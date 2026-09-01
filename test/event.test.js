import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import Event, { EVENT_STATUS, EVENT_TYPE, EVENT_VISIBILITY } from '../src/modules/event/event.model.js';
import EventParticipant, { RSVP_STATUS } from '../src/modules/event_participant/event_participant.model.js';
import EventCategory from '../src/modules/event_category/event_category.model.js';
import * as eventService from '../src/modules/event/event.service.js';
import * as participantService from '../src/modules/event_participant/event_participant.service.js';

test('Event CRUD & Functional Tests', async (t) => {
  let createdEventId = null;
  let testCategoryId = null;
  let mockUser = null;

  // Retrieve or create a test user
  mockUser = await User.findOne({ where: { is_deleted: false } });
  if (!mockUser) {
    mockUser = await User.create({
      userName: 'EventTester',
      email: 'eventtester@smartgali.com',
      phone: '9988776655',
    });
  }
  const mockUserId = mockUser.userId;

  // Setup: Create a test category
  const category = await EventCategory.create({
    name: 'Tech & Workshops',
    icon: '💻',
    is_active: true,
    is_deleted: false,
  });
  testCategoryId = category.id;

  try {
    // 1. Create Event
    const startAt = new Date(Date.now() + 86400000);
    const endAt = new Date(Date.now() + 90000000);

    const event = await eventService.createEvent({
      title: 'SmartGali Tech Meetup 2026',
      description: 'Discussing hyper-local community systems and architecture.',
      category_id: testCategoryId,
      event_type: EVENT_TYPE.OFFLINE,
      visibility: EVENT_VISIBILITY.PUBLIC,
      status: EVENT_STATUS.PUBLISHED,
      start_at: startAt,
      end_at: endAt,
      location: 'Innovation Hub, Sector 62',
      location_name: 'Main Auditorium',
      address: 'Plot 4, Block B, Tech Zone',
      latitude: 28.6280,
      longitude: 77.3649,
      max_participants: 50,
      cover_image: '/uploads/event/tech-meetup.jpg',
    }, mockUserId);

    assert.ok(event.id, 'Event ID must be generated');
    assert.equal(event.title, 'SmartGali Tech Meetup 2026');
    assert.equal(Number(event.going_count), 1, 'Creator is automatically going');
    assert.equal(Number(event.created_by), mockUserId);
    createdEventId = event.id;

    // 2. Get Event by ID
    const fetched = await eventService.getEventById(createdEventId, { id: mockUserId });
    assert.ok(fetched);
    assert.equal(fetched.title, 'SmartGali Tech Meetup 2026');
    assert.equal(fetched.myRsvpStatus, 'going');

    // 3. Upcoming Events search
    const result = await eventService.getUpcomingEvents({
      search: 'Tech Meetup',
      limit: 10,
      user: { id: mockUserId },
    });
    assert.ok(result.events.length >= 1);
    const found = result.events.find(e => Number(e.id) === Number(createdEventId));
    assert.ok(found, 'Created event must appear in upcoming search');
    assert.equal(found.myRsvpStatus, 'going');

    // 4. Geo Haversine Discovery
    const nearby = await eventService.getNearbyEvents({
      lat: 28.6300,
      lng: 77.3800,
      radiusKm: 20,
      limit: 10,
      user: { id: mockUserId },
    });
    assert.ok(nearby.events.length >= 1);
    const item = nearby.events.find(e => Number(e.id) === Number(createdEventId));
    assert.ok(item, 'Event should be discovered within 20km radius');
    assert.ok(item.distance_km !== undefined, 'Distance in km must be computed');
    assert.ok(item.distance_km < 10, 'Distance must be less than 10km');

    // 5. Event Categories
    const cats = await eventService.getEventCategories();
    assert.ok(cats.length >= 1);
    assert.ok(cats.some(c => c.name === 'Tech & Workshops'));

    // 6. Update Event
    const updated = await eventService.updateEvent(createdEventId, {
      title: 'SmartGali Enterprise Tech Summit 2026',
    }, { id: mockUserId });
    assert.equal(updated.title, 'SmartGali Enterprise Tech Summit 2026');

    // 7. Cancel Event
    const cancelled = await eventService.cancelEvent(createdEventId, 'Postponed due to monsoon', { id: mockUserId });
    assert.equal(cancelled.status, EVENT_STATUS.CANCELLED);

    // 8. Soft Delete Event
    const deleted = await eventService.softDeleteEvent(createdEventId, 'Cleanup test', { id: mockUserId });
    assert.equal(deleted.is_deleted, true);

    const checkFetch = await eventService.getEventById(createdEventId, { id: mockUserId });
    assert.equal(checkFetch, null, 'Deleted event must return null');
  } finally {
    if (createdEventId) {
      await EventParticipant.destroy({ where: { event_id: createdEventId } });
      await Event.destroy({ where: { id: createdEventId } });
    }
    if (testCategoryId) {
      await EventCategory.destroy({ where: { id: testCategoryId } });
    }
  }
});
