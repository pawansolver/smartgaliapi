import CommunityAuditLog from './community_audit_log.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Record an immutable audit log entry for a community event.
 * Non-blocking: write failures are logged and never crash main transactions.
 */
export const logCommunityAudit = async ({
  communityId,
  actorUserId,
  action,
  targetUserId = null,
  targetEntityType = null,
  targetEntityId = null,
  oldValue = null,
  newValue = null,
  reason = null,
  requestId = null,
}, { transaction } = {}) => {
  try {
    await CommunityAuditLog.create({
      community_id: communityId,
      actor_user_id: actorUserId,
      action,
      target_user_id: targetUserId,
      target_entity_type: targetEntityType,
      target_entity_id: targetEntityId,
      old_value: oldValue,
      new_value: newValue,
      reason,
      request_id: requestId,
      created_at: new Date(),
    }, transaction ? { transaction } : {});

    logger.info('COMMUNITY_AUDIT', action, {
      communityId,
      actorUserId,
      targetUserId,
      targetEntityType,
      targetEntityId,
    });
  } catch (error) {
    logger.error('COMMUNITY_AUDIT', 'audit_write_failed', {
      communityId,
      action,
      error: error.message,
    });
  }
};
