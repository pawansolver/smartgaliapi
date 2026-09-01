import SocietyAuditLog from './society_audit_log.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Record an immutable audit log entry for a society mutation.
 * Non-blocking: failures are logged and do not crash business execution.
 */
export const logSocietyAudit = async ({
  societyId,
  actorUserId,
  action,
  targetUserId = null,
  targetEntityType = null,
  targetEntityId = null,
  oldValue = null,
  newValue = null,
  reason = null,
  requestId = null,
  ipAddress = null,
  userAgent = null,
}, { transaction } = {}) => {
  try {
    await SocietyAuditLog.create({
      society_id: societyId,
      actor_user_id: actorUserId,
      action,
      target_user_id: targetUserId,
      target_entity_type: targetEntityType,
      target_entity_id: targetEntityId,
      old_value: oldValue,
      new_value: newValue,
      reason,
      request_id: requestId,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date(),
    }, transaction ? { transaction } : {});

    logger.info('SOCIETY_AUDIT', action, {
      societyId,
      actorUserId,
      targetUserId,
      targetEntityType,
      targetEntityId,
    });
  } catch (error) {
    logger.error('SOCIETY_AUDIT', 'audit_write_failed', {
      societyId,
      action,
      error: error.message,
    });
  }
};

export default {
  logSocietyAudit,
};
