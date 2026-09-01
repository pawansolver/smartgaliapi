import Community from './community.model.js';
import CommunityCategory from '../communityCategory/communityCategory.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import Chat from '../chat/chat.model.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { syncCommunityChatParticipant } from './communityChat.service.js';
import { logCommunityAudit } from './community_audit_log.service.js';
import {
  getCommunityDetailCache,
  setCommunityDetailCache,
  invalidateCommunityDetailCache,
  invalidateCommunityCategoriesCache,
} from './community.cache.js';

export const createCommunity = async (userId, communityData) => {
  const {
    communityName,
    communityDescription,
    category_id,
    cover_image,
    icon,
    is_private = false,
    rules = [],
    latitude = null,
    longitude = null,
    location_name = null,
    discovery_radius = 25.0,
  } = communityData;

  const transaction = await sequelize.transaction();
  try {
    const community = await Community.create({
      communityName,
      communityDescription: communityDescription || null,
      category_id: category_id || null,
      cover_image: cover_image || null,
      icon: icon || null,
      is_private: Boolean(is_private),
      rules: Array.isArray(rules) ? rules : [],
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      location_name: location_name || null,
      discovery_radius: discovery_radius ? Number(discovery_radius) : 25.0,
      members_count: 1,
      posts_count: 0,
      status: 'active',
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    // Creator is automatically the Admin
    const ownerMembership = await CommunityMember.create({
      community_id: community.communityId,
      user_id: userId,
      role: 'admin',
      status: 'active',
      joined_at: new Date(),
      created_by: userId,
    }, { transaction });

    await syncCommunityChatParticipant(community, userId, ownerMembership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_CREATED || 'community.created',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(community.communityId),
      payload: {
        communityId: Number(community.communityId),
        created_by: Number(userId),
        communityName,
        is_private: Boolean(is_private),
      },
    }, { transaction });

    await logCommunityAudit({
      communityId: community.communityId,
      actorUserId: userId,
      action: 'community.created',
      newValue: {
        communityName,
        is_private: Boolean(is_private),
        category_id,
      },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityCategoriesCache();
    return getCommunityById(community.communityId, userId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityById = async (communityId, currentUserId = null) => {
  const cached = await getCommunityDetailCache(communityId);
  let baseCommunity = cached;

  if (!baseCommunity) {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      include: [
        { model: CommunityCategory, as: 'category' },
        { model: User, as: 'creator', attributes: ['userId', 'userName'] },
      ],
    });

    if (!community) return null;
    baseCommunity = community.toJSON();
    await setCommunityDetailCache(communityId, baseCommunity);
  }

  let myRole = 'none';
  let isMember = false;
  let hasPendingRequest = false;

  if (currentUserId) {
    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: currentUserId, is_deleted: false },
    });

    if (membership && membership.status === 'active') {
      isMember = true;
      myRole = membership.role;
    } else if (membership && membership.status === 'pending') {
      hasPendingRequest = true;
    }
  }

  return {
    ...baseCommunity,
    isMember,
    myRole,
    hasPendingRequest,
  };
};

/**
 * Scalable Community Search & Listings with Cursor Pagination (Phase 7)
 */
export const getAllCommunities = async ({
  search,
  category_id,
  is_private,
  cursor,
  limit = 20,
  page = 1,
}) => {
  const where = { is_deleted: false, status: 'active' };

  if (category_id) {
    where.category_id = category_id;
  }

  if (is_private !== undefined && is_private !== null) {
    where.is_private = Boolean(is_private);
  }

  if (search && search.trim()) {
    where.communityName = { [Op.like]: `%${search.trim()}%` };
  }

  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  // Cursor-based pagination if cursor provided
  if (cursor) {
    let cursorData;
    try {
      cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      cursorData = null;
    }

    if (cursorData?.created_at && cursorData?.id) {
      where[Op.or] = [
        { created_at: { [Op.lt]: new Date(cursorData.created_at) } },
        {
          created_at: new Date(cursorData.created_at),
          communityId: { [Op.lt]: Number(cursorData.id) },
        },
      ];
    }

    const rows = await Community.findAll({
      where,
      include: [{ model: CommunityCategory, as: 'category' }],
      order: [['created_at', 'DESC'], ['communityId', 'DESC']],
      limit: safeLimit + 1,
    });

    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
    const lastItem = pageRows.at(-1);
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({ id: Number(lastItem.communityId), created_at: lastItem.created_at })).toString('base64')
      : null;

    return {
      communities: pageRows,
      nextCursor,
      hasMore,
    };
  }

  // Fallback offset-based pagination
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;

  const { rows, count } = await Community.findAndCountAll({
    where,
    include: [{ model: CommunityCategory, as: 'category' }],
    order: [['members_count', 'DESC'], ['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    communities: rows,
    total: count,
    page: safePage,
    totalPages: Math.ceil(count / safeLimit),
  };
};

export const getMyCommunities = async (userId) => {
  const memberships = await CommunityMember.findAll({
    where: { user_id: userId, status: 'active', is_deleted: false },
    include: [
      {
        model: Community,
        as: 'community',
        where: { is_deleted: false },
        include: [{ model: CommunityCategory, as: 'category' }],
      },
    ],
    order: [['joined_at', 'DESC']],
  });

  return memberships.map((m) => {
    const comm = m.community ? m.community.toJSON() : {};
    return {
      ...comm,
      myRole: m.role,
      isMember: true,
    };
  });
};

/**
 * Geo-Fenced & Interest-Based Community Suggestions (Phase 6)
 */
export const getSuggestedCommunities = async (userId, {
  limit = 10,
  category_id,
  latitude,
  longitude,
  max_distance = 50, // default 50 km radius
} = {}) => {
  let joinedIds = [];
  if (userId) {
    const userMemberships = await CommunityMember.findAll({
      where: { user_id: userId, status: { [Op.ne]: 'left' } },
      attributes: ['community_id'],
    });
    joinedIds = userMemberships.map((m) => m.community_id);
  }

  // If user coordinates not supplied directly, try resolving from UserProfile
  let userLat = latitude ? Number(latitude) : null;
  let userLng = longitude ? Number(longitude) : null;

  if ((userLat == null || userLng == null) && userId) {
    const profile = await UserProfile.findOne({
      where: { user_id: userId, is_deleted: false },
      attributes: ['latitude', 'longitude'],
    });
    if (profile?.latitude && profile?.longitude) {
      userLat = Number(profile.latitude);
      userLng = Number(profile.longitude);
    }
  }

  const where = {
    is_deleted: false,
    status: 'active',
  };

  if (joinedIds.length > 0) {
    where.communityId = { [Op.notIn]: joinedIds };
  }

  if (category_id) {
    where.category_id = category_id;
  }

  const safeLimit = Math.min(30, Math.max(1, parseInt(limit, 10) || 10));

  // If coordinates available, calculate distance using Haversine formula
  if (userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng)) {
    const haversineDistance = sequelize.literal(`
      (6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(${userLat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${userLng})) +
          sin(radians(${userLat})) * sin(radians(latitude))
        ))
      ))
    `);

    const communities = await Community.findAll({
      attributes: {
        include: [[haversineDistance, 'distance_km']],
      },
      where: {
        ...where,
        latitude: { [Op.ne]: null },
        longitude: { [Op.ne]: null },
      },
      include: [{ model: CommunityCategory, as: 'category' }],
      order: [
        [sequelize.literal('distance_km'), 'ASC'],
        ['members_count', 'DESC'],
      ],
      limit: safeLimit,
    });

    if (communities.length > 0) {
      return communities.filter((c) => {
        const dist = parseFloat(c.getDataValue('distance_km'));
        const radius = parseFloat(c.discovery_radius || max_distance);
        return isNaN(dist) || dist <= radius;
      });
    }
  }

  // Fallback to popularity ranking
  return await Community.findAll({
    where,
    include: [{ model: CommunityCategory, as: 'category' }],
    order: [['members_count', 'DESC'], ['created_at', 'DESC']],
    limit: safeLimit,
  });
};

export const updateCommunity = async (communityId, updateData, actorUserId) => {
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) {
      await transaction.commit();
      return null;
    }

    const allowedFields = [
      'communityName',
      'communityDescription',
      'category_id',
      'cover_image',
      'icon',
      'is_private',
      'rules',
      'latitude',
      'longitude',
      'location_name',
      'discovery_radius',
      'status',
    ];

    const sanitized = {};
    for (const f of allowedFields) {
      if (updateData[f] !== undefined) sanitized[f] = updateData[f];
    }

    const oldSnapshot = community.toJSON();
    await community.update({ ...sanitized, updatedAt: new Date() }, { transaction });

    // Group chat sync: If name or cover image updated, sync linked Chat room
    if (sanitized.communityName || sanitized.cover_image) {
      await Chat.update({
        ...(sanitized.communityName ? { name: sanitized.communityName } : {}),
        ...(sanitized.cover_image ? { avatar_url: sanitized.cover_image } : {}),
        updatedAt: new Date(),
      }, {
        where: { community_id: communityId, chat_type: 'community', is_deleted: false },
        transaction,
      });
    }

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_UPDATED || 'community.updated',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(communityId),
      payload: { communityId: Number(communityId), updatedFields: Object.keys(sanitized) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId,
      action: 'community.updated',
      oldValue: oldSnapshot,
      newValue: sanitized,
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityDetailCache(communityId);
    return getCommunityById(communityId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteCommunity = async (communityId, deletedRemarks, updated_by) => {
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) {
      await transaction.commit();
      return null;
    }

    await community.update({
      is_deleted: true,
      status: 'inactive',
      deletedRemarks: deletedRemarks || 'Deleted by admin',
      updated_by,
      updatedAt: new Date(),
    }, { transaction });

    // Deactivate linked community chat room
    await Chat.update({
      is_active: false,
      is_deleted: true,
      updatedAt: new Date(),
    }, {
      where: { community_id: communityId, chat_type: 'community' },
      transaction,
    });

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_DELETED || 'community.deleted',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(communityId),
      payload: { communityId: Number(communityId), deleted_by: Number(updated_by) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: updated_by,
      action: 'community.deleted',
      reason: deletedRemarks,
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityDetailCache(communityId);
    await invalidateCommunityCategoriesCache();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
