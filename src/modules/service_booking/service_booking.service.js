import ServiceBooking from './service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import User from '../user/user.model.js';

export const createBooking = async (bookingData) => {
  return await ServiceBooking.create(bookingData);
};

export const getAllBookings = async () => {
  return await ServiceBooking.findAll({
    where: { is_deleted: false },
    include: [
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title', 'price'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getBookingById = async (id) => {
  return await ServiceBooking.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title', 'price'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateBooking = async (id, updateData) => {
  const booking = await ServiceBooking.findOne({ where: { id, is_deleted: false } });
  if (!booking) return null;
  return await booking.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteBooking = async (id, deletedRemarks, updated_by) => {
  const booking = await ServiceBooking.findOne({ where: { id, is_deleted: false } });
  if (!booking) return null;
  return await booking.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteBookings = async (ids, deletedRemarks, updated_by) => {
  return await ServiceBooking.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
