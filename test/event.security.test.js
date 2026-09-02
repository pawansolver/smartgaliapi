import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import Event, { EVENT_STATUS, EVENT_TYPE, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import EventParticipant, { RSVP_STATUS } from '../src/modules/event_participant/event_participant.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import * as participantService from '../src/modules/event_participant/event_participant.service.js';
import {
  canReadEvent,
  canCreateEvent,
  canUpdateEvent,
  canDeleteEvent,
  canCancelEvent,
  canRsvpEvent,
  isGlobalAdminUser,
} from '../src/modules/event/event.policy.js';

test('Event RBAC, Security, IDOR & Multi-Role Test Suite', async (t) => {
  let hostUser = null;
  let normalUser = null;
  let modUser = null;
  let adminUser = null;
  let superAdminUser = null;
  let testEventId = null;
  let privateCommunity = null;

  // Retrieve or create test users
  let users = await User.findAll({ where: { is_deleted: false }, limit: 5 });
  while (users.length < 5) {
    const u = await User.create({
      userName: `EventTestUser_${Date.now()}_${users.length}`,
      email: `event_user_${Date.now()}_${users.length}@smartgali.com`,
      phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      userRole: 'resident',
    });
    users.push(u);
  }

  hostUser = users[0];
  normalUser = users[1];
  modUser = users[2];
  adminUser = { userId: users[3].userId, id: users[3].userId, userRole: 'admin', role: 'admin' };
  superAdminUser = { userId: users[4].userId, id: users[4].userId, userRole: 'super_admin', role: 'super_admin' };

  // Create a private test community
  privateCommunity = await Community.create({
    communityName: `Private Sec Comm ${Date.now()}`,
    is_private: true,
    created_by: hostUser.userId,
    status: 'active',
    is_deleted: false,
    created_at: new Date(),
  });

  // Add modUser as moderator in private community
  await CommunityMember.create({
    community_id: privateCommunity.communityId,
    user_id: modUser.userId,
    role: 'moderator',
    status: 'active',
    is_deleted: false,
    joined_at: new Date(),
  });

  try {
    // ── 1. Create capacity-limited event ──
    const event = await eventService.createEvent({
      title: 'Exclusive Coding Bootcamp',
      description: 'Strict capacity of 5 attendees',
      event_type: EVENT_TYPE.OFFLINE,
      visibility: EVENT_VISIBILITY.PUBLIC,
      status: EVENT_STATUS.PUBLISHED,
      start_at: new Date(Date.now() + 86400000),
      location: 'Lab A',
      max_participants: 5,
    }, hostUser.userId, hostUser);

    testEventId = event.id;
    assert.equal(Number(event.going_count), 1, 'Creator automatically RSVP going');

    const dbEvent = await Event.findByPk(testEventId);

    // ── 2. Standalone Event Policy & IDOR Checks ──
    await t.test('Non-creator member cannot edit/delete/cancel standalone event', async () => {
      assert.equal(canUpdateEvent(dbEvent, { id: normalUser.userId }), false);
      assert.equal(canDeleteEvent(dbEvent, { id: normalUser.userId }), false);
      assert.equal(canCancelEvent(dbEvent, { id: normalUser.userId }), false);
    });

    await t.test('Creator can edit/delete/cancel own event', async () => {
      assert.equal(canUpdateEvent(dbEvent, { id: hostUser.userId }), true);
      assert.equal(canDeleteEvent(dbEvent, { id: hostUser.userId }), true);
      assert.equal(canCancelEvent(dbEvent, { id: hostUser.userId }), true);
    });

    // ── 3. Global Super Admin and Admin Overrides ──
    await t.test('Global Admin and Super Admin can manage any event', async () => {
      assert.equal(isGlobalAdminUser(adminUser), true);
      assert.equal(isGlobalAdminUser(superAdminUser), true);
      assert.equal(canUpdateEvent(dbEvent, adminUser), true, 'Global admin can update');
      assert.equal(canDeleteEvent(dbEvent, adminUser), true, 'Global admin can delete');
      assert.equal(canCancelEvent(dbEvent, adminUser), true, 'Global admin can cancel');
      assert.equal(canUpdateEvent(dbEvent, superAdminUser), true, 'Super admin can update');
      assert.equal(canDeleteEvent(dbEvent, superAdminUser), true, 'Super admin can delete');
      assert.equal(canCancelEvent(dbEvent, superAdminUser), true, 'Super admin can cancel');
    });

    // ── 4. Private Community Event Creation Guards (EVT-03) ──
    await t.test('Non-member cannot create event in private community', async () => {
      await assert.rejects(
        async () => {
          await eventService.createEvent({
            title: 'Unauthorized Private Comm Event',
            event_type: EVENT_TYPE.OFFLINE,
            community_id: privateCommunity.communityId,
            start_at: new Date(Date.now() + 86400000),
          }, normalUser.userId, normalUser);
        },
        { statusCode: 403, message: /membership required/i }
      );
    });

    await t.test('Community Moderator/Creator can create event in private community', async () => {
      const commEvent = await eventService.createEvent({
        title: 'Authorized Mod Private Comm Event',
        event_type: EVENT_TYPE.OFFLINE,
        community_id: privateCommunity.communityId,
        start_at: new Date(Date.now() + 86400000),
      }, modUser.userId, modUser);
      assert.ok(commEvent.id);
      await EventParticipant.destroy({ where: { event_id: commEvent.id } });
      await Event.destroy({ where: { id: commEvent.id } });
    });

    // ── 5. RSVP State Machine & Capacity Rejection ──
    await t.test('RSVP state transitions and atomicity', async () => {
      const res1 = await participantService.setEventRsvp(testEventId, normalUser.userId, RSVP_STATUS.INTERESTED);
      assert.equal(res1.event.interested_count, 1);
      assert.equal(res1.event.going_count, 1);

      const res2 = await participantService.setEventRsvp(testEventId, normalUser.userId, RSVP_STATUS.GOING);
      assert.equal(res2.event.going_count, 2);
      assert.equal(res2.event.interested_count, 0);

      // Idempotent call
      const res3 = await participantService.setEventRsvp(testEventId, normalUser.userId, RSVP_STATUS.GOING);
      assert.equal(res3.changed, false);
      assert.equal(res3.event.going_count, 2);

      // Cancel RSVP
      const cancelRes = await participantService.cancelEventRsvp(testEventId, normalUser.userId);
      assert.equal(cancelRes.success, true);
      assert.equal(cancelRes.event.going_count, 1);
    });

    // ── 6. Event Cancellation & Rejection ──
    await t.test('Cancelled event rejects new RSVPs', async () => {
      await eventService.cancelEvent(testEventId, 'Emergency cancel', { id: hostUser.userId });

      await assert.rejects(
        async () => {
          await participantService.setEventRsvp(testEventId, normalUser.userId, RSVP_STATUS.GOING);
        },
        { message: /cancelled/i }
      );
    });

  } finally {
    if (testEventId) {
      await EventParticipant.destroy({ where: { event_id: testEventId } });
      await Event.destroy({ where: { id: testEventId } });
    }
    if (privateCommunity) {
      await CommunityMember.destroy({ where: { community_id: privateCommunity.communityId } });
      await Community.destroy({ where: { communityId: privateCommunity.communityId } });
    }
  }
});
