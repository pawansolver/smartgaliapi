import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import Event, { EVENT_STATUS, EVENT_TYPE, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import EventParticipant, { RSVP_STATUS } from '../src/modules/event_participant/event_participant.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import * as participantService from '../src/modules/event_participant/event_participant.service.js';
import { canUpdateEvent, canDeleteEvent } from '../src/modules/event/event.policy.js';

test('Event RBAC, Security & Concurrency Test Suite', async (t) => {
  let creatorId = null;
  let userA = null;
  let testEventId = null;

  // Retrieve or create test users with valid DB foreign keys
  let users = await User.findAll({ where: { is_deleted: false }, limit: 2 });
  if (users.length < 2) {
    const u1 = await User.create({ userName: 'EventHost1', email: 'host1@smartgali.com', phone: '9811111111' });
    const u2 = await User.create({ userName: 'EventGuest1', email: 'guest1@smartgali.com', phone: '9822222222' });
    users = [u1, u2];
  }
  creatorId = users[0].userId;
  userA = users[1].userId;

  try {
    // 1. Setup capacity-limited event
    const event = await eventService.createEvent({
      title: 'Exclusive Coding Bootcamp',
      description: 'Strict capacity of 5 attendees',
      event_type: EVENT_TYPE.OFFLINE,
      visibility: EVENT_VISIBILITY.PUBLIC,
      status: EVENT_STATUS.PUBLISHED,
      start_at: new Date(Date.now() + 86400000),
      location: 'Lab A',
      max_participants: 5,
    }, creatorId);

    testEventId = event.id;
    assert.equal(Number(event.going_count), 1); // creator is #1

    // 2. RBAC Policy Check
    const dbEvent = await Event.findByPk(testEventId);
    assert.equal(canUpdateEvent(dbEvent, { id: userA }), false, 'User A cannot update event');
    assert.equal(canDeleteEvent(dbEvent, { id: userA }), false, 'User A cannot delete event');
    assert.equal(canUpdateEvent(dbEvent, { id: creatorId }), true, 'Creator can update');
    assert.equal(canDeleteEvent(dbEvent, { id: creatorId }), true, 'Creator can delete');

    // 3. RSVP Transitions
    const res1 = await participantService.setEventRsvp(testEventId, userA, RSVP_STATUS.INTERESTED);
    assert.equal(res1.event.interested_count, 1);
    assert.equal(res1.event.going_count, 1);

    const res2 = await participantService.setEventRsvp(testEventId, userA, RSVP_STATUS.GOING);
    assert.equal(res2.event.going_count, 2, 'Going count should increment to 2');
    assert.equal(res2.event.interested_count, 0, 'Interested count should decrement to 0');

    // Idempotent call
    const res3 = await participantService.setEventRsvp(testEventId, userA, RSVP_STATUS.GOING);
    assert.equal(res3.changed, false);
    assert.equal(res3.event.going_count, 2, 'Going count must not double increment');

    // RSVP Removal
    const cancelRes = await participantService.cancelEventRsvp(testEventId, userA);
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.event.going_count, 1, 'Going count decrements back to 1');

    // 4. Cancel Event & Rejection
    await eventService.cancelEvent(testEventId, 'Emergency cancel', { id: creatorId });

    await assert.rejects(
      async () => {
        await participantService.setEventRsvp(testEventId, userA, RSVP_STATUS.GOING);
      },
      { message: /cancelled/i }
    );
  } finally {
    if (testEventId) {
      await EventParticipant.destroy({ where: { event_id: testEventId } });
      await Event.destroy({ where: { id: testEventId } });
    }
  }
});
