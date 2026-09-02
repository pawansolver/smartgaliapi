import express from 'express';
import * as communityController from './community.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { requireCommunityRole, requireCommunityMember, requireCommunityReadAccess } from '../../middleware/communityAuth.middleware.js';
import {
  uploadCommunityDocument,
  uploadCommunityMedia,
  uploadImage,
} from '../../utils/fileUpload.js';
import { validate, schemas } from './community.validation.js';
import {
  communityReadLimiter,
  communityMutationLimiter,
  communityJoinLimiter,
  communityInviteLimiter,
  communityPollVoteLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// ── Discovery & Listings (Public / Auth-Optional) ──────────────────────────────
router.use(communityReadLimiter);
router.get('/', optionalAuthenticate, validate(schemas.list), communityController.getAllCommunities);
router.get('/my', authenticate, communityController.getMyCommunities);
router.get('/suggested', authenticate, communityController.getSuggestedCommunities);
router.get('/invitations', authenticate, validate(schemas.invitationList), communityController.getMyInvitations);
router.get('/:id', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getCommunityById);

// ── Creation & Admin Management ───────────────────────────────────────────────
router.post('/', authenticate, communityMutationLimiter, uploadImage('community').fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'icon', maxCount: 1 },
]), validate(schemas.create), communityController.createCommunity);
router.put('/:id', authenticate, communityMutationLimiter, requireCommunityRole(['admin', 'moderator']), uploadImage('community').fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'icon', maxCount: 1 },
]), validate(schemas.update), communityController.updateCommunity);
router.delete('/:id', authenticate, communityMutationLimiter, validate(schemas.id), requireCommunityRole(['admin']), communityController.deleteCommunity);

// ── Membership ────────────────────────────────────────────────────────────────
router.post('/:id/join', authenticate, communityJoinLimiter, validate(schemas.join), communityController.joinCommunity);
router.post('/:id/leave', authenticate, communityJoinLimiter, validate(schemas.id), communityController.leaveCommunity);

// ── Join Requests (Private Communities) ──────────────────────────────────────
router.get('/:id/join-requests', authenticate, requireCommunityRole(['admin', 'moderator']), communityController.getJoinRequests);
router.post('/:id/join-requests/:requestId/approve', authenticate, communityMutationLimiter, validate(schemas.joinRequest), requireCommunityRole(['admin', 'moderator']), communityController.approveJoinRequest);
router.post('/:id/join-requests/:requestId/reject', authenticate, communityMutationLimiter, validate(schemas.joinRequest), requireCommunityRole(['admin', 'moderator']), communityController.rejectJoinRequest);

// ── Members Directory & Moderation ────────────────────────────────────────────
router.get('/:id/members', optionalAuthenticate, validate(schemas.members), requireCommunityReadAccess, communityController.getCommunityMembers);
router.put('/:id/members/:memberId/role', authenticate, communityMutationLimiter, validate(schemas.roleUpdate), requireCommunityRole(['admin']), communityController.updateMemberRole);
router.delete('/:id/members/:memberId', authenticate, communityMutationLimiter, validate(schemas.moderation), requireCommunityRole(['admin', 'moderator']), communityController.removeMember);
router.post('/:id/members/:memberId/ban', authenticate, communityMutationLimiter, validate(schemas.moderation), requireCommunityRole(['admin']), communityController.banMember);
router.post('/:id/members/:memberId/unban', authenticate, communityMutationLimiter, validate(schemas.moderation), requireCommunityRole(['admin']), communityController.unbanMember);
router.get('/:id/inviteable-users', authenticate, validate(schemas.inviteable), requireCommunityRole(['admin', 'moderator']), communityController.getInviteableUsers);
router.post('/:id/invitations', authenticate, communityInviteLimiter, validate(schemas.invite), requireCommunityRole(['admin', 'moderator']), communityController.sendInvitations);
router.post('/:id/invitations/:invitationId/respond', authenticate, communityMutationLimiter, validate(schemas.invitationResponse), communityController.respondToInvitation);

// ── Pinned Announcements ───────────────────────────────────────────────────────
router.get('/:id/announcements', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getAnnouncements);
router.post('/:id/announcements', authenticate, communityMutationLimiter, validate(schemas.announcement), requireCommunityRole(['admin', 'moderator']), communityController.createAnnouncement);
router.delete('/:id/announcements/:announcementId', authenticate, communityMutationLimiter, validate(schemas.announcementId), requireCommunityRole(['admin', 'moderator']), communityController.deleteAnnouncement);

// ── Documents & Rules Circulars ───────────────────────────────────────────────
router.get('/:id/documents', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getDocuments);
router.post('/:id/documents', authenticate, communityMutationLimiter, requireCommunityRole(['admin', 'moderator']), uploadCommunityDocument('community').single('file'), validate(schemas.document), communityController.uploadDocument);
router.delete('/:id/documents/:documentId', authenticate, communityMutationLimiter, validate(schemas.documentId), requireCommunityRole(['admin', 'moderator']), communityController.deleteDocument);

// ── Gallery Media ─────────────────────────────────────────────────────────────
router.get('/:id/gallery', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getGallery);
router.post('/:id/gallery', authenticate, communityMutationLimiter, requireCommunityMember, uploadCommunityMedia('community').single('media'), validate(schemas.gallery), communityController.uploadMedia);
router.delete('/:id/gallery/:mediaId', authenticate, communityMutationLimiter, validate(schemas.mediaId), requireCommunityRole(['admin', 'moderator']), communityController.deleteMedia);

// ── Polls & Concurrency-Safe Voting ───────────────────────────────────────────
router.get('/:id/polls', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getPolls);
router.post('/:id/polls', authenticate, communityMutationLimiter, validate(schemas.poll), requireCommunityRole(['admin', 'moderator']), communityController.createPoll);
router.post('/:id/polls/:pollId/vote', authenticate, communityPollVoteLimiter, validate(schemas.vote), requireCommunityMember, communityController.votePoll);
router.delete('/:id/polls/:pollId', authenticate, communityMutationLimiter, requireCommunityMember, communityController.deletePoll);

// ── Scoped Feed ───────────────────────────────────────────────────────────────
router.get('/:id/feed', optionalAuthenticate, validate(schemas.feed), requireCommunityReadAccess, communityController.getCommunityFeed);
router.post('/:id/feed', authenticate, communityMutationLimiter, validate(schemas.post), requireCommunityMember, communityController.createCommunityPost);

// ── Community Events ──────────────────────────────────────────────────────────
router.get('/:id/events', optionalAuthenticate, validate(schemas.id), requireCommunityReadAccess, communityController.getCommunityEvents);
router.post('/:id/events', authenticate, communityMutationLimiter, validate(schemas.event), requireCommunityMember, communityController.createCommunityEvent);
router.put('/:id/events/:eventId/rsvp', authenticate, communityMutationLimiter, validate(schemas.rsvp), requireCommunityMember, communityController.rsvpCommunityEvent);

// ── Community Real-Time Chat ──────────────────────────────────────────────────
router.get('/:id/chat', authenticate, validate(schemas.id), requireCommunityMember, communityController.getCommunityChat);

export default router;
