/**
 * Community Module Unit & Functional Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import CommunityJoinRequest from '../src/modules/community_join_request/community_join_request.model.js';
import CommunityPoll from '../src/modules/community_poll/community_poll.model.js';
import CommunityPollVote from '../src/modules/community_poll/community_poll_vote.model.js';
import CommunityAnnouncement from '../src/modules/community_announcement/community_announcement.model.js';
import CommunityDocument from '../src/modules/community_document/community_document.model.js';
import CommunityMedia from '../src/modules/community_media/community_media.model.js';
import Chat from '../src/modules/chat/chat.model.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import * as communityService from '../src/modules/community/community.service.js';
import * as memberService from '../src/modules/communityMember/communityMember.service.js';
import * as joinRequestService from '../src/modules/community_join_request/community_join_request.service.js';
import * as pollService from '../src/modules/community_poll/community_poll.service.js';
import * as announcementService from '../src/modules/community_announcement/community_announcement.service.js';
import * as documentService from '../src/modules/community_document/community_document.service.js';
import * as mediaService from '../src/modules/community_media/community_media.service.js';

const mockCommunity = (o = {}) => ({
  communityId: 101,
  communityName: 'Greenwood Cricket Club',
  communityDescription: 'Cricket enthusiasts',
  category_id: 1,
  is_private: false,
  rules: ['Respect rules'],
  members_count: 5,
  status: 'active',
  created_by: 1,
  is_deleted: false,
  toJSON() { return { ...this }; },
  increment: async () => true,
  decrement: async () => true,
  update: async function(data) { Object.assign(this, data); return this; },
  ...o,
});

const mockMember = (o = {}) => ({
  communityMemberId: 501,
  community_id: 101,
  user_id: 2,
  role: 'member',
  status: 'active',
  is_deleted: false,
  toJSON() { return { ...this }; },
  update: async function(data) { Object.assign(this, data); return this; },
  ...o,
});

const mockChat = (o = {}) => ({
  id: 201,
  chat_type: 'community',
  community_id: 101,
  name: 'Community Chat',
  is_active: true,
  is_deleted: false,
  update: async function(data) { Object.assign(this, data); return this; },
  ...o,
});

// ── 1. Community Discovery & CRUD ─────────────────────────────────────
test('getCommunityById: returns community details with membership role', async (t) => {
  t.mock.method(Community, 'findOne', async () => mockCommunity());
  t.mock.method(CommunityMember, 'findOne', async () => mockMember({ role: 'admin', user_id: 1 }));

  const result = await communityService.getCommunityById(101, 1);
  assert.equal(result.communityId, 101);
  assert.equal(result.communityName, 'Greenwood Cricket Club');
  assert.equal(result.isMember, true);
  assert.equal(result.myRole, 'admin');
});

test('getAllCommunities: returns paginated list of active communities', async (t) => {
  t.mock.method(Community, 'findAndCountAll', async () => ({
    count: 1,
    rows: [mockCommunity()],
  }));

  const res = await communityService.getAllCommunities({ page: 1, limit: 10 });
  assert.equal(res.total, 1);
  assert.equal(res.communities.length, 1);
  assert.equal(res.communities[0].communityName, 'Greenwood Cricket Club');
});

test('getMyCommunities: returns communities user has joined', async (t) => {
  t.mock.method(CommunityMember, 'findAll', async () => [
    {
      role: 'member',
      community: mockCommunity(),
    },
  ]);

  const res = await communityService.getMyCommunities(2);
  assert.equal(res.length, 1);
  assert.equal(res[0].communityName, 'Greenwood Cricket Club');
  assert.equal(res[0].myRole, 'member');
});

test('updateCommunity: updates allowed fields', async (t) => {
  const comm = mockCommunity();
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(Chat, 'update', async () => [1]);

  const updated = await communityService.updateCommunity(101, {
    communityName: 'Greenwood Sports Club',
    communityDescription: 'All sports enthusiasts',
  }, 1);

  assert.equal(comm.communityName, 'Greenwood Sports Club');
});

// ── 2. Membership & Moderation ────────────────────────────────────────
test('joinPublicCommunity: creates new active member record and increments counter', async (t) => {
  const comm = mockCommunity({ is_private: false, members_count: 5 });
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async () => null);
  t.mock.method(CommunityMember, 'create', async (data) => mockMember(data));
  t.mock.method(Chat, 'findOne', async () => mockChat());
  t.mock.method(ChatParticipant, 'findOrCreate', async () => [{ id: 1, update: async () => true }, true]);

  const membership = await memberService.joinPublicCommunity(101, 3);
  assert.equal(membership.user_id, 3);
  assert.equal(membership.role, 'member');
  assert.equal(membership.status, 'active');
});

test('leaveCommunity: sets member status to left and decrements counter', async (t) => {
  const comm = mockCommunity({ members_count: 5 });
  const member = mockMember({ user_id: 3, role: 'member', status: 'active' });
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async () => member);
  t.mock.method(Chat, 'findOne', async () => mockChat());
  t.mock.method(ChatParticipant, 'findOrCreate', async () => [{ id: 1, update: async () => true }, false]);

  const res = await memberService.leaveCommunity(101, 3);
  assert.equal(res, true);
  assert.equal(member.status, 'left');
});

test('updateMemberRole: prevents demoting owner/creator', async (t) => {
  const comm = mockCommunity({ created_by: 1 });
  const targetMember = mockMember({ user_id: 1, role: 'admin' });
  const actorMember = mockMember({ user_id: 2, role: 'admin' });
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async (opts) => {
    if (opts.where.user_id === 1) return targetMember;
    return actorMember;
  });

  await assert.rejects(
    () => memberService.updateMemberRole(101, 1, 'member', 2),
    /Not authorized to change role/
  );
});

test('banMember: prevents banning community owner/creator', async (t) => {
  const comm = mockCommunity({ created_by: 1 });
  const targetMember = mockMember({ user_id: 1, role: 'admin' });
  const actorMember = mockMember({ user_id: 2, role: 'admin' });
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async (opts) => {
    if (opts.where.user_id === 1) return targetMember;
    return actorMember;
  });

  await assert.rejects(
    () => memberService.banMember(101, 1, 2),
    /Not authorized to ban this member/
  );
});

// ── 3. Join Requests ──────────────────────────────────────────────────
test('createJoinRequest: submits pending request for private community', async (t) => {
  t.mock.method(Community, 'findOne', async () => mockCommunity({ is_private: true }));
  t.mock.method(CommunityMember, 'findOne', async () => null);
  t.mock.method(CommunityJoinRequest, 'findOrCreate', async () => [{ id: 99, status: 'pending' }, true]);

  const req = await joinRequestService.createJoinRequest(101, 5, 'Resident of Flat 301');
  assert.equal(req.id, 99);
  assert.equal(req.status, 'pending');
});

test('approveJoinRequest: approves request and activates member', async (t) => {
  const joinReq = {
    id: 99,
    community_id: 101,
    user_id: 5,
    status: 'pending',
    update: async function(d) { Object.assign(this, d); return this; },
  };
  const comm = mockCommunity();

  t.mock.method(CommunityJoinRequest, 'findOne', async () => joinReq);
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async () => null);
  t.mock.method(CommunityMember, 'create', async () => mockMember({ user_id: 5 }));
  t.mock.method(Chat, 'findOne', async () => mockChat());
  t.mock.method(ChatParticipant, 'findOrCreate', async () => [{ id: 1, update: async () => true }, true]);

  const res = await joinRequestService.approveJoinRequest(101, 99, 1);
  assert.equal(res, true);
  assert.equal(joinReq.status, 'approved');
});

// ── 4. Polls & Concurrency-Safe Voting ─────────────────────────────────
test('createPoll: creates a poll with validated options', async (t) => {
  t.mock.method(CommunityPoll, 'create', async (d) => ({ id: 701, ...d }));

  const poll = await pollService.createPoll(101, 1, {
    question: 'Choose team jersey color',
    options: ['Navy Blue', 'Forest Green', 'Sunset Orange'],
  });

  assert.equal(poll.id, 701);
  assert.equal(poll.options.length, 3);
  assert.equal(poll.options[0].text, 'Navy Blue');
});

test('votePoll: records vote and supports vote switching', async (t) => {
  const poll = {
    id: 701,
    community_id: 101,
    options: [{ id: 1, text: 'Navy Blue', votesCount: 0 }, { id: 2, text: 'Forest Green', votesCount: 0 }],
    total_votes: 0,
    is_deleted: false,
    update: async function(d) { Object.assign(this, d); return this; },
  };
  t.mock.method(CommunityMember, 'findOne', async () => mockMember({ user_id: 2, status: 'active' }));
  t.mock.method(CommunityPoll, 'findOne', async () => poll);
  t.mock.method(CommunityPollVote, 'findOne', async () => null);
  t.mock.method(CommunityPollVote, 'create', async () => ({ id: 1 }));

  const res = await pollService.votePoll(101, 701, 1, 2);
  assert.equal(res.ok, true);
  assert.equal(res.votedOptionId, 1);
});

// ── 5. Announcements, Documents & Media ───────────────────────────────
test('createAnnouncement: creates pinned notice', async (t) => {
  t.mock.method(CommunityAnnouncement, 'create', async (d) => ({ id: 801, ...d }));

  const notice = await announcementService.createAnnouncement(101, 1, {
    title: 'Lift Maintenance',
    message: 'Tower A lift maintenance on Sunday 2 PM',
    isPinned: true,
  });

  assert.equal(notice.id, 801);
  assert.equal(notice.title, 'Lift Maintenance');
  assert.equal(notice.is_pinned, true);
});

test('uploadDocument: registers document with file metadata', async (t) => {
  t.mock.method(CommunityDocument, 'create', async (d) => ({ id: 901, ...d }));

  const doc = await documentService.uploadDocument(101, 1, {
    title: 'Society_Rules_2026.pdf',
    fileUrl: '/uploads/community/rules.pdf',
    fileType: 'pdf',
    fileSize: '2.4 MB',
  });

  assert.equal(doc.id, 901);
  assert.equal(doc.title, 'Society_Rules_2026.pdf');
});

test('uploadMedia: adds photo to community gallery', async (t) => {
  t.mock.method(CommunityMedia, 'create', async (d) => ({ id: 601, ...d }));

  const media = await mediaService.uploadMedia(101, 1, {
    mediaUrl: '/uploads/community/event_photo.jpg',
    mediaType: 'image',
    caption: 'Diwali celebration 2026',
  });

  assert.equal(media.id, 601);
  assert.equal(media.caption, 'Diwali celebration 2026');
});
