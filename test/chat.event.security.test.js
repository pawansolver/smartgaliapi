import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import Event, { EVENT_STATUS, EVENT_TYPE, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import EventParticipant, { RSVP_STATUS } from '../src/modules/event_participant/event_participant.model.js';
import Chat from '../src/modules/chat/chat.model.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import * as participantService from '../src/modules/event_participant/event_participant.service.js';
import { verifyChatMember } from '../src/middleware/chatAuthorization.middleware.js';
import { revokeUserFromChatRoom, initSocket, getIO } from '../src/socket.js';
import http from 'http';

// Minimal mock helpers for middleware testing
const resStub = () => {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

test('Event Chat & Community Chat Authorization & Revocation Security Suite', async (t) => {
  let hostUser = null;
  let attendeeUser = null;
  let nonRsvpUser = null;
  let adminUser = null;
  let testEvent = null;
  let testEventChat = null;
  let testCommunity = null;
  let server = null;

  // Retrieve or create test users
  let users = await User.findAll({ where: { is_deleted: false }, limit: 4 });
  while (users.length < 4) {
    const u = await User.create({
      userName: `ChatSecUser_${Date.now()}_${users.length}`,
      email: `chat_user_${Date.now()}_${users.length}@smartgali.com`,
      phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      userRole: 'resident',
    });
    users.push(u);
  }

  hostUser = users[0];
  attendeeUser = users[1];
  nonRsvpUser = users[2];
  adminUser = { userId: users[3].userId, id: users[3].userId, userRole: 'admin', role: 'admin' };

  try {
    // 1. Setup Event
    testEvent = await eventService.createEvent({
      title: 'Real-Time Hackathon 2026',
      description: 'Event with dedicated chat room',
      event_type: EVENT_TYPE.OFFLINE,
      visibility: EVENT_VISIBILITY.PUBLIC,
      status: EVENT_STATUS.PUBLISHED,
      start_at: new Date(Date.now() + 86400000),
      location: 'Tech Hub',
    }, hostUser.userId, hostUser);

    // Create Event Chat
    testEventChat = await Chat.create({
      chat_type: 'event',
      event_id: testEvent.id,
      name: 'Hackathon Chat',
      created_by: hostUser.userId,
      is_active: true,
      is_deleted: false,
    });

    // ── Test 1: Non-RSVP user is rejected ──
    await t.test('Non-RSVP user is rejected from Event Chat', async () => {
      const req = { user: { id: nonRsvpUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      const r = resStub();
      await verifyChatMember(req, r, () => {});
      assert.equal(r.statusCode, 403, 'Non-attendee should receive 403');
    });

    // ── Test 2: Active RSVP user gets access ──
    await t.test('Active RSVP user gets access to Event Chat', async () => {
      await participantService.setEventRsvp(testEvent.id, attendeeUser.userId, RSVP_STATUS.GOING);
      const req = { user: { id: attendeeUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      const r = resStub();
      let nextCalled = false;
      await verifyChatMember(req, r, () => { nextCalled = true; });
      assert.equal(nextCalled, true, 'Active RSVP attendee should be allowed');
    });

    // ── Test 3: RSVP Cancellation revokes ChatParticipant and blocks access ──
    await t.test('RSVP cancellation immediately blocks HTTP chat access and prevents auto-recreation', async () => {
      await participantService.cancelEventRsvp(testEvent.id, attendeeUser.userId);

      // Verify ChatParticipant was deactivated
      const chatPart = await ChatParticipant.findOne({
        where: { chat_id: testEventChat.id, user_id: attendeeUser.userId },
      });
      assert.ok(chatPart, 'Record exists');
      assert.equal(chatPart.is_deleted, true, 'ChatParticipant must be soft-deleted');

      // Verify verifyChatMember rejects access
      const req = { user: { id: attendeeUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      const r = resStub();
      let nextCalled = false;
      await verifyChatMember(req, r, () => { nextCalled = true; });
      assert.equal(nextCalled, false, 'Cancelled attendee must be rejected');
      assert.equal(r.statusCode, 403);

      // Verify auto-provisioning DOES NOT resurrect ChatParticipant
      const chatPartAfter = await ChatParticipant.findOne({
        where: { chat_id: testEventChat.id, user_id: attendeeUser.userId },
      });
      assert.equal(chatPartAfter.is_deleted, true, 'ChatParticipant must remain deleted');
    });

    // ── Test 4: Socket room eviction verification ──
    await t.test('Socket room eviction properly removes socket from chat room', async () => {
      // Setup mock socket IO server if not active
      if (!getIO()) {
        server = http.createServer();
        initSocket(server);
      }
      const io = getIO();
      if (io) {
        // Create mock socket instance
        const mockSocketId = 'test_socket_123';
        const mockSocket = {
          id: mockSocketId,
          rooms: new Set([`user:${attendeeUser.userId}`, `chat:${testEventChat.id}`]),
          leave: function(room) { this.rooms.delete(room); },
        };
        
        // Mock io.in().fetchSockets()
        const origIn = io.in.bind(io);
        io.in = (roomName) => {
          if (roomName === `user:${attendeeUser.userId}`) {
            return {
              fetchSockets: async () => [mockSocket],
            };
          }
          return origIn(roomName);
        };

        // Assert socket starts in room
        assert.equal(mockSocket.rooms.has(`chat:${testEventChat.id}`), true, 'Socket initially in room');

        // Execute revokeUserFromChatRoom
        await revokeUserFromChatRoom(testEventChat.id, attendeeUser.userId);

        // Assert socket was removed from chat room
        assert.equal(mockSocket.rooms.has(`chat:${testEventChat.id}`), false, 'Socket successfully evicted from chat room');
        
        // Restore io.in
        io.in = origIn;
      }
    });

    // ── Test 5: Event Creator & Global Admin retain access ──
    await t.test('Event Creator and Global Admin retain chat access', async () => {
      // Event Creator
      const reqCreator = { user: { id: hostUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      let creatorAllowed = false;
      await verifyChatMember(reqCreator, resStub(), () => { creatorAllowed = true; });
      assert.equal(creatorAllowed, true, 'Event creator retains access');

      // Global Admin
      const reqAdmin = { user: adminUser, params: { chatId: testEventChat.id }, body: {} };
      let adminAllowed = false;
      await verifyChatMember(reqAdmin, resStub(), () => { adminAllowed = true; });
      assert.equal(adminAllowed, true, 'Global admin retains access');
    });

    // ── Test 6: Interested RSVP status allows access ──
    await t.test('Interested RSVP status allows Event Chat access', async () => {
      await participantService.setEventRsvp(testEvent.id, nonRsvpUser.userId, RSVP_STATUS.INTERESTED);
      const req = { user: { id: nonRsvpUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      const r = resStub();
      let nextCalled = false;
      await verifyChatMember(req, r, () => { nextCalled = true; });
      assert.equal(nextCalled, true, 'Interested RSVP should be allowed');
    });

    // ── Test 7: Event Cancellation closes Event Chat for non-admins ──
    await t.test('Event cancellation rejects non-admin chat access', async () => {
      await eventService.cancelEvent(testEvent.id, 'Host cancelled event', { id: hostUser.userId });

      const req = { user: { id: nonRsvpUser.userId }, params: { chatId: testEventChat.id }, body: {} };
      const r = resStub();
      let nextCalled = false;
      await verifyChatMember(req, r, () => { nextCalled = true; });
      assert.equal(nextCalled, false);
      assert.equal(r.statusCode, 403, 'Cancelled event rejects normal attendee chat participation');

      // Global admin retains audit access
      const reqAdmin = { user: adminUser, params: { chatId: testEventChat.id }, body: {} };
      let adminAllowed = false;
      await verifyChatMember(reqAdmin, resStub(), () => { adminAllowed = true; });
      assert.equal(adminAllowed, true, 'Global admin retains audit access on cancelled event');
    });

  } finally {
    if (server) server.close();
    if (testEventChat) {
      await ChatParticipant.destroy({ where: { chat_id: testEventChat.id } });
      await Chat.destroy({ where: { id: testEventChat.id } });
    }
    if (testEvent) {
      await EventParticipant.destroy({ where: { event_id: testEvent.id } });
      await Event.destroy({ where: { id: testEvent.id } });
    }
    if (testCommunity) {
      await CommunityMember.destroy({ where: { community_id: testCommunity.communityId } });
      await Community.destroy({ where: { communityId: testCommunity.communityId } });
    }
  }
});
