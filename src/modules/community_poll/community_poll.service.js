import CommunityPoll, { parseOptionsSafely } from './community_poll.model.js';
import CommunityPollVote from './community_poll_vote.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import User from '../user/user.model.js';
import sequelize from '../../config/db.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';

export const createPoll = async (communityId, userId, { question, options, expiresAt }) => {
  if (!question || !question.trim()) throw new Error('Poll question is required');

  const rawOptions = parseOptionsSafely(options);
  if (!rawOptions || !Array.isArray(rawOptions) || rawOptions.length < 2) {
    throw new Error('At least 2 options are required for a poll');
  }

  const formattedOptions = rawOptions.map((opt, idx) => ({
    id: idx + 1,
    text: typeof opt === 'string' ? opt.trim() : (opt.text || opt.title || `Option ${idx + 1}`),
    votesCount: 0,
  }));

  const transaction = await sequelize.transaction();
  try {
    const poll = await CommunityPoll.create({
      community_id: communityId,
      question: question.trim(),
      options: formattedOptions,
      total_votes: 0,
      expires_at: expiresAt || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_POLL_CREATED || 'community.poll_created',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(poll.id),
      payload: { communityId: Number(communityId), pollId: Number(poll.id), userId: Number(userId) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'poll.created',
      targetEntityType: 'poll',
      targetEntityId: poll.id,
      newValue: { question: poll.question, optionsCount: formattedOptions.length },
    }, { transaction });

    await transaction.commit();
    return poll;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityPolls = async (communityId, currentUserId = null) => {
  const polls = await CommunityPoll.findAll({
    where: { community_id: communityId, is_active: true, is_deleted: false },
    include: [{ model: User, as: 'creator', attributes: ['userId', 'userName'] }],
    order: [['created_at', 'DESC']],
  });

  let userVotes = {};
  if (currentUserId && polls.length > 0) {
    const pollIds = polls.map((p) => p.id);
    const votes = await CommunityPollVote.findAll({
      where: { poll_id: pollIds, user_id: currentUserId },
    });
    for (const v of votes) {
      userVotes[v.poll_id] = v.option_id;
    }
  }

  return polls.map((p) => {
    const json = p.toJSON();
    const parsedOptions = parseOptionsSafely(json.options);
    const myVote = userVotes[p.id] || null;
    return {
      ...json,
      hasVoted: Boolean(myVote),
      votedOptionId: myVote != null ? Number(myVote) : null,
      options: parsedOptions.map((opt) => ({
        ...opt,
        id: Number(opt.id),
        text: String(opt.text || ''),
        votesCount: Number(opt.votesCount || 0),
        isVotedByMe: myVote != null ? Number(myVote) === Number(opt.id) : false,
      })),
    };
  });
};

/**
 * Concurrency-Safe Atomic Voting & Vote Switching (Phase 8)
 */
export const votePoll = async (communityId, pollId, optionId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: userId, status: 'active', is_deleted: false },
      transaction,
    });
    if (!membership) {
      throw new Error('Active community membership is required to vote on polls');
    }

    const poll = await CommunityPoll.findOne({
      where: {
        id: pollId,
        community_id: communityId,
        is_active: true,
        is_deleted: false,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!poll) throw new Error('Poll not found');
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      throw new Error('This poll has expired');
    }

    const options = parseOptionsSafely(poll.options).map((opt) => ({
      ...opt,
      id: Number(opt.id),
      text: String(opt.text || ''),
      votesCount: Number(opt.votesCount || 0),
    }));

    const numericOptionId = Number(optionId);
    if (!Number.isInteger(numericOptionId) || numericOptionId <= 0) {
      throw new Error('Invalid option selected');
    }
    const targetOption = options.find((o) => Number(o.id) === numericOptionId);
    if (!targetOption) {
      throw new Error('Invalid option selected');
    }

    const existingVote = await CommunityPollVote.findOne({
      where: { poll_id: pollId, user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existingVote) {
      const oldOptionId = Number(existingVote.option_id);
      if (oldOptionId === numericOptionId) {
        await transaction.commit();
        return { ok: true, totalVotes: poll.total_votes, votedOptionId: numericOptionId };
      }

      // Switch vote atomically
      const oldOption = options.find((o) => Number(o.id) === oldOptionId);
      if (oldOption) {
        oldOption.votesCount = Math.max(0, (oldOption.votesCount || 1) - 1);
      }
      targetOption.votesCount = (targetOption.votesCount || 0) + 1;

      await existingVote.update({
        option_id: numericOptionId,
        updatedAt: new Date(),
      }, { transaction });

      await poll.update({
        options,
        updatedAt: new Date(),
      }, { transaction });

      await transaction.commit();
      return { ok: true, totalVotes: poll.total_votes, votedOptionId: numericOptionId };
    }

    // Insert new vote
    await CommunityPollVote.create({
      poll_id: pollId,
      user_id: userId,
      option_id: numericOptionId,
      created_at: new Date(),
    }, { transaction });

    targetOption.votesCount = (targetOption.votesCount || 0) + 1;
    const totalVotes = (poll.total_votes || 0) + 1;

    await poll.update({
      options,
      total_votes: totalVotes,
      updatedAt: new Date(),
    }, { transaction });

    await transaction.commit();
    return { ok: true, totalVotes, votedOptionId: numericOptionId };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const deletePoll = async (communityId, pollId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const poll = await CommunityPoll.findOne({
      where: { id: pollId, community_id: communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!poll) {
      await transaction.commit();
      return null;
    }

    await poll.update({
      is_deleted: true,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'poll.deleted',
      targetEntityType: 'poll',
      targetEntityId: pollId,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};


export const getPollById = async (communityId, pollId) => {
  return await CommunityPoll.findOne({
    where: { id: pollId, community_id: communityId, is_deleted: false },
  });
};
