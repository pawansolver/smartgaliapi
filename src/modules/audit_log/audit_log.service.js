import AuditLog from './audit_log.model.js';
import { logger } from '../../utils/logger.js';

/**
 * AuditLog Service
 * ─────────────────────────────────────────────────────────────────────────────
 * All writes are INSERT-only (no update/delete of audit records).
 * Non-blocking: failures are swallowed so they never break the main flow.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Record an audit event.
 * @param {object} params
 * @param {number}  params.actorId
 * @param {string}  params.action        e.g. 'message.edit'
 * @param {string}  params.targetType    e.g. 'message'
 * @param {number}  [params.targetId]
 * @param {number}  [params.chatId]
 * @param {object}  [params.before]      snapshot before mutation
 * @param {object}  [params.after]       snapshot after mutation
 * @param {string}  [params.ip]
 * @param {string}  [params.ua]          user-agent
 */
export const audit = async ({
  actorId,
  action,
  targetType,
  targetId   = null,
  chatId     = null,
  before     = null,
  after      = null,
  ip         = null,
  ua         = null,
}) => {
  try {
    await AuditLog.create({
      actor_id:        actorId,
      action,
      target_type:     targetType,
      target_id:       targetId,
      chat_id:         chatId,
      before_snapshot: before,
      after_snapshot:  after,
      ip_address:      ip,
      user_agent:      ua,
    });
    logger.auditAction({ actorId, action, targetType, targetId, chatId });
  } catch (err) {
    // Audit failure must never break the main request
    logger.error('AUDIT', 'audit_write_failed', { actorId, action, error: err.message });
  }
};

/**
 * Convenience wrappers for common audit actions.
 */
export const auditMessageEdit = (params) =>
  audit({ ...params, action: 'message.edit', targetType: 'message' });

export const auditMessageDelete = (params) =>
  audit({ ...params, action: 'message.delete', targetType: 'message' });

export const auditMessageForward = (params) =>
  audit({ ...params, action: 'message.forward', targetType: 'message' });

export const auditMemberAdd = (params) =>
  audit({ ...params, action: 'member.add', targetType: 'chat_participant' });

export const auditMemberRemove = (params) =>
  audit({ ...params, action: 'member.remove', targetType: 'chat_participant' });

export const auditMemberPromote = (params) =>
  audit({ ...params, action: 'member.promote_admin', targetType: 'chat_participant' });

export const auditUpload = (params) =>
  audit({ ...params, action: 'media.upload', targetType: 'media' });

/**
 * Query audit logs (for compliance/admin dashboards).
 */
export const queryAuditLogs = async ({ actorId, action, targetType, chatId, limit = 50, offset = 0 }) => {
  const where = {};
  if (actorId)    where.actor_id    = actorId;
  if (action)     where.action      = action;
  if (targetType) where.target_type = targetType;
  if (chatId)     where.chat_id     = chatId;

  return await AuditLog.findAndCountAll({
    where,
    order:  [['created_at', 'DESC']],
    limit:  Math.min(limit, 200),
    offset,
  });
};
