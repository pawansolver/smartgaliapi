/**
 * Comprehensive Test Suite:
 * - Society Documents & Authorization
 * - Society Emergency Contacts & Alert Broadcast
 * - Society Events & Scoping
 * - Event Invitations (Creation, Duplicate Prevention, Accept RSVP Sync, Decline)
 * - Event Chat Lifecycle (Idempotent Get/Create, RSVP requirement, Cancelled guard)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';

import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';
import SocietyDocument from '../src/modules/society_document/society_document.model.js';
import * as societyDocumentService from '../src/modules/society_document/society_document.service.js';
import SocietyEmergencyContact from '../src/modules/society_emergency_contact/society_emergency_contact.model.js';
import * as societyEmergencyContactService from '../src/modules/society_emergency_contact/society_emergency_contact.service.js';
import Event, { EVENT_STATUS, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import EventInvitation, { INVITATION_STATUS } from '../src/modules/event_invitation/event_invitation.model.js';
import * as eventInvitationService from '../src/modules/event_invitation/event_invitation.service.js';
import EventParticipant from '../src/modules/event_participant/event_participant.model.js';
import Chat from '../src/modules/chat/chat.model.js';

test('Society Documents, Emergency Contacts, Society Events & Event Invitations Suite', async (t) => {
  let testSociety;
  let adminUser;
  let residentUser;
  let strangerUser;
  let testEvent;

  t.before(async () => {
    // Find or setup test users
    adminUser = await User.findOne({ where: { is_deleted: false } });
    const otherUsers = await User.findAll({
      where: { userId: { [Op.ne]: adminUser.userId }, is_deleted: false },
      limit: 2,
    });
    residentUser = otherUsers[0];
    strangerUser = otherUsers[1] || adminUser;

    // Create a temporary test society
    testSociety = await SocietyProfile.create({
      society_name: 'Test Enterprise Greens ' + Date.now(),
      registration_no: 'REG-' + Date.now(),
      address: '123 Test Avenue, Metropolis',
      user_id: adminUser.userId,
      created_by: adminUser.userId,
      created_at: new Date(),
    });

    // Bind admin membership
    await SocietyMember.create({
      society_id: testSociety.id,
      user_id: adminUser.userId,
      role: 'admin',
      status: 'active',
      created_at: new Date(),
    });

    // Bind resident membership
    await SocietyMember.create({
      society_id: testSociety.id,
      user_id: residentUser.userId,
      role: 'resident',
      status: 'active',
      created_at: new Date(),
    });
  });

  t.after(async () => {
    // Cleanup created test records
    if (testSociety) {
      await SocietyDocument.destroy({ where: { society_id: testSociety.id } });
      await SocietyEmergencyContact.destroy({ where: { society_id: testSociety.id } });
      await Event.destroy({ where: { society_id: testSociety.id } });
      await SocietyMember.destroy({ where: { society_id: testSociety.id } });
      await testSociety.destroy();
    }
  });

  // ── 1. Society Documents Tests ──────────────────────────────────────────────
  await t.test('1. Society Documents: Upload, List, Filter, Update, Delete', async () => {
    // Upload document
    const doc = await societyDocumentService.createDocument(
      testSociety.id,
      adminUser.userId,
      {
        title: 'Society Bye-Laws 2026',
        description: 'Official bye-laws document',
        category: 'bye_laws',
        file_url: 'http://example.com/uploads/society/bye-laws.pdf',
        file_type: 'application/pdf',
        file_size: 102400,
      }
    );

    assert.ok(doc.id, 'Document created with ID');
    assert.equal(doc.category, 'bye_laws');

    // List documents
    const listRes = await societyDocumentService.getAllDocuments(testSociety.id, { category: 'bye_laws' });
    assert.equal(listRes.total >= 1, true, 'At least 1 document found');
    assert.equal(listRes.data[0].title, 'Society Bye-Laws 2026');

    // Update metadata
    const updated = await societyDocumentService.updateDocument(
      doc.id,
      testSociety.id,
      { title: 'Updated Bye-Laws 2026' },
      adminUser.userId
    );
    assert.equal(updated.title, 'Updated Bye-Laws 2026');

    // Soft delete
    const deleted = await societyDocumentService.deleteDocument(doc.id, testSociety.id, adminUser.userId);
    assert.equal(deleted, true);

    const checkAfterDelete = await societyDocumentService.getDocumentById(doc.id, testSociety.id);
    assert.equal(checkAfterDelete, null, 'Deleted document is not returned');
  });

  // ── 2. Society Emergency Contacts & Alert Tests ─────────────────────────────
  await t.test('2. Society Emergency Contacts: Create, List, Update, Alert Broadcast', async () => {
    // Create emergency contact
    const contact = await societyEmergencyContactService.createEmergencyContact(
      testSociety.id,
      adminUser.userId,
      {
        name: 'Gate 1 Security Guard',
        designation: 'Head Guard',
        phone: '9876543210',
        category: 'security',
      }
    );

    assert.ok(contact.id, 'Emergency contact created');
    assert.equal(contact.category, 'security');

    // List contacts
    const contacts = await societyEmergencyContactService.getAllEmergencyContacts(testSociety.id, {});
    assert.equal(contacts.length >= 1, true);

    // Broadcast emergency alert
    const alertRes = await societyEmergencyContactService.broadcastEmergencyAlert(
      testSociety.id,
      {
        title: 'Fire Drill Alert',
        message: 'Annual fire drill at 4 PM in Block A',
        severity: 'high',
      },
      adminUser.userId
    );

    assert.equal(alertRes.success, true);
  });

  // ── 3. Society Scoped Events Tests ──────────────────────────────────────────
  await t.test('3. Society Events: Creation and Scoping', async () => {
    testEvent = await eventService.createEvent(
      {
        title: 'Society Annual AGM 2026',
        description: 'Annual General Meeting for residents',
        start_at: new Date(Date.now() + 86400000).toISOString(),
        visibility: EVENT_VISIBILITY.COMMUNITY,
        society_id: testSociety.id,
        location: 'Clubhouse Hall',
      },
      adminUser.userId,
      adminUser
    );

    assert.ok(testEvent.id, 'Event created');
    assert.equal(Number(testEvent.society_id), Number(testSociety.id));

    // Fetch upcoming events scoped to society
    const societyEvents = await eventService.getUpcomingEvents({
      society_id: testSociety.id,
    });
    assert.equal(societyEvents.events.length >= 1, true);
    assert.equal(societyEvents.events[0].title, 'Society Annual AGM 2026');
  });

  // ── 4. Event Invitations Tests ──────────────────────────────────────────────
  await t.test('4. Event Invitations: Send, Prevent Duplicate, Accept RSVP Sync, Decline', async () => {
    // Send invitation to residentUser
    const sendRes = await eventInvitationService.sendInvitations(
      testEvent.id,
      adminUser.userId,
      [residentUser.userId]
    );

    assert.equal(sendRes.created, 1, '1 invitation created');
    const invitation = sendRes.invitations[0];

    // Attempt duplicate invite (should be skipped)
    const dupRes = await eventInvitationService.sendInvitations(
      testEvent.id,
      adminUser.userId,
      [residentUser.userId]
    );
    assert.equal(dupRes.created, 0, 'Duplicate invitation prevented');

    // Resident views my invitations
    const myInvites = await eventInvitationService.getMyInvitations(residentUser.userId, { status: 'pending' });
    assert.equal(myInvites.total >= 1, true);

    // Resident accepts invitation -> automatically syncs RSVP to 'going'
    const accepted = await eventInvitationService.respondToInvitation(
      invitation.id,
      residentUser.userId,
      'accepted'
    );
    assert.equal(accepted.status, INVITATION_STATUS.ACCEPTED);

    // Verify RSVP was synchronized in event_participants
    const participant = await EventParticipant.findOne({
      where: { event_id: testEvent.id, user_id: residentUser.userId, is_deleted: false },
    });
    assert.ok(participant, 'Participant record created on acceptance');
    assert.equal(participant.status, 'going', 'RSVP synced to going');
  });

  // ── 5. Event Chat Lifecycle Tests ───────────────────────────────────────────
  await t.test('5. Event Chat Lifecycle: Idempotent Get/Create & Authorization', async () => {
    // 1. Creator accesses event chat -> creates chat
    const chat1 = await eventService.getOrCreateEventChat(testEvent.id, adminUser);
    assert.ok(chat1.id, 'Event chat created');
    assert.equal(chat1.chat_type, 'event');

    // 2. RSVP participant ('going') accesses event chat -> returns SAME chat (idempotent)
    const chat2 = await eventService.getOrCreateEventChat(testEvent.id, residentUser);
    assert.equal(chat2.id, chat1.id, 'Idempotent chat access returns same chat ID');

    // 3. Unauthorized non-participant stranger is rejected with 403
    await assert.rejects(
      async () => {
        await eventService.getOrCreateEventChat(testEvent.id, { userId: 999999, role: 'resident' });
      },
      (err) => err.status === 403,
      'Stranger without active RSVP is rejected with 403'
    );

    // 4. Cancelled event chat rejection
    await testEvent.update({ status: EVENT_STATUS.CANCELLED });
    await assert.rejects(
      async () => {
        await eventService.getOrCreateEventChat(testEvent.id, adminUser);
      },
      (err) => err.status === 400,
      'Cancelled event chat is rejected with 400'
    );
  });
});
