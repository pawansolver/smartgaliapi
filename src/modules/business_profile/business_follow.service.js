import { Op, fn, col, literal } from 'sequelize';
import BusinessFollow from './business_follow.model.js';
import BusinessProfile from './business_profile.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessCoverageArea from './business_coverage_area.model.js';
import SocietyBusinessAccess from './society_business_access.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import BusinessOffer from '../business_offer/business_offer.model.js';
import BusinessReview from '../business_review/business_review.model.js';
import businessCoverageService from './business_coverage.service.js';
import { createNotification } from '../notification/notification.service.js';
import { sendToUser } from '../../infrastructure/notifications/push.service.js';

let tableSyncPromise = null;

export const ensureBusinessFollowTable = async () => {
  if (!tableSyncPromise) {
    tableSyncPromise = BusinessFollow.sync().catch((err) => {
      tableSyncPromise = null;
      throw err;
    });
  }
  return tableSyncPromise;
};

/**
 * Fetch follower counts and optional per-viewer follow state for a batch of business IDs.
 */
export const fetchFollowStatsByBusinessIds = async (businessIds = [], viewerUserId = null) => {
  if (!Array.isArray(businessIds) || businessIds.length === 0) return {};
  await ensureBusinessFollowTable();

  const ids = [...new Set(businessIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return {};

  const queries = [
    BusinessFollow.findAll({
      attributes: ['business_id', [fn('COUNT', col('id')), 'cnt']],
      where: {
        business_id: { [Op.in]: ids },
        is_active: true,
        is_deleted: false,
      },
      group: ['business_id'],
      raw: true,
    }),
  ];

  const viewerId = Number(viewerUserId);
  if (Number.isInteger(viewerId) && viewerId > 0) {
    queries.push(
      BusinessFollow.findAll({
        attributes: ['business_id'],
        where: {
          business_id: { [Op.in]: ids },
          user_id: viewerId,
          is_active: true,
          is_deleted: false,
        },
        raw: true,
      })
    );
  }

  const [countRows, myRows = []] = await Promise.all(queries);
  const mySet = new Set(myRows.map((r) => Number(r.business_id)));
  const countMap = Object.fromEntries(countRows.map((r) => [Number(r.business_id), Number(r.cnt || 0)]));

  const result = {};
  for (const id of ids) {
    result[id] = {
      follower_count: countMap[id] || 0,
      is_following: mySet.has(id),
    };
  }
  return result;
};

const emitFollowOwnerNotification = async (profile, followerUserId) => {
  try {
    const ownerId = Number(profile?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0 || ownerId === Number(followerUserId)) return;

    const title = 'New Shop Follower';
    const message = `A nearby resident started following ${profile.businessName || 'your shop'}.`;
    await createNotification({
      user_id: ownerId,
      title,
      message,
      type: 'info',
      data: {
        business_id: Number(profile.id),
        follower_user_id: Number(followerUserId),
        action: 'business_follow',
      },
    });
    await sendToUser({
      userId: ownerId,
      title,
      body: message,
      data: { businessId: String(profile.id), type: 'business_follow' },
    }).catch(() => {});
  } catch (_) {
    // Non-blocking notification failure
  }
};

export const followBusiness = async (businessId, userId, notifyUpdates = true) => {
  await ensureBusinessFollowTable();
  const bId = Number(businessId);
  const uId = Number(userId);
  if (!Number.isInteger(bId) || bId <= 0) {
    const err = new Error('Valid business id is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(uId) || uId <= 0) {
    const err = new Error('Authenticated user is required.');
    err.statusCode = 401;
    throw err;
  }

  const profile = await BusinessProfile.findOne({
    where: { id: bId, is_deleted: false, is_active: true },
  });
  if (!profile) {
    const err = new Error('Business profile not found.');
    err.statusCode = 404;
    throw err;
  }

  const existing = await BusinessFollow.findOne({
    where: { business_id: bId, user_id: uId },
  });

  let createdOrReactivated = false;
  if (existing) {
    if (existing.is_deleted || !existing.is_active) {
      await existing.update({
        is_active: true,
        is_deleted: false,
        notify_updates: Boolean(notifyUpdates),
        updated_by: uId,
        updatedAt: new Date(),
      });
      createdOrReactivated = true;
    }
  } else {
    await BusinessFollow.create({
      business_id: bId,
      user_id: uId,
      notify_updates: Boolean(notifyUpdates),
      is_active: true,
      is_deleted: false,
      created_by: uId,
      updated_by: uId,
      created_at: new Date(),
      updatedAt: new Date(),
    });
    createdOrReactivated = true;
  }

  const followerCount = await BusinessFollow.count({
    where: { business_id: bId, is_active: true, is_deleted: false },
  });

  if (createdOrReactivated) {
    emitFollowOwnerNotification(profile, uId);
  }

  return {
    business_id: bId,
    is_following: true,
    follower_count: followerCount,
  };
};

export const unfollowBusiness = async (businessId, userId) => {
  await ensureBusinessFollowTable();
  const bId = Number(businessId);
  const uId = Number(userId);
  if (!Number.isInteger(bId) || bId <= 0) {
    const err = new Error('Valid business id is required.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await BusinessFollow.findOne({
    where: { business_id: bId, user_id: uId, is_deleted: false, is_active: true },
  });

  if (existing) {
    await existing.update({
      is_active: false,
      is_deleted: true,
      updated_by: uId,
      updatedAt: new Date(),
    });
  }

  const followerCount = await BusinessFollow.count({
    where: { business_id: bId, is_active: true, is_deleted: false },
  });

  return {
    business_id: bId,
    is_following: false,
    follower_count: followerCount,
  };
};

export const getFollowedBusinesses = async (userId, query = {}, formatBusinessProfileFn) => {
  await ensureBusinessFollowTable();
  const uId = Number(userId);
  const rows = await BusinessFollow.findAll({
    where: { user_id: uId, is_active: true, is_deleted: false },
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    raw: true,
  });

  const ids = rows.map((r) => Number(r.business_id)).filter(Boolean);
  if (ids.length === 0) {
    return { total: 0, items: [] };
  }

  const loc = businessCoverageService.parseLocationQuery(query);
  const profiles = await BusinessProfile.findAll({
    where: { id: { [Op.in]: ids }, is_deleted: false, is_active: true },
    include: [
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'], required: false },
      {
        model: BusinessCoverageArea,
        as: 'coverageAreas',
        where: { is_deleted: false, is_active: true },
        required: false,
      },
      {
        model: SocietyBusinessAccess,
        as: 'societyAccesses',
        where: { is_deleted: false },
        required: false,
      },
    ],
  });

  const activeIds = profiles.map((p) => Number(p.id));
  const [prodRows, revRows, offerRows, followStatsMap] = await Promise.all([
    BusinessProduct.findAll({
      attributes: [
        'business_id',
        [fn('COUNT', col('id')), 'cnt'],
        [fn('SUM', literal('CASE WHEN home_delivery = 1 THEN 1 ELSE 0 END')), 'del_cnt'],
        [fn('SUM', literal('CASE WHEN store_pickup = 1 THEN 1 ELSE 0 END')), 'pick_cnt'],
      ],
      where: {
        business_id: { [Op.in]: activeIds },
        status: 'active',
        approval_status: 'approved',
        is_deleted: false,
      },
      group: ['business_id'],
      raw: true,
    }),
    BusinessReview.findAll({
      attributes: [
        'business_id',
        [fn('COUNT', col('id')), 'cnt'],
        [fn('AVG', col('rating')), 'avg_rating'],
      ],
      where: { business_id: { [Op.in]: activeIds }, is_deleted: false },
      group: ['business_id'],
      raw: true,
    }),
    BusinessOffer.findAll({
      attributes: ['business_id', [fn('COUNT', col('id')), 'cnt']],
      where: { business_id: { [Op.in]: activeIds }, is_active: true, is_deleted: false },
      group: ['business_id'],
      raw: true,
    }),
    fetchFollowStatsByBusinessIds(activeIds, uId),
  ]);

  const prodMap = Object.fromEntries(
    prodRows.map((r) => [
      Number(r.business_id),
      {
        product_count: Number(r.cnt || 0),
        delivery_product_count: Number(r.del_cnt || 0),
        pickup_product_count: Number(r.pick_cnt || 0),
      },
    ])
  );
  const revMap = Object.fromEntries(
    revRows.map((r) => {
      const cnt = Number(r.cnt || 0);
      return [
        Number(r.business_id),
        {
          review_count: cnt,
          rating: cnt > 0 && r.avg_rating != null ? Number(Number(r.avg_rating).toFixed(1)) : null,
        },
      ];
    })
  );
  const offerMap = Object.fromEntries(offerRows.map((r) => [Number(r.business_id), Number(r.cnt || 0)]));

  const byId = new Map();
  for (const inst of profiles) {
    const plain = inst.toJSON();
    const evalResult = businessCoverageService.evaluateBusinessMatch(
      plain,
      plain.coverageAreas || [],
      plain.societyAccesses || [],
      loc
    );
    const pCap = prodMap[Number(plain.id)] || {};
    const rev = revMap[Number(plain.id)] || {};
    const fol = followStatsMap[Number(plain.id)] || { follower_count: 1, is_following: true };
    const formatted = formatBusinessProfileFn(plain, {
      distance_km: evalResult.distance_km,
      distance: evalResult.distance,
      matched_by: loc.hasLocationFilter ? evalResult.matched_by : null,
      society_access_status: evalResult.society_access_status || null,
      product_count: pCap.product_count || 0,
      delivery_product_count: pCap.delivery_product_count || 0,
      pickup_product_count: pCap.pickup_product_count || 0,
      supports_home_delivery: (pCap.delivery_product_count || 0) > 0,
      supports_store_pickup: (pCap.pickup_product_count || 0) > 0,
      active_offer_count: offerMap[Number(plain.id)] || 0,
      rating: rev.rating ?? null,
      review_count: rev.review_count ?? 0,
      follower_count: fol.follower_count,
      is_following: true,
      is_deliverable: loc.hasLocationFilter ? Boolean(evalResult.matched) : true,
    });
    byId.set(Number(plain.id), formatted);
  }

  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return { total: ordered.length, items: ordered };
};

export const getFollowedBusinessUpdates = async (userId, query = {}) => {
  await ensureBusinessFollowTable();
  const uId = Number(userId);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit || 20, 10)));

  const follows = await BusinessFollow.findAll({
    attributes: ['business_id'],
    where: { user_id: uId, is_active: true, is_deleted: false },
    raw: true,
  });
  const ids = [...new Set(follows.map((r) => Number(r.business_id)).filter(Boolean))];
  if (ids.length === 0) {
    return { total: 0, updates: [] };
  }

  const [profiles, offers, products] = await Promise.all([
    BusinessProfile.findAll({
      attributes: ['id', 'businessName', 'logo_url', 'serviceCategory'],
      where: { id: { [Op.in]: ids }, is_deleted: false, is_active: true },
      raw: true,
    }),
    BusinessOffer.findAll({
      where: { business_id: { [Op.in]: ids }, is_active: true, is_deleted: false },
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit,
      raw: true,
    }),
    BusinessProduct.findAll({
      attributes: ['id', 'business_id', 'name', 'selling_price', 'mrp', 'images', 'home_delivery', 'store_pickup', 'created_at'],
      where: {
        business_id: { [Op.in]: ids },
        status: 'active',
        approval_status: 'approved',
        is_deleted: false,
      },
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit,
      raw: true,
    }),
  ]);

  const shopMap = Object.fromEntries(profiles.map((p) => [Number(p.id), p]));
  const updates = [];

  for (const off of offers) {
    const shop = shopMap[Number(off.business_id)];
    if (!shop) continue;
    updates.push({
      update_type: 'offer',
      id: Number(off.id),
      business_id: Number(off.business_id),
      business_name: shop.businessName,
      business_logo: shop.logo_url || null,
      title: off.title,
      subtitle: off.promo_code
        ? `Use code ${off.promo_code}${off.discount ? ` • ${off.discount}` : ''}`
        : (off.discount || off.description || 'Special shop offer'),
      promo_code: off.promo_code || null,
      created_at: off.created_at || off.updatedAt || null,
    });
  }

  for (const prod of products) {
    const shop = shopMap[Number(prod.business_id)];
    if (!shop) continue;
    let firstImage = null;
    if (Array.isArray(prod.images) && prod.images.length > 0) {
      firstImage = prod.images[0];
    } else if (typeof prod.images === 'string' && prod.images.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(prod.images);
        if (Array.isArray(parsed) && parsed.length > 0) firstImage = parsed[0];
      } catch (_) {}
    }
    updates.push({
      update_type: 'product',
      id: Number(prod.id),
      business_id: Number(prod.business_id),
      business_name: shop.businessName,
      business_logo: shop.logo_url || null,
      title: prod.name,
      subtitle: `New item ₹${Number(prod.selling_price || 0).toFixed(0)}`,
      image_url: firstImage,
      home_delivery: Boolean(prod.home_delivery),
      store_pickup: Boolean(prod.store_pickup),
      created_at: prod.created_at || null,
    });
  }

  updates.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { total: updates.length, updates: updates.slice(0, limit) };
};

