import PostComment from './post_comment.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';
import FeedPost from '../feed/feed_post.model.js';
import sequelize from '../../config/db.js';
import { emitNotification } from '../notification/notification.service.js';

export const getCommentsByPost = async (postId) => {
  return await PostComment.findAll({
    where: { post_id: postId, is_deleted: false },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['userId'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName'] }],
        required: false,
      }
    ],
    order: [['id', 'DESC']],
  });
};

export const createComment = async (commentData) => {
  const transaction = await sequelize.transaction();
  try {
    const post = await FeedPost.findOne({
      where: { id: commentData.post_id, is_deleted: false, is_active: true },
      transaction,
    });
    if (!post) {
      await transaction.rollback();
      return null;
    }

    const comment = await PostComment.create(commentData, { transaction });
    await post.increment('comments_count', { by: 1, transaction });
    await transaction.commit();
    await post.reload();
    await comment.reload({
      include: [{
        model: User,
        as: 'user',
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName'] }],
        required: false,
      }],
    });

    // ── Real-time notification to the post owner ──
    const actorName =
      comment.user?.profile?.fullName || comment.user?.userName || 'Someone';
    await emitNotification({
      recipientId: post.user_id,
      actorId: commentData.user_id,
      type: 'info',
      title: 'New comment',
      message: `${actorName} commented on your post`,
      data: { kind: 'post_comment', postId: commentData.post_id, commentId: comment.id },
    });

    return {
      comment,
      commentsCount: Number(post.comments_count) || 0,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getAllComments = async () => {
  return await PostComment.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getCommentById = async (id) => {
  return await PostComment.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] },
      { model: PostComment, as: 'replies' }
    ]
  });
};

export const updateComment = async (id, updateData) => {
  const comment = await PostComment.findOne({ where: { id, is_deleted: false } });
  if (!comment) return null;
  return await comment.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteComment = async (id, deletedRemarks, updated_by) => {
  const comment = await PostComment.findOne({ where: { id, is_deleted: false } });
  if (!comment) return null;
  return await comment.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteComments = async (ids, deletedRemarks, updated_by) => {
  return await PostComment.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
