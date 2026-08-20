/**
 * Post Controller — Phase 9
 */
import { successResponse, errorResponse } from '../../utils/response.js';
import { createPost, getPostById, PostError } from './post.service.js';
import { likePost, unlikePost, LikeError } from '../post_like/post_like.service.js';
import { addComment, getComments, CommentError } from '../post_comment/post_comment.service.js';
import { mediaUploadsTotal, mediaUploadFailuresTotal } from '../../monitoring/metrics.js';
import MediaFile from '../media_file/media_file.model.js';
import PostLike from '../post_like/post_like.model.js';
import Post from './post.model.js';

/** POST /api/v1/post */
export const create = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const { content, type, visibility, mediaIds, communityId } = req.body;
    const result = await createPost(authorId, { content, type, visibility, mediaIds, communityId }, req.correlationId);
    return successResponse(res, 201, 'Post created successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/v1/post/:id */
export const getOne = async (req, res, next) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return errorResponse(res, 404, 'Post not found.');
    return successResponse(res, 200, 'Post fetched.', post);
  } catch (err) { next(err); }
};

/** POST /api/v1/post/:id/like */
export const like = async (req, res, next) => {
  try {
    await likePost(req.user.id, req.params.id, req.correlationId);
    // Return accurate server-side count so Flutter can sync
    const [likesCount, isLikedByMe] = await Promise.all([
      PostLike.count({ where: { post_id: req.params.id } }),
      PostLike.count({ where: { post_id: req.params.id, user_id: req.user.id } }),
    ]);
    return successResponse(res, 201, 'Post liked.', {
      postId: Number(req.params.id),
      likesCount,
      isLikedByMe: isLikedByMe > 0,
    });
  } catch (err) {
    if (err instanceof LikeError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** DELETE /api/v1/post/:id/like */
export const unlike = async (req, res, next) => {
  try {
    await unlikePost(req.user.id, req.params.id, req.correlationId);
    // Return accurate server-side count
    const likesCount = await PostLike.count({ where: { post_id: req.params.id } });
    return successResponse(res, 200, 'Post unliked.', {
      postId: Number(req.params.id),
      likesCount,
      isLikedByMe: false,
    });
  } catch (err) { next(err); }
};

/** POST /api/v1/post/:id/comment */
export const comment = async (req, res, next) => {
  try {
    const result = await addComment(req.user.id, req.params.id, req.body?.content, req.correlationId);
    return successResponse(res, 201, 'Comment added.', result);
  } catch (err) {
    if (err instanceof CommentError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/v1/post/:id/comments */
export const listComments = async (req, res, next) => {
  try {
    const result = await getComments(req.params.id, req.query);
    // Return flat comments array so Flutter can do: (resp.data['data'] as List)
    return successResponse(res, 200, 'Comments fetched.', result.comments);
  } catch (err) { next(err); }
};

/** DELETE /api/v1/post/:id — Soft delete (author only) */
export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!post) return errorResponse(res, 404, 'Post not found.');
    if (Number(post.user_id) !== Number(req.user.id)) {
      return errorResponse(res, 403, 'You can only delete your own posts.');
    }
    await post.update({ is_deleted: true, is_active: false });
    return successResponse(res, 200, 'Post deleted successfully.', { postId: Number(post.id) });
  } catch (err) { next(err); }
};

/** POST /api/v1/post/:id/report — Report a post */
export const reportPost = async (req, res, next) => {
  try {
    const { reason, details } = req.body || {};
    if (!reason) return errorResponse(res, 400, 'Report reason is required.');
    // Store in reports table (entity_type=post)
    const { default: sequelize } = await import('../../config/db.js');
    await sequelize.query(
      `INSERT INTO reports (reporter_id, entity_type, entity_id, reason, details, status, created_at)
       VALUES (?, 'post', ?, ?, ?, 'pending', NOW())`,
      { replacements: [req.user.id, req.params.id, reason, details || null] },
    );
    return successResponse(res, 201, 'Report submitted. Thank you for keeping SmartGali safe.', {});
  } catch (err) { next(err); }
};
export const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) return errorResponse(res, 400, 'No file uploaded.');
    const uploaderId = req.user.id;
    const kind = req.file.mediaKind || 'image';

    // ALWAYS store web-accessible relative path: /uploads/<filename>
    // env.uploadsPath is an absolute filesystem path — never use it as URL
    const webUrl = `/uploads/${req.file.filename}`;

    // Save to MediaFile table
    const media = await MediaFile.create({
      url: webUrl,
      type: kind,
      uploaded_by: uploaderId,
      is_active: true,
      is_deleted: false,
      created_by: uploaderId,
    });

    mediaUploadsTotal.inc({ media_type: kind });

    return successResponse(res, 201, 'Media uploaded.', {
      mediaId: Number(media.id),
      url: webUrl,
      type: media.type,
    });
  } catch (err) {
    mediaUploadFailuresTotal.inc({ reason: 'db_error' });
    next(err);
  }
};
