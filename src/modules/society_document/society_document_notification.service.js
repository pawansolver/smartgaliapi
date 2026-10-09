import Notification from '../notification/notification.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import { SocietyCommitteeMember, SocietyCommitteePermission } from '../society_committee/society_committee.model.js';
import { SocietyGuardAuthorization } from '../society_guard/society_guard_authorization.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { logger } from '../../utils/logger.js';
import { Op } from 'sequelize';

/**
 * Enterprise Document Notification Events
 */
export const DOCUMENT_NOTIFICATION_EVENTS = Object.freeze({
  DOCUMENT_CREATED: 'society.document_created',
  DOCUMENT_SUBMITTED_FOR_REVIEW: 'society.document_submitted_for_review',
  DOCUMENT_REVIEWED: 'society.document_reviewed',
  DOCUMENT_APPROVED: 'society.document_approved',
  DOCUMENT_PUBLISHED: 'society.document_published',
  DOCUMENT_REJECTED: 'society.document_rejected',
  DOCUMENT_ARCHIVED: 'society.document_archived',
  DOCUMENT_VERSION_PUBLISHED: 'society.document_version_published',
  DOCUMENT_ACKNOWLEDGEMENT_REQUIRED: 'society.document_acknowledgement_required',
  DOCUMENT_EXPIRING: 'society.document_expiring',
  DOCUMENT_EXPIRED: 'society.document_expired',

  RESIDENT_DOCUMENT_SHARED: 'society.resident_document_shared',
  RESIDENT_DOCUMENT_REVIEWED: 'society.resident_document_reviewed',
  RESIDENT_DOCUMENT_VERIFIED: 'society.resident_document_verified',
  RESIDENT_DOCUMENT_REJECTED: 'society.resident_document_rejected',

  COMMITTEE_REVIEW_REQUIRED: 'society.committee_review_required',
  COMMITTEE_APPROVAL_REQUIRED: 'society.committee_approval_required',
});

/**
 * Recipient Resolver: determines the exact set of user IDs who should receive notifications
 * based on document audience, PBAC permissions, and active memberships.
 */
export const resolveRecipients = async (eventType, payload) => {
  const { societyId, documentId, visibility, allowedRoles, ownerId, uploadedBy } = payload;
  const today = new Date().toISOString().split('T')[0];

  const recipientUserIds = new Set();

  switch (eventType) {
    case DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_SUBMITTED_FOR_REVIEW:
    case DOCUMENT_NOTIFICATION_EVENTS.COMMITTEE_REVIEW_REQUIRED: {
      // 1. Society Admins
      const admins = await SocietyMember.findAll({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
        attributes: ['user_id'],
      });
      admins.forEach(a => recipientUserIds.add(Number(a.user_id)));

      // 2. Active Committee Members with 'society_document.review' permission
      const reviewers = await SocietyCommitteePermission.findAll({
        where: { society_id: societyId, permission_code: 'society_document.review' },
        include: [{
          model: SocietyCommitteeMember,
          as: 'committee_member',
          where: {
            society_id: societyId,
            status: 'active',
            is_deleted: false,
            [Op.or]: [
              { end_date: null },
              { end_date: { [Op.gte]: today } },
            ],
          },
          attributes: ['user_id'],
        }],
      }).catch(async () => {
        // Fallback to active committee members query if association differs
        return SocietyCommitteeMember.findAll({
          where: {
            society_id: societyId,
            status: 'active',
            is_deleted: false,
            [Op.or]: [
              { end_date: null },
              { end_date: { [Op.gte]: today } },
            ],
          },
          attributes: ['user_id'],
        });
      });

      reviewers.forEach(r => {
        const uid = r.committee_member ? r.committee_member.user_id : r.user_id;
        if (uid) recipientUserIds.add(Number(uid));
      });

      // Exclude uploader from review request
      if (uploadedBy) recipientUserIds.delete(Number(uploadedBy));
      break;
    }

    case DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_APPROVED:
    case DOCUMENT_NOTIFICATION_EVENTS.COMMITTEE_APPROVAL_REQUIRED: {
      // Notify uploader and publishers
      if (uploadedBy) recipientUserIds.add(Number(uploadedBy));

      const admins = await SocietyMember.findAll({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
        attributes: ['user_id'],
      });
      admins.forEach(a => recipientUserIds.add(Number(a.user_id)));
      break;
    }

    case DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_PUBLISHED:
    case DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_VERSION_PUBLISHED:
    case DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_ACKNOWLEDGEMENT_REQUIRED: {
      const vis = (visibility || 'all').toLowerCase().trim();

      if (vis === 'all') {
        // All active residents, tenants, and committee members
        const members = await SocietyMember.findAll({
          where: { society_id: societyId, status: 'active', is_deleted: false },
          attributes: ['user_id'],
        });
        members.forEach(m => recipientUserIds.add(Number(m.user_id)));

        // Security guards
        const guards = await SocietyGuardAuthorization.findAll({
          where: { society_id: societyId, status: 'active', is_deleted: false },
          attributes: ['user_id'],
        }).catch(() => []);
        guards.forEach(g => recipientUserIds.add(Number(g.user_id)));
      } else if (vis === 'resident') {
        // Active residents and tenants only
        const residents = await SocietyMember.findAll({
          where: {
            society_id: societyId,
            role: { [Op.in]: ['member', 'tenant', 'resident'] },
            status: 'active',
            is_deleted: false,
          },
          attributes: ['user_id'],
        });
        residents.forEach(r => recipientUserIds.add(Number(r.user_id)));
      } else if (vis === 'committee') {
        // Active committee members only
        const committee = await SocietyCommitteeMember.findAll({
          where: {
            society_id: societyId,
            status: 'active',
            is_deleted: false,
            [Op.or]: [
              { end_date: null },
              { end_date: { [Op.gte]: today } },
            ],
          },
          attributes: ['user_id'],
        });
        committee.forEach(c => recipientUserIds.add(Number(c.user_id)));
      } else if (vis === 'security') {
        // Guards only
        const guards = await SocietyGuardAuthorization.findAll({
          where: { society_id: societyId, status: 'active', is_deleted: false },
          attributes: ['user_id'],
        }).catch(() => []);
        guards.forEach(g => recipientUserIds.add(Number(g.user_id)));
      } else if (vis === 'specific_roles' && Array.isArray(allowedRoles)) {
        const roles = allowedRoles.map(r => String(r).toLowerCase());
        const targeted = await SocietyMember.findAll({
          where: {
            society_id: societyId,
            role: { [Op.in]: roles },
            status: 'active',
            is_deleted: false,
          },
          attributes: ['user_id'],
        });
        targeted.forEach(t => recipientUserIds.add(Number(t.user_id)));
      }
      break;
    }

    case DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_SHARED: {
      // Notify Society Admins
      const admins = await SocietyMember.findAll({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
        attributes: ['user_id'],
      });
      admins.forEach(a => recipientUserIds.add(Number(a.user_id)));
      break;
    }

    case DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_VERIFIED:
    case DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_REJECTED: {
      // Notify the specific resident owner
      if (ownerId) recipientUserIds.add(Number(ownerId));
      break;
    }

    default:
      if (uploadedBy) recipientUserIds.add(Number(uploadedBy));
      break;
  }

  return Array.from(recipientUserIds);
};

/**
 * Dispatch Document Notification to all resolved recipients with strict idempotency.
 */
export const dispatchDocumentNotification = async (eventType, payload, options = {}) => {
  const {
    societyId,
    documentId,
    title,
    documentNumber,
    version,
    acknowledgementRequired,
    actorUserId,
    rejectionReason,
  } = payload;

  const recipientIds = await resolveRecipients(eventType, payload);
  if (!recipientIds.length) {
    logger.info('NOTIFICATION', 'no_recipients_resolved', { eventType, documentId });
    return { dispatchedCount: 0 };
  }

  const verStr = version ? `v${version}` : 'v1.0';
  let notifTitle = 'Society Document Notification';
  let notifMessage = `Update regarding document ${title || ''}`;
  let notifType = 'info';

  if (eventType === DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_SUBMITTED_FOR_REVIEW) {
    notifTitle = 'Document Review Required';
    notifMessage = `Document "${title}" has been submitted for your review.`;
    notifType = 'alert';
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_APPROVED) {
    notifTitle = 'Document Approved';
    notifMessage = `Document "${title}" (${verStr}) has been approved and is ready to publish.`;
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_PUBLISHED) {
    notifTitle = acknowledgementRequired
      ? 'Action Required: Acknowledge Official Document'
      : 'New Official Document Published';
    notifMessage = acknowledgementRequired
      ? `Acknowledgement Required for "${title}" (${verStr}). Please review and acknowledge.`
      : `New official document "${title}" (${verStr}) is now available.`;
    notifType = acknowledgementRequired ? 'alert' : 'info';
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_VERSION_PUBLISHED) {
    notifTitle = acknowledgementRequired
      ? `Action Required: Acknowledge New Version ${verStr}`
      : `New Version ${verStr} Published`;
    notifMessage = acknowledgementRequired
      ? `A new version (${verStr}) of "${title}" was published. You must review and acknowledge this version.`
      : `Version ${verStr} of "${title}" has been published.`;
    notifType = acknowledgementRequired ? 'alert' : 'info';
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.DOCUMENT_ARCHIVED) {
    notifTitle = 'Document Archived';
    notifMessage = `Official document "${title}" has been archived.`;
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_SHARED) {
    notifTitle = 'Resident Document Submitted for Verification';
    notifMessage = `Resident from flat ${payload.flatNumber || ''} submitted "${title}" for verification.`;
    notifType = 'alert';
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_VERIFIED) {
    notifTitle = 'Personal Document Verified';
    notifMessage = `Your personal document "${title}" has been verified by the society administration.`;
  } else if (eventType === DOCUMENT_NOTIFICATION_EVENTS.RESIDENT_DOCUMENT_REJECTED) {
    notifTitle = 'Personal Document Verification Declined';
    notifMessage = `Your personal document "${title}" was rejected: ${rejectionReason || 'Please resubmit with valid proofs'}.`;
    notifType = 'alert';
  }

  let dispatchedCount = 0;

  for (const recipientId of recipientIds) {
    // 1. Idempotency Key: guarantees the same event cannot produce duplicate notifications for the same recipient
    const idempotencyKey = `doc:${eventType}:${documentId}:${recipientId}:${verStr}`;

    // Check if notification already exists
    const existing = await Notification.findOne({
      where: {
        idempotency_key: idempotencyKey,
      },
    });

    if (existing) {
      logger.info('NOTIFICATION', 'idempotent_duplicate_skipped', { idempotencyKey, recipientId });
      continue;
    }

    const notifRecord = await Notification.create({
      society_id: societyId,
      user_id: recipientId,
      title: notifTitle,
      message: notifMessage,
      type: notifType,
      idempotency_key: idempotencyKey,
      data: {
        eventType,
        societyId,
        documentId,
        version: verStr,
        acknowledgementRequired: Boolean(acknowledgementRequired),
        target: payload.isResidentDocument ? 'resident_document' : 'society_document',
      },
      is_read: false,
      created_by: actorUserId || null,
      created_at: new Date(),
    });

    // Realtime socket delivery
    await emitNotification({
      recipientId,
      actorId: actorUserId,
      type: notifType,
      title: notifTitle,
      message: notifMessage,
      data: notifRecord.data,
      preferenceKey: 'society_announcements',
    }).catch(err => {
      logger.warn('NOTIFICATION', 'socket_emit_failed', { recipientId, error: err.message });
    });

    dispatchedCount++;
  }

  return { dispatchedCount, totalRecipients: recipientIds.length };
};

export default {
  DOCUMENT_NOTIFICATION_EVENTS,
  resolveRecipients,
  dispatchDocumentNotification,
};
