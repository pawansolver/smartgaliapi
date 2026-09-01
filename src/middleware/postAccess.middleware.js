import Post from '../modules/post/post.model.js';
import Follow from '../modules/follow/follow.model.js';
import CommunityMember from '../modules/communityMember/communityMember.model.js';
import { errorResponse } from '../utils/response.js';

export const requirePostReadAccess = async (req, res, next) => {
  try {
    const postId = req.params.postId || req.body?.post_id || req.body?.postId || req.params.id;
    if (!postId) return errorResponse(res, 400, 'Post ID is required.');
    const post = await Post.findOne({
      where: { id: postId, is_active: true, is_deleted: false },
      attributes: ['id', 'user_id', 'visibility', 'community_id'],
    });
    if (!post) return errorResponse(res, 404, 'Post not found.');
    if (Number(post.user_id) === Number(req.user.id) || post.visibility === 'public') {
      req.authorizedPost = post;
      return next();
    }
    if (post.visibility === 'community' && post.community_id) {
      const membership = await CommunityMember.findOne({
        where: {
          community_id: post.community_id,
          user_id: req.user.id,
          status: 'active',
          is_deleted: false,
        },
        attributes: ['communityMemberId'],
      });
      if (membership) {
        req.authorizedPost = post;
        return next();
      }
    }
    if (post.visibility === 'followers') {
      const follows = await Follow.findOne({
        where: { follower_id: req.user.id, following_id: post.user_id, is_deleted: false },
        attributes: ['id'],
      });
      if (follows) {
        req.authorizedPost = post;
        return next();
      }
    }
    return errorResponse(res, 403, 'You do not have access to this post.');
  } catch (error) {
    return next(error);
  }
};
