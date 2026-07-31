import SocietyFacility from './society_facility.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const createFacility = async (facilityData) => {
  return await SocietyFacility.create(facilityData);
};

export const getAllFacilities = async () => {
  return await SocietyFacility.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] }
    ]
  });
};

export const getFacilityById = async (id) => {
  return await SocietyFacility.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] }
    ]
  });
};

export const updateFacility = async (id, updateData) => {
  const facility = await SocietyFacility.findOne({ where: { id, is_deleted: false } });
  if (!facility) return null;
  return await facility.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteFacility = async (id, deletedRemarks, updated_by) => {
  const facility = await SocietyFacility.findOne({ where: { id, is_deleted: false } });
  if (!facility) return null;
  return await facility.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteFacilities = async (ids, deletedRemarks, updated_by) => {
  return await SocietyFacility.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
