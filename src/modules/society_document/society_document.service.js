import { hasPermission } from '../permission/permission.service.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyDocument, { DOCUMENT_STATUSES, DOCUMENT_VISIBILITY } from './society_document.model.js';
import SocietyDocumentVersion from './society_document_version.model.js';
import SocietyDocumentAcknowledgement from './society_document_acknowledgement.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import {
  canAccessOfficialDocument,
  buildOfficialDocumentWhere,
  isAdminRole,
  isGuardRole,
} from './society_document_visibility.service.js';
import { DOCUMENT_NOTIFICATION_EVENTS } from './society_document_notification.service.js';

const parseJsonField = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    if (typeof val === 'string' && val.includes(',')) {
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [val.trim()];
  }
};

/**
 * 1. Create Official Society Document
 */
export const createDocument = async (societyId, userId, docData, callerUser = null, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const isApprovalRequired = docData.requires_approval === true || docData.requires_approval === 'true';
    const isAckRequired = docData.acknowledgement_required === true || docData.acknowledgement_required === 'true';

    if (callerUser) {
      const canCreate = await hasPermission(callerUser, 'society_document.create', { societyId });
      if (!canCreate) {
        const err = new Error("Forbidden: Missing required permission 'society_document.create' to create document");
        err.statusCode = 403;
        throw err;
      }
    }

    let initialStatus = (docData.status || '').toLowerCase().trim();
    if (!initialStatus) {
      initialStatus = isApprovalRequired ? DOCUMENT_STATUSES.UNDER_REVIEW : DOCUMENT_STATUSES.DRAFT;
    }

    if (initialStatus === DOCUMENT_STATUSES.PUBLISHED) {
      if (callerUser) {
        const canPublish = await hasPermission(callerUser, 'society_document.publish', { societyId });
        if (!canPublish) {
          const err = new Error("Forbidden: Missing required permission 'society_document.publish' to create an immediately published document");
          err.statusCode = 403;
          throw err;
        }
      }
    } else if (initialStatus === DOCUMENT_STATUSES.APPROVED) {
      if (callerUser) {
        const canApprove = await hasPermission(callerUser, 'society_document.approve', { societyId });
        if (!canApprove) {
          const err = new Error("Forbidden: Missing required permission 'society_document.approve' to create an immediately approved document");
          err.statusCode = 403;
          throw err;
        }
      }
    }

    const version = (docData.version || '1.0').trim();
    const allowedRoles = parseJsonField(docData.allowed_roles);
    const tags = parseJsonField(docData.tags);

    const docFields = {
      society_id: societyId,
      title: docData.title.trim(),
      document_number: docData.document_number ? docData.document_number.trim() : null,
      version,
      description: docData.description ? docData.description.trim() : null,
      file_url: docData.file_url,
      file_type: docData.file_type || null,
      file_size: docData.file_size || null,
      category: (docData.category || 'general').toLowerCase().trim(),
      priority: (docData.priority || 'normal').toLowerCase().trim(),
      visibility: (docData.visibility || 'all').toLowerCase().trim(),
      allowed_roles: allowedRoles,
      tags: tags,
      status: initialStatus,
      requires_approval: isApprovalRequired,
      acknowledgement_required: isAckRequired,
      is_official: true,
      flat_number: docData.flat_number || null,
      effective_from: docData.effective_from || new Date(),
      expiry_date: docData.expiry_date || null,
      scheduled_publish_at: docData.scheduled_publish_at || null,
      uploaded_by: userId,
      created_by: userId,
    };

    if (initialStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
      docFields.reviewed_by = userId;
      docFields.reviewed_at = new Date();
    } else if (initialStatus === DOCUMENT_STATUSES.APPROVED) {
      docFields.approved_by = userId;
      docFields.approved_at = new Date();
    } else if (initialStatus === DOCUMENT_STATUSES.PUBLISHED) {
      docFields.published_by = userId;
      docFields.published_at = new Date();
    }

    const document = await SocietyDocument.create(docFields, { transaction });

    // Initial version
    const resolvedSocietyId = societyId || document.society_id;
    const versionRecord = await SocietyDocumentVersion.create({
      document_id: document.id,
      society_id: resolvedSocietyId,
      version,
      title: document.title,
      file_url: document.file_url,
      file_type: document.file_type,
      file_size: document.file_size,
      change_summary: docData.change_summary || 'Initial version',
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    // Immutable Audit Trail
    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_created',
      targetEntityType: 'document',
      targetEntityId: document.id,
      newValue: {
        title: document.title,
        version: document.version,
        status: document.status,
        category: document.category,
        visibility: document.visibility,
        document_number: document.document_number,
      },
      reason: docData.reason || 'Official society document created',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // Domain Event mapping
    let eventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_CREATED;
    if (initialStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
      eventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_SUBMITTED_FOR_REVIEW;
    } else if (initialStatus === DOCUMENT_STATUSES.APPROVED) {
      eventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_APPROVED;
    } else if (initialStatus === DOCUMENT_STATUSES.PUBLISHED) {
      eventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_PUBLISHED;
    }

    await createEvent({
      event_type: eventType,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(document.id),
        title: document.title,
        category: document.category,
        version: document.version,
        status: document.status,
        visibility: document.visibility,
        allowedRoles: document.allowed_roles,
        acknowledgementRequired: isAckRequired,
        uploadedBy: Number(userId),
        actorUserId: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * 2. Get All Official Documents (Centralized Visibility Scoping)
 */
export const getAllDocuments = async (societyId, query = {}, callerUser = null, callerRole = null) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  // Use centralized visibility engine to construct WHERE clause
  const where = await buildOfficialDocumentWhere(societyId, callerUser, callerRole, query);

  const { rows, count } = await SocietyDocument.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
      {
        model: User,
        as: 'reviewer',
        attributes: ['userId', 'userName'],
      },
      {
        model: User,
        as: 'approver',
        attributes: ['userId', 'userName'],
      },
      {
        model: User,
        as: 'publisher',
        attributes: ['userId', 'userName'],
      },
      {
        model: SocietyDocumentVersion,
        as: 'versions',
        attributes: ['id', 'version', 'title', 'file_url', 'created_at'],
      },
      {
        model: SocietyDocumentAcknowledgement,
        as: 'acknowledgements',
        attributes: ['id', 'user_id', 'version', 'document_version_id', 'acknowledged_at'],
      },
    ],
  });

  const totalSocietyMembers = await SocietyMember.count({
    where: { society_id: societyId, is_deleted: false, status: 'active' },
  }).catch(() => 0);

  const enrichedRows = rows.map((doc) => {
    const raw = doc.toJSON();
    const acks = raw.acknowledgements || [];
    const vers = raw.versions || [];
    // Version-specific acknowledgement check: caller must have acknowledged THIS specific version
    const isAckByCaller = callerUser
      ? acks.some((a) => Number(a.user_id) === Number(callerUser.userId) && a.version === raw.version)
      : false;

    return {
      ...raw,
      versions_count: vers.length,
      acknowledgement_count: acks.length,
      total_audience_count: totalSocietyMembers,
      is_acknowledged_by_me: isAckByCaller,
    };
  });

  return {
    data: enrichedRows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

/**
 * 3. Get Document Details by ID (Strict Object-Level & Visibility Evaluation)
 */
export const getDocumentById = async (id, societyId, callerUser = null, callerRole = null) => {
  const document = await SocietyDocument.findOne({
    where: {
      id,
      is_deleted: false,
    },
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
      {
        model: User,
        as: 'reviewer',
        attributes: ['userId', 'userName'],
      },
      {
        model: User,
        as: 'approver',
        attributes: ['userId', 'userName'],
      },
      {
        model: User,
        as: 'publisher',
        attributes: ['userId', 'userName'],
      },
      {
        model: SocietyDocumentVersion,
        as: 'versions',
        include: [{ model: User, as: 'creator', attributes: ['userId', 'userName'] }],
      },
      {
        model: SocietyDocumentAcknowledgement,
        as: 'acknowledgements',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName'] }],
      },
    ],
  });

  if (!document) return null;

  // Centralized Visibility & Authorization check
  const access = await canAccessOfficialDocument(document, callerUser, callerRole, societyId);
  if (!access.allowed) {
    const err = new Error(access.reason || 'Access denied to document');
    err.statusCode = access.statusCode || 403;
    throw err;
  }

  const raw = document.toJSON();
  const acks = raw.acknowledgements || [];
  const vers = raw.versions || [];
  const isAckByCaller = callerUser
    ? acks.some((a) => Number(a.user_id) === Number(callerUser.userId) && a.version === raw.version)
    : false;

  const totalSocietyMembers = await SocietyMember.count({
    where: { society_id: societyId, is_deleted: false, status: 'active' },
  }).catch(() => 0);

  return {
    ...raw,
    versions_count: vers.length,
    acknowledgement_count: acks.length,
    total_audience_count: totalSocietyMembers,
    is_acknowledged_by_me: isAckByCaller,
  };
};

/**
 * 4. Update Document Metadata
 */
export const updateDocument = async (id, societyId, updateData, userId, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const oldValues = document.toJSON();
    const fieldsToUpdate = {};

    if (updateData.title) fieldsToUpdate.title = updateData.title.trim();
    if (updateData.description !== undefined) fieldsToUpdate.description = updateData.description ? updateData.description.trim() : null;
    if (updateData.category) fieldsToUpdate.category = updateData.category.toLowerCase().trim();
    if (updateData.priority) fieldsToUpdate.priority = updateData.priority.toLowerCase().trim();
    if (updateData.visibility) fieldsToUpdate.visibility = updateData.visibility.toLowerCase().trim();
    if (updateData.allowed_roles !== undefined) fieldsToUpdate.allowed_roles = parseJsonField(updateData.allowed_roles);
    if (updateData.tags !== undefined) fieldsToUpdate.tags = parseJsonField(updateData.tags);
    if (updateData.effective_from) fieldsToUpdate.effective_from = updateData.effective_from;
    if (updateData.expiry_date !== undefined) fieldsToUpdate.expiry_date = updateData.expiry_date;
    if (updateData.document_number) fieldsToUpdate.document_number = updateData.document_number.trim();
    if (updateData.requires_approval !== undefined) fieldsToUpdate.requires_approval = updateData.requires_approval === true || updateData.requires_approval === 'true';
    if (updateData.acknowledgement_required !== undefined) fieldsToUpdate.acknowledgement_required = updateData.acknowledgement_required === true || updateData.acknowledgement_required === 'true';

    fieldsToUpdate.updated_by = userId;
    fieldsToUpdate.updatedAt = new Date();

    await document.update(fieldsToUpdate, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_updated',
      targetEntityType: 'document',
      targetEntityId: document.id,
      oldValue: oldValues,
      newValue: fieldsToUpdate,
      reason: meta.reason || 'Document metadata updated',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * 5. Create New Document Version
 */
export const createVersion = async (id, societyId, versionData, userId, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId != null) where.society_id = societyId;
  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const oldVersion = document.version;
    const newVersion = versionData.version.trim();

    const versionRecord = await SocietyDocumentVersion.create({
      document_id: document.id,
      society_id: societyId,
      version: newVersion,
      title: versionData.title ? versionData.title.trim() : document.title,
      file_url: versionData.file_url,
      file_type: versionData.file_type || null,
      file_size: versionData.file_size || null,
      change_summary: versionData.change_summary ? versionData.change_summary.trim() : null,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await document.update({
      version: newVersion,
      file_url: versionData.file_url,
      file_type: versionData.file_type || document.file_type,
      file_size: versionData.file_size || document.file_size,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_version_created',
      targetEntityType: 'document',
      targetEntityId: document.id,
      oldValue: { version: oldVersion },
      newValue: { version: newVersion, change_summary: versionData.change_summary },
      reason: meta.reason || `New version ${newVersion} created`,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // Emits domain event for new version
    const eventType = document.status === DOCUMENT_STATUSES.PUBLISHED
      ? DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_VERSION_PUBLISHED
      : DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_CREATED;

    await createEvent({
      event_type: eventType,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(document.id),
        title: document.title,
        version: newVersion,
        visibility: document.visibility,
        allowedRoles: document.allowed_roles,
        acknowledgementRequired: document.acknowledgement_required,
        uploadedBy: Number(document.uploaded_by),
        actorUserId: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return { document, version: versionRecord };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * 6. Get Document Versions
 */
export const getVersions = async (id, societyId) => {
  return SocietyDocumentVersion.findAll({
    where: { document_id: id, society_id: societyId },
    order: [['created_at', 'DESC']],
    include: [{ model: User, as: 'creator', attributes: ['userId', 'userName'] }],
  });
};

/**
 * 7. Update Document Status (Strict PBAC + Enterprise Lifecycle State Machine)
 */
export const updateDocumentStatus = async (id, societyId, newStatus, userId, callerUser = null, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return null;

  const validStatuses = Object.values(DOCUMENT_STATUSES);
  const targetStatus = newStatus.toLowerCase().trim();
  if (!validStatuses.includes(targetStatus) && targetStatus !== 'rejected') {
    const err = new Error(`Invalid status. Allowed: ${validStatuses.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // 1. Map target status to required granular PBAC permission
  let requiredPerm = 'society_document.review';
  if (targetStatus === DOCUMENT_STATUSES.APPROVED) {
    requiredPerm = 'society_document.approve';
  } else if (targetStatus === DOCUMENT_STATUSES.PUBLISHED) {
    requiredPerm = 'society_document.publish';
  } else if (targetStatus === DOCUMENT_STATUSES.ARCHIVED) {
    requiredPerm = 'society_document.archive';
  } else if (targetStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
    requiredPerm = 'society_document.review';
  } else if (targetStatus === DOCUMENT_STATUSES.DRAFT) {
    requiredPerm = 'society_document.create';
  } else if (targetStatus === 'rejected') {
    requiredPerm = 'society_document.approve';
  }

  // 2. Enforce granular PBAC permission
  if (callerUser) {
    const isAuthorized = await hasPermission(callerUser, requiredPerm, { societyId });
    if (!isAuthorized) {
      const err = new Error(`Forbidden: Missing required permission '${requiredPerm}' to set document status to '${targetStatus}'`);
      err.statusCode = 403;
      throw err;
    }
  }

  // 3. Enforce valid enterprise lifecycle state machine transitions
  // DRAFT -> UNDER_REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED
  const oldStatus = (document.status || '').toLowerCase().trim();

  if (oldStatus === DOCUMENT_STATUSES.DRAFT) {
    if (targetStatus !== DOCUMENT_STATUSES.UNDER_REVIEW && targetStatus !== DOCUMENT_STATUSES.DRAFT) {
      const err = new Error(`Invalid lifecycle transition: Cannot transition directly from '${oldStatus}' to '${targetStatus}'. Document must first be submitted for review.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (oldStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
    if (targetStatus !== DOCUMENT_STATUSES.APPROVED && targetStatus !== 'rejected' && targetStatus !== DOCUMENT_STATUSES.DRAFT) {
      const err = new Error(`Invalid lifecycle transition: Cannot transition directly from '${oldStatus}' to '${targetStatus}'. Document must first be approved or rejected.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (oldStatus === DOCUMENT_STATUSES.APPROVED) {
    if (targetStatus !== DOCUMENT_STATUSES.PUBLISHED && targetStatus !== DOCUMENT_STATUSES.UNDER_REVIEW) {
      const err = new Error(`Invalid lifecycle transition: Cannot transition directly from '${oldStatus}' to '${targetStatus}'. Approved document can only be published or returned for review.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (oldStatus === DOCUMENT_STATUSES.PUBLISHED) {
    if (targetStatus !== DOCUMENT_STATUSES.ARCHIVED) {
      const err = new Error(`Invalid lifecycle transition: Published document can only be archived.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (oldStatus === DOCUMENT_STATUSES.ARCHIVED) {
    if (targetStatus !== DOCUMENT_STATUSES.PUBLISHED) {
      const err = new Error(`Invalid lifecycle transition: Archived document can only be restored to published.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (oldStatus === 'rejected') {
    if (targetStatus !== DOCUMENT_STATUSES.DRAFT && targetStatus !== DOCUMENT_STATUSES.UNDER_REVIEW) {
      const err = new Error(`Invalid lifecycle transition: Rejected document can only return to draft or under_review.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const transaction = await sequelize.transaction();
  try {
    const updates = {
      status: targetStatus,
      updated_by: userId,
      updatedAt: new Date(),
    };

    if (targetStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
      updates.reviewed_by = userId;
      updates.reviewed_at = new Date();
    } else if (targetStatus === DOCUMENT_STATUSES.APPROVED) {
      updates.approved_by = userId;
      updates.approved_at = new Date();
    } else if (targetStatus === DOCUMENT_STATUSES.PUBLISHED) {
      updates.published_by = userId;
      updates.published_at = new Date();
    } else if (targetStatus === DOCUMENT_STATUSES.ARCHIVED) {
      updates.archived_at = new Date();
    }

    await document.update(updates, { transaction });

    const auditAction = targetStatus === DOCUMENT_STATUSES.ARCHIVED
      ? 'society.document_archived'
      : (oldStatus === DOCUMENT_STATUSES.ARCHIVED ? 'society.document_restored' : 'society.document_status_changed');

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: auditAction,
      targetEntityType: 'document',
      targetEntityId: document.id,
      oldValue: { status: oldStatus },
      newValue: { status: targetStatus },
      reason: meta.reason || `Status changed from ${oldStatus} to ${targetStatus}`,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // Domain Event Mapping
    let domainEventType = null;
    if (targetStatus === DOCUMENT_STATUSES.UNDER_REVIEW) {
      domainEventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_SUBMITTED_FOR_REVIEW;
    } else if (targetStatus === DOCUMENT_STATUSES.APPROVED) {
      domainEventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_APPROVED;
    } else if (targetStatus === DOCUMENT_STATUSES.PUBLISHED) {
      domainEventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_PUBLISHED;
    } else if (targetStatus === DOCUMENT_STATUSES.ARCHIVED) {
      domainEventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_ARCHIVED;
    } else if (targetStatus === 'rejected') {
      domainEventType = DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_REJECTED;
    }

    if (domainEventType) {
      await createEvent({
        event_type: domainEventType,
        aggregate_type: 'society',
        aggregate_id: String(societyId),
        payload: {
          societyId: Number(societyId),
          documentId: Number(document.id),
          title: document.title,
          category: document.category,
          version: document.version,
          status: targetStatus,
          visibility: document.visibility,
          allowedRoles: document.allowed_roles,
          acknowledgementRequired: document.acknowledgement_required,
          uploadedBy: Number(document.uploaded_by),
          actorUserId: Number(userId),
          rejectionReason: meta.reason,
        },
      }, { transaction });
    }

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * 8. Acknowledge Document (Version-Specific)
 */
export const acknowledgeDocument = async (id, societyId, userId, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false, status: DOCUMENT_STATUSES.PUBLISHED },
  });
  if (!document) {
    const err = new Error('Document not found or is not published');
    err.statusCode = 404;
    throw err;
  }

  // Active membership check
  const member = await SocietyMember.findOne({
    where: { society_id: societyId, user_id: userId, status: 'active', is_deleted: false },
  });
  if (!member) {
    const err = new Error('Forbidden: Active society membership required to acknowledge document');
    err.statusCode = 403;
    throw err;
  }

  const currentVersion = document.version || '1.0';

  // Find corresponding version record if available
  const versionRecord = await SocietyDocumentVersion.findOne({
    where: { document_id: id, version: currentVersion },
  });

  // Version-specific acknowledgement uniqueness check
  const existingAck = await SocietyDocumentAcknowledgement.findOne({
    where: {
      document_id: id,
      user_id: userId,
      version: currentVersion,
    },
  });

  if (existingAck) {
    return {
      message: `Document version ${currentVersion} was already acknowledged`,
      acknowledgement: existingAck,
      alreadyAcknowledged: true,
    };
  }

  const transaction = await sequelize.transaction();
  try {
    const ack = await SocietyDocumentAcknowledgement.create({
      document_id: id,
      document_version_id: versionRecord ? versionRecord.id : null,
      society_id: societyId,
      user_id: userId,
      version: currentVersion,
      acknowledged_at: new Date(),
      ip_address: meta.ip || null,
      user_agent: meta.userAgent || null,
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_acknowledged',
      targetEntityType: 'document',
      targetEntityId: document.id,
      newValue: { version: currentVersion, acknowledged_at: ack.acknowledged_at },
      reason: meta.reason || `Document version ${currentVersion} acknowledged`,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return {
      message: `Document version ${currentVersion} acknowledged successfully`,
      acknowledgement: ack,
      alreadyAcknowledged: false,
    };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * 9. Get Acknowledgements List (Admin & Governance Reviewers)
 */
export const getAcknowledgements = async (id, societyId) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return null;

  const [acknowledgements, totalSocietyMembers] = await Promise.all([
    SocietyDocumentAcknowledgement.findAll({
      where: { document_id: id, society_id: societyId },
      order: [['acknowledged_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['userId', 'userName', 'email'],
        },
      ],
    }),
    SocietyMember.count({
      where: { society_id: societyId, status: 'active', is_deleted: false },
    }),
  ]);

  const totalAudience = totalSocietyMembers > 0 ? totalSocietyMembers : 1;
  const totalAck = acknowledgements.length;
  const percentage = Math.round((totalAck / totalAudience) * 100);

  return {
    total_acknowledged: totalAck,
    total_audience: totalSocietyMembers,
    percentage,
    acknowledgements: acknowledgements.map((a) => ({
      id: a.id,
      document_id: a.document_id,
      society_id: a.society_id,
      user_id: a.user_id,
      user_name: a.user?.userName || 'Resident',
      version: a.version,
      acknowledged_at: a.acknowledged_at,
    })),
  };
};

/**
 * 10. Get Audit History
 */
export const getAuditHistory = async (id, societyId) => {
  return SocietyAuditLog.findAll({
    where: {
      society_id: societyId,
      target_entity_type: 'document',
      target_entity_id: id,
    },
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'actor',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });
};

/**
 * 11. Soft Delete Document (Admin Only)
 */
export const deleteDocument = async (id, societyId, userId, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return false;

  const transaction = await sequelize.transaction();
  try {
    await document.update({
      is_deleted: true,
      is_active: false,
      deletedRemarks: meta.remarks || 'Document deleted by admin',
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_deleted',
      targetEntityType: 'document',
      targetEntityId: document.id,
      reason: meta.remarks || 'Document soft-deleted by admin',
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
 * 12. Scheduled Expirations and Acknowledgement Reminders
 */
export const checkDocumentExpirationsAndReminders = async (societyId = null) => {
  const now = new Date();
  const where = {
    is_deleted: false,
    status: DOCUMENT_STATUSES.PUBLISHED,
  };
  if (societyId) where.society_id = societyId;

  const publishedDocs = await SocietyDocument.findAll({ where });
  const results = { expiredCount: 0, reminderCount: 0 };

  for (const doc of publishedDocs) {
    if (doc.expiry_date && new Date(doc.expiry_date) <= now) {
      await doc.update({
        status: DOCUMENT_STATUSES.EXPIRED,
        archived_at: now,
        updatedAt: now,
      });

      await createEvent({
        event_type: DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_EXPIRED,
        aggregate_type: 'society',
        aggregate_id: String(doc.society_id),
        payload: {
          societyId: Number(doc.society_id),
          documentId: Number(doc.id),
          title: doc.title,
          version: doc.version,
        },
      });
      results.expiredCount++;
    }
  }

  return results;
};
