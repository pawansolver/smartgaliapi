import sequelize from '../../config/db.js';
import ResidentDocument, { RESIDENT_DOCUMENT_STATUSES } from './resident_document.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { canAccessResidentDocument, isAdminRole } from './society_document_visibility.service.js';
import { hasPermission } from '../permission/permission.service.js';
import { DOCUMENT_NOTIFICATION_EVENTS } from './society_document_notification.service.js';
import { Op } from 'sequelize';

/**
 * Upload a Resident Personal Document (Vault)
 */
export const uploadResidentDocument = async (societyId, userId, data, meta = {}) => {
  // 1. Validate caller is an active resident/member in this society
  const membership = await SocietyMember.findOne({
    where: {
      society_id: societyId,
      user_id: userId,
      status: 'active',
      is_deleted: false,
    },
  });

  if (!membership) {
    const err = new Error('Forbidden: Active society membership required to upload personal documents');
    err.statusCode = 403;
    throw err;
  }

  const flatNumber = (data.flat_number || membership.flat_no || 'UNKNOWN').trim();
  const initialStatus = (data.status || 'private').toLowerCase().trim();
  const validStatus = [RESIDENT_DOCUMENT_STATUSES.PRIVATE, RESIDENT_DOCUMENT_STATUSES.SHARED_FOR_VERIFICATION].includes(initialStatus)
    ? initialStatus
    : RESIDENT_DOCUMENT_STATUSES.PRIVATE;

  const transaction = await sequelize.transaction();
  try {
    const doc = await ResidentDocument.create({
      society_id: societyId,
      owner_id: userId,
      flat_number: flatNumber,
      document_type: (data.document_type || 'other').toLowerCase().trim(),
      title: data.title.trim(),
      description: data.description ? data.description.trim() : null,
      file_url: data.file_url,
      file_type: data.file_type || null,
      file_size: data.file_size || null,
      status: validStatus,
      created_by: userId,
      metadata: data.metadata || null,
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'resident.document_uploaded',
      targetEntityType: 'resident_document',
      targetEntityId: doc.id,
      newValue: { title: doc.title, document_type: doc.document_type, status: doc.status, flat_number: flatNumber },
      reason: meta.reason || 'Resident personal document uploaded to vault',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // If directly shared for verification, emit domain event
    if (validStatus === RESIDENT_DOCUMENT_STATUSES.SHARED_FOR_VERIFICATION) {
      await createEvent({
        event_type: DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_SHARED,
        aggregate_type: 'society',
        aggregate_id: String(societyId),
        payload: {
          societyId: Number(societyId),
          documentId: Number(doc.id),
          title: doc.title,
          documentType: doc.document_type,
          flatNumber,
          ownerId: Number(userId),
          actorUserId: Number(userId),
          isResidentDocument: true,
        },
      }, { transaction });
    }

    await transaction.commit();
    return doc;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * List Resident Personal Documents for the authenticated resident (Vault)
 */
export const getMyResidentDocuments = async (societyId, userId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    owner_id: userId,
    is_deleted: false,
  };

  if (query.status && query.status !== 'all') {
    where.status = query.status.toLowerCase().trim();
  }
  if (query.document_type && query.document_type !== 'all') {
    where.document_type = query.document_type.toLowerCase().trim();
  }

  const { rows, count } = await ResidentDocument.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'verifier', attributes: ['userId', 'userName'] },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

/**
 * List all shared Resident Documents for Admin/Committee Verification
 */
export const getSharedResidentDocuments = async (societyId, callerUser, callerRole, query = {}) => {
  const userRole = (callerRole || callerUser.role || 'resident').toLowerCase().trim();
  const isAdmin = isAdminRole(userRole);
  const hasReview = await hasPermission(callerUser, 'society_document.review', { societyId });

  if (!isAdmin && !hasReview) {
    const err = new Error('Forbidden: Admin or Committee document review permission required');
    err.statusCode = 403;
    throw err;
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    is_deleted: false,
    status: {
      [Op.in]: [
        RESIDENT_DOCUMENT_STATUSES.SHARED_FOR_VERIFICATION,
        RESIDENT_DOCUMENT_STATUSES.UNDER_REVIEW,
        RESIDENT_DOCUMENT_STATUSES.VERIFIED,
        RESIDENT_DOCUMENT_STATUSES.REJECTED,
      ],
    },
  };

  if (query.status && query.status !== 'all') {
    where.status = query.status.toLowerCase().trim();
  }
  if (query.document_type && query.document_type !== 'all') {
    where.document_type = query.document_type.toLowerCase().trim();
  }
  if (query.flat_number) {
    where.flat_number = query.flat_number.trim();
  }

  const { rows, count } = await ResidentDocument.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'verifier', attributes: ['userId', 'userName'] },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

/**
 * Get single Resident Personal Document by ID (Object-Level Authorization)
 */
export const getResidentDocumentById = async (id, societyId, callerUser, callerRole = null) => {
  const doc = await ResidentDocument.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'verifier', attributes: ['userId', 'userName'] },
    ],
  });

  if (!doc) return null;

  const access = await canAccessResidentDocument(doc, callerUser, callerRole, societyId);
  if (!access.allowed) {
    const err = new Error(access.reason || 'Access denied to personal document');
    err.statusCode = access.statusCode || 403;
    throw err;
  }

  return doc;
};

/**
 * Share a private resident document for verification by Society Admin
 */
export const shareForVerification = async (id, societyId, userId, meta = {}) => {
  const doc = await ResidentDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });

  if (!doc) return null;

  // Object-level authorization
  if (Number(doc.owner_id) !== Number(userId)) {
    const err = new Error('Forbidden: You can only share your own personal documents');
    err.statusCode = 403;
    throw err;
  }

  if (doc.status === RESIDENT_DOCUMENT_STATUSES.VERIFIED) {
    const err = new Error('Document is already verified');
    err.statusCode = 400;
    throw err;
  }

  const transaction = await sequelize.transaction();
  try {
    const oldStatus = doc.status;
    await doc.update({
      status: RESIDENT_DOCUMENT_STATUSES.SHARED_FOR_VERIFICATION,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'resident.document_shared_for_verification',
      targetEntityType: 'resident_document',
      targetEntityId: doc.id,
      oldValue: { status: oldStatus },
      newValue: { status: RESIDENT_DOCUMENT_STATUSES.SHARED_FOR_VERIFICATION },
      reason: meta.reason || 'Shared for administrative verification',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_SHARED,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(doc.id),
        title: doc.title,
        documentType: doc.document_type,
        flatNumber: doc.flat_number,
        ownerId: Number(userId),
        actorUserId: Number(userId),
        isResidentDocument: true,
      },
    }, { transaction });

    await transaction.commit();
    return doc;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Admin / Committee Verifies or Rejects a Resident Document
 */
export const verifyResidentDocument = async (id, societyId, verifierUserId, callerUser, callerRole, updateData, meta = {}) => {
  const userRole = (callerRole || callerUser.role || 'resident').toLowerCase().trim();
  const isAdmin = isAdminRole(userRole);
  const hasReview = await hasPermission(callerUser, 'society_document.review', { societyId });

  if (!isAdmin && !hasReview) {
    const err = new Error('Forbidden: Admin or Committee document review permission required to verify documents');
    err.statusCode = 403;
    throw err;
  }

  const doc = await ResidentDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });

  if (!doc) return null;

  const targetStatus = (updateData.status || '').toLowerCase().trim();
  if (targetStatus !== RESIDENT_DOCUMENT_STATUSES.VERIFIED && targetStatus !== RESIDENT_DOCUMENT_STATUSES.REJECTED && targetStatus !== RESIDENT_DOCUMENT_STATUSES.UNDER_REVIEW) {
    const err = new Error('Invalid verification status. Must be verified, rejected, or under_review');
    err.statusCode = 400;
    throw err;
  }

  const transaction = await sequelize.transaction();
  try {
    const oldStatus = doc.status;
    const updates = {
      status: targetStatus,
      verified_by: verifierUserId,
      verified_at: new Date(),
      updated_by: verifierUserId,
      updatedAt: new Date(),
    };

    if (targetStatus === RESIDENT_DOCUMENT_STATUSES.REJECTED) {
      updates.rejection_reason = updateData.rejection_reason || 'Verification criteria not satisfied';
    } else if (targetStatus === RESIDENT_DOCUMENT_STATUSES.VERIFIED) {
      updates.rejection_reason = null;
    }

    await doc.update(updates, { transaction });

    const auditAction = targetStatus === RESIDENT_DOCUMENT_STATUSES.VERIFIED
      ? 'resident.document_verified'
      : (targetStatus === RESIDENT_DOCUMENT_STATUSES.REJECTED ? 'resident.document_rejected' : 'resident.document_under_review');

    await logSocietyAudit({
      societyId,
      actorUserId: verifierUserId,
      action: auditAction,
      targetEntityType: 'resident_document',
      targetEntityId: doc.id,
      oldValue: { status: oldStatus },
      newValue: { status: targetStatus, rejection_reason: updates.rejection_reason },
      reason: meta.reason || `Verification status updated to ${targetStatus}`,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    const eventType = targetStatus === RESIDENT_DOCUMENT_STATUSES.VERIFIED
      ? DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_VERIFIED
      : (targetStatus === RESIDENT_DOCUMENT_STATUSES.REJECTED
        ? DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_REJECTED
        : DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_REVIEWED);

    await createEvent({
      event_type: eventType,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(doc.id),
        title: doc.title,
        documentType: doc.document_type,
        flatNumber: doc.flat_number,
        ownerId: Number(doc.owner_id),
        actorUserId: Number(verifierUserId),
        rejectionReason: updates.rejection_reason,
        isResidentDocument: true,
      },
    }, { transaction });

    await transaction.commit();
    return doc;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Delete a resident personal document (Object-Level Authorization)
 */
export const deleteResidentDocument = async (id, societyId, userId, meta = {}) => {
  const doc = await ResidentDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });

  if (!doc) return false;

  // Object-level authorization: resident owner only
  if (Number(doc.owner_id) !== Number(userId)) {
    const err = new Error('Forbidden: You can only delete your own personal documents');
    err.statusCode = 403;
    throw err;
  }

  const transaction = await sequelize.transaction();
  try {
    await doc.update({
      is_deleted: true,
      is_active: false,
      deletedRemarks: meta.remarks || 'Resident deleted document from vault',
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'resident.document_deleted',
      targetEntityType: 'resident_document',
      targetEntityId: doc.id,
      reason: meta.remarks || 'Personal document deleted from vault',
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
