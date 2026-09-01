import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import Event, { EVENT_STATUS, EVENT_TYPE, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import EventParticipant, { RSVP_STATUS } from '../src/modules/event_participant/event_participant.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import * as participantService from '../src/modules/event_participant/event_participant.service.js';
import { reconcileEventCounters } from '../src/workers/counterReconciliation.worker.js';

test('Events Module Enterprise Concurrency & Resilience Suite', async (t) => {
  let hostId = null;
  let testUsers = [];
  let testEventId = null;

  // Setup: Ensure host and at least 26 test users exist
  let users = await User.findAll({ where: { is_deleted: false }, limit: 35 });
  while (users.length < 26) {
    const newUser = await User.create({
      userName: `ConcurrentTester_${users.length + 1}`,
      email: `conctest_${users.length + 1}@smartgali.com`,
      phone: `98765432${(users.length + 1).toString().padStart(2, '0')}`,
    });
    users.push(newUser);
  }

  hostId = users[0].userId;
  testUsers = users.slice(1, 26); // Exactly 25 users

  try {
    // 1. Create capacity-restricted event (Capacity = 10)
    // Creator is automatically registered as Going (#1), leaving 9 spots.
    const event = await eventService.createEvent({
      title: 'High-Concurrency Tech Masterclass',
      description: 'Stress testing 20 concurrent RSVP attempts on 4 remaining spots',
      event_type: EVENT_TYPE.OFFLINE,
      visibility: EVENT_VISIBILITY.PUBLIC,
      status: EVENT_STATUS.PUBLISHED,
      start_at: new Date(Date.now() + 86400000),
      max_participants: 10,
    }, hostId);

    testEventId = event.id;
    assert.equal(Number(event.going_count), 1);

    // 2. Pre-fill 5 more spots (Users 0..4) -> Total going = 6, Remaining spots = 4
    for (let i = 0; i < 5; i++) {
      await participantService.setEventRsvp(testEventId, testUsers[i].userId, RSVP_STATUS.GOING);
    }

    const midEvent = await Event.findByPk(testEventId);
    assert.equal(Number(midEvent.going_count), 6, 'Pre-filled going count must equal 6 (4 spots remaining)');

    // 3. CONCURRENCY: 20 simultaneous users (Users 5..24) race for the 4 remaining slots
    const concurrentUsers = testUsers.slice(5, 25); // Exactly 20 users
    assert.equal(concurrentUsers.length, 20);

    const racePromises = concurrentUsers.map((u) =>
      participantService.setEventRsvp(testEventId, u.userId, RSVP_STATUS.GOING)
        .then((res) => ({ success: true, userId: u.userId, res }))
        .catch((err) => ({ success: false, userId: u.userId, error: err.message, status: err.statusCode }))
    );

    const raceResults = await Promise.all(racePromises);

    const successes = raceResults.filter((r) => r.success);
    const failures = raceResults.filter((r) => !r.success);

    // Exactly 4 must succeed to reach max_participants = 10
    assert.equal(successes.length, 4, `Exactly 4 of 20 concurrent requests must succeed, got ${successes.length}`);
    // Exactly 16 must fail with 409 capacity rejection
    assert.equal(failures.length, 16, `Exactly 16 of 20 concurrent requests must fail, got ${failures.length}`);
    for (const f of failures) {
      assert.equal(f.status, 409, 'Rejection status code must be 409 Conflict / Capacity Reached');
      assert.match(f.error, /capacity/i, 'Rejection message must mention capacity limit');
    }

    // Verify database state integrity
    const finalEvent = await Event.findByPk(testEventId);
    assert.equal(Number(finalEvent.going_count), 10, 'Event going_count must strictly equal max_participants 10');

    const totalGoingRows = await EventParticipant.count({
      where: { event_id: testEventId, status: RSVP_STATUS.GOING, is_deleted: false },
    });
    assert.equal(totalGoingRows, 10, 'Actual database participant rows with status=going must strictly equal 10');

    // 4. Test Counter Reconciliation Worker with artificially corrupted counter
    await Event.update({ going_count: 99 }, { where: { id: testEventId } });
    const corrupted = await Event.findByPk(testEventId);
    assert.equal(corrupted.going_count, 99);

    const reconRes = await reconcileEventCounters();
    assert.ok(reconRes.mismatches >= 1, 'Reconciliation worker must detect counter mismatch');
    assert.ok(reconRes.repaired >= 1, 'Reconciliation worker must repair corrupted counter');

    const repaired = await Event.findByPk(testEventId);
    assert.equal(Number(repaired.going_count), 10, 'Reconciled going_count must be restored back to exact 10');
  } finally {
    if (testEventId) {
      await EventParticipant.destroy({ where: { event_id: testEventId } });
      await Event.destroy({ where: { id: testEventId } });
    }
  }
});
