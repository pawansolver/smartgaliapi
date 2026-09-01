/**
 * PostShare Service - Scalability Hardening Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * SHARE creation is fully transactional:
 *   BEGIN -> create PostShare -> increment shares_count
 *         -> create POST_SHARED outbox event -> COMMIT
 */

import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import PostShare from './post_share.model.js';
import Post from '../post/post.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { logger } from '../../utils/logger.js';
import { postSharesTotal } from '../../monitoring/metrics.js';

/**
 * Create a new share - fully transactional.
 * PostShare row + shares_count increment + outbox event in ONE transaction.
 */
export const createShare = async (shareData, correlationId) => {
  const { post_id, user_id } = shareData;

  let share;
  const transaction = await sequelize.transaction();
  try {
    // Verify post exists
    const post = await Post.findOne({
      where: { id: post_id, is_deleted: false },
      attributes: ['id', 'shares_count'],
      transaction,
    });
    if (!post) {
      await transaction.rollback();
      throw new Error('Post not found.');
    }

    share = await PostShare.create({
      ...shareData,
      is_deleted: false,
    }, { transaction });

    // Atomically increment shares_count
    await Post.increment('shares_count', {
      by: 1,
      where: { id: post_id },
      transaction,
    });

    // Write POST_SHARED outbox event (same transaction)
    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.POST_SHARED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
      aggregate_id: String(post_id),
      payload: {
        postId: Number(post_id),
        userId: Number(user_id),
        shareId: Number(share.id),
        correlationId,
      },
    }, { transaction });

    await transaction.commit();

    postSharesTotal.inc();
    logger.info('POST_SHARE', 'post_shared', { postId: Number(post_id), userId: Number(user_id) });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }

  return share;
};

export const getAllShares = async () => {
  return await PostShare.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getShareById = async (id) => {
  return await PostShare.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const updateShare = async (id, updateData) => {
  const share = await PostShare.findOne({ where: { id, is_deleted: false } });
  if (!share) return null;
  return await share.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteShare = async (id, deletedRemarks, updated_by) => {
  const share = await PostShare.findOne({ where: { id, is_deleted: false } });
  if (!share) return null;
  return await share.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteShares = async (ids, deletedRemarks, updated_by) => {
  return await PostShare.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};

export default { createShare, getAllShares, getShareById, updateShare, softDeleteShare, bulkSoftDeleteShares };
