import jwt from 'jsonwebtoken';
import User from './src/modules/user/user.model.js';
import EventCategory from './src/modules/event_category/event_category.model.js';
import Event from './src/modules/event/event.model.js';
import EventParticipant from './src/modules/event_participant/event_participant.model.js';
import OutboxEvent from './src/modules/outbox/outbox_event.model.js';
import { processEvent } from './src/modules/outbox/outbox.processor.js';
import { reconcileEventCounters } from './src/workers/counterReconciliation.worker.js';

const runComprehensiveEventAudit = async () => {
  console.log('\n=============================================================');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END EVENT MODULE SYSTEM AUDIT');
  console.log('=============================================================\n');

  let app;
  try {
    const appModule = await import('./src/app.js');
    app = appModule.default;
  } catch (e) {
    console.error('❌ Failed to load app.js:', e);
    process.exit(1);
  }

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.log(`[INIT] Test Server running on port ${port} -> ${baseUrl}\n`);

  let testUser1, testUser2, token1, token2;
  let testCategoryId;
  let createdEventId;

  try {
    // ── Setup Users ──
    const users = await User.findAll({ where: { is_deleted: false }, limit: 2 });
    if (users.length < 2) {
      testUser1 = await User.create({
        userName: 'AuditHostUser',
        email: 'audithost@smartgali.com',
        phone: '9900000001',
      });
      testUser2 = await User.create({
        userName: 'AuditAttendeeUser',
        email: 'auditattendee@smartgali.com',
        phone: '9900000002',
      });
    } else {
      testUser1 = users[0];
      testUser2 = users[1];
    }

    token1 = jwt.sign({ id: testUser1.userId, userId: testUser1.userId, email: testUser1.email, userRole: 'user' }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1h' });
    token2 = jwt.sign({ id: testUser2.userId, userId: testUser2.userId, email: testUser2.email, userRole: 'user' }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1h' });

    // ── Setup Category ──
    let cat = await EventCategory.findOne({ where: { is_deleted: false } });
    if (!cat) {
      cat = await EventCategory.create({ name: 'Technology', icon: '💻' });
    }
    testCategoryId = cat.id;

    // ── TEST 1: Categories Fetch ──
    console.log('🔹 TEST 1: GET /event/categories');
    const catRes = await fetch(`${baseUrl}/event/categories`);
    const catData = await catRes.json();
    if (catRes.status !== 200 || !catData.success || !Array.isArray(catData.data)) {
      throw new Error(`Categories fetch failed: ${JSON.stringify(catData)}`);
    }
    console.log(`   ✅ PASS: Fetched ${catData.data.length} categories successfully.`);

    // ── TEST 2: Event Creation (JSON Body) ──
    console.log('\n🔹 TEST 2: POST /event (JSON Event Creation)');
    const eventPayload = {
      title: 'Enterprise AI & Flutter Summit 2026',
      description: 'Comprehensive deep dive into scalable system architectures.',
      category_id: testCategoryId,
      event_type: 'offline',
      visibility: 'public',
      start_at: new Date(Date.now() + 86400000).toISOString(),
      end_at: new Date(Date.now() + 90000000).toISOString(),
      location: 'Tech Hub Arena, Noida',
      location_name: 'Tech Hub Arena',
      address: 'Plot 4, Sector 62, Noida, UP',
      latitude: 28.6280,
      longitude: 77.3649,
      max_participants: 5,
    };

    const createRes = await fetch(`${baseUrl}/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
      },
      body: JSON.stringify(eventPayload),
    });
    const createData = await createRes.json();
    if (createRes.status !== 201 || !createData.success || !createData.data?.id) {
      throw new Error(`Event creation failed: ${JSON.stringify(createData)}`);
    }
    createdEventId = createData.data.id;
    console.log(`   ✅ PASS: Event created with ID: ${createdEventId} (going_count: ${createData.data.going_count})`);

    // ── TEST 3: Plural Route Alias (/events) ──
    console.log('\n🔹 TEST 3: POST /events (Plural Route Alias Test)');
    const createPluralRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
      },
      body: JSON.stringify({
        ...eventPayload,
        title: 'Enterprise Plural Alias Test Event',
      }),
    });
    const createPluralData = await createPluralRes.json();
    if (createPluralRes.status !== 201 || !createPluralData.success) {
      throw new Error(`Plural /events route failed: ${JSON.stringify(createPluralData)}`);
    }
    const pluralEventId = createPluralData.data.id;
    console.log(`   ✅ PASS: Plural endpoint /events created event ID: ${pluralEventId}`);
    await Event.destroy({ where: { id: pluralEventId } });

    // ── TEST 4: Event Details Fetch ──
    console.log(`\n🔹 TEST 4: GET /event/${createdEventId} (Details with Associations)`);
    const detailRes = await fetch(`${baseUrl}/event/${createdEventId}`, {
      headers: { 'Authorization': `Bearer ${token1}` },
    });
    const detailData = await detailRes.json();
    if (detailRes.status !== 200 || !detailData.data || detailData.data.id !== createdEventId) {
      throw new Error(`Get event details failed: ${JSON.stringify(detailData)}`);
    }
    console.log(`   ✅ PASS: Details fetched. Title: "${detailData.data.title}", Creator: ${detailData.data.creator?.userName || 'Found'}`);

    // ── TEST 5: Upcoming Events Feed ──
    console.log('\n🔹 TEST 5: GET /event/upcoming (Feed & Filters)');
    const upcomingRes = await fetch(`${baseUrl}/event/upcoming?limit=10&search=Summit`);
    const upcomingData = await upcomingRes.json();
    if (upcomingRes.status !== 200 || !upcomingData.data?.events) {
      throw new Error(`Upcoming events failed: ${JSON.stringify(upcomingData)}`);
    }
    const foundInUpcoming = upcomingData.data.events.some((e) => e.id === createdEventId);
    if (!foundInUpcoming) throw new Error('Created event not returned in upcoming feed with search query');
    console.log(`   ✅ PASS: Upcoming query returned ${upcomingData.data.events.length} events with matching search.`);

    // ── TEST 6: Nearby Events Query (Haversine & Bounding Box) ──
    console.log('\n🔹 TEST 6: GET /event/nearby (Geo Distance Search)');
    const nearbyRes = await fetch(`${baseUrl}/event/nearby?lat=28.6275&lng=77.3640&radiusKm=20`);
    const nearbyData = await nearbyRes.json();
    if (nearbyRes.status !== 200 || !nearbyData.data?.events) {
      throw new Error(`Nearby events failed: ${JSON.stringify(nearbyData)}`);
    }
    const foundInNearby = nearbyData.data.events.some((e) => e.id === createdEventId);
    if (!foundInNearby) throw new Error('Created event not returned in nearby geo query within 20km');
    console.log(`   ✅ PASS: Geo search found event at proximity distance.`);

    // ── TEST 7: RSVP Action (User 2 -> Going) ──
    console.log(`\n🔹 TEST 7: PUT /event/${createdEventId}/rsvp (Status: GOING)`);
    const rsvpRes = await fetch(`${baseUrl}/event/${createdEventId}/rsvp`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`,
      },
      body: JSON.stringify({ status: 'going' }),
    });
    const rsvpData = await rsvpRes.json();
    const eventGoingCount = rsvpData.data.event ? rsvpData.data.event.going_count : rsvpData.data.going_count;
    if (rsvpRes.status !== 200 || !rsvpData.success || eventGoingCount !== 2) {
      throw new Error(`RSVP going failed: ${JSON.stringify(rsvpData)}`);
    }
    console.log(`   ✅ PASS: User 2 RSVP set to GOING. Total going_count: ${eventGoingCount}`);

    // ── TEST 8: RSVP Action (User 2 -> Transition to Interested) ──
    console.log(`\n🔹 TEST 8: PUT /event/${createdEventId}/rsvp (Transition: GOING -> INTERESTED)`);
    const rsvpIntRes = await fetch(`${baseUrl}/event/${createdEventId}/rsvp`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`,
      },
      body: JSON.stringify({ status: 'interested' }),
    });
    const rsvpIntData = await rsvpIntRes.json();
    const eventIntGoingCount = rsvpIntData.data.event ? rsvpIntData.data.event.going_count : rsvpIntData.data.going_count;
    const eventIntInterestedCount = rsvpIntData.data.event ? rsvpIntData.data.event.interested_count : rsvpIntData.data.interested_count;
    if (rsvpIntRes.status !== 200 || eventIntGoingCount !== 1 || eventIntInterestedCount !== 1) {
      throw new Error(`RSVP transition failed: ${JSON.stringify(rsvpIntData)}`);
    }
    console.log(`   ✅ PASS: Status transitioned. going_count: ${eventIntGoingCount}, interested_count: ${eventIntInterestedCount}`);

    // ── TEST 9: Get Event Participants ──
    console.log(`\n🔹 TEST 9: GET /event/${createdEventId}/participants`);
    const partRes = await fetch(`${baseUrl}/event/${createdEventId}/participants`);
    const partData = await partRes.json();
    if (partRes.status !== 200 || !partData.data?.participants || partData.data.participants.length < 2) {
      throw new Error(`Get participants failed: ${JSON.stringify(partData)}`);
    }
    console.log(`   ✅ PASS: Fetched ${partData.data.participants.length} event participants.`);

    // ── TEST 10: Get My RSVPs ──
    console.log('\n🔹 TEST 10: GET /event/my-rsvps');
    const myRsvpRes = await fetch(`${baseUrl}/event/my-rsvps`, {
      headers: { 'Authorization': `Bearer ${token2}` },
    });
    const myRsvpData = await myRsvpRes.json();
    if (myRsvpRes.status !== 200 || !myRsvpData.data?.rsvps || myRsvpData.data.rsvps.length === 0) {
      throw new Error(`My RSVPs failed: ${JSON.stringify(myRsvpData)}`);
    }
    console.log(`   ✅ PASS: User 2 has ${myRsvpData.data.rsvps.length} active RSVP entries.`);

    // ── TEST 11: Update Event (Host Only) ──
    console.log(`\n🔹 TEST 11: PUT /event/${createdEventId} (Event Metadata Update)`);
    const updateRes = await fetch(`${baseUrl}/event/${createdEventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
      },
      body: JSON.stringify({
        title: 'Enterprise AI & Flutter Summit 2026 (Updated)',
        max_participants: 100,
      }),
    });
    const updateData = await updateRes.json();
    if (updateRes.status !== 200 || updateData.data.title !== 'Enterprise AI & Flutter Summit 2026 (Updated)') {
      throw new Error(`Event update failed: ${JSON.stringify(updateData)}`);
    }
    console.log(`   ✅ PASS: Event title & max_participants updated successfully.`);

    // ── TEST 12: Cancel RSVP ──
    console.log(`\n🔹 TEST 12: DELETE /event/${createdEventId}/rsvp`);
    const delRsvpRes = await fetch(`${baseUrl}/event/${createdEventId}/rsvp`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token2}` },
    });
    const delRsvpData = await delRsvpRes.json();
    if (delRsvpRes.status !== 200 || !delRsvpData.success) {
      throw new Error(`Cancel RSVP failed: ${JSON.stringify(delRsvpData)}`);
    }
    console.log(`   ✅ PASS: User 2 RSVP cancelled.`);

    // ── TEST 13: Cancel Event (Host Action) ──
    console.log(`\n🔹 TEST 13: PUT /event/${createdEventId}/cancel`);
    const cancelRes = await fetch(`${baseUrl}/event/${createdEventId}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
      },
      body: JSON.stringify({ reason: 'Rescheduling to next quarter' }),
    });
    const cancelData = await cancelRes.json();
    if (cancelRes.status !== 200 || cancelData.data.status !== 'cancelled') {
      throw new Error(`Cancel event failed: ${JSON.stringify(cancelData)}`);
    }
    console.log(`   ✅ PASS: Event marked as CANCELLED.`);

    // ── TEST 14: Soft Delete Event ──
    console.log(`\n🔹 TEST 14: DELETE /event/${createdEventId}`);
    const deleteRes = await fetch(`${baseUrl}/event/${createdEventId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
      },
      body: JSON.stringify({ deletedRemarks: 'Audit completed' }),
    });
    const deleteData = await deleteRes.json();
    if (deleteRes.status !== 200 || !deleteData.success) {
      throw new Error(`Delete event failed: ${JSON.stringify(deleteData)}`);
    }
    console.log(`   ✅ PASS: Event soft-deleted successfully.`);

    // ── TEST 15: Outbox Event Processing ──
    console.log('\n🔹 TEST 15: Outbox Event Processing Pipeline');
    const outboxEvents = await OutboxEvent.findAll({
      where: { aggregate_type: 'event', aggregate_id: createdEventId },
      limit: 10,
    });
    console.log(`   Found ${outboxEvents.length} outbox domain events generated.`);
    for (const ob of outboxEvents) {
      const processRes = await processEvent(ob);
      if (!processRes.ok && processRes.reason !== 'already_published') {
        throw new Error(`Outbox event processing failed for ${ob.id}: ${processRes.error}`);
      }
    }
    console.log(`   ✅ PASS: Outbox events processed and published cleanly.`);

    // ── TEST 16: Counter Reconciliation Engine ──
    console.log('\n🔹 TEST 16: Counter Reconciliation Worker Execution');
    const recon = await reconcileEventCounters();
    console.log(`   ✅ PASS: Reconciliation checked active events (mismatches: ${recon.mismatches}, repaired: ${recon.repaired}).`);

    console.log('\n=============================================================');
    console.log('🎉 ALL 16 COMPREHENSIVE EVENT MODULE AUDIT TESTS PASSED (100%)');
    console.log('=============================================================\n');
  } finally {
    if (createdEventId) {
      await EventParticipant.destroy({ where: { event_id: createdEventId } });
      await Event.destroy({ where: { id: createdEventId } });
      await OutboxEvent.destroy({ where: { aggregate_type: 'event', aggregate_id: createdEventId } });
    }
    server.close();
  }
};

runComprehensiveEventAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ AUDIT FAILED:', err);
    process.exit(1);
  });
