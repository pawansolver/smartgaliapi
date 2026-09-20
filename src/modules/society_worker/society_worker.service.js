import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyWorkerAuthorization from './society_worker_authorization.model.js';
import SocietyWorkerSkill from './society_worker_skill.model.js';
import User from '../user/user.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { createEvent } from '../outbox/outbox.service.js';

/**
 * Get all authorized workers for a society (for admin management panel)
 */
export const getAuthorizedWorkers = async (societyId) => {
  const rawRows = await sequelize.query(`
    SELECT 
      swa.id, swa.society_id, swa.user_id, swa.designation,
      swa.authorization_status, swa.service_provider_profile_id,
      swa.start_date, swa.end_date, swa.notes,
      swa.created_at, swa.updatedAt,
      u.userId, u.userName, u.email, u.phone,
      spp.id AS provider_profile_id, spp.is_verified,
      sc.serviceCategoryId, sc.serviceCategoryName,
      COALESCE(
        (SELECT GROUP_CONCAT(cc.name ORDER BY cc.name SEPARATOR ', ')
         FROM society_worker_skills sws2
         JOIN complaint_categories cc ON cc.id = sws2.complaint_category_id AND cc.is_deleted = 0
         WHERE sws2.authorization_id = swa.id),
        ''
      ) AS skills,
      COALESCE(
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', cc.id, 'name', cc.name))
         FROM society_worker_skills sws3
         JOIN complaint_categories cc ON cc.id = sws3.complaint_category_id AND cc.is_deleted = 0
         WHERE sws3.authorization_id = swa.id),
        '[]'
      ) AS skill_categories
    FROM society_worker_authorizations swa
    JOIN users u ON u.userId = swa.user_id
    LEFT JOIN service_provider_profiles spp ON spp.id = swa.service_provider_profile_id AND spp.is_deleted = 0
    LEFT JOIN service_categories sc ON sc.serviceCategoryId = spp.service_category_id AND sc.is_deleted = 0
    WHERE swa.society_id = :societyId
    AND swa.is_deleted = 0
    ORDER BY swa.authorization_status ASC, swa.designation ASC
  `, { replacements: { societyId }, type: sequelize.QueryTypes.SELECT });

  const rows = Array.isArray(rawRows) ? rawRows : (rawRows ? [rawRows] : []);

  return rows.map(r => ({
    ...r,
    skill_categories: typeof r.skill_categories === 'string'
      ? JSON.parse(r.skill_categories)
      : (r.skill_categories || []),
    is_marketplace_provider: !!r.provider_profile_id,
  }));
};

/**
 * Get eligible workers for assignment to a complaint category.
 * Returns { recommended: [...], others: [...] }
 * recommended = skill-matched active authorized workers
 * others = authorized workers with no skill match (for admin override)
 */
export const getEligibleAssignees = async (societyId, complaintCategory) => {
  const rawWorkers = await sequelize.query(`
    SELECT 
      swa.id AS authorization_id, swa.user_id, swa.designation, swa.authorization_status,
      swa.service_provider_profile_id,
      u.userId, u.userName, u.email, u.phone,
      spp.is_verified AS provider_verified,
      sc.serviceCategoryName AS provider_category,
      COALESCE(
        (SELECT GROUP_CONCAT(LOWER(cc.name) ORDER BY cc.name SEPARATOR '|')
         FROM society_worker_skills sws
         JOIN complaint_categories cc ON cc.id = sws.complaint_category_id AND cc.is_deleted = 0
         WHERE sws.authorization_id = swa.id),
        ''
      ) AS skill_slugs,
      COALESCE(
        (SELECT GROUP_CONCAT(cc.name ORDER BY cc.name SEPARATOR ', ')
         FROM society_worker_skills sws2
         JOIN complaint_categories cc ON cc.id = sws2.complaint_category_id AND cc.is_deleted = 0
         WHERE sws2.authorization_id = swa.id),
        ''
      ) AS skills
    FROM society_worker_authorizations swa
    JOIN users u ON u.userId = swa.user_id
    LEFT JOIN service_provider_profiles spp ON spp.id = swa.service_provider_profile_id AND spp.is_deleted = 0
    LEFT JOIN service_categories sc ON sc.serviceCategoryId = spp.service_category_id AND sc.is_deleted = 0
    WHERE swa.society_id = :societyId
    AND swa.authorization_status = 'active'
    AND swa.is_deleted = 0
    AND (swa.end_date IS NULL OR swa.end_date >= CURDATE())
    ORDER BY swa.designation ASC
  `, { replacements: { societyId }, type: sequelize.QueryTypes.SELECT });

  const allWorkers = Array.isArray(rawWorkers) ? rawWorkers : (rawWorkers ? [rawWorkers] : []);

  // Query registered Marketplace Service Providers (who are not yet in swa for this society)
  const rawMarketplace = await sequelize.query(`
    SELECT 
      NULL AS authorization_id,
      u.userId AS user_id,
      u.userId,
      u.userName,
      u.email,
      u.phone,
      spp.id AS service_provider_profile_id,
      spp.is_verified AS provider_verified,
      spp.hourly_rate,
      spp.experience,
      spp.description,
      COALESCE(sc.serviceCategoryName, 'Service Provider') AS designation,
      COALESCE(sc.serviceCategoryName, 'General') AS skills,
      LOWER(COALESCE(sc.serviceCategoryName, '')) AS skill_slugs,
      1 AS is_marketplace_provider
    FROM service_provider_profiles spp
    JOIN users u ON u.userId = spp.user_id AND u.is_deleted = 0
    LEFT JOIN service_categories sc ON sc.serviceCategoryId = spp.service_category_id AND sc.is_deleted = 0
    WHERE spp.is_deleted = 0
    AND u.userId NOT IN (
      SELECT swa2.user_id 
      FROM society_worker_authorizations swa2 
      WHERE swa2.society_id = :societyId 
      AND swa2.is_deleted = 0
    )
    ORDER BY spp.is_verified DESC, u.userName ASC
    LIMIT 25
  `, { replacements: { societyId }, type: sequelize.QueryTypes.SELECT });

  const marketplaceWorkers = Array.isArray(rawMarketplace) ? rawMarketplace : (rawMarketplace ? [rawMarketplace] : []);

  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetNorm = normalize(complaintCategory);

  const recommended = [];
  const others = [];

  for (const w of allWorkers) {
    if (!w.skill_slugs || w.skill_slugs.length === 0) {
      others.push(w);
      continue;
    }
    const slugs = w.skill_slugs.split('|').map(normalize);
    const matched = slugs.some(s => s.includes(targetNorm) || targetNorm.includes(s));
    if (matched) {
      recommended.push(w);
    } else {
      others.push(w);
    }
  }

  // If no skill-matched in-house workers, and no skills configured across any worker, all in-house workers are recommended
  if (recommended.length === 0 && allWorkers.length > 0) {
    const workersWithSkills = allWorkers.filter(w => w.skill_slugs && w.skill_slugs.length > 0);
    if (workersWithSkills.length === 0) {
      recommended.push(...allWorkers);
      others.length = 0;
    }
  }

  // Sort marketplace workers: those matching targetNorm come first
  if (targetNorm && targetNorm.length > 0) {
    marketplaceWorkers.sort((a, b) => {
      const aMatch = normalize(a.skill_slugs).includes(targetNorm) || targetNorm.includes(normalize(a.skill_slugs));
      const bMatch = normalize(b.skill_slugs).includes(targetNorm) || targetNorm.includes(normalize(b.skill_slugs));
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return (b.provider_verified ? 1 : 0) - (a.provider_verified ? 1 : 0);
    });
  }

  return { recommended, others, marketplace: marketplaceWorkers };
};

/**
 * Create or update a worker authorization
 */
export const authorizeWorker = async (
  societyId,
  { user_id, phone, designation, authorization_status, service_provider_profile_id, start_date, end_date, notes, skill_category_ids },
  actorUserId,
  meta = {}
) => {
  // Resolve user by phone if user_id is not provided
  if (!user_id && phone) {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const user = await User.findOne({
      where: {
        is_deleted: false,
        [Op.or]: [
          { phone: cleanPhone },
          { phone: { [Op.like]: `%${cleanPhone}` } },
        ],
      },
    });
    if (!user) {
      const err = new Error(`No registered user found with phone number "${phone}". They must register on SmartGali first.`);
      err.statusCode = 404;
      throw err;
    }
    user_id = user.userId;
  }

  if (!user_id) {
    const err = new Error('Either user_id or a valid registered phone number is required.');
    err.statusCode = 400;
    throw err;
  }

  const transaction = await sequelize.transaction();
  try {
    let existing = await SocietyWorkerAuthorization.findOne({
      where: { society_id: societyId, user_id, is_deleted: false },
      transaction,
    });

    let auth;
    const isUpdate = !!existing;

    if (isUpdate) {
      await existing.update({
        designation: designation !== undefined ? designation : existing.designation,
        authorization_status: authorization_status !== undefined ? authorization_status : existing.authorization_status,
        service_provider_profile_id: service_provider_profile_id !== undefined ? service_provider_profile_id : existing.service_provider_profile_id,
        start_date: start_date !== undefined ? start_date : existing.start_date,
        end_date: end_date !== undefined ? end_date : existing.end_date,
        notes: notes !== undefined ? notes : existing.notes,
        updated_by: actorUserId,
        updatedAt: new Date(),
      }, { transaction });
      auth = existing;
    } else {
      auth = await SocietyWorkerAuthorization.create({
        society_id: societyId,
        user_id,
        designation: designation || 'Worker',
        authorization_status: authorization_status || 'active',
        service_provider_profile_id: service_provider_profile_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        notes: notes || null,
        created_by: actorUserId,
      }, { transaction });
    }

    // Update skills if provided
    if (Array.isArray(skill_category_ids)) {
      await SocietyWorkerSkill.destroy({ where: { authorization_id: auth.id }, transaction });
      if (skill_category_ids.length > 0) {
        await SocietyWorkerSkill.bulkCreate(
          skill_category_ids.map(catId => ({ authorization_id: auth.id, complaint_category_id: catId })),
          { transaction, ignoreDuplicates: true }
        );
      }
    }

    const actionName = isUpdate ? 'society.worker_authorization_updated' : 'society.worker_authorized';

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: actionName,
      targetUserId: user_id,
      targetEntityType: 'worker_authorization',
      targetEntityId: Number(auth.id),
      newValue: { designation: auth.designation, authorization_status: auth.authorization_status },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: actionName,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        userId: Number(user_id),
        authorizationId: Number(auth.id),
        designation: auth.designation,
      },
    }, { transaction });

    await transaction.commit();
    return auth;
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
};

/**
 * Revoke a worker authorization
 */
export const revokeWorkerAuthorization = async (authId, societyId, reason, actorUserId, meta = {}) => {
  const auth = await SocietyWorkerAuthorization.findOne({
    where: { id: authId, society_id: societyId, is_deleted: false },
  });
  if (!auth) return null;

  await auth.update({
    authorization_status: 'revoked',
    notes: reason ? `[Revoked] ${reason}` : '[Revoked]',
    updated_by: actorUserId,
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.worker_authorization_revoked',
    targetUserId: auth.user_id,
    targetEntityType: 'worker_authorization',
    targetEntityId: Number(authId),
    reason,
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return auth;
};

/**
 * Validate that a specific user is an active authorized worker for this society.
 * Used by the complaint assignment engine to verify eligibility.
 */
export const validateWorkerAuthorization = async (societyId, userId) => {
  return await SocietyWorkerAuthorization.findOne({
    where: {
      society_id: societyId,
      user_id: userId,
      authorization_status: 'active',
      is_deleted: false,
      [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: new Date() } }],
    },
  });
};
