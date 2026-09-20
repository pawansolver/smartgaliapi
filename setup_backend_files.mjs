/**
 * Master setup script - writes all enterprise worker backend files
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = 'C:\\Users\\pawan\\Downloads\\smartgaliapi-main\\smartgaliapi-main\\src\\modules';

function write(relPath, content) {
  const fullPath = BASE + '\\' + relPath;
  const dir = dirname(fullPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
  console.log('  Written:', fullPath.replace(BASE, ''));
}

// ── 1. Society Worker Skill Model ────────────────────────────────────────────
write('society_worker\\society_worker_skill.model.js', `
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyWorkerAuthorization from './society_worker_authorization.model.js';

const SocietyWorkerSkill = sequelize.define('SocietyWorkerSkill', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  authorization_id: {
    type: DataTypes.BIGINT, allowNull: false,
    references: { model: SocietyWorkerAuthorization, key: 'id' },
  },
  complaint_category_id: { type: DataTypes.BIGINT, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'society_worker_skills', timestamps: false });

SocietyWorkerSkill.belongsTo(SocietyWorkerAuthorization, { foreignKey: 'authorization_id', as: 'authorization' });
SocietyWorkerAuthorization.hasMany(SocietyWorkerSkill, { foreignKey: 'authorization_id', as: 'skills' });

export default SocietyWorkerSkill;
`.trimStart());

// ── 2. Complaint Assignment History Model ────────────────────────────────────
write('society_complaint\\complaint_assignment_history.model.js', `
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

const ComplaintAssignmentHistory = sequelize.define('ComplaintAssignmentHistory', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  complaint_id: { type: DataTypes.BIGINT, allowNull: false },
  previous_assignee_id: { type: DataTypes.BIGINT, allowNull: true },
  new_assignee_id: { type: DataTypes.BIGINT, allowNull: true },
  assigned_by: { type: DataTypes.BIGINT, allowNull: false },
  action_type: {
    type: DataTypes.ENUM('assigned', 'reassigned', 'unassigned'),
    allowNull: false, defaultValue: 'assigned',
  },
  reason: { type: DataTypes.TEXT, allowNull: true },
  assigned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'complaint_assignment_history', timestamps: false });

ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedByUser' });
ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'previous_assignee_id', as: 'previousAssignee' });
ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'new_assignee_id', as: 'newAssignee' });

export default ComplaintAssignmentHistory;
`.trimStart());

// ── 3. Society Worker Service ─────────────────────────────────────────────────
write('society_worker\\society_worker.service.js', `
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
 * Get all authorized workers for a society
 */
export const getAuthorizedWorkers = async (societyId) => {
  return await SocietyWorkerAuthorization.findAll({
    where: { society_id: societyId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      {
        model: ServiceProviderProfile, as: 'providerProfile',
        required: false,
        include: [{ model: ServiceCategory, as: 'category', attributes: ['serviceCategoryId', 'serviceCategoryName'] }],
      },
    ],
    order: [['authorization_status', 'ASC'], ['designation', 'ASC']],
  });
};

/**
 * Get workers eligible to be assigned a complaint of a given category.
 * Eligibility = active authorization + skill matching complaint category.
 * If no workers have explicit skill entries, return all active workers for that society.
 */
export const getEligibleAssignees = async (societyId, complaintCategory) => {
  // First try skill-matched
  const withSkills = await SocietyWorkerAuthorization.findAll({
    where: { society_id: societyId, authorization_status: 'active', is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      {
        model: SocietyWorkerSkill, as: 'skills', required: true,
        include: [{
          model: sequelize.models.ComplaintCategory || null, as: null,
          attributes: [],
        }],
      },
      { model: ServiceProviderProfile, as: 'providerProfile', required: false },
    ],
  }).catch(() => []); // If ComplaintCategory not loaded, skip

  // Simpler approach: join on complaint_categories by category name slug
  const [eligibleRows] = await sequelize.query(`
    SELECT 
      swa.id, swa.society_id, swa.user_id, swa.designation, swa.authorization_status,
      swa.service_provider_profile_id, swa.notes,
      u.userId, u.userName, u.email, u.phone,
      spp.id as provider_id, spp.is_verified,
      sc.serviceCategoryId, sc.serviceCategoryName,
      GROUP_CONCAT(DISTINCT cc.name ORDER BY cc.name SEPARATOR ', ') as skills
    FROM society_worker_authorizations swa
    JOIN users u ON u.userId = swa.user_id
    LEFT JOIN society_worker_skills sws ON sws.authorization_id = swa.id
    LEFT JOIN complaint_categories cc ON cc.id = sws.complaint_category_id AND cc.is_deleted = 0
    LEFT JOIN service_provider_profiles spp ON spp.id = swa.service_provider_profile_id AND spp.is_deleted = 0
    LEFT JOIN service_categories sc ON sc.serviceCategoryId = spp.service_category_id AND sc.is_deleted = 0
    WHERE swa.society_id = :societyId
    AND swa.authorization_status = 'active'
    AND swa.is_deleted = 0
    AND (swa.end_date IS NULL OR swa.end_date >= CURDATE())
    GROUP BY swa.id, swa.society_id, swa.user_id, swa.designation, swa.authorization_status,
      swa.service_provider_profile_id, swa.notes, u.userId, u.userName, u.email, u.phone,
      spp.id, spp.is_verified, sc.serviceCategoryId, sc.serviceCategoryName
    ORDER BY swa.designation ASC
  `, { replacements: { societyId }, type: sequelize.QueryTypes.SELECT });

  // Filter by skill if category provided and skills exist
  const normalizeCategory = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetCat = normalizeCategory(complaintCategory);

  const workersWithSkills = eligibleRows.filter(r => r.skills && r.skills.trim().length > 0);
  
  if (workersWithSkills.length > 0 && targetCat) {
    const matched = eligibleRows.filter(r => {
      if (!r.skills) return false;
      const skillList = r.skills.split(',').map(s => normalizeCategory(s));
      return skillList.some(s => s.includes(targetCat) || targetCat.includes(s));
    });
    // If we have skill-matched results, return them + workers with no skills registered (fallback)
    const unregistered = eligibleRows.filter(r => !r.skills || r.skills.trim().length === 0);
    return { recommended: matched, others: unregistered };
  }

  return { recommended: eligibleRows, others: [] };
};

/**
 * Create or update a worker authorization for a society
 */
export const authorizeWorker = async (societyId, { user_id, designation, authorization_status, service_provider_profile_id, start_date, end_date, notes, skill_category_ids }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    // Check if authorization already exists (soft-delete aware)
    const existing = await SocietyWorkerAuthorization.findOne({
      where: { society_id: societyId, user_id, is_deleted: false },
      transaction,
    });

    let auth;
    if (existing) {
      await existing.update({
        designation: designation || existing.designation,
        authorization_status: authorization_status || existing.authorization_status,
        service_provider_profile_id: service_provider_profile_id !== undefined ? service_provider_profile_id : existing.service_provider_profile_id,
        start_date: start_date || existing.start_date,
        end_date: end_date || existing.end_date,
        notes: notes || existing.notes,
        updated_by: actorUserId,
        updatedAt: new Date(),
      }, { transaction });
      auth = existing;
    } else {
      auth = await SocietyWorkerAuthorization.create({
        society_id: societyId, user_id, designation: designation || 'Worker',
        authorization_status: authorization_status || 'active',
        service_provider_profile_id: service_provider_profile_id || null,
        start_date: start_date || null, end_date: end_date || null,
        notes: notes || null, created_by: actorUserId,
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

    await logSocietyAudit({
      societyId, actorUserId,
      action: existing ? 'society.worker_authorization_updated' : 'society.worker_authorized',
      targetUserId: user_id, targetEntityType: 'worker_authorization', targetEntityId: auth.id,
      newValue: { designation, authorization_status },
      requestId: meta.requestId, ipAddress: meta.ip, userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: existing ? 'society.worker_authorization_updated' : 'society.worker_authorized',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: { societyId: Number(societyId), userId: Number(user_id), authorizationId: Number(auth.id) },
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
    notes: reason || auth.notes,
    updated_by: actorUserId,
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId, actorUserId,
    action: 'society.worker_authorization_revoked',
    targetUserId: auth.user_id, targetEntityType: 'worker_authorization', targetEntityId: authId,
    reason, requestId: meta.requestId, ipAddress: meta.ip, userAgent: meta.userAgent,
  });

  return auth;
};

/**
 * Validate that a user is an active authorized worker for this society
 */
export const validateWorkerAuthorization = async (societyId, userId) => {
  const auth = await SocietyWorkerAuthorization.findOne({
    where: {
      society_id: societyId, user_id: userId,
      authorization_status: 'active', is_deleted: false,
      [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: new Date() } }],
    },
  });
  return auth;
};
`.trimStart());

// ── 4. Society Worker Controller ─────────────────────────────────────────────
write('society_worker\\society_worker.controller.js', `
import { successResponse, errorResponse } from '../../utils/response.js';
import * as workerService from './society_worker.service.js';

export const getAuthorizedWorkers = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    const workers = await workerService.getAuthorizedWorkers(societyId);
    return successResponse(res, 200, 'Authorized workers fetched', workers);
  } catch (err) { return next(err); }
};

export const getEligibleAssignees = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { category } = req.query;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    const result = await workerService.getEligibleAssignees(societyId, category);
    return successResponse(res, 200, 'Eligible assignees fetched', result);
  } catch (err) { return next(err); }
};

export const authorizeWorker = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    const auth = await workerService.authorizeWorker(societyId, req.body, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Worker authorized successfully', auth);
  } catch (err) { return next(err); }
};

export const updateWorkerAuthorization = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { id } = req.params;
    // Load auth and update by putting user_id from existing record
    const { SocietyWorkerAuthorization } = await import('./society_worker_authorization.model.js');
    const existing = await SocietyWorkerAuthorization.findOne({ where: { id, society_id: societyId, is_deleted: false } });
    if (!existing) return errorResponse(res, 404, 'Worker authorization not found');
    const auth = await workerService.authorizeWorker(societyId, { user_id: existing.user_id, ...req.body }, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Worker authorization updated', auth);
  } catch (err) { return next(err); }
};

export const revokeWorkerAuthorization = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { id } = req.params;
    const auth = await workerService.revokeWorkerAuthorization(id, societyId, req.body?.reason, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    if (!auth) return errorResponse(res, 404, 'Worker authorization not found');
    return successResponse(res, 200, 'Worker authorization revoked', auth);
  } catch (err) { return next(err); }
};
`.trimStart());

// ── 5. Society Worker Routes ─────────────────────────────────────────────────
write('society_worker\\society_worker.routes.js', `
import express from 'express';
import * as workerController from './society_worker.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { societyReadLimiter, societyMutationLimiter } from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// GET all authorized workers for a society
router.get('/', authenticate, societyReadLimiter, requireSocietyRole(['admin', 'committee']), workerController.getAuthorizedWorkers);

// GET eligible assignees for a complaint (by category)
router.get('/eligible', authenticate, societyReadLimiter, requireSocietyRole(['admin', 'committee']), workerController.getEligibleAssignees);

// POST authorize a worker
router.post('/', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.authorizeWorker);

// PUT update authorization
router.put('/:id', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.updateWorkerAuthorization);

// DELETE revoke authorization
router.delete('/:id', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.revokeWorkerAuthorization);

export default router;
`.trimStart());

console.log('\nAll backend files written successfully!');
