import SocietyPoll from './society_poll.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createPoll = async (data) => {
  return await SocietyPoll.create(data);
};

export const getAllPolls = async () => {
  return await SocietyPoll.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'creator' }
    ]
  });
};

export const getPollById = async (id) => {
  return await SocietyPoll.findOne({
    where: { pollId: id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'creator' }
    ]
  });
};

export const updatePoll = async (id, data) => {
  const poll = await SocietyPoll.findOne({ where: { pollId: id, is_deleted: false } });
  if (!poll) return null;
  return await poll.update({ ...data, updatedAt: new Date() });
};

export const updatePollStatus = async (id, status) => {
  const poll = await SocietyPoll.findOne({ where: { pollId: id, is_deleted: false } });
  if (!poll) return null;
  return await poll.update({ status, updatedAt: new Date() });
};

export const softDeletePoll = async (id, deletedRemarks, updated_by) => {
  const poll = await SocietyPoll.findOne({ where: { pollId: id, is_deleted: false } });
  if (!poll) return null;
  return await poll.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
