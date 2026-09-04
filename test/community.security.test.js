import sequelize from '../src/config/db.js';
/**
 * Phase 15 & 16 — Community Enterprise Security, RBAC & Failure Tests
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../src/modules/community/community.policy.js';
import * as pollService from '../src/modules/community_poll/community_poll.service.js';
import * as memberService from '../src/modules/communityMember/communityMember.service.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import CommunityPoll from '../src/modules/community_poll/community_poll.model.js';
import CommunityPollVote from '../src/modules/community_poll/community_poll_vote.model.js';

const dummyCommunity = (o = {}) => ({
  communityId: 10,
  communityName: 'Greenwood Society',
  is_private: true,
  status: 'active',
  is_deleted: false,
  created_by: 1, // Owner is User 1
  ...o,
});

test('RBAC Policy: Member cannot update community or delete community', () => {
  const comm = dummyCommunity();
  const member = { user_id: 5, role: 'member', status: 'active' };
  assert.equal(policy.canUpdateCommunity(comm, member, { id: 5 }), false);
  assert.equal(policy.canDeleteCommunity(comm, member, { id: 5 }), false);
});

test('RBAC Policy: Member cannot ban, remove or change roles', () => {
  const comm = dummyCommunity();
  const member = { user_id: 5, role: 'member', status: 'active' };
  const target = { user_id: 6, role: 'member', status: 'active' };
  assert.equal(policy.canBanMember(comm, member, { id: 5 }, target), false);
  assert.equal(policy.canRemoveMember(comm, member, { id: 5 }, target), false);
  assert.equal(policy.canChangeMemberRole(comm, member, { id: 5 }, target, 'moderator'), false);
});

test('RBAC Policy: Moderator cannot promote themselves to admin', () => {
  const comm = dummyCommunity();
  const mod = { user_id: 3, role: 'moderator', status: 'active' };
  assert.equal(policy.canChangeMemberRole(comm, mod, { id: 3 }, mod, 'admin'), false);
});

test('RBAC Policy: Moderator cannot remove or demote owner or admins', () => {
  const comm = dummyCommunity();
  const mod = { user_id: 3, role: 'moderator', status: 'active' };
  const owner = { user_id: 1, role: 'admin', status: 'active' };
  const admin = { user_id: 2, role: 'admin', status: 'active' };
  assert.equal(policy.canRemoveMember(comm, mod, { id: 3 }, owner), false);
  assert.equal(policy.canRemoveMember(comm, mod, { id: 3 }, admin), false);
});

test('RBAC Policy: Community Owner cannot be banned or demoted by another admin', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const admin = { user_id: 2, role: 'admin', status: 'active' };
  const owner = { user_id: 1, role: 'admin', status: 'active' };
  assert.equal(policy.canBanMember(comm, admin, { id: 2 }, owner), false);
  assert.equal(policy.canChangeMemberRole(comm, admin, { id: 2 }, owner, 'member'), false);
  assert.equal(policy.canRemoveMember(comm, admin, { id: 2 }, owner), false);
});

test('RBAC Policy: Banned user has no read access to private community', () => {
  const comm = dummyCommunity({ is_private: true });
  const banned = { user_id: 9, role: 'member', status: 'banned' };
  assert.equal(policy.canReadCommunity(comm, banned, { id: 9 }), false);
});

test('RBAC Policy: Public community allows read access to anonymous users but denies banned', () => {
  const comm = dummyCommunity({ is_private: false });
  assert.equal(policy.canReadCommunity(comm, null, null), true);
});

test('IDOR Isolation: Non-member cannot vote on community poll', async (t) => {
  t.mock.method(CommunityMember, 'findOne', async () => null); // Not a member
  await assert.rejects(
    () => pollService.votePoll(10, 100, 1, 99),
    /Active community membership is required/
  );
});

test('Poll Hardening: Expired poll rejects votes', async (t) => {
  t.mock.method(CommunityMember, 'findOne', async () => ({ user_id: 2, status: 'active' }));
  t.mock.method(CommunityPoll, 'findOne', async () => ({
    id: 100,
    community_id: 10,
    options: [{ id: 1, text: 'Opt 1', votesCount: 0 }],
    expires_at: new Date(Date.now() - 10000), // Expired in past
    is_deleted: false,
  }));
  await assert.rejects(
    () => pollService.votePoll(10, 100, 1, 2),
    /This poll has expired/
  );
});

test('Membership Hardening: Sole active admin cannot leave without promoting another admin', async (t) => {
  const comm = dummyCommunity({ created_by: 100 }); // creator is 100
  const soleAdmin = { user_id: 2, role: 'admin', status: 'active' };
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async () => soleAdmin);
  t.mock.method(CommunityMember, 'count', async () => 1); // only 1 admin

  await assert.rejects(
    () => memberService.leaveCommunity(10, 2),
    /The sole active admin cannot leave/
  );
});


// ── Step 1 Negative Authorization Tests ───────────────────────────────────────

test('Step 1 Authorization: Member cannot delete another member\'s poll', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const member = { user_id: 5, role: 'member', status: 'active' };
  const pollCreatedByOther = { id: 101, created_by: 6 };
  assert.equal(policy.canDeletePoll(comm, member, { id: 5 }, pollCreatedByOther), false);
});

test('Step 1 Authorization: Poll creator can delete their own poll', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const member = { user_id: 5, role: 'member', status: 'active' };
  const ownPoll = { id: 101, created_by: 5 };
  assert.equal(policy.canDeletePoll(comm, member, { id: 5 }, ownPoll), true);
});

test('Step 1 Authorization: Moderator can update community but cannot delete community', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const mod = { user_id: 3, role: 'moderator', status: 'active' };
  assert.equal(policy.canUpdateCommunity(comm, mod, { id: 3 }), true);
  assert.equal(policy.canDeleteCommunity(comm, mod, { id: 3 }), false);
});

test('Step 1 Authorization: Community Admin / Owner can update and delete own community', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const owner = { user_id: 1, role: 'admin', status: 'active' };
  assert.equal(policy.canUpdateCommunity(comm, owner, { id: 1 }), true);
  assert.equal(policy.canDeleteCommunity(comm, owner, { id: 1 }), true);
});

test('Step 1 Authorization: Non-owner admin cannot delete community without ownership', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const nonOwnerAdmin = { user_id: 2, role: 'admin', status: 'active' };
  assert.equal(policy.canDeleteCommunity(comm, nonOwnerAdmin, { id: 2 }), false);
});

test('Step 1 Authorization: Super Admin has global override for update, delete, and poll moderation', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const superAdmin = { id: 99, role: 'super_admin', userRole: 'super_admin' };
  const poll = { id: 101, created_by: 6 };
  assert.equal(policy.canUpdateCommunity(comm, null, superAdmin), true);
  assert.equal(policy.canDeleteCommunity(comm, null, superAdmin), true);
  assert.equal(policy.canDeletePoll(comm, null, superAdmin, poll), true);
});


after(async () => {
  try { await sequelize.close(); } catch {}
});
