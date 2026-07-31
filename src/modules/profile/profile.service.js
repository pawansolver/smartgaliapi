import bcrypt from 'bcrypt';
import { Op, UniqueConstraintError } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import Notification from '../notification/notification.model.js';
import EmailNotification from '../notification/email_notification.model.js';
import SavedPost from '../saved_post/saved_post.model.js';
import UserAddress from './user_address.model.js';
import NotificationPreference from './notification_preference.model.js';
import PrivacySetting from './privacy_setting.model.js';
import SupportTicket from './support_ticket.model.js';
import DataExportRequest from './data_export_request.model.js';

const SALT_ROUNDS = 10;

export const activeAddressWhere = (userId) => ({
  user_id: userId,
  is_deleted: false,
  is_active: true,
});

export const shouldMakeAddressDefault = ({ requestedDefault, activeAddressCount }) =>
  requestedDefault === true || activeAddressCount === 0;

export const pendingExportWhere = (userId) => ({
  user_id: userId,
  status: { [Op.in]: ['pending', 'processing'] },
  is_deleted: false,
});

// ─────────────────────────────────────────────────────────────
// Serializers — shape DB rows into UI-ready DTOs (single source of truth)
// ─────────────────────────────────────────────────────────────
const serializeProfile = (user) => {
  const profile = user.profile || null;
  return {
    id: user.userId,
    fullName: profile?.fullName || user.userName || 'SmartGalli User',
    email: user.email || null,
    phone: user.phone || null,
    role: user.userRole || 'resident',
    isActive: user.status === 'active',
    status: user.status,
    isVerified: !!user.is_verified,
    hasPassword: !!user.password,
    avatarUrl: profile?.avatarUrl || null,
    bio: profile?.bio || null,
    locationName: profile?.locationName || null,
    latitude: profile?.latitude ?? user.latitude ?? null,
    longitude: profile?.longitude ?? user.longitude ?? null,
    isProfileComplete: !!profile?.isProfileComplete,
    memberSince: user.created_at || null,
  };
};

const serializeAddress = (a) => ({
  id: a.id,
  label: a.label,
  houseNo: a.house_no,
  street: a.street,
  landmark: a.landmark,
  city: a.city,
  fullAddress: a.full_address,
  latitude: a.latitude,
  longitude: a.longitude,
  isDefault: !!a.is_default,
});

const serializePreferences = (p) => ({
  pushNotifications: {
    societyAnnouncements: p.society_announcements,
    complaintUpdates: p.complaint_updates,
    visitorAlerts: p.visitor_alerts,
    eventReminders: p.event_reminders,
    communityChat: p.community_chat,
    promotionalOffers: p.promotional_offers,
  },
  professionalAlerts: {
    bookingRequests: p.booking_requests,
    customerMessages: p.customer_messages,
  },
  emailNotifications: {
    weeklyDigest: p.weekly_digest,
    invoicesReceipts: p.invoices_receipts,
  },
});

const serializePrivacy = (p) => ({
  profileVisibility: p.profile_visibility,
  showActivityStatus: !!p.show_activity_status,
});

// ─────────────────────────────────────────────────────────────
// Profile aggregate
// ─────────────────────────────────────────────────────────────
export const getMyProfile = async (userId) => {
  const user = await User.findOne({
    where: { userId, is_deleted: false },
    attributes: { exclude: ['currentOtp', 'password', 'otpBlockedUntil'] },
    include: [{ model: UserProfile, as: 'profile', required: false }],
  });
  if (!user) return null;
  // password excluded above but we still need hasPassword flag — fetch minimally
  const pwdRow = await User.findByPk(userId, { attributes: ['password'] });
  user.password = pwdRow?.password || null;
  return serializeProfile(user);
};

export const updateMyProfile = async (userId, data) => {
  const t = await sequelize.transaction();
  try {
    const { fullName, email, bio, avatarUrl, locationName, latitude, longitude } = data;
    const user = await User.findOne({
      where: { userId, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!user) {
      await t.rollback();
      return { error: 'Profile not found.', status: 404 };
    }

    const cleanEmail = email === undefined ? undefined : email.toLowerCase().trim();
    const emailChanged = cleanEmail !== undefined && cleanEmail !== (user.email || '').toLowerCase();
    if (emailChanged) {
      const existing = await User.findOne({
        where: {
          email: cleanEmail,
          userId: { [Op.ne]: userId },
          is_deleted: false,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (existing) {
        await t.rollback();
        return { error: 'This email is already in use by another account.', status: 409 };
      }
    }

    const userPatch = {};
    if (cleanEmail !== undefined) userPatch.email = cleanEmail;
    if (emailChanged) userPatch.is_verified = false;
    if (fullName !== undefined) userPatch.userName = fullName;
    const coordinatesChanged = latitude !== undefined || longitude !== undefined;
    const effectiveLatitude = latitude !== undefined ? latitude : user.latitude;
    const effectiveLongitude = longitude !== undefined ? longitude : user.longitude;
    if (coordinatesChanged) {
      userPatch.latitude = effectiveLatitude;
      userPatch.longitude = effectiveLongitude;
    }
    if (Object.keys(userPatch).length > 0) {
      await user.update(userPatch, { transaction: t });
    }

    const profilePatch = {};
    if (fullName !== undefined) profilePatch.fullName = fullName;
    if (bio !== undefined) profilePatch.bio = bio;
    if (avatarUrl !== undefined) profilePatch.avatarUrl = avatarUrl;
    if (locationName !== undefined) profilePatch.locationName = locationName;
    if (coordinatesChanged) {
      profilePatch.latitude = effectiveLatitude;
      profilePatch.longitude = effectiveLongitude;
    }

    let profile = await UserProfile.findOne({ where: { user_id: userId }, transaction: t });
    if (!profile) {
      await UserProfile.create({ user_id: userId, ...profilePatch }, { transaction: t });
    } else if (Object.keys(profilePatch).length > 0) {
      await profile.update(profilePatch, { transaction: t });
    }

    await t.commit();
    return { data: await getMyProfile(userId) };
  } catch (error) {
    if (!t.finished) await t.rollback();
    if (error instanceof UniqueConstraintError) {
      return { error: 'This email is already in use by another account.', status: 409 };
    }
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// Addresses
// ─────────────────────────────────────────────────────────────
export const getAddresses = async (userId) => {
  const rows = await UserAddress.findAll({
    where: { user_id: userId, is_deleted: false, is_active: true },
    order: [['is_default', 'DESC'], ['id', 'DESC']],
  });
  return rows.map(serializeAddress);
};

export const createAddress = async (userId, data) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return null;
    }
    const parts = [data.houseNo, data.street, data.landmark, data.city].filter(Boolean);
    const fullAddress = data.fullAddress || parts.join(', ');

    const activeWhere = activeAddressWhere(userId);
    const count = await UserAddress.count({ where: activeWhere, transaction: t });
    const shouldDefault = shouldMakeAddressDefault({
      requestedDefault: data.isDefault,
      activeAddressCount: count,
    });
    if (shouldDefault) {
      await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
    }

    const created = await UserAddress.create({
      user_id: userId,
      label: data.label || 'Home',
      house_no: data.houseNo || null,
      street: data.street || null,
      landmark: data.landmark || null,
      city: data.city || null,
      full_address: fullAddress || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      is_default: shouldDefault,
      created_by: userId,
    }, { transaction: t });

    await t.commit();
    return serializeAddress(created);
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const updateAddress = async (userId, addressId, data) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return null;
    }
    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return null;
    }

    const patch = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.houseNo !== undefined) patch.house_no = data.houseNo;
    if (data.street !== undefined) patch.street = data.street;
    if (data.landmark !== undefined) patch.landmark = data.landmark;
    if (data.city !== undefined) patch.city = data.city;
    if (data.latitude !== undefined) patch.latitude = data.latitude;
    if (data.longitude !== undefined) patch.longitude = data.longitude;
    if (data.fullAddress !== undefined) {
      patch.full_address = data.fullAddress;
    } else if (Object.keys(patch).length > 0) {
      patch.full_address = [
        patch.house_no ?? address.house_no,
        patch.street ?? address.street,
        patch.landmark ?? address.landmark,
        patch.city ?? address.city,
      ].filter(Boolean).join(', ');
    }

    if (data.isDefault === true) {
      await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
      patch.is_default = true;
    } else if (data.isDefault === false && address.is_default) {
      const replacement = await UserAddress.findOne({
        where: { ...activeWhere, id: { [Op.ne]: address.id } },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      patch.is_default = replacement ? false : true;
      if (replacement) {
        await UserAddress.update(
          { is_default: false },
          { where: activeWhere, transaction: t }
        );
        await replacement.update({ is_default: true, updated_by: userId }, { transaction: t });
      }
    }
    patch.updated_by = userId;

    await address.update(patch, { transaction: t });
    await t.commit();
    return serializeAddress(address);
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }
};

export const setDefaultAddress = async (userId, addressId) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return null;
    }
    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return null;
    }
    await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
    await address.update({ is_default: true, updated_by: userId }, { transaction: t });
    await t.commit();
    return serializeAddress(address);
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const deleteAddress = async (userId, addressId) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return null;
    }
    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return null;
    }

    const wasDefault = address.is_default;
    await address.update({
      is_deleted: true,
      is_active: false,
      is_default: false,
      updated_by: userId,
    }, { transaction: t });

    if (wasDefault) {
      const replacement = await UserAddress.findOne({
        where: activeWhere,
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (replacement) {
        await UserAddress.update(
          { is_default: false },
          { where: activeWhere, transaction: t }
        );
        await replacement.update({ is_default: true, updated_by: userId }, { transaction: t });
      }
    }

    await t.commit();
    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// Society, support and data export
// ─────────────────────────────────────────────────────────────
export const getMySociety = async (userId) => {
  const membership = await SocietyMember.findOne({
    where: {
      user_id: userId,
      status: 'active',
      is_active: true,
      is_deleted: false,
    },
    include: [{
      model: SocietyProfile,
      as: 'society',
      required: true,
      where: { is_active: true, is_deleted: false },
      include: [{
        model: User,
        as: 'admin_user',
        attributes: ['is_verified'],
        required: false,
      }],
    }],
    order: [['joined_at', 'DESC'], ['id', 'DESC']],
  });
  if (!membership) return null;

  const society = membership.society;
  return {
    id: society.id,
    name: society.society_name,
    societyName: society.society_name,
    address: society.address,
    location: society.address,
    isVerified: !!society.admin_user?.is_verified,
    registrationNo: society.registration_no,
    latitude: society.latitude,
    longitude: society.longitude,
    totalFlats: society.total_flats,
    membership: {
      id: membership.id,
      flatNo: membership.flat_no,
      role: membership.role,
      joinedAt: membership.joined_at,
      status: membership.status,
    },
  };
};

export const createSupportTicket = async (userId, data) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return null;
    }
    const ticket = await SupportTicket.create({
      user_id: userId,
      category: data.category,
      description: data.description,
      status: 'open',
      created_by: userId,
    }, { transaction: t });
    await t.commit();
    return {
      id: ticket.id,
      category: ticket.category,
      description: ticket.description,
      status: ticket.status,
      createdAt: ticket.created_at,
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const createDataExportRequest = async (userId) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return { error: 'User not found.', status: 404 };
    }

    const pending = await DataExportRequest.findOne({
      where: pendingExportWhere(userId),
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (pending) {
      await t.rollback();
      return {
        error: 'A data export request is already pending.',
        status: 409,
        data: { id: pending.id, status: pending.status },
      };
    }

    const request = await DataExportRequest.create({
      user_id: userId,
      status: 'pending',
      requested_at: new Date(),
      created_by: userId,
    }, { transaction: t });
    await t.commit();
    return {
      data: {
        id: request.id,
        status: request.status,
        requestedAt: request.requested_at,
      },
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// Notification preferences (auto-provision defaults on first read)
// ─────────────────────────────────────────────────────────────
export const getNotificationPreferences = async (userId) => {
  const [pref] = await NotificationPreference.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, created_by: userId },
  });
  return serializePreferences(pref);
};

export const updateNotificationPreferences = async (userId, data) => {
  const [pref] = await NotificationPreference.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, created_by: userId },
  });

  const push = data.pushNotifications || {};
  const pro = data.professionalAlerts || {};
  const email = data.emailNotifications || {};

  const patch = {};
  const setBool = (key, val) => { if (typeof val === 'boolean') patch[key] = val; };
  setBool('society_announcements', push.societyAnnouncements);
  setBool('complaint_updates', push.complaintUpdates);
  setBool('visitor_alerts', push.visitorAlerts);
  setBool('event_reminders', push.eventReminders);
  setBool('community_chat', push.communityChat);
  setBool('promotional_offers', push.promotionalOffers);
  setBool('booking_requests', pro.bookingRequests);
  setBool('customer_messages', pro.customerMessages);
  setBool('weekly_digest', email.weeklyDigest);
  setBool('invoices_receipts', email.invoicesReceipts);
  patch.updated_by = userId;

  await pref.update(patch);
  return serializePreferences(pref);
};

// ─────────────────────────────────────────────────────────────
// Privacy settings
// ─────────────────────────────────────────────────────────────
export const getPrivacySettings = async (userId) => {
  const [row] = await PrivacySetting.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, created_by: userId },
  });
  return serializePrivacy(row);
};

export const updatePrivacySettings = async (userId, data) => {
  const [row] = await PrivacySetting.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, created_by: userId },
  });
  const patch = { updated_by: userId };
  if (data.profileVisibility && ['public', 'members_only'].includes(data.profileVisibility)) {
    patch.profile_visibility = data.profileVisibility;
  }
  if (typeof data.showActivityStatus === 'boolean') {
    patch.show_activity_status = data.showActivityStatus;
  }
  await row.update(patch);
  return serializePrivacy(row);
};

// ─────────────────────────────────────────────────────────────
// Change password (set if none exists, else verify current)
// ─────────────────────────────────────────────────────────────
export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findByPk(userId, { attributes: ['userId', 'password'] });
  if (!user) return { error: 'User not found.', status: 404 };

  // If a password already exists, the current one must match
  if (user.password) {
    if (!currentPassword) {
      return { error: 'Current password is required.', status: 400 };
    }
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return { error: 'Current password is incorrect.', status: 400 };
    }
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.update({ password: hashed });
  return { data: true };
};

// ─────────────────────────────────────────────────────────────
// Delete account (soft delete + deactivate; verify password if set)
// ─────────────────────────────────────────────────────────────
export const deleteAccount = async (userId, { password, reason }) => {
  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return { error: 'User not found.', status: 404 };
    }

    // If the account has a password, require it for re-authentication
    if (user.password) {
      if (!password) {
        await t.rollback();
        return { error: 'Password is required to delete your account.', status: 400 };
      }
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        await t.rollback();
        return { error: 'Incorrect password. Account not deleted.', status: 400 };
      }
    }

    await user.update({
      status: 'inactive',
      is_deleted: true,
      deletedRemarks: reason || 'User requested account deletion.',
      // scramble unique identifiers so they can be reused by a fresh signup
      email: user.email ? `deleted_${userId}_${user.email}` : null,
      phone: user.phone ? `deleted_${userId}_${user.phone}` : null,
    }, { transaction: t });

    await UserProfile.update(
      { is_deleted: true, is_active: false, updated_by: userId },
      { where: { user_id: userId }, transaction: t }
    );
    const ownedModels = [
      UserAddress,
      NotificationPreference,
      PrivacySetting,
      SupportTicket,
      DataExportRequest,
      Notification,
      EmailNotification,
      SavedPost,
    ];
    for (const model of ownedModels) {
      await model.update(
        {
          is_deleted: true,
          is_active: false,
          updated_by: userId,
          deletedRemarks: reason || 'Owner account deleted.',
        },
        { where: { user_id: userId }, transaction: t }
      );
    }

    await t.commit();
    return { data: true };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};
