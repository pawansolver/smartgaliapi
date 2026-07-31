import Event from './event.model.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import EventCategory from '../event_category/event_category.model.js';

export const createEvent = async (eventData) => {
  return await Event.create(eventData);
};

export const getAllEvents = async () => {
  return await Event.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] },
      { model: EventCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
    ]
  });
};

export const getEventById = async (id) => {
  return await Event.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] },
      { model: EventCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
    ]
  });
};

export const updateEvent = async (id, updateData) => {
  const event = await Event.findOne({ where: { id, is_deleted: false } });
  if (!event) return null;
  return await event.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteEvent = async (id, deletedRemarks, updated_by) => {
  const event = await Event.findOne({ where: { id, is_deleted: false } });
  if (!event) return null;
  return await event.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteEvents = async (ids, deletedRemarks, updated_by) => {
  return await Event.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
