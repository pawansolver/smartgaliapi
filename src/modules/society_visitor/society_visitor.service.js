import SocietyVisitor from './society_visitor.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createVisitor = async (data) => {
  return await SocietyVisitor.create(data);
};

export const getAllVisitors = async () => {
  return await SocietyVisitor.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'resident' }
    ]
  });
};

export const getVisitorById = async (id) => {
  return await SocietyVisitor.findOne({
    where: { visitorId: id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'resident' }
    ]
  });
};

export const updateVisitor = async (id, data) => {
  const visitor = await SocietyVisitor.findOne({ where: { visitorId: id, is_deleted: false } });
  if (!visitor) return null;
  return await visitor.update({ ...data, updatedAt: new Date() });
};

export const softDeleteVisitor = async (id, deletedRemarks, updated_by) => {
  const visitor = await SocietyVisitor.findOne({ where: { visitorId: id, is_deleted: false } });
  if (!visitor) return null;
  return await visitor.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const updateVisitorStatus = async (id, status) => {
  const visitor = await SocietyVisitor.findOne({ where: { visitorId: id, is_deleted: false } });
  if (!visitor) return null;
  
  const updateData = { status, updatedAt: new Date() };
  if (status === 'checked_in') {
    updateData.check_in_time = new Date();
  } else if (status === 'checked_out') {
    updateData.check_out_time = new Date();
  }
  
  return await visitor.update(updateData);
};
