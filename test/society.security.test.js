/**
 * Society Subsystem Enterprise Security, RBAC & Multi-Tenant IDOR Test Suite
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../src/modules/society_profile/society.policy.js';
import * as validation from '../src/modules/society_profile/society.validation.js';
import * as memberService from '../src/modules/society_member/society_member.service.js';
import * as complaintService from '../src/modules/society_complaint/society_complaint.service.js';
import * as visitorService from '../src/modules/society_visitor/society_visitor.service.js';
import * as announcementService from '../src/modules/society_announcement/society_announcement.service.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';
import User from '../src/modules/user/user.model.js';

const dummySociety = (o = {}) => ({
  id: 100,
  user_id: 1, // Owner is User 1
  society_name: 'Royal Heritage Society',
  is_deleted: false,
  ...o,
});

test('Society RBAC Matrix Policy Verification', async (t) => {
  const soc = dummySociety();
  const owner = { id: 1 };
  const admin = { id: 2 };
  const adminMembership = { user_id: 2, role: 'admin', status: 'active' };
  const committee = { id: 3 };
  const committeeMembership = { user_id: 3, role: 'committee', status: 'active' };
  const resident = { id: 4 };
  const residentMembership = { user_id: 4, role: 'member', status: 'active' };
  const stranger = { id: 99 };
  const strangerMembership = null;

  await t.test('Owner Super-Admin Permissions', () => {
    assert.equal(policy.canManageSociety(soc, null, owner), true);
    assert.equal(policy.canTransferOwnership(soc, null, owner), true);
    assert.equal(policy.canCreateAnnouncement(soc, null, owner), true);
    assert.equal(policy.canApproveMember(soc, null, owner), true);
    assert.equal(policy.canUpdateMemberRole(soc, null, owner), true);
  });

  await t.test('Admin Role Permissions', () => {
    assert.equal(policy.canManageSociety(soc, adminMembership, admin), true);
    assert.equal(policy.canTransferOwnership(soc, adminMembership, admin), false); // Only owner can transfer
    assert.equal(policy.canApproveMember(soc, adminMembership, admin), true);
    assert.equal(policy.canUpdateMemberRole(soc, adminMembership, admin), true);
    assert.equal(policy.canCreateAnnouncement(soc, adminMembership, admin), true);
    assert.equal(policy.canAllocateParking(soc, adminMembership, admin), true);
  });

  await t.test('Committee Role Permissions', () => {
    assert.equal(policy.canManageSociety(soc, committeeMembership, committee), false);
    assert.equal(policy.canUpdateMemberRole(soc, committeeMembership, committee), false);
    assert.equal(policy.canApproveMember(soc, committeeMembership, committee), true);
    assert.equal(policy.canCreateAnnouncement(soc, committeeMembership, committee), true);
    assert.equal(policy.canAllocateParking(soc, committeeMembership, committee), true);
  });

  await t.test('Resident Role Restrictions', () => {
    assert.equal(policy.canManageSociety(soc, residentMembership, resident), false);
    assert.equal(policy.canApproveMember(soc, residentMembership, resident), false);
    assert.equal(policy.canUpdateMemberRole(soc, residentMembership, resident), false);
    assert.equal(policy.canCreateAnnouncement(soc, residentMembership, resident), false);
    assert.equal(policy.canAllocateParking(soc, residentMembership, resident), false);
    assert.equal(policy.canCreateComplaint(soc, residentMembership, resident), true);
    assert.equal(policy.canCreateVisitor(soc, residentMembership, resident), true);
    assert.equal(policy.canVotePoll(soc, residentMembership, resident), true);
  });

  await t.test('Stranger Non-Member Restrictions', () => {
    assert.equal(policy.canCreateComplaint(soc, strangerMembership, stranger), false);
    assert.equal(policy.canCreateVisitor(soc, strangerMembership, stranger), false);
    assert.equal(policy.canVotePoll(soc, strangerMembership, stranger), false);
  });
});

test('Multi-Tenant IDOR Isolation & Scoping Verification', async (t) => {
  let users = await User.findAll({ where: { is_deleted: false }, limit: 5 });
  while (users.length < 4) {
    const u = await User.create({
      userName: `SecUser_${users.length + 1}`,
      email: `secuser_${users.length + 1}_${Date.now()}@smartgali.com`,
      phone: `91122${Math.floor(10000 + Math.random() * 90000)}`,
    });
    users.push(u);
  }

  // Create Society A and Society B
  const socA = await SocietyProfile.create({
    user_id: users[0].userId,
    society_name: 'Society Alpha',
    created_by: users[0].userId,
  });

  const socB = await SocietyProfile.create({
    user_id: users[1].userId,
    society_name: 'Society Beta',
    created_by: users[1].userId,
  });

  const userA = users[2];
  const userB = users[3];

  await SocietyMember.create({
    society_id: socA.id,
    user_id: userA.userId,
    role: 'member',
    status: 'active',
  });

  await SocietyMember.create({
    society_id: socB.id,
    user_id: userB.userId,
    role: 'member',
    status: 'active',
  });

  await t.test('Cross-Society Complaint Access is Blocked', async () => {
    const complaintA = await complaintService.createComplaint(socA.id, userA.userId, {
      title: 'Water Leak in Alpha Block',
      description: 'Pipe leaking on 3rd floor',
    });

    // User B in Society B cannot view Society A complaint
    const retrieved = await complaintService.getComplaintById(complaintA.id, socB.id, userB.userId, false);
    assert.equal(retrieved, null);
  });

  await t.test('Resident Privacy: Resident A cannot view Resident B complaint in same society', async () => {
    const complaintA = await complaintService.createComplaint(socA.id, userA.userId, {
      title: 'Private Grievance of User A',
      description: 'Confidential billing question',
    });

    // Another resident in same society cannot view User A complaint
    const retrieved = await complaintService.getComplaintById(complaintA.id, socA.id, userB.userId, false);
    assert.equal(retrieved, null);
  });

  await t.test('Last Active Admin Protection Blocks Demotion / Removal', async () => {
    // Admin in Society B is users[1]
    const adminB = await SocietyMember.create({
      society_id: socB.id,
      user_id: users[1].userId,
      role: 'admin',
      status: 'active',
    });

    // Demoting sole admin should be rejected
    await assert.rejects(async () => {
      await memberService.updateMember(adminB.id, socB.id, { role: 'member' }, users[1].userId);
    }, (err) => err.message.includes('Cannot demote or deactivate the last active admin'));

    // Removing sole admin should be rejected
    await assert.rejects(async () => {
      await memberService.removeMember(adminB.id, socB.id, 'Leaving society', users[1].userId);
    }, (err) => err.message.includes('Cannot remove the last active admin'));
  });

  await t.test('Ownership Transfer Enforcement', async () => {
    // Non-owner (userB) cannot transfer ownership of Soc A
    await assert.rejects(async () => {
      await memberService.transferSocietyOwnership(socA.id, {
        currentOwnerId: userB.userId,
        targetUserId: userA.userId,
      });
    }, (err) => err.statusCode === 403);

    // Owner transfers ownership of Soc A to userA
    const updatedSoc = await memberService.transferSocietyOwnership(socA.id, {
      currentOwnerId: users[0].userId,
      targetUserId: userA.userId,
    });
    assert.equal(Number(updatedSoc.user_id), Number(userA.userId));
  });
});

test('Society Joi Validation Schemas Reject Invalid Payloads', () => {
  // Empty society name
  const badProfile = validation.createSocietyProfileSchema.validate({ society_name: '' });
  assert.ok(badProfile.error);

  // Invalid priority
  const badAnnouncement = validation.createAnnouncementSchema.validate({
    society_id: 1,
    title: 'Test',
    message: 'Test message',
    priority: 'ultra_critical',
  });
  assert.ok(badAnnouncement.error);

  // Poll with less than 2 options
  const badPoll = validation.createPollSchema.validate({
    society_id: 1,
    question: 'Only one option?',
    options: ['Option 1'],
  });
  assert.ok(badPoll.error);

  // Invalid visitor state transition
  const badVisitorStatus = validation.updateVisitorStatusSchema.validate({
    status: 'teleported',
  });
  assert.ok(badVisitorStatus.error);
});
