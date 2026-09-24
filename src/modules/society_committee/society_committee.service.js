import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { SocietyCommittee, SocietyCommitteeMember, SocietyCommitteePermission } from './society_committee.model.js';
import Permission from '../permission/permission.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { createEvent } from '../outbox/outbox.service.js';
import { invalidateUserPermissionCache } from '../permission/permission.service.js';
import { emitNotification } from '../notification/notification.service.js';

/**
 * Enterprise Operational Module Definitions
 * Maps backend permissions to real, implemented operational modules in SmartGali
 */
export const OPERATIONAL_MODULES = {
  visitor: {
    key: 'visitor',
    label: 'Visitor Management',
    icon: 'people',
    description: 'Gate entries, check-in/out, visitor approval & logs',
    match: (p) => p.module === 'visitor' || p.permission_code === 'society.visitor.manage',
  },
  guard: {
    key: 'guard',
    label: 'Guard Management',
    icon: 'security',
    description: 'Guard onboarding, profiles, gate & shift assignments',
    match: (p) => p.module === 'guard',
  },
  gate: {
    key: 'gate',
    label: 'Gate Management',
    icon: 'door_sliding',
    description: 'Gates configuration, entry points & status',
    match: (p) => p.module === 'gate',
  },
  shift: {
    key: 'shift',
    label: 'Shift Schedules',
    icon: 'schedule',
    description: 'Security shifts, timings & rosters',
    match: (p) => p.module === 'shift',
  },
  security: {
    key: 'security',
    label: 'Security & SOS Monitoring',
    icon: 'shield',
    description: 'Security dashboard, incident reports & audits',
    match: (p) => p.module === 'security',
  },
  complaint: {
    key: 'complaint',
    label: 'Complaints & Maintenance',
    icon: 'report_problem',
    description: 'Resident complaints, work orders & resolution',
    match: (p) => p.permission_code.startsWith('society.complaint.'),
  },
  notice: {
    key: 'notice',
    label: 'Announcements & Notices',
    icon: 'campaign',
    description: 'Broadcast notices, circulars & announcements',
    match: (p) => p.permission_code.startsWith('society.notice.'),
  },
  event: {
    key: 'event',
    label: 'Events & Gatherings',
    icon: 'event',
    description: 'Society events, celebrations, RSVPs & participants',
    match: (p) => p.module === 'event',
  },
  parking: {
    key: 'parking',
    label: 'Parking Management',
    icon: 'local_parking',
    description: 'Parking slots, vehicle authorization & stickers',
    match: (p) => p.permission_code.startsWith('society.parking.'),
  },
  committee: {
    key: 'committee',
    label: 'Governance & Committees',
    icon: 'groups',
    description: 'Committee governance, member delegation & PBAC',
    match: (p) => p.module === 'committee',
  },
};

export const COMMITTEE_CATEGORIES = [
  {
    key: 'security',
    label: 'Security Committee',
    description: 'Oversees gates, guards, shifts, visitors, and society security',
    recommended_modules: ['visitor', 'guard', 'gate', 'shift', 'security'],
  },
  {
    key: 'maintenance',
    label: 'Maintenance Committee',
    description: 'Oversees infrastructure maintenance, vendor repairs, and resident complaints',
    recommended_modules: ['complaint'],
  },
  {
    key: 'events',
    label: 'Events Committee',
    description: 'Organizes cultural programs, festivals, sports, and society gatherings',
    recommended_modules: ['event'],
  },
  {
    key: 'operations',
    label: 'Operations Committee',
    description: 'General administrative society operations, notices, and parking',
    recommended_modules: ['visitor', 'gate', 'parking', 'notice'],
  },
  {
    key: 'garden',
    label: 'Garden Committee',
    description: 'Landscaping, horticulture, and green areas classification',
    recommended_modules: [],
    note: 'Garden operational module is unavailable in this release. Classification metadata only.',
  },
  {
    key: 'finance',
    label: 'Finance Committee',
    description: 'Society accounts, maintenance billing, and treasury classification',
    recommended_modules: [],
    note: 'Finance operational module is unavailable in this release. Classification metadata only.',
  },
  {
    key: 'custom',
    label: 'Custom Team / Committee',
    description: 'Custom governance team with tailored operational modules',
    recommended_modules: [],
  },
];

/**
 * Validates permission codes against permission master table.
 * Rejects unknown codes or inactive permissions with HTTP 400.
 * If selectedModules provided, verifies codes belong to selected modules.
 */
export const validatePermissionsMaster = async (permissionCodes, selectedModules = null) => {
  if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) return [];
  const uniqueCodes = [...new Set(permissionCodes.map(c => String(c).trim()).filter(Boolean))];
  if (uniqueCodes.length === 0) return [];

  // Check all codes exist in Permission table and are active and not deleted
  const validMaster = await Permission.findAll({
    where: {
      permission_code: uniqueCodes,
      is_active: true,
      is_deleted: false,
    },
    attributes: ['id', 'permission_code', 'module', 'permission_name', 'is_active', 'is_deleted'],
  });

  const validSet = new Set(validMaster.map(p => p.permission_code));
  const invalidCodes = uniqueCodes.filter(c => !validSet.has(c));

  if (invalidCodes.length > 0) {
    const err = new Error(`Invalid or inactive permission code(s): ${invalidCodes.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // If selectedModules provided, ensure all permissions belong to the chosen modules
  if (Array.isArray(selectedModules) && selectedModules.length > 0) {
    const selectedModSet = new Set(selectedModules.map(m => String(m).toLowerCase().trim()));
    const unallowedForModules = [];

    for (const p of validMaster) {
      let matchedModuleKey = null;
      for (const [modKey, cfg] of Object.entries(OPERATIONAL_MODULES)) {
        if (cfg.match(p)) {
          matchedModuleKey = modKey;
          break;
        }
      }
      if (!matchedModuleKey || !selectedModSet.has(matchedModuleKey)) {
        unallowedForModules.push(`${p.permission_code} (requires module '${matchedModuleKey || p.module}')`);
      }
    }

    if (unallowedForModules.length > 0) {
      const err = new Error(`Permission code(s) do not belong to selected module(s): ${unallowedForModules.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
  }

  return uniqueCodes;
};

/**
 * Validates operational scope.
 * Entire society and Gate scopes are supported and modeled.
 * Zone and Block scopes are rejected because their resource entities are not modeled.
 */
export const validateOperationalScope = (scopeType, scopeGateIds = null, scopeId = null) => {
  const cleanType = String(scopeType || 'entire_society').toLowerCase().trim();
  if (cleanType === 'zone' || cleanType === 'block') {
    const err = new Error(`Operational scope '${cleanType}' is not supported because ${cleanType} entities are not modeled.`);
    err.statusCode = 400;
    throw err;
  }
  if (!['entire_society', 'gate', 'specific_gates'].includes(cleanType)) {
    const err = new Error(`Invalid scope type: ${scopeType}. Supported scopes: entire_society, gate.`);
    err.statusCode = 400;
    throw err;
  }
  return cleanType;
};

/**
 * Returns dynamic permission catalog from backend permissions master.
 */
export const getPermissionCatalog = async (societyId) => {
  const masterPerms = await Permission.findAll({
    where: {
      is_active: true,
      is_deleted: false,
    },
    attributes: ['id', 'permission_code', 'permission_name', 'module', 'description', 'is_active'],
    order: [['module', 'ASC'], ['permission_code', 'ASC']],
  });

  const catalog = [];
  for (const p of masterPerms) {
    let matchedKey = null;
    let matchedLabel = p.module;
    for (const [key, modCfg] of Object.entries(OPERATIONAL_MODULES)) {
      if (modCfg.match(p)) {
        matchedKey = key;
        matchedLabel = modCfg.label;
        break;
      }
    }
    // Only include permissions matching supported society operational modules
    if (matchedKey) {
      const parts = p.permission_code.split('.');
      const action = parts[parts.length - 1];
      catalog.push({
        code: p.permission_code,
        module: matchedKey,
        module_label: matchedLabel,
        raw_module: p.module,
        action: action,
        label: p.permission_name || p.permission_code,
        description: p.description || '',
        is_active: p.is_active,
      });
    }
  }

  const moduleList = Object.values(OPERATIONAL_MODULES).map(m => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    description: m.description,
  }));

  return {
    modules: moduleList,
    permissions: catalog,
    categories: COMMITTEE_CATEGORIES,
  };
};

export const createCommittee = async (societyId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const scopeType = validateOperationalScope(data.scope_type, data.scope_gate_ids, data.scope_id);
    const selectedModules = Array.isArray(data.modules) ? data.modules : (Array.isArray(data.selected_modules) ? data.selected_modules : null);

    // Validate permissions against master
    let validatedPerms = [];
    if (Array.isArray(data.permissions) && data.permissions.length > 0) {
      validatedPerms = await validatePermissionsMaster(data.permissions, selectedModules);
    }

    const committee = await SocietyCommittee.create({
      society_id: societyId,
      name: data.name.trim(),
      description: data.description || null,
      committee_type: data.committee_type || 'custom',
      scope_type: scopeType,
      scope_gate_ids: data.scope_gate_ids ? (Array.isArray(data.scope_gate_ids) ? data.scope_gate_ids : [data.scope_gate_ids]) : (data.scope_id ? [Number(data.scope_id)] : null),
      scope_id: data.scope_id || null,
      status: data.status || 'active',
      created_by: actorUserId,
      created_at: new Date(),
      updated_at: new Date(),
    }, { transaction });

    // Seed permissions
    if (validatedPerms.length > 0) {
      const permRows = validatedPerms.map(p => ({
        society_id: societyId,
        committee_id: committee.id,
        permission_code: p,
        created_by: actorUserId,
        created_at: new Date(),
      }));
      await SocietyCommitteePermission.bulkCreate(permRows, { transaction });
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_created',
      targetEntityType: 'committee',
      targetEntityId: committee.id,
      newValue: { name: committee.name, committee_type: committee.committee_type, scope_type: committee.scope_type, scope_id: committee.scope_id },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.committee_created',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: { societyId, committeeId: committee.id, name: committee.name },
    }, { transaction });

    await transaction.commit();
    return getCommitteeById(committee.id, societyId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommittees = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;
  if (query.committee_type) where.committee_type = query.committee_type;

  const committees = await SocietyCommittee.findAll({
    where,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: SocietyCommitteeMember,
        as: 'members',
        where: { is_deleted: false },
        required: false,
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }],
      },
      {
        model: SocietyCommitteePermission,
        as: 'permissions',
        attributes: ['permission_code', 'committee_member_id'],
      },
    ],
  });

  return committees;
};

export const getCommitteeById = async (id, societyId) => {
  return await SocietyCommittee.findOne({
    where: { id, society_id: societyId, is_deleted: false },
    include: [
      {
        model: SocietyCommitteeMember,
        as: 'members',
        where: { is_deleted: false },
        required: false,
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }],
      },
      {
        model: SocietyCommitteePermission,
        as: 'permissions',
        attributes: ['permission_code', 'committee_member_id'],
      },
    ],
  });
};

export const updateCommittee = async (id, societyId, data, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const committee = await SocietyCommittee.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!committee) {
      await transaction.commit();
      return null;
    }

    const before = committee.toJSON();
    const scopeType = data.scope_type !== undefined ? validateOperationalScope(data.scope_type, data.scope_gate_ids, data.scope_id) : committee.scope_type;
    const selectedModules = Array.isArray(data.modules) ? data.modules : (Array.isArray(data.selected_modules) ? data.selected_modules : null);

    // Validate permissions if provided
    let validatedPerms = null;
    if (Array.isArray(data.permissions)) {
      validatedPerms = await validatePermissionsMaster(data.permissions, selectedModules);
    }

    await committee.update({
      name: data.name !== undefined ? data.name.trim() : committee.name,
      description: data.description !== undefined ? data.description : committee.description,
      committee_type: data.committee_type || committee.committee_type,
      scope_type: scopeType,
      scope_gate_ids: data.scope_gate_ids !== undefined ? (typeof data.scope_gate_ids === 'string' ? data.scope_gate_ids : JSON.stringify(data.scope_gate_ids)) : committee.scope_gate_ids,
      scope_id: data.scope_id !== undefined ? data.scope_id : committee.scope_id,
      status: data.status || committee.status,
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    // Update permissions if provided
    if (validatedPerms !== null) {
      await SocietyCommitteePermission.destroy({
        where: { committee_id: id, committee_member_id: null },
        transaction,
      });
      if (validatedPerms.length > 0) {
        const permRows = validatedPerms.map(p => ({
          society_id: societyId,
          committee_id: id,
          committee_member_id: null,
          permission_code: p,
          created_by: actorUserId,
          created_at: new Date(),
        }));
        await SocietyCommitteePermission.bulkCreate(permRows, { transaction });
      }

      // Invalidate all active members' PBAC cache
      const members = await SocietyCommitteeMember.findAll({
        where: { committee_id: id, is_deleted: false, status: 'active' },
        transaction,
      });
      for (const m of members) {
        await invalidateUserPermissionCache(m.user_id);
      }
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_updated',
      targetEntityType: 'committee',
      targetEntityId: committee.id,
      beforeValue: before,
      newValue: committee.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return getCommitteeById(id, societyId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const deleteCommittee = async (id, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const committee = await SocietyCommittee.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!committee) {
      await transaction.commit();
      return false;
    }

    await committee.update({
      is_deleted: true,
      status: 'inactive',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    // Mark all memberships as inactive and invalidate cache
    const members = await SocietyCommitteeMember.findAll({
      where: { committee_id: id, is_deleted: false },
      transaction,
    });
    for (const m of members) {
      await m.update({ status: 'inactive', is_deleted: true, updated_by: actorUserId, updated_at: new Date() }, { transaction });
      await invalidateUserPermissionCache(m.user_id);
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_deleted',
      targetEntityType: 'committee',
      targetEntityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * ─── INVITATION LIFECYCLE ──────────────────────────────────────────────────────
 */
export const addCommitteeMember = async (committeeId, societyId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const committee = await SocietyCommittee.findOne({
      where: { id: committeeId, society_id: societyId, is_deleted: false },
      transaction,
    });
    if (!committee) {
      const err = new Error('Committee not found');
      err.statusCode = 404;
      throw err;
    }

    let targetUser = null;
    if (data.user_id) {
      targetUser = await User.findByPk(data.user_id, { transaction });
    } else if (data.phone) {
      const cleanPhone = String(data.phone).replace(/\D/g, '').slice(-10);
      targetUser = await User.findOne({
        where: { phone: { [Op.like]: `%${cleanPhone}` } },
        transaction,
      });
    } else if (data.email) {
      targetUser = await User.findOne({
        where: { email: data.email.trim().toLowerCase() },
        transaction,
      });
    }

    if (!targetUser) {
      const err = new Error('User not found. Please provide an existing SmartGali user phone, email, or user_id.');
      err.statusCode = 404;
      throw err;
    }

    // Check if membership already exists in this committee
    let commMember = await SocietyCommitteeMember.findOne({
      where: { committee_id: committeeId, user_id: targetUser.userId, is_deleted: false },
      transaction,
    });

    if (commMember) {
      if (commMember.status === 'active') {
        const err = new Error('User is already an active member of this committee.');
        err.statusCode = 409;
        throw err;
      }
      if (commMember.status === 'pending') {
        const err = new Error('User already has a pending invitation to this committee. Use resend if needed.');
        err.statusCode = 409;
        throw err;
      }
      // Re-invite if previously rejected, expired, suspended or revoked
      await commMember.update({
        designation: data.designation || commMember.designation,
        status: 'pending',
        invited_at: new Date(),
        invited_by: actorUserId,
        accepted_at: null,
        rejected_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day expiry
        start_date: null,
        end_date: data.end_date || null,
        updated_by: actorUserId,
        updated_at: new Date(),
      }, { transaction });
    } else {
      commMember = await SocietyCommitteeMember.create({
        committee_id: committeeId,
        society_id: societyId,
        user_id: targetUser.userId,
        designation: data.designation || 'Member',
        status: 'pending', // Starts strictly as PENDING
        invited_at: new Date(),
        invited_by: actorUserId,
        accepted_at: null,
        rejected_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        start_date: null,
        end_date: data.end_date || null,
        created_by: actorUserId,
        created_at: new Date(),
        updated_at: new Date(),
      }, { transaction });
    }

    // Optional member-specific permissions
    if (Array.isArray(data.permissions) && data.permissions.length > 0) {
      const validPerms = await validatePermissionsMaster(data.permissions);
      await SocietyCommitteePermission.destroy({
        where: { committee_id: committeeId, committee_member_id: commMember.id },
        transaction,
      });
      const rows = validPerms.map(p => ({
        society_id: societyId,
        committee_id: committeeId,
        committee_member_id: commMember.id,
        permission_code: p,
        created_by: actorUserId,
        created_at: new Date(),
      }));
      await SocietyCommitteePermission.bulkCreate(rows, { transaction });
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_invited',
      targetUserId: targetUser.userId,
      targetEntityType: 'committee_member',
      targetEntityId: commMember.id,
      newValue: { designation: commMember.designation, committeeId, status: 'pending' },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      await emitNotification({
        recipientId: targetUser.userId,
        actorId: actorUserId,
        title: 'Committee Invitation',
        message: `You have been invited to join ${committee.name} as ${commMember.designation}.`,
        type: 'society_committee',
        data: {
          societyId: Number(societyId),
          committeeId: Number(committee.id),
          committeeMemberId: Number(commMember.id),
          invitationId: Number(commMember.id),
          action: 'committee_invitation',
          target: `/society/${societyId}/committees/${committee.id}/invitations/${commMember.id}`,
        },
      });
    } catch (_) {}

    return commMember;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getInvitationById = async (invitationId, societyId, callerUserId) => {
  const member = await SocietyCommitteeMember.findOne({
    where: { id: invitationId, society_id: societyId, is_deleted: false },
    include: [
      {
        model: SocietyCommittee,
        as: 'committee',
        include: [{ model: SocietyCommitteePermission, as: 'permissions', attributes: ['permission_code'] }],
      },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
  });
  if (!member) return null;

  const isTarget = Number(member.user_id) === Number(callerUserId);
  const socMember = await SocietyMember.findOne({
    where: { society_id: societyId, user_id: callerUserId, is_deleted: false },
  });
  const isAdmin = socMember && ['admin', 'owner'].includes(socMember.role);
  if (!isTarget && !isAdmin) {
    const err = new Error('Forbidden: You do not have access to this invitation');
    err.statusCode = 403;
    throw err;
  }

  let inviter = null;
  if (member.invited_by) {
    inviter = await User.findByPk(member.invited_by, { attributes: ['userId', 'userName'] });
  }

  const society = await SocietyProfile.findByPk(societyId, { attributes: ['id', 'name'] });

  return {
    ...member.toJSON(),
    inviter,
    societyName: society?.name || 'Society',
  };
};

export const getMyCommitteeInvitations = async (societyId, callerUserId) => {
  return await SocietyCommitteeMember.findAll({
    where: {
      society_id: societyId,
      user_id: callerUserId,
      status: 'pending',
      is_deleted: false,
    },
    include: [
      {
        model: SocietyCommittee,
        as: 'committee',
        include: [{ model: SocietyCommitteePermission, as: 'permissions', attributes: ['permission_code'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });
};

export const getMyCommitteeMemberships = async (societyId, callerUserId) => {
  return await SocietyCommitteeMember.findAll({
    where: {
      society_id: societyId,
      user_id: callerUserId,
      status: 'active',
      is_deleted: false,
    },
    include: [
      {
        model: SocietyCommittee,
        as: 'committee',
        where: { status: 'active', is_deleted: false },
        include: [{ model: SocietyCommitteePermission, as: 'permissions', attributes: ['permission_code', 'committee_member_id'] }],
      },
    ],
  });
};

export const acceptInvitation = async (invitationId, societyId, callerUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { id: invitationId, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }

    if (Number(member.user_id) !== Number(callerUserId)) {
      const err = new Error('Forbidden: Only the invited user can accept this invitation');
      err.statusCode = 403;
      throw err;
    }

    if (member.status === 'active') {
      const err = new Error('Invitation has already been accepted');
      err.statusCode = 400;
      throw err;
    }

    if (member.status === 'rejected') {
      const err = new Error('This invitation was previously declined');
      err.statusCode = 400;
      throw err;
    }

    if (member.status === 'suspended' || member.status === 'revoked') {
      const err = new Error('Invitation is no longer valid');
      err.statusCode = 400;
      throw err;
    }

    if (member.expires_at && new Date() > new Date(member.expires_at)) {
      await member.update({ status: 'expired', updated_at: new Date() }, { transaction });
      await transaction.commit();
      const err = new Error('This invitation has expired. Please request the administrator to resend.');
      err.statusCode = 400;
      throw err;
    }

    // Transition to ACTIVE
    await member.update({
      status: 'active',
      accepted_at: new Date(),
      start_date: new Date(),
      updated_at: new Date(),
    }, { transaction });

    // Ensure society membership without mutating role
    let socMember = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: callerUserId, is_deleted: false },
      transaction,
    });
    if (!socMember) {
      socMember = await SocietyMember.create({
        society_id: societyId,
        user_id: callerUserId,
        role: 'resident',
        status: 'active',
        joined_at: new Date(),
        created_at: new Date(),
      }, { transaction });
    }

    // Immediately activate PBAC permissions
    await invalidateUserPermissionCache(callerUserId);

    await logSocietyAudit({
      societyId,
      actorUserId: callerUserId,
      action: 'society.committee_member_accepted',
      targetUserId: callerUserId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      oldValue: { status: 'pending' },
      newValue: { status: 'active', accepted_at: member.accepted_at },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    if (member.invited_by) {
      try {
        const callerUser = await User.findByPk(callerUserId, { attributes: ['userName'] });
        const comm = await SocietyCommittee.findByPk(member.committee_id);
        await emitNotification({
          recipientId: member.invited_by,
          actorId: callerUserId,
          title: 'Invitation Accepted',
          message: `${callerUser?.userName || 'A member'} accepted the invitation to ${comm?.name || 'the committee'}.`,
          type: 'society_committee',
          data: {
            societyId: Number(societyId),
            committeeId: Number(member.committee_id),
            action: 'member_accepted',
          },
        });
      } catch (_) {}
    }

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const rejectInvitation = async (invitationId, societyId, callerUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { id: invitationId, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }

    if (Number(member.user_id) !== Number(callerUserId)) {
      const err = new Error('Forbidden: Only the invited user can decline this invitation');
      err.statusCode = 403;
      throw err;
    }

    if (member.status === 'active') {
      const err = new Error('Cannot decline an already active committee membership');
      err.statusCode = 400;
      throw err;
    }

    await member.update({
      status: 'rejected',
      rejected_at: new Date(),
      updated_at: new Date(),
    }, { transaction });

    await invalidateUserPermissionCache(callerUserId);

    await logSocietyAudit({
      societyId,
      actorUserId: callerUserId,
      action: 'society.committee_member_rejected',
      targetUserId: callerUserId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      oldValue: { status: 'pending' },
      newValue: { status: 'rejected', rejected_at: member.rejected_at },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const resendInvitation = async (invitationId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { id: invitationId, society_id: societyId, is_deleted: false },
      include: [{ model: SocietyCommittee, as: 'committee' }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }

    if (member.status === 'active') {
      const err = new Error('Member is already active');
      err.statusCode = 400;
      throw err;
    }

    await member.update({
      status: 'pending',
      invited_at: new Date(),
      invited_by: actorUserId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_invited',
      targetUserId: member.user_id,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      newValue: { designation: member.designation, resend: true },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      await emitNotification({
        recipientId: member.user_id,
        actorId: actorUserId,
        title: 'Committee Invitation (Reminder)',
        message: `Reminder: You have an invitation to join ${member.committee?.name || 'the committee'} as ${member.designation}.`,
        type: 'society_committee',
        data: {
          societyId: Number(societyId),
          committeeId: Number(member.committee_id),
          committeeMemberId: Number(member.id),
          invitationId: Number(member.id),
          action: 'committee_invitation',
          target: `/society/${societyId}/committees/${member.committee_id}/invitations/${member.id}`,
        },
      });
    } catch (_) {}

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const cancelInvitation = async (invitationId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { id: invitationId, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      await transaction.commit();
      return false;
    }

    if (member.status === 'active') {
      const err = new Error('Cannot cancel an active membership. Use remove or revoke.');
      err.statusCode = 400;
      throw err;
    }

    await member.update({
      status: 'inactive',
      is_deleted: true,
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_invitation_cancelled',
      targetUserId: member.user_id,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const suspendCommitteeMember = async (committeeId, userId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { committee_id: committeeId, user_id: userId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Committee member not found');
      err.statusCode = 404;
      throw err;
    }

    const oldStatus = member.status;
    await member.update({
      status: 'suspended',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await invalidateUserPermissionCache(userId);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_suspended',
      targetUserId: userId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      oldValue: { status: oldStatus },
      newValue: { status: 'suspended' },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      const committee = await SocietyCommittee.findByPk(committeeId);
      await emitNotification({
        recipientId: userId,
        actorId: actorUserId,
        title: 'Committee Membership Suspended',
        message: `Your membership in ${committee?.name || 'the committee'} has been temporarily suspended.`,
        type: 'society_committee',
        data: { societyId, committeeId, action: 'member_suspended' },
      });
    } catch (_) {}

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const revokeCommitteeMember = async (committeeId, userId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { committee_id: committeeId, user_id: userId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Committee member not found');
      err.statusCode = 404;
      throw err;
    }

    const oldStatus = member.status;
    await member.update({
      status: 'revoked',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await invalidateUserPermissionCache(userId);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_revoked',
      targetUserId: userId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      oldValue: { status: oldStatus },
      newValue: { status: 'revoked' },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      const committee = await SocietyCommittee.findByPk(committeeId);
      await emitNotification({
        recipientId: userId,
        actorId: actorUserId,
        title: 'Committee Membership Revoked',
        message: `Your membership in ${committee?.name || 'the committee'} has been revoked.`,
        type: 'society_committee',
        data: { societyId, committeeId, action: 'member_revoked' },
      });
    } catch (_) {}

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const activateCommitteeMember = async (committeeId, userId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { committee_id: committeeId, user_id: userId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      const err = new Error('Committee member not found');
      err.statusCode = 404;
      throw err;
    }

    const oldStatus = member.status;
    await member.update({
      status: 'active',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await invalidateUserPermissionCache(userId);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_activated',
      targetUserId: userId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      oldValue: { status: oldStatus },
      newValue: { status: 'active' },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      const committee = await SocietyCommittee.findByPk(committeeId);
      await emitNotification({
        recipientId: userId,
        actorId: actorUserId,
        title: 'Committee Membership Activated',
        message: `Your membership in ${committee?.name || 'the committee'} is now active.`,
        type: 'society_committee',
        data: { societyId, committeeId, action: 'member_activated' },
      });
    } catch (_) {}

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const removeCommitteeMember = async (committeeId, userId, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyCommitteeMember.findOne({
      where: { committee_id: committeeId, user_id: userId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      await transaction.commit();
      return false;
    }

    await member.update({
      is_deleted: true,
      status: 'inactive',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await SocietyCommitteePermission.destroy({
      where: { committee_id: committeeId, committee_member_id: member.id },
      transaction,
    });

    await invalidateUserPermissionCache(userId);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_member_removed',
      targetUserId: userId,
      targetEntityType: 'committee_member',
      targetEntityId: member.id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const assignCommitteePermissions = async (committeeId, societyId, actorUserId, permissions = [], memberId = null, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const committee = await SocietyCommittee.findOne({
      where: { id: committeeId, society_id: societyId, is_deleted: false },
      transaction,
    });
    if (!committee) {
      const err = new Error('Committee not found');
      err.statusCode = 404;
      throw err;
    }

    // Validate permissions against master
    const validPerms = await validatePermissionsMaster(permissions);

    const whereClause = {
      society_id: societyId,
      committee_id: committeeId,
      committee_member_id: memberId ? memberId : null,
    };

    await SocietyCommitteePermission.destroy({ where: whereClause, transaction });

    if (validPerms.length > 0) {
      const permRows = validPerms.map(code => ({
        society_id: societyId,
        committee_id: committeeId,
        committee_member_id: memberId || null,
        permission_code: code,
        created_by: actorUserId,
        created_at: new Date(),
      }));
      await SocietyCommitteePermission.bulkCreate(permRows, { transaction });
    }

    // Invalidate affected users cache
    if (memberId) {
      const member = await SocietyCommitteeMember.findByPk(memberId, { transaction });
      if (member) await invalidateUserPermissionCache(member.user_id);
    } else {
      const members = await SocietyCommitteeMember.findAll({
        where: { committee_id: committeeId, is_deleted: false },
        transaction,
      });
      for (const m of members) {
        await invalidateUserPermissionCache(m.user_id);
      }
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.committee_permission_granted',
      targetEntityType: 'committee',
      targetEntityId: committeeId,
      newValue: { permissions: validPerms, memberId },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return getCommitteeById(committeeId, societyId);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const searchUsersForCommittee = async (societyId, query = '') => {
  const clean = query.trim();
  if (!clean) return [];

  const users = await User.findAll({
    where: {
      is_deleted: false,
      is_active: true,
      [Op.or]: [
        { userName: { [Op.like]: `%${clean}%` } },
        { phone: { [Op.like]: `%${clean}%` } },
        { email: { [Op.like]: `%${clean}%` } },
      ],
    },
    attributes: ['userId', 'userName', 'email', 'phone'],
    limit: 20,
  });

  return users;
};
