/**
 * Real Super Admin Authorization & Community RBAC Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates that a user with userRole = 'super_admin' possesses global authority
 * across all community operations without needing community membership,
 * while strict isolation is preserved for residents, members, and moderators.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../src/modules/community/community.policy.js';
import { isGlobalAdminUser, requireGlobalAdmin } from '../src/middleware/auth.middleware.js';
import { requireCommunityReadAccess, requireCommunityMember, requireCommunityRole } from '../src/middleware/communityAuth.middleware.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import Post from '../src/modules/post/post.model.js';
import { deletePost } from '../src/modules/post/post.controller.js';
import sequelize from '../src/config/db.js';

after(async () => {
  try {
    await sequelize.close();
  } catch {}
});

const dummyCommunity = (o = {}) => ({
  communityId: 10,
  communityName: 'Greenwood Society',
  is_private: true,
  status: 'active',
  is_deleted: false,
  created_by: 1, // Community Creator/Owner is User 1
  ...o,
});

const realSuperAdmin = { id: 999, userRole: 'super_admin', role: 'super_admin' };
const normalResident = { id: 50, userRole: 'user', role: 'user' };
const communityModerator = { id: 30, userRole: 'user', role: 'user' };

// ── 1. Role Resolution & Central Global Admin Helper ──────────────────────────

test('Role Resolution: isGlobalAdminUser identifies real super_admin correctly', () => {
  assert.equal(isGlobalAdminUser({ userRole: 'super_admin' }), true);
  assert.equal(isGlobalAdminUser({ role: 'super_admin' }), true);
  assert.equal(isGlobalAdminUser({ userRole: 'superadmin' }), true);
  assert.equal(isGlobalAdminUser({ userRole: 'admin' }), true);
  assert.equal(isGlobalAdminUser({ userRole: 'user' }), false);
  assert.equal(isGlobalAdminUser({ role: 'resident' }), false);
  assert.equal(isGlobalAdminUser(null), false);
  assert.equal(isGlobalAdminUser(undefined), false);
});

// ── 2. Super Admin Views Public & Private Communities Without Membership ──────

test('Policy: Super Admin can read public and private communities without membership', () => {
  const publicComm = dummyCommunity({ is_private: false });
  const privateComm = dummyCommunity({ is_private: true });

  assert.equal(policy.canReadCommunity(publicComm, null, realSuperAdmin), true);
  assert.equal(policy.canReadCommunity(privateComm, null, realSuperAdmin), true);
  
  // Normal resident cannot read private community without membership
  assert.equal(policy.canReadCommunity(privateComm, null, normalResident), false);
});

test('Middleware: requireCommunityReadAccess allows Super Admin into private community without membership', async (t) => {
  const privateComm = dummyCommunity({ is_private: true });
  t.mock.method(Community, 'findOne', async () => privateComm);
  t.mock.method(CommunityMember, 'findOne', async () => null); // No membership

  const req = { params: { id: 10 }, user: realSuperAdmin };
  let calledNext = false;
  const next = () => { calledNext = true; };
  const res = { status: () => res, json: () => res };

  await requireCommunityReadAccess(req, res, next);
  assert.equal(calledNext, true);
  assert.equal(req.communityMembership?.isSuperAdmin, true);
});

test('Middleware: requireCommunityReadAccess rejects non-member resident from private community', async (t) => {
  const privateComm = dummyCommunity({ is_private: true });
  t.mock.method(Community, 'findOne', async () => privateComm);
  t.mock.method(CommunityMember, 'findOne', async () => null);

  const req = { params: { id: 10 }, user: normalResident };
  let responseStatus = null;
  let responseData = null;
  const res = {
    status: (code) => { responseStatus = code; return res; },
    json: (data) => { responseData = data; return res; },
  };
  const next = () => {};

  await requireCommunityReadAccess(req, res, next);
  assert.equal(responseStatus, 403);
  assert.match(responseData.message, /Active membership is required/);
});

// ── 3. Super Admin Updates & Deletes Communities ──────────────────────────────

test('Policy: Super Admin can update and delete any community', () => {
  const comm = dummyCommunity({ created_by: 1 });
  assert.equal(policy.canUpdateCommunity(comm, null, realSuperAdmin), true);
  assert.equal(policy.canDeleteCommunity(comm, null, realSuperAdmin), true);

  // Resident cannot update or delete
  assert.equal(policy.canUpdateCommunity(comm, null, normalResident), false);
  assert.equal(policy.canDeleteCommunity(comm, null, normalResident), false);
});

// ── 4. Super Admin Member Moderation & Role Assignment ────────────────────────

test('Policy: Super Admin can manage members, change roles, remove, ban, and unban without membership', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const targetMember = { user_id: 100, role: 'member', status: 'active' };

  assert.equal(policy.canManageMembers(comm, null, realSuperAdmin), true);
  assert.equal(policy.canApproveJoinRequest(comm, null, realSuperAdmin), true);
  assert.equal(policy.canRejectJoinRequest(comm, null, realSuperAdmin), true);
  assert.equal(policy.canChangeMemberRole(comm, null, realSuperAdmin, targetMember, 'moderator'), true);
  assert.equal(policy.canChangeMemberRole(comm, null, realSuperAdmin, targetMember, 'admin'), true);
  assert.equal(policy.canRemoveMember(comm, null, realSuperAdmin, targetMember), true);
  assert.equal(policy.canBanMember(comm, null, realSuperAdmin, targetMember), true);
  assert.equal(policy.canUnbanMember(comm, null, realSuperAdmin), true);
});

test('Policy Negative: Normal resident cannot manage members, ban, or change roles', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const residentMember = { user_id: 50, role: 'member', status: 'active' };
  const targetMember = { user_id: 100, role: 'member', status: 'active' };

  assert.equal(policy.canManageMembers(comm, residentMember, normalResident), false);
  assert.equal(policy.canApproveJoinRequest(comm, residentMember, normalResident), false);
  assert.equal(policy.canRejectJoinRequest(comm, residentMember, normalResident), false);
  assert.equal(policy.canChangeMemberRole(comm, residentMember, normalResident, targetMember, 'moderator'), false);
  assert.equal(policy.canRemoveMember(comm, residentMember, normalResident, targetMember), false);
  assert.equal(policy.canBanMember(comm, residentMember, normalResident, targetMember), false);
  assert.equal(policy.canUnbanMember(comm, residentMember, normalResident), false);
});

test('Policy Negative: Moderator cannot promote themselves to admin or remove creator/admins', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const modMembership = { user_id: 30, role: 'moderator', status: 'active' };
  const ownerMembership = { user_id: 1, role: 'admin', status: 'active' };
  const adminMembership = { user_id: 2, role: 'admin', status: 'active' };

  assert.equal(policy.canChangeMemberRole(comm, modMembership, communityModerator, modMembership, 'admin'), false);
  assert.equal(policy.canRemoveMember(comm, modMembership, communityModerator, ownerMembership), false);
  assert.equal(policy.canRemoveMember(comm, modMembership, communityModerator, adminMembership), false);
});

// ── 5. Super Admin Content & Module Management ────────────────────────────────

test('Policy: Super Admin can manage announcements, polls, documents, gallery', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const pollCreatedByResident = { id: 10, created_by: 50 };
  const annCreatedByResident = { id: 20, created_by: 50 };
  const docUploadedByResident = { id: 30, uploaded_by: 50 };
  const mediaUploadedByResident = { id: 40, uploaded_by: 50 };

  assert.equal(policy.canCreateAnnouncement(comm, null, realSuperAdmin), true);
  assert.equal(policy.canDeleteAnnouncement(comm, null, realSuperAdmin, annCreatedByResident), true);
  assert.equal(policy.canCreatePoll(comm, null, realSuperAdmin), true);
  assert.equal(policy.canDeletePoll(comm, null, realSuperAdmin, pollCreatedByResident), true);
  assert.equal(policy.canUploadDocument(comm, null, realSuperAdmin), true);
  assert.equal(policy.canDeleteDocument(comm, null, realSuperAdmin, docUploadedByResident), true);
  assert.equal(policy.canUploadMedia(comm, null, realSuperAdmin), true);
  assert.equal(policy.canDeleteMedia(comm, null, realSuperAdmin, mediaUploadedByResident), true);
});

test('Policy Negative: Member cannot delete another user announcements, documents, polls', () => {
  const comm = dummyCommunity({ created_by: 1 });
  const residentMember = { user_id: 50, role: 'member', status: 'active' };
  const otherPoll = { id: 10, created_by: 99 };
  const otherAnn = { id: 20, created_by: 99 };
  const otherDoc = { id: 30, uploaded_by: 99 };

  assert.equal(policy.canDeletePoll(comm, residentMember, normalResident, otherPoll), false);
  assert.equal(policy.canDeleteAnnouncement(comm, residentMember, normalResident, otherAnn), false);
  assert.equal(policy.canDeleteDocument(comm, residentMember, normalResident, otherDoc), false);
});

// ── 6. Post Moderation: Super Admin Can Delete Another User Post ───────────────

test('Post Moderation: Super Admin can delete/moderate another user post', async (t) => {
  const dummyPost = {
    id: 555,
    user_id: 88, // Authored by User 88
    community_id: 10,
    update: async () => {},
  };
  t.mock.method(Post, 'findOne', async () => dummyPost);
  t.mock.method(Community, 'decrement', async () => {});

  const req = {
    params: { id: 555 },
    user: realSuperAdmin, // Deleting as Super Admin
  };
  let responseStatus = null;
  let responseData = null;
  const res = {
    status: (code) => { responseStatus = code; return res; },
    json: (data) => { responseData = data; return res; },
  };
  const next = (err) => { if (err) throw err; };

  await deletePost(req, res, next);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.message, 'Post deleted successfully.');
});

test('Post Moderation Negative: Normal resident cannot delete another user post', async (t) => {
  const dummyPost = {
    id: 555,
    user_id: 88, // Authored by User 88
    community_id: 10,
  };
  t.mock.method(Post, 'findOne', async () => dummyPost);
  t.mock.method(CommunityMember, 'findOne', async () => ({ role: 'member' }));

  const req = {
    params: { id: 555 },
    user: normalResident, // User 50 attempting to delete User 88's post
  };
  let responseStatus = null;
  let responseData = null;
  const res = {
    status: (code) => { responseStatus = code; return res; },
    json: (data) => { responseData = data; return res; },
  };
  const next = () => {};

  await deletePost(req, res, next);
  assert.equal(responseStatus, 403);
  assert.match(responseData.message, /Forbidden: You do not have permission/);
});

// ── 7. Report & Admin Dashboard Security Middleware ───────────────────────────

test('Security: requireGlobalAdmin allows real super_admin and blocks normal resident', () => {
  let adminPassed = false;
  const reqAdmin = { user: realSuperAdmin };
  requireGlobalAdmin(reqAdmin, {}, () => { adminPassed = true; });
  assert.equal(adminPassed, true);

  let residentStatus = null;
  let residentData = null;
  const reqResident = { user: normalResident };
  const resResident = {
    status: (code) => { residentStatus = code; return resResident; },
    json: (data) => { residentData = data; return resResident; },
  };
  let residentPassed = false;
  requireGlobalAdmin(reqResident, resResident, () => { residentPassed = true; });
  assert.equal(residentPassed, false);
  assert.equal(residentStatus, 403);
  assert.match(residentData.message, /Administrator privileges required/);
});

test('Security: requireCommunityRole allows Super Admin and rejects unauthorized resident', async (t) => {
  const comm = dummyCommunity();
  t.mock.method(Community, 'findOne', async () => comm);
  t.mock.method(CommunityMember, 'findOne', async () => null);

  const roleMiddleware = requireCommunityRole(['admin']);

  // Super Admin bypasses community role check
  let superAdminPassed = false;
  const reqSuperAdmin = { params: { id: 10 }, user: realSuperAdmin };
  await roleMiddleware(reqSuperAdmin, {}, () => { superAdminPassed = true; });
  assert.equal(superAdminPassed, true);

  // Resident without community admin role gets 403
  let residentStatus = null;
  const reqResident = { params: { id: 10 }, user: normalResident };
  const resResident = {
    status: (code) => { residentStatus = code; return resResident; },
    json: () => resResident,
  };
  let residentPassed = false;
  await roleMiddleware(reqResident, resResident, () => { residentPassed = true; });
  assert.equal(residentPassed, false);
  assert.equal(residentStatus, 403);
});
