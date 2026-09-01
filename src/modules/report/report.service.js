import Report from './report.model.js';
import User from '../user/user.model.js';

export const createReport = async (reportData) => {
  return await Report.create(reportData);
};

export const getAllReports = async () => {
  return await Report.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'reporter', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const getReportById = async (id) => {
  return await Report.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'reporter', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const updateReport = async (id, updateData) => {
  const report = await Report.findOne({ where: { id, is_deleted: false } });
  if (!report) return null;
  return await report.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteReport = async (id, deletedRemarks, updated_by) => {
  const report = await Report.findOne({ where: { id, is_deleted: false } });
  if (!report) return null;
  return await report.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteReports = async (ids, deletedRemarks, updated_by) => {
  return await Report.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
