import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyPoll from './society_poll.model.js';
import SocietyPollVote from './society_poll_vote.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createPoll = async (societyId, userId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await SocietyPoll.create({
      society_id: societyId,
      created_by: userId,
      question: data.question,
      options: JSON.stringify(data.options),
      status: 'active',
      expires_at: data.expires_at || null,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.poll_created',
      targetEntityType: 'poll',
      targetEntityId: poll.pollId,
      newValue: { question: poll.question },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.poll_created',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        pollId: Number(poll.pollId),
        question: poll.question,
        createdBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return poll;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

const formatPollWithVotes = async (poll, callerUserId = null) => {
  if (!poll) return null;
  const pollJson = poll.toJSON ? poll.toJSON() : poll;
  
  let optionsArray = [];
  try {
    optionsArray = typeof pollJson.options === 'string' ? JSON.parse(pollJson.options) : pollJson.options;
  } catch {
    optionsArray = [];
  }

  const votes = await SocietyPollVote.findAll({
    where: { poll_id: pollJson.pollId || pollJson.id },
    attributes: ['option_index', 'user_id'],
  });

  const voteCounts = {};
  optionsArray.forEach((_, idx) => { voteCounts[idx] = 0; });
  let userVotedOption = null;

  votes.forEach((v) => {
    voteCounts[v.option_index] = (voteCounts[v.option_index] || 0) + 1;
    if (callerUserId && Number(v.user_id) === Number(callerUserId)) {
      userVotedOption = v.option_index;
    }
  });

  const totalVotes = votes.length;
  const optionsWithTally = optionsArray.map((text, idx) => ({
    index: idx,
    text,
    count: voteCounts[idx] || 0,
    percentage: totalVotes > 0 ? Math.round(((voteCounts[idx] || 0) / totalVotes) * 100) : 0,
  }));

  return {
    ...pollJson,
    id: pollJson.pollId || pollJson.id,
    options: optionsWithTally,
    total_votes: totalVotes,
    has_voted: userVotedOption !== null,
    user_voted_option: userVotedOption,
  };
};

export const getAllPolls = async (societyId, query = {}, callerUserId = null) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;

  const { rows, count } = await SocietyPoll.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['pollId', 'DESC']],
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });

  const formattedRows = await Promise.all(rows.map((p) => formatPollWithVotes(p, callerUserId)));

  return {
    data: formattedRows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getPollById = async (id, societyId, callerUserId = null) => {
  const poll = await SocietyPoll.findOne({
    where: { pollId: id, society_id: societyId, is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
  return await formatPollWithVotes(poll, callerUserId);
};

export const votePoll = async (pollId, societyId, userId, { option_index }, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await SocietyPoll.findOne({
      where: { pollId, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!poll) {
      const err = new Error('Poll not found');
      err.statusCode = 404;
      throw err;
    }

    if (poll.status !== 'active') {
      const err = new Error('This poll is closed');
      err.statusCode = 400;
      throw err;
    }

    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      const err = new Error('This poll has expired');
      err.statusCode = 400;
      throw err;
    }

    let parsedOptions = [];
    try {
      parsedOptions = JSON.parse(poll.options);
    } catch {
      parsedOptions = [];
    }

    if (option_index < 0 || option_index >= parsedOptions.length) {
      const err = new Error('Invalid option index selected');
      err.statusCode = 422;
      throw err;
    }

    // Atomic duplicate vote check
    const existingVote = await SocietyPollVote.findOne({
      where: { poll_id: pollId, user_id: userId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (existingVote) {
      const err = new Error('You have already cast your vote on this poll');
      err.statusCode = 409;
      throw err;
    }

    await SocietyPollVote.create({
      poll_id: pollId,
      society_id: societyId,
      user_id: userId,
      option_index,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.poll_voted',
      targetEntityType: 'poll',
      targetEntityId: pollId,
      newValue: { option_index },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.poll_voted',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        pollId: Number(pollId),
        userId: Number(userId),
        optionIndex: Number(option_index),
      },
    }, { transaction });

    await transaction.commit();
    return await getPollById(pollId, societyId, userId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    if (error.name === 'SequelizeUniqueConstraintError' || error.parent?.code === 'ER_DUP_ENTRY') {
      const err = new Error('You have already cast your vote on this poll');
      err.statusCode = 409;
      throw err;
    }
    throw error;
  }
};

export const updatePoll = async (id, societyId, data, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await SocietyPoll.findOne({
      where: { pollId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!poll) {
      await transaction.commit();
      return null;
    }

    const oldValue = poll.toJSON();
    await poll.update({
      ...data,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.poll_updated',
      targetEntityType: 'poll',
      targetEntityId: id,
      oldValue,
      newValue: poll.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return await formatPollWithVotes(poll);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const updatePollStatus = async (id, societyId, status, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await SocietyPoll.findOne({
      where: { pollId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!poll) {
      await transaction.commit();
      return null;
    }

    await poll.update({ status, updated_by: actorUserId, updatedAt: new Date() }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: status === 'closed' ? 'society.poll_closed' : 'society.poll_reopened',
      targetEntityType: 'poll',
      targetEntityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return await formatPollWithVotes(poll);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeletePoll = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await SocietyPoll.findOne({
      where: { pollId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!poll) {
      await transaction.commit();
      return null;
    }

    await poll.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.poll_deleted',
      targetEntityType: 'poll',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return poll;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
