import SocietyParking from './society_parking.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createParking = async (data) => {
  return await SocietyParking.create(data);
};

export const getAllParkings = async () => {
  return await SocietyParking.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'owner' }
    ]
  });
};

export const getParkingById = async (id) => {
  return await SocietyParking.findOne({
    where: { parkingId: id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society' },
      { model: User, as: 'owner' }
    ]
  });
};

export const updateParking = async (id, data) => {
  const parking = await SocietyParking.findOne({ where: { parkingId: id, is_deleted: false } });
  if (!parking) return null;
  return await parking.update({ ...data, updatedAt: new Date() });
};

export const softDeleteParking = async (id, deletedRemarks, updated_by) => {
  const parking = await SocietyParking.findOne({ where: { parkingId: id, is_deleted: false } });
  if (!parking) return null;
  return await parking.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
