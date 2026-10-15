import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';
import ServiceProviderProfile from '../src/modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../src/modules/service_listing/service_listing.model.js';
import ServiceBooking from '../src/modules/service_booking/service_booking.model.js';
import ServiceBookingTimeline from '../src/modules/service_booking/service_booking_timeline.model.js';
import ServiceReview from '../src/modules/service_review/service_review.model.js';
import * as providerProfileService from '../src/modules/service_provider_profile/service_provider_profile.service.js';
import * as listingService from '../src/modules/service_listing/service_listing.service.js';
import * as bookingService from '../src/modules/service_booking/service_booking.service.js';
import * as reviewService from '../src/modules/service_review/service_review.service.js';
import { toPublicServiceListing, toPublicProviderProfile } from '../src/modules/service_listing/service_listing.projection.js';

test('SmartGali Services Module Enterprise Test Suite', async (t) => {
  let residentUser = null;
  let providerUser1 = null;
  let providerUser2 = null;
  let adminUser = null;
  let testCategory = null;
  let testListing1 = null;
  let testListing2 = null;

  await t.test('Setup: Create test users and category', async () => {
    // 1. Create unique test users
    const ts = Date.now();
    residentUser = await User.create({
      userName: `TestResident_${ts}`,
      email: `resident_${ts}@test.smartgali.com`,
      userRole: 'resident',
      is_active: true,
      status: 'active',
    });

    providerUser1 = await User.create({
      userName: `TestProvider1_${ts}`,
      email: `provider1_${ts}@test.smartgali.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    providerUser2 = await User.create({
      userName: `TestProvider2_${ts}`,
      email: `provider2_${ts}@test.smartgali.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    adminUser = await User.create({
      userName: `TestAdmin_${ts}`,
      email: `admin_${ts}@test.smartgali.com`,
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });

    testCategory = await ServiceCategory.create({
      serviceCategoryName: `HVAC & Electrical ${ts}`,
      serviceCategoryImage: 'https://smartgali.com/assets/electric.png',
      is_active: true,
    });

    assert.ok(residentUser.userId);
    assert.ok(providerUser1.userId);
    assert.ok(providerUser2.userId);
    assert.ok(testCategory.serviceCategoryId);
  });

  await t.test('Provider Profile: Service Area & Availability schedule management', async () => {
    const profile = await providerProfileService.getOrCreateProviderProfile(providerUser1.userId);
    assert.ok(profile.id);
    assert.equal(profile.user_id, providerUser1.userId);

    // Update operational service area
    const updatedArea = await providerProfileService.updateMyServiceArea(providerUser1.userId, {
      city: 'Patna',
      localities: ['Boring Road', 'Kankarbagh', 'Rajendra Nagar'],
      pincodes: ['800001', '800020', '800016'],
      radiusKm: 12.5,
      centerLatitude: 25.6091,
      centerLongitude: 85.1235,
    });
    assert.equal(updatedArea.city, 'Patna');
    assert.equal(updatedArea.radiusKm, 12.5);
    assert.equal(updatedArea.localities.length, 3);

    // Verify KYC and trade skill for providerUser1
    await profile.update({
      service_category_id: testCategory.serviceCategoryId,
      is_verified: true,
      verification_status: 'verified',
    });

    // Also verify KYC and trade skill for providerUser2
    const profile2 = await providerProfileService.getOrCreateProviderProfile(providerUser2.userId);
    await profile2.update({
      service_category_id: testCategory.serviceCategoryId,
      is_verified: true,
      verification_status: 'verified',
    });

    // Update availability
    const updatedAvail = await providerProfileService.updateMyAvailability(providerUser1.userId, {
      weeklySchedule: [
        { dayName: 'Monday', weekday: 1, isWorking: true, startTime: '08:00', endTime: '18:00' },
        { dayName: 'Tuesday', weekday: 2, isWorking: true, startTime: '08:00', endTime: '18:00' },
        { dayName: 'Wednesday', weekday: 3, isWorking: true, startTime: '08:00', endTime: '18:00' },
      ],
      slotDurationMinutes: 60,
      bufferDurationMinutes: 15,
      maxConcurrentBookings: 1,
      exceptions: [],
    });
    assert.equal(updatedAvail.slotDurationMinutes, 60);
    assert.equal(updatedAvail.maxConcurrentBookings, 1);
  });

  await t.test('Public Projection: Strips sensitive PII, private GPS, and internal records', async () => {
    const profile = await providerProfileService.getOrCreateProviderProfile(providerUser1.userId);
    const publicProj = toPublicProviderProfile(profile);

    // Verify allowed fields exist
    assert.ok(publicProj.id);
    assert.ok(publicProj.name);
    assert.ok(publicProj.service_area);
    assert.equal(publicProj.service_area.city, 'Patna');

    // Verify forbidden private fields are NEVER exposed
    assert.equal(publicProj.user_id, undefined);
    assert.equal(publicProj.phone, undefined);
    assert.equal(publicProj.email, undefined);
    assert.equal(publicProj.aadhaar, undefined);
    assert.equal(publicProj.pan, undefined);
    assert.equal(publicProj.bank_account, undefined);
  });

  await t.test('Service Listing CRUD & Provider Ownership boundary', async () => {
    // Provider 1 creates a listing
    testListing1 = await listingService.createListing({
      title: 'AC Deep Chemical Jet Wash',
      description: 'Complete indoor and outdoor coil chemical cleaning with pressure jet.',
      price: 699.00,
      duration: '90 mins',
      category_id: testCategory.serviceCategoryId,
      highlights: ['Pressure jet wash', '30-day warranty', 'Eco-friendly chemical'],
      safe_terms: 'Electricity & water bucket to be provided by resident.',
    }, { id: providerUser1.userId, userRole: 'service_provider' });

    assert.ok(testListing1.id);
    assert.equal(testListing1.title, 'AC Deep Chemical Jet Wash');
    assert.equal(Number(testListing1.price), 699.00);

    // Provider 2 creates a listing
    testListing2 = await listingService.createListing({
      title: 'Ceiling Fan & Switch Repair',
      description: 'Quick diagnosis and repair of fan capacitors and switches.',
      price: 249.00,
      duration: '45 mins',
      category_id: testCategory.serviceCategoryId,
    }, { id: providerUser2.userId, userRole: 'service_provider' });

    assert.ok(testListing2.id);

    // Ownership test: Provider 1 attempts to edit Provider 2's listing -> MUST FAIL
    await assert.rejects(
      async () => {
        await listingService.updateListing(
          testListing2.id,
          { title: 'Hacked Title' },
          { id: providerUser1.userId, userRole: 'service_provider' }
        );
      },
      /Forbidden/
    );

    // Provider 1 pauses own listing -> MUST SUCCEED
    const paused = await listingService.pauseListing(
      testListing1.id,
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(paused.is_available, false);
    assert.equal(paused.moderation_status, 'paused');

    // Provider 1 resumes own listing -> MUST SUCCEED
    const resumed = await listingService.resumeListing(
      testListing1.id,
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(resumed.is_available, true);
    assert.equal(resumed.moderation_status, 'approved');
  });

  await t.test('Discovery: Locality matching & active approved filtering', async () => {
    // Search with matching locality
    const matchRes = await listingService.getAllListings({
      locality: 'Boring Road',
      category_id: testCategory.serviceCategoryId,
    });
    assert.ok(matchRes.rows.some(l => l.id === testListing1.id));

    // Search with non-matching locality
    const noMatchRes = await listingService.getAllListings({
      locality: 'CompletelyUnrelatedLocalityXYZ',
      category_id: testCategory.serviceCategoryId,
    });
    assert.equal(noMatchRes.rows.some(l => l.id === testListing1.id), false);
  });

  await t.test('Admin Moderation: Admin moderates listing and notifies provider', async () => {
    const moderated = await listingService.moderateListing(
      testListing1.id,
      { moderation_status: 'approved', moderation_remarks: 'Verified standards met.' },
      adminUser.userId
    );
    assert.equal(moderated.moderation_status, 'approved');
  });

  let createdBooking = null;

  await t.test('Booking Creation: Concurrency locking, doorstep PIN & price snapshot', async () => {
    const scheduleDate = new Date(Date.now() + 86400000).toISOString();
    const timeSlot = '10:00 AM - 11:30 AM';

    // Resident books service
    createdBooking = await bookingService.createBooking({
      listing_id: testListing1.id,
      scheduled_at: scheduleDate,
      time_slot: timeSlot,
      service_address: 'Flat 402, Sunshine Towers, Boring Road, Patna',
      notes: 'Please bring ladder.',
    }, { id: residentUser.userId, userRole: 'resident' });

    assert.ok(createdBooking.id);
    assert.equal(createdBooking.status, 'requested');
    assert.ok(createdBooking.booking_reference.startsWith('SG-SRV-'));
    assert.ok(createdBooking.doorstep_pin);
    assert.equal(createdBooking.doorstep_pin.length, 4);
    assert.equal(createdBooking.doorstep_pin_verified, false);
    assert.ok(createdBooking.price_snapshot);
    assert.equal(createdBooking.price_snapshot.title, 'AC Deep Chemical Jet Wash');

    // Concurrency / Double Booking check:
    // Second booking for same provider and same date/slot must be REJECTED with 409
    await assert.rejects(
      async () => {
        await bookingService.createBooking({
          listing_id: testListing1.id,
          scheduled_at: scheduleDate,
          time_slot: timeSlot,
          service_address: 'Flat 101, Other Building',
        }, { id: residentUser.userId, userRole: 'resident' });
      },
      (err) => err.statusCode === 409
    );
  });

  await t.test('Booking State Machine Lifecycle: accept -> schedule -> on_the_way', async () => {
    // 1. Provider accepts booking
    const accepted = await bookingService.transitionBooking(
      createdBooking.id,
      'accept',
      {},
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(accepted.status, 'accepted');

    // 2. Provider schedules booking
    const scheduled = await bookingService.transitionBooking(
      createdBooking.id,
      'schedule',
      {},
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(scheduled.status, 'scheduled');

    // 3. Provider transitions to on_the_way
    const onTheWay = await bookingService.transitionBooking(
      createdBooking.id,
      'on_the_way',
      {},
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(onTheWay.status, 'on_the_way');
  });

  await t.test('Doorstep PIN Verification: Wrong PIN fails, correct PIN starts service', async () => {
    // Attempt with wrong PIN -> MUST THROW 400
    await assert.rejects(
      async () => {
        await bookingService.transitionBooking(
          createdBooking.id,
          'start',
          { doorstep_pin: '0000' },
          { id: providerUser1.userId, userRole: 'service_provider' }
        );
      },
      /Invalid Doorstep Safety PIN/
    );

    // Attempt with correct PIN -> MUST SUCCEED
    const started = await bookingService.transitionBooking(
      createdBooking.id,
      'start',
      { doorstep_pin: createdBooking.doorstep_pin },
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(started.status, 'started');
    assert.equal(started.doorstep_pin_verified, true);
    assert.ok(started.started_at);
  });

  await t.test('Booking Completion: Provider completes service', async () => {
    const completed = await bookingService.transitionBooking(
      createdBooking.id,
      'complete',
      {},
      { id: providerUser1.userId, userRole: 'service_provider' }
    );
    assert.equal(completed.status, 'completed');
    assert.ok(completed.completed_at);

    // Verify timeline records
    const timelines = await bookingService.getBookingTimelines(createdBooking.id);
    assert.ok(timelines.length >= 5);
    const statuses = timelines.map(t => t.status);
    assert.ok(statuses.includes('requested'));
    assert.ok(statuses.includes('accepted'));
    assert.ok(statuses.includes('on_the_way'));
    assert.ok(statuses.includes('started'));
    assert.ok(statuses.includes('completed'));
  });

  await t.test('Reviews: Completed booking review & aggregate rating recalculation', async () => {
    // Resident reviews the completed booking
    const review = await reviewService.createReview({
      booking_id: createdBooking.id,
      rating: 5,
      comment: 'Excellent service! On time and very polite technician.',
    }, { id: residentUser.userId, userRole: 'resident' });

    assert.ok(review.id);
    assert.equal(review.rating, 5);

    // Duplicate review check: Second review for same completed booking MUST FAIL with 409
    await assert.rejects(
      async () => {
        await reviewService.createReview({
          booking_id: createdBooking.id,
          rating: 4,
          comment: 'Duplicate attempt.',
        }, { id: residentUser.userId, userRole: 'resident' });
      },
      (err) => err.statusCode === 409
    );

    // Verify server-side aggregate rating recalculation on provider profile
    const providerProfile = await ServiceProviderProfile.findOne({
      where: { user_id: providerUser1.userId },
    });
    assert.ok(Number(providerProfile.rating) >= 4.5);
    assert.ok(providerProfile.review_count >= 1);

    // Verify server-side aggregate rating recalculation on service listing
    const listing = await ServiceListing.findByPk(testListing1.id);
    assert.ok(Number(listing.rating) >= 4.5);
    assert.ok(listing.reviews_count >= 1);
  });

  await t.test('Cleanup test records', async () => {
    try {
      await ServiceReview.destroy({ where: { booking_id: createdBooking.id } });
      await ServiceBookingTimeline.destroy({ where: { booking_id: createdBooking.id } });
      await ServiceBooking.destroy({ where: { id: createdBooking.id } });
      await ServiceListing.destroy({ where: { id: [testListing1.id, testListing2.id] } });
      await ServiceProviderProfile.destroy({ where: { user_id: [providerUser1.userId, providerUser2.userId] } });
      await ServiceCategory.destroy({ where: { serviceCategoryId: testCategory.serviceCategoryId } });
      await User.destroy({ where: { userId: [residentUser.userId, providerUser1.userId, providerUser2.userId, adminUser.userId] } });
    } catch (_) {}
  });
});
