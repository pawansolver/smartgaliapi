import EventParticipant from './event_participant.model.js';
import User from '../user/user.model.js';
import Event from '../event/event.model.js';

export const createParticipant = async (participantData) => {
  return await EventParticipant.create(participantData);
};

export const getAllParticipants = async () => {
  return await EventParticipant.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Event, as: 'event', attributes: ['id', 'title'] }
    ]
  });
};

export const getParticipantById = async (id) => {
  return await EventParticipant.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Event, as: 'event', attributes: ['id', 'title'] }
    ]
  });
};

export const updateParticipant = async (id, updateData) => {
  const participant = await EventParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteParticipant = async (id, deletedRemarks, updated_by) => {
  const participant = await EventParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteParticipants = async (ids, deletedRemarks, updated_by) => {
  return await EventParticipant.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
