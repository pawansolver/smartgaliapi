import * as policy from './community.policy.js';
import * as communityService from './community.service.js';
import * as memberService from '../communityMember/communityMember.service.js';
import * as joinRequestService from '../community_join_request/community_join_request.service.js';
import * as pollService from '../community_poll/community_poll.service.js';
import * as announcementService from '../community_announcement/community_announcement.service.js';
import * as documentService from '../community_document/community_document.service.js';
import * as mediaService from '../community_media/community_media.service.js';
import Post from '../post/post.model.js';
import Event from '../event/event.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { createPost, serializePost, PostError } from '../post/post.service.js';
import PostLike from '../post_like/post_like.model.js';
import PostComment from '../post_comment/post_comment.model.js';
import SavedPost from '../saved_post/saved_post.model.js';
import { Op } from 'sequelize';
import { getOrCreateCommunityChat, syncCommunityChatParticipant } from './communityChat.service.js';
import EventParticipant from '../event_participant/event_participant.model.js';
import * as invitationService from './communityInvitation.service.js';
import {
  communityCreateTotal,
  communityJoinTotal,
  communityLeaveTotal,
  communityJoinRequestTotal,
  communityJoinApprovalTotal,
  communityMemberBanTotal,
  communityRoleChangeTotal,
  communityPostTotal,
  communityPollCreateTotal,
  communityPollVoteTotal,
  communityMediaUploadTotal,
  communityDocumentUploadTotal,
} from '../../monitoring/metrics.js';

// ── 1. Discovery & CRUD ───────────────────────────────────────────────────────
export const createCommunity = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body.created_by;
    if (!userId) return errorResponse(res, 401, 'Authentication required');

    const communityName = req.body.communityName || req.body.name;
    if (!communityName) return errorResponse(res, 400, 'Community name is required');

    const coverFile = req.files?.cover_image?.[0] ?? req.file;
    const iconFile = req.files?.icon?.[0];
    const coverImage = coverFile
      ? `/uploads/community/${coverFile.filename}`
      : req.body.cover_image;
    const icon = iconFile
      ? `/uploads/community/${iconFile.filename}`
      : req.body.icon;
    let rules = req.body.rules;
    if (typeof rules === 'string') {
      try {
        rules = JSON.parse(rules || '[]');
      } catch {
        return errorResponse(res, 422, 'rules must be a JSON array');
      }
    }

    const data = {
      communityName,
      communityDescription: req.body.communityDescription || req.body.description,
      category_id: req.body.category_id,
      cover_image: coverImage,
      icon,
      is_private: req.body.is_private === 'true' || req.body.is_private === true,
      rules,
      latitude: req.body.latitude != null ? Number(req.body.latitude) : null,
      longitude: req.body.longitude != null ? Number(req.body.longitude) : null,
      location_name: req.body.location_name || null,
      discovery_radius: req.body.discovery_radius != null ? Number(req.body.discovery_radius) : 25.0,
    };

    const created = await communityService.createCommunity(userId, data);
    communityCreateTotal.inc();
    return successResponse(res, 201, 'Community created successfully', created);
  } catch (error) {
    return next(error);
  }
};

export const getAllCommunities = async (req, res, next) => {
  try {
    const { search, category_id, is_private, cursor, page, limit } = req.query;
    const result = await communityService.getAllCommunities({
      search,
      category_id,
      is_private,
      cursor,
      page,
      limit,
    });
    return successResponse(res, 200, 'Communities retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const getMyCommunities = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    if (!userId) return errorResponse(res, 401, 'Authentication required');

    const result = await communityService.getMyCommunities(userId);
    return successResponse(res, 200, 'My communities retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const getSuggestedCommunities = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { limit, category_id, latitude, longitude, max_distance } = req.query;
    const result = await communityService.getSuggestedCommunities(userId, {
      limit,
      category_id,
      latitude,
      longitude,
      max_distance,
    });
    return successResponse(res, 200, 'Suggested communities retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const getCommunityById = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id || null;
    const community = await communityService.getCommunityById(communityId, userId);

    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }

    return successResponse(res, 200, 'Community retrieved successfully', community);
  } catch (error) {
    return next(error);
  }
};

export const updateCommunity = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const actorUserId = req.user?.id;
    const updateData = { ...req.body };

    const coverFile = req.files?.cover_image?.[0] ?? req.file;
    const iconFile = req.files?.icon?.[0];
    if (coverFile) updateData.cover_image = `/uploads/community/${coverFile.filename}`;
    if (iconFile) updateData.icon = `/uploads/community/${iconFile.filename}`;
    if (typeof updateData.rules === 'string') {
      try {
        updateData.rules = JSON.parse(updateData.rules || '[]');
      } catch {
        return errorResponse(res, 422, 'rules must be a JSON array');
      }
    }
    if (updateData.is_private !== undefined) {
      updateData.is_private = updateData.is_private === 'true' || updateData.is_private === true;
    }

    const updated = await communityService.updateCommunity(communityId, updateData, actorUserId);
    if (!updated) return errorResponse(res, 404, 'Community not found');

    return successResponse(res, 200, 'Community updated successfully', updated);
  } catch (error) {
    return next(error);
  }
};

export const deleteCommunity = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!policy.canDeleteCommunity(req.community, req.communityMembership, req.user)) {
      return errorResponse(res, 403, 'Forbidden: Only the community creator or platform administrator can delete this community');
    }

    const deleted = await communityService.softDeleteCommunity(communityId, reason, userId);
    if (!deleted) return errorResponse(res, 404, 'Community not found');

    return successResponse(res, 200, 'Community deleted successfully', { success: true });
  } catch (error) {
    return next(error);
  }
};

// ── 2. Membership ─────────────────────────────────────────────────────────────
export const joinCommunity = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id || req.body.user_id;
    if (!userId) return errorResponse(res, 401, 'Authentication required');

    const community = await communityService.getCommunityById(communityId);
    if (!community) return errorResponse(res, 404, 'Community not found');

    if (community.is_private) {
      const note = req.body.note || 'Request to join';
      const request = await joinRequestService.createJoinRequest(communityId, userId, note);
      communityJoinRequestTotal.inc();
      return successResponse(res, 201, 'Join request submitted to group admins', { isPending: true, request });
    }

    const membership = await memberService.joinPublicCommunity(communityId, userId);
    communityJoinTotal.inc({ type: 'public' });
    return successResponse(res, 200, 'Joined community successfully', { isMember: true, membership });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const leaveCommunity = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id || req.body.user_id;
    if (!userId) return errorResponse(res, 401, 'Authentication required');

    await memberService.leaveCommunity(communityId, userId);
    communityLeaveTotal.inc();
    return successResponse(res, 200, 'Left community successfully', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const getJoinRequests = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const { page, limit } = req.query;
    const result = await joinRequestService.getJoinRequests(communityId, { page, limit });
    return successResponse(res, 200, 'Pending join requests retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const approveJoinRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const actorId = req.user?.id;
    await joinRequestService.approveJoinRequest(req.params.id, requestId, req.user);
    communityJoinApprovalTotal.inc({ status: 'approved' });
    communityJoinTotal.inc({ type: 'approved' });
    return successResponse(res, 200, 'Join request approved successfully', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const rejectJoinRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const actorId = req.user?.id;
    await joinRequestService.rejectJoinRequest(req.params.id, requestId, req.user);
    communityJoinApprovalTotal.inc({ status: 'rejected' });
    return successResponse(res, 200, 'Join request rejected', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

// ── 3. Member Directory & Moderation ──────────────────────────────────────────
export const getCommunityMembers = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const { page, limit, role, search } = req.query;
    const result = await memberService.getCommunityMembers(communityId, { page, limit, role, search });
    return successResponse(res, 200, 'Community members retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const updateMemberRole = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const targetUserId = req.params.memberId;
    const { role } = req.body;
    const actorId = req.user?.id;

    const updated = await memberService.updateMemberRole(communityId, targetUserId, role, req.user);
    communityRoleChangeTotal.inc({ new_role: role });
    return successResponse(res, 200, 'Member role updated successfully', updated);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const targetUserId = req.params.memberId;
    const actorId = req.user?.id;

    await memberService.removeMember(communityId, targetUserId, req.user);
    return successResponse(res, 200, 'Member removed from community', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const banMember = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const targetUserId = req.params.memberId;
    const actorId = req.user?.id;

    await memberService.banMember(communityId, targetUserId, req.user);
    communityMemberBanTotal.inc();
    return successResponse(res, 200, 'Member banned from community', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const unbanMember = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const targetUserId = req.params.memberId;
    const actorId = req.user?.id;

    await memberService.unbanMember(communityId, targetUserId, req.user);
    return successResponse(res, 200, 'Member unbanned successfully', { success: true });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

// ── 4. Pinned Announcements ───────────────────────────────────────────────────
export const getAnnouncements = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const announcements = await announcementService.getCommunityAnnouncements(communityId);
    return successResponse(res, 200, 'Announcements retrieved successfully', announcements);
  } catch (error) {
    return next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;
    const { title, message, isPinned } = req.body;

    const announcement = await announcementService.createAnnouncement(communityId, userId, { title, message, isPinned });
    return successResponse(res, 201, 'Announcement published successfully', announcement);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { announcementId } = req.params;
    const userId = req.user?.id;

    const deleted = await announcementService.deleteAnnouncement(req.params.id, announcementId, userId);
    if (!deleted) return errorResponse(res, 404, 'Announcement not found in this community');
    return successResponse(res, 200, 'Announcement deleted', { success: true });
  } catch (error) {
    return next(error);
  }
};

// ── 5. Documents & Files ───────────────────────────────────────────────────────
export const getDocuments = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const docs = await documentService.getCommunityDocuments(communityId);
    return successResponse(res, 200, 'Documents retrieved successfully', docs);
  } catch (error) {
    return next(error);
  }
};

export const uploadDocument = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;

    let fileUrl = req.body.file_url || req.body.fileUrl;
    if (req.file) {
      fileUrl = `/uploads/community/${req.file.filename}`;
    }

    const { title, fileType, fileSize } = req.body;
    const doc = await documentService.uploadDocument(communityId, userId, {
      title,
      fileUrl,
      fileType: req.file?.mimetype || fileType || 'application/pdf',
      fileSize: req.file?.size ? String(req.file.size) : (fileSize || null),
    });

    communityDocumentUploadTotal.inc();
    return successResponse(res, 201, 'Document uploaded successfully', doc);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id;

    const deleted = await documentService.deleteDocument(req.params.id, documentId, userId);
    if (!deleted) return errorResponse(res, 404, 'Document not found in this community');
    return successResponse(res, 200, 'Document deleted', { success: true });
  } catch (error) {
    return next(error);
  }
};

// ── 6. Gallery Media ───────────────────────────────────────────────────────────
export const getGallery = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const media = await mediaService.getCommunityGallery(communityId);
    return successResponse(res, 200, 'Gallery media retrieved successfully', media);
  } catch (error) {
    return next(error);
  }
};

export const uploadMedia = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;

    let mediaUrl = req.body.media_url || req.body.mediaUrl;
    if (req.file) {
      mediaUrl = `/uploads/community/${req.file.filename}`;
    }

    const inferredMediaType = req.file?.mimetype?.startsWith('video/') ? 'video' : 'image';
    const { caption } = req.body;
    const media = await mediaService.uploadMedia(communityId, userId, {
      mediaUrl,
      mediaType: req.file ? inferredMediaType : (req.body.mediaType || 'image'),
      caption,
    });

    communityMediaUploadTotal.inc();
    return successResponse(res, 201, 'Photo posted to gallery', media);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const deleteMedia = async (req, res, next) => {
  try {
    const { mediaId } = req.params;
    const userId = req.user?.id;

    const deleted = await mediaService.deleteMedia(req.params.id, mediaId, userId);
    if (!deleted) return errorResponse(res, 404, 'Media not found in this community');
    return successResponse(res, 200, 'Media removed', { success: true });
  } catch (error) {
    return next(error);
  }
};

// ── 7. Polls & Atomic Voting ──────────────────────────────────────────────────
export const getPolls = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;
    const polls = await pollService.getCommunityPolls(communityId, userId);
    return successResponse(res, 200, 'Community polls retrieved successfully', polls);
  } catch (error) {
    return next(error);
  }
};

export const createPoll = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;
    const { question, options, expiresAt } = req.body;

    const poll = await pollService.createPoll(communityId, userId, { question, options, expiresAt });
    communityPollCreateTotal.inc();
    return successResponse(res, 201, 'Poll published successfully', poll);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const deletePoll = async (req, res, next) => {
  try {
    const { pollId } = req.params;
    const communityId = req.params.id;
    const userId = req.user?.id;

    const poll = await pollService.getPollById(communityId, pollId);
    if (!poll) return errorResponse(res, 404, 'Poll not found in this community');

    if (!policy.canDeletePoll(req.community, req.communityMembership, req.user, poll)) {
      return errorResponse(res, 403, 'Forbidden: You do not have permission to delete this poll');
    }

    const deleted = await pollService.deletePoll(communityId, pollId, userId);
    if (!deleted) return errorResponse(res, 404, 'Poll not found in this community');
    return successResponse(res, 200, 'Poll deleted successfully', { success: true });
  } catch (error) {
    return next(error);
  }
};

export const votePoll = async (req, res, next) => {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;
    const userId = req.user?.id;

    if (!optionId) return errorResponse(res, 400, 'optionId is required');

    const result = await pollService.votePoll(req.params.id, pollId, optionId, userId);
    communityPollVoteTotal.inc();
    return successResponse(res, 200, 'Vote recorded successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

// ── 8. Scoped Feed ─────────────────────────────────────────────────────────────
export const getCommunityFeed = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user?.id;
    const limit = Math.min(50, Number(req.query.limit) || 20);
    let cursorWhere = {};
    if (req.query.cursor) {
      const decoded = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('utf8'));
      cursorWhere = {
        [Op.or]: [
          { created_at: { [Op.lt]: new Date(decoded.created_at) } },
          { created_at: new Date(decoded.created_at), id: { [Op.lt]: Number(decoded.id) } },
        ],
      };
    }

    const posts = await Post.findAll({
      where: {
        community_id: communityId,
        visibility: 'community',
        is_active: true,
        is_deleted: false,
        ...cursorWhere,
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['userId', 'userName'],
          include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'], required: false }],
        },
      ],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit: limit + 1,
    });

    const hasMore = posts.length > limit;
    const pagePosts = hasMore ? posts.slice(0, limit) : posts;
    const ids = pagePosts.map((post) => post.id);
    const [likes, comments, saves] = await Promise.all([
      userId && ids.length ? PostLike.findAll({ where: { post_id: ids, user_id: userId }, attributes: ['post_id'] }) : [],
      ids.length ? PostComment.findAll({ where: { post_id: ids, is_deleted: false }, attributes: ['post_id'] }) : [],
      userId && ids.length ? SavedPost.findAll({ where: { post_id: ids, user_id: userId, is_deleted: false }, attributes: ['post_id'] }) : [],
    ]);
    const liked = new Set(likes.map((row) => Number(row.post_id)));
    const saved = new Set(saves.map((row) => Number(row.post_id)));
    const commentCounts = comments.reduce((map, row) => map.set(Number(row.post_id), (map.get(Number(row.post_id)) || 0) + 1), new Map());
    const community = req.community;
    const formatted = pagePosts.map((post) => ({
      ...serializePost(post, post.author, post.media_url ? [{ url: post.media_url, type: post.type }] : [], community),
      isLikedByMe: liked.has(Number(post.id)),
      isSaved: saved.has(Number(post.id)),
      commentCount: commentCounts.get(Number(post.id)) || 0,
    }));
    const last = pagePosts.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ id: Number(last.id), created_at: last.created_at })).toString('base64')
      : null;
    return successResponse(res, 200, 'Community feed retrieved successfully', {
      posts: formatted, timeline: formatted, nextCursor, hasMore,
    });
  } catch (error) {
    return next(error);
  }
};

export const createCommunityPost = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user.id;
    const post = await createPost(userId, {
      ...req.body,
      communityId,
      visibility: 'community',
    }, req.correlationId);

    if (post.mediaUrl) {
      const mediaType = post.postType === 'video' ? 'video' : 'image';
      mediaService.syncPostMediaToGallery(communityId, userId, post.mediaUrl, mediaType)
        .catch(() => {});
    }

    communityPostTotal.inc();
    return successResponse(res, 201, 'Post created successfully in community', post);
  } catch (error) {
    if (error instanceof PostError) return errorResponse(res, error.statusCode, error.message);
    return next(error);
  }
};

// ── 9. Community Group Chat ───────────────────────────────────────────────────
export const getCommunityChat = async (req, res, next) => {
  try {
    const chat = await getOrCreateCommunityChat(req.community);
    if (req.user?.id) {
      await syncCommunityChatParticipant(req.community, req.user.id, req.communityMembership || { status: 'active', role: 'member' }).catch(() => {});
    }
    return successResponse(res, 200, 'Community chat retrieved successfully', chat);
  } catch (error) {
    return next(error);
  }
};

// ── 10. Invitations ───────────────────────────────────────────────────────────
export const getInviteableUsers = async (req, res, next) => {
  try {
    const result = await invitationService.getInviteableUsers(req.params.id, req.query);
    return successResponse(res, 200, 'Inviteable users retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const sendInvitations = async (req, res, next) => {
  try {
    const targetUserIds = req.body.userIds || req.body.invitee_ids || [];
    const invitations = await invitationService.sendInvitations(req.params.id, req.user.id, targetUserIds);
    return successResponse(res, 201, 'Community invitations sent', { invitations, count: invitations.length });
  } catch (error) {
    return next(error);
  }
};

export const getMyInvitations = async (req, res, next) => {
  try {
    const result = await invitationService.getMyInvitations(req.user.id, req.query);
    return successResponse(res, 200, 'Community invitations retrieved', result);
  } catch (error) {
    return next(error);
  }
};

export const respondToInvitation = async (req, res, next) => {
  try {
    const invitation = await invitationService.respondToInvitation(
      req.params.id,
      req.params.invitationId,
      req.user.id,
      req.body.action,
    );
    return successResponse(res, 200, 'Community invitation updated', invitation);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

// ── 11. Community Events ──────────────────────────────────────────────────────
export const getCommunityEvents = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const events = await Event.findAll({
      where: { community_id: communityId, is_active: true, is_deleted: false },
      order: [['start_at', 'ASC'], ['created_at', 'DESC']],
    });
    const eventIds = events.map((event) => event.id);
    const participants = eventIds.length ? await EventParticipant.findAll({
      where: { event_id: eventIds, is_deleted: false },
      attributes: ['event_id', 'user_id', 'status'],
    }) : [];

    const formatted = events.map(ev => {
      const json = ev.toJSON();
      const eventParticipants = participants.filter((row) => Number(row.event_id) === Number(json.id));
      const myRsvp = eventParticipants.find((row) => Number(row.user_id) === Number(req.user?.id));
      return {
        id: json.id,
        title: json.title,
        description: json.description,
        venue: json.location || 'Community Grounds',
        location: json.location || 'Community Grounds',
        date: json.start_at || json.created_at,
        time: json.start_at ? new Date(json.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM',
        isFree: true,
        coverImage: json.cover_image || null,
        goingCount: eventParticipants.filter((row) => row.status === 'going').length,
        interestedCount: eventParticipants.filter((row) => row.status === 'interested').length,
        myRsvpStatus: myRsvp?.status || null,
      };
    });

    return successResponse(res, 200, 'Community events retrieved successfully', formatted);
  } catch (error) {
    return next(error);
  }
};

export const rsvpCommunityEvent = async (req, res, next) => {
  try {
    const event = await Event.findOne({
      where: { id: req.params.eventId, community_id: req.params.id, is_active: true, is_deleted: false },
    });
    if (!event) return errorResponse(res, 404, 'Community event not found');
    const [participant] = await EventParticipant.findOrCreate({
      where: { event_id: event.id, user_id: req.user.id },
      defaults: {
        status: req.body.status,
        joined_at: new Date(),
        created_by: req.user.id,
        is_active: true,
        is_deleted: false,
      },
    });
    await participant.update({
      status: req.body.status,
      is_active: true,
      is_deleted: false,
      updated_by: req.user.id,
      updatedAt: new Date(),
    });
    const [goingCount, interestedCount] = await Promise.all([
      EventParticipant.count({ where: { event_id: event.id, status: 'going', is_deleted: false } }),
      EventParticipant.count({ where: { event_id: event.id, status: 'interested', is_deleted: false } }),
    ]);
    return successResponse(res, 200, 'Event RSVP updated', {
      eventId: Number(event.id),
      status: participant.status,
      goingCount,
      interestedCount,
    });
  } catch (error) {
    return next(error);
  }
};

export const createCommunityEvent = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const userId = req.user.id;
    const { title, description, venue, location, date } = req.body;

    if (!title || !title.trim()) {
      return errorResponse(res, 400, 'Event title is required.');
    }

    let startAt = new Date();
    if (date) {
      startAt = new Date(date);
    }

    const event = await Event.create({
      community_id: communityId,
      title: title.trim(),
      description: description ? description.trim() : null,
      location: (venue || location || 'Community Grounds').trim(),
      start_at: startAt,
      created_by: userId,
      created_at: new Date(),
      end_at: req.body.endAt || null,
      cover_image: req.body.coverImage || null,
      latitude: req.body.latitude ?? null,
      longitude: req.body.longitude ?? null,
    });

    const responseData = {
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.location,
      location: event.location,
      date: event.start_at,
      time: new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isFree: true,
    };

    return successResponse(res, 201, 'Event created successfully in community', responseData);
  } catch (error) {
    return next(error);
  }
};
