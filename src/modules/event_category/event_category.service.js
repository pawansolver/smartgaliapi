import EventCategory from './event_category.model.js';

export const createEventCategory = async (data) => {
  return await EventCategory.create(data);
};

export const getAllEventCategories = async () => {
  return await EventCategory.findAll({
    where: { is_deleted: false }
  });
};

export const getEventCategoryById = async (id) => {
  return await EventCategory.findOne({
    where: { id, is_deleted: false }
  });
};

export const updateEventCategory = async (id, data) => {
  const category = await EventCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;
  return await category.update(data);
};

export const deleteEventCategory = async (id, deletedRemarks, updated_by) => {
  const category = await EventCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;
  return await category.update({ 
    is_deleted: true,
    deletedRemarks,
    updated_by,
    updated_at: new Date()
  });
};
