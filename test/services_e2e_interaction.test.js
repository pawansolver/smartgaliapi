import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import env from '../src/config/env.js';
import User from '../src/modules/user/user.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';
import ServiceProviderProfile from '../src/modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../src/modules/service_listing/service_listing.model.js';
import ServiceBooking from '../src/modules/service_booking/service_booking.model.js';
import ServiceBookingTimeline from '../src/modules/service_booking/service_booking_timeline.model.js';
import ServiceReview from '../src/modules/service_review/service_review.model.js';

test('SmartGali Services E2E Interactive Role Matrix (Resident, Provider, Admin, Guest)', async (t) => {
  let server = null;
  let baseUrl = '';

  let residentUser = null;
  let providerUser1 = null;
  let providerUser2 = null;
  let adminUser = null;

  let residentToken = '';
  let provider1Token = '';
  let provider2Token = '';
  let adminToken = '';

  let createdCategoryId = null;
  let provider1ProfileId = null;
  let createdListingId = null;
  let createdBookingId = null;
  let doorstepPin = null;

  const request = async (path, options = {}) => {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  };

  await t.test('Phase 0: Server Initialization & Authentication Token Generation', async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    const ts = Date.now();
    residentUser = await User.create({
      userName: `ResidentUser_${ts}`,
      email: `res_${ts}@smartgali.test`,
      userRole: 'resident',
      is_active: true,
      status: 'active',
    });

    providerUser1 = await User.create({
      userName: `ProviderOne_${ts}`,
      email: `pro1_${ts}@smartgali.test`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    providerUser2 = await User.create({
      userName: `ProviderTwo_${ts}`,
      email: `pro2_${ts}@smartgali.test`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    adminUser = await User.create({
      userName: `AdminUser_${ts}`,
      email: `adm_${ts}@smartgali.test`,
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });

    residentToken = jwt.sign({ id: residentUser.userId, userRole: 'resident' }, env.jwt.secret, { expiresIn: '1h' });
    provider1Token = jwt.sign({ id: providerUser1.userId, userRole: 'service_provider' }, env.jwt.secret, { expiresIn: '1h' });
    provider2Token = jwt.sign({ id: providerUser2.userId, userRole: 'service_provider' }, env.jwt.secret, { expiresIn: '1h' });
    adminToken = jwt.sign({ id: adminUser.userId, userRole: 'admin' }, env.jwt.secret, { expiresIn: '1h' });

    assert.ok(baseUrl);
    assert.ok(residentToken);
    assert.ok(provider1Token);
    assert.ok(adminToken);
  });

  await t.test('Phase 1 [Admin]: Create Category & Public Discovery', async () => {
    // 1. Admin creates category
    const catRes = await request('/service-category', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        serviceCategoryName: 'Appliance Repair & Servicing',
        remark: 'Home & Kitchen Appliances',
      },
    });

    assert.equal(catRes.status, 201);
    assert.ok(catRes.data.data?.serviceCategoryId);
    createdCategoryId = catRes.data.data.serviceCategoryId;

    // 2. Guest reads category list (Public - No Token)
    const guestCatRes = await request('/service-category');
    assert.equal(guestCatRes.status, 200);
    assert.ok(Array.isArray(guestCatRes.data.data));
    const found = guestCatRes.data.data.find(c => c.serviceCategoryId === createdCategoryId);
    assert.ok(found);
    assert.equal(found.serviceCategoryName, 'Appliance Repair & Servicing');
  });

  await t.test('Phase 2 [Provider 1]: Setup Profile, Operational Service Area & Availability', async () => {
    // 1. Provider 1 fetches own profile (auto-initializes if new)
    const meRes = await request('/service-provider-profile/me', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(meRes.status, 200);
    assert.ok(meRes.data.data.id);
    provider1ProfileId = meRes.data.data.id;

    // 2. Provider 1 updates profile details
    const updateRes = await request('/service-provider-profile/me', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: {
        business_name: 'Apex Cooling & Appliance Labs',
        provider_type: 'Independent Professional',
        description: 'Certified HVAC master technician with 10+ years field experience.',
        experience: '10 years',
        hourly_rate: 499.00,
        service_category_id: createdCategoryId,
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.data.business_name, 'Apex Cooling & Appliance Labs');

    // 3. Provider 1 configures operational service area (Strictly operational coverage)
    const areaRes = await request('/service-provider-profile/me/service-area', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: {
        city: 'Patna',
        localities: ['Boring Road', 'Kankarbagh', 'Rajendra Nagar'],
        pincodes: ['800001', '800020', '800016'],
        radiusKm: 15,
        centerLatitude: 25.6091,
        centerLongitude: 85.1235,
      },
    });
    assert.equal(areaRes.status, 200);
    assert.equal(areaRes.data.data.city, 'Patna');
    assert.equal(areaRes.data.data.localities.length, 3);

    // 4. Provider 1 sets availability schedule & slots
    const availRes = await request('/service-provider-profile/me/availability', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: {
        weeklySchedule: [
          { dayName: 'Monday', weekday: 1, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Tuesday', weekday: 2, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Wednesday', weekday: 3, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Thursday', weekday: 4, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Friday', weekday: 5, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Saturday', weekday: 6, isWorking: true, startTime: '10:00', endTime: '17:00' },
          { dayName: 'Sunday', weekday: 7, isWorking: false, startTime: '10:00', endTime: '14:00' },
        ],
        slotDurationMinutes: 90,
        bufferDurationMinutes: 30,
        maxConcurrentBookings: 1,
      },
    });
    assert.equal(availRes.status, 200);
    assert.equal(availRes.data.data.maxConcurrentBookings, 1);
  });

  await t.test('Phase 3 [Admin]: Verify Provider 1 in Admin Queue', async () => {
    const queueRes = await request('/service-provider-profile/status/pending-verification', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(queueRes.status, 200);

    const verifyRes = await request(`/service-provider-profile/${provider1ProfileId}/verify`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        is_verified: true,
        verification_status: 'verified',
        remarks: 'Trade License & Identity Verified by Admin.',
      },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.data.is_verified, true);
    assert.equal(verifyRes.data.data.verification_status, 'verified');
  });

  await t.test('Phase 4 [Provider 1]: Create & Manage Service Listing', async () => {
    // 1. Create service listing
    const createRes = await request('/service-listing', {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: {
        title: 'Inverter AC Jet Chemical Wash',
        description: 'Deep coil foam pressure wash and refrigerant pressure check.',
        price: 699.00,
        duration: '90 mins',
        category_id: createdCategoryId,
        highlights: ['High Pressure Jet Wash', '30-Day Free Service Warranty', 'Gas Leakage Diagnosis'],
        safe_terms: 'Customer must provide domestic water and power bucket point.',
      },
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.data.data.id);
    createdListingId = createRes.data.data.id;
    assert.equal(Number(createRes.data.data.price), 699.00);

    // 2. View my listings
    const myListingsRes = await request('/service-listing/my/listings', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(myListingsRes.status, 200);
    assert.ok(myListingsRes.data.data.some(l => l.id === createdListingId));

    // 3. Edit listing price to 649
    const editRes = await request(`/service-listing/${createdListingId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: { price: 649.00 },
    });
    assert.equal(editRes.status, 200);
    assert.equal(Number(editRes.data.data.price), 649.00);
  });

  await t.test('Phase 5 [Guest / Resident]: Public Discovery, Projections & Locality Matching', async () => {
    // 1. Guest discovers listings (no token)
    const discoveryRes = await request('/service-listing');
    assert.equal(discoveryRes.status, 200);
    const publicItem = discoveryRes.data.data.find(l => l.id === createdListingId);
    assert.ok(publicItem);

    // Check Public Projection integrity (NO private provider info leaked)
    assert.equal(publicItem.title, 'Inverter AC Jet Chemical Wash');
    assert.equal(Number(publicItem.price), 649.00);
    assert.ok(Array.isArray(publicItem.highlights));
    assert.equal(publicItem.provider.business_name, 'Apex Cooling & Appliance Labs');
    assert.equal(publicItem.provider.is_verified, true);
    assert.equal(publicItem.provider.user_id, undefined);
    assert.equal(publicItem.provider.phone, undefined);
    assert.equal(publicItem.provider.email, undefined);

    // 2. Locality matching discovery
    const locMatchRes = await request(`/service-listing?locality=Boring%20Road&category_id=${createdCategoryId}`);
    assert.equal(locMatchRes.status, 200);
    assert.ok(locMatchRes.data.data.some(l => l.id === createdListingId));

    // 3. Locality non-matching
    const locNoMatchRes = await request(`/service-listing?locality=NonExistentArea999&category_id=${createdCategoryId}`);
    assert.equal(locNoMatchRes.status, 200);
    assert.equal(locNoMatchRes.data.data.some(l => l.id === createdListingId), false);
  });

  await t.test('Phase 6 [Security]: Cross-Provider Ownership Violation Attempt is Blocked', async () => {
    // Provider 2 tries to edit Provider 1's listing -> MUST RETURN 403
    const hackRes = await request(`/service-listing/${createdListingId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${provider2Token}` },
      body: { price: 10.00 },
    });
    assert.equal(hackRes.status, 403);

    // Provider 2 tries to pause Provider 1's listing -> MUST RETURN 403
    const hackPause = await request(`/service-listing/${createdListingId}/pause`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${provider2Token}` },
    });
    assert.equal(hackPause.status, 403);
  });

  await t.test('Phase 7 [Resident]: Create Booking with Concurrency Lock & Doorstep PIN', async () => {
    const bookingSlot = '10:00 AM - 11:30 AM';
    const bookingDate = new Date(Date.now() + 86400000).toISOString();

    const bookRes = await request('/service-booking', {
      method: 'POST',
      headers: { Authorization: `Bearer ${residentToken}` },
      body: {
        listing_id: createdListingId,
        scheduled_at: bookingDate,
        time_slot: bookingSlot,
        service_address: 'Flat 304, Green Heights, Boring Road, Patna',
        notes: 'Please call before arrival.',
      },
    });

    assert.equal(bookRes.status, 201);
    const booking = bookRes.data.data;
    assert.ok(booking.id);
    createdBookingId = booking.id;
    doorstepPin = booking.doorstep_pin;

    assert.equal(booking.status, 'requested');
    assert.ok(booking.booking_reference.startsWith('SG-SRV-'));
    assert.ok(doorstepPin);
    assert.equal(doorstepPin.length, 4);
    assert.equal(booking.doorstep_pin_verified, false);
    assert.equal(Number(booking.amount), 649.00);
    assert.equal(booking.price_snapshot.title, 'Inverter AC Jet Chemical Wash');

    // Concurrency test: Immediate second booking attempt for same provider slot -> MUST RETURN 409
    const conflictRes = await request('/service-booking', {
      method: 'POST',
      headers: { Authorization: `Bearer ${residentToken}` },
      body: {
        listing_id: createdListingId,
        scheduled_at: bookingDate,
        time_slot: bookingSlot,
        service_address: 'Flat 101, Same Building',
      },
    });
    assert.equal(conflictRes.status, 409);
  });

  await t.test('Phase 8 [Privacy Check]: Doorstep PIN Masked from Provider before Arrival', async () => {
    // 1. Resident sees PIN
    const residentView = await request(`/service-booking/${createdBookingId}`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    assert.equal(residentView.status, 200);
    assert.equal(residentView.data.data.doorstep_pin, doorstepPin);

    // 2. Provider CANNOT see plaintext PIN before doorstep arrival
    const providerView = await request(`/service-booking/${createdBookingId}`, {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(providerView.status, 200);
    assert.equal(providerView.data.data.doorstep_pin, null);
  });

  await t.test('Phase 9 [Provider & Resident Lifecycle]: accept -> schedule -> on_the_way', async () => {
    // Provider views incoming request
    const reqList = await request('/service-booking/provider/requests', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(reqList.status, 200);
    assert.ok(reqList.data.data.some(b => b.id === createdBookingId));

    // Provider accepts
    const acceptRes = await request(`/service-booking/${createdBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.data.status, 'accepted');

    // Provider schedules
    const schedRes = await request(`/service-booking/${createdBookingId}/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: {
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        time_slot: '10:00 AM - 11:30 AM',
      },
    });
    assert.equal(schedRes.status, 200);
    assert.equal(schedRes.data.data.status, 'scheduled');

    // Provider marks on the way
    const onWayRes = await request(`/service-booking/${createdBookingId}/on-the-way`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(onWayRes.status, 200);
    assert.equal(onWayRes.data.data.status, 'on_the_way');
  });

  await t.test('Phase 10 [Doorstep Safety PIN]: Wrong PIN Fails, Correct PIN Starts Service', async () => {
    // 1. Wrong PIN submitted -> MUST RETURN 400
    const failStart = await request(`/service-booking/${createdBookingId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: { doorstep_pin: '0000' },
    });
    assert.equal(failStart.status, 400);

    // 2. Correct PIN submitted -> Starts service successfully
    const successStart = await request(`/service-booking/${createdBookingId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
      body: { doorstep_pin: doorstepPin },
    });
    assert.equal(successStart.status, 200);
    assert.equal(successStart.data.data.status, 'started');
    assert.equal(successStart.data.data.doorstep_pin_verified, true);
    assert.ok(successStart.data.data.started_at);
  });

  await t.test('Phase 11 [Completion & Earnings]: Provider Completes Service & Stats Update', async () => {
    // Complete service
    const compRes = await request(`/service-booking/${createdBookingId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(compRes.status, 200);
    assert.equal(compRes.data.data.status, 'completed');
    assert.ok(compRes.data.data.completed_at);

    // Provider overview stats reflect completed booking
    const statsRes = await request('/service-provider-profile/me/overview-stats', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(statsRes.status, 200);
    assert.ok(statsRes.data.data.completedBookings >= 1);
    assert.ok(statsRes.data.data.earnings >= 649.00);

    // Earnings breakdown reflects earnings
    const earnRes = await request('/service-provider-profile/me/earnings', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(earnRes.status, 200);
    assert.ok(earnRes.data.data.totalEarnings >= 649.00);
    assert.ok(earnRes.data.data.completedJobs >= 1);
  });

  await t.test('Phase 12 [Reviews]: Resident Submits Review & Rating Recalculation', async () => {
    // 1. Resident reviews completed booking
    const revRes = await request('/service-review', {
      method: 'POST',
      headers: { Authorization: `Bearer ${residentToken}` },
      body: {
        booking_id: createdBookingId,
        rating: 5,
        comment: 'Outstanding split AC jet wash! Punctual and clean work.',
      },
    });

    assert.equal(revRes.status, 201);
    assert.equal(revRes.data.data.rating, 5);

    // 2. Duplicate review attempt -> MUST RETURN 409
    const dupRes = await request('/service-review', {
      method: 'POST',
      headers: { Authorization: `Bearer ${residentToken}` },
      body: {
        booking_id: createdBookingId,
        rating: 4,
        comment: 'Trying second review.',
      },
    });
    assert.equal(dupRes.status, 409);

    // 3. Verify server-side aggregate rating on provider profile
    const proProfileRes = await request('/service-provider-profile/me', {
      headers: { Authorization: `Bearer ${provider1Token}` },
    });
    assert.equal(proProfileRes.status, 200);
    assert.ok(Number(proProfileRes.data.data.rating) >= 4.9);
    assert.ok(proProfileRes.data.data.review_count >= 1);

    // 4. Verify server-side aggregate rating on service listing
    const listingRes = await request(`/service-listing/${createdListingId}`);
    assert.equal(listingRes.status, 200);
    assert.ok(Number(listingRes.data.data.rating) >= 4.9);
    assert.ok(listingRes.data.data.reviews_count >= 1);
  });

  await t.test('Phase 13 [Timeline & Admin Monitoring]: Verification of Audit Trail', async () => {
    // 1. Booking timeline
    const timelineRes = await request(`/service-booking/${createdBookingId}/timeline`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    assert.equal(timelineRes.status, 200);
    const steps = timelineRes.data.data.map(t => t.status);
    assert.ok(steps.includes('requested'));
    assert.ok(steps.includes('accepted'));
    assert.ok(steps.includes('scheduled'));
    assert.ok(steps.includes('on_the_way'));
    assert.ok(steps.includes('started'));
    assert.ok(steps.includes('completed'));

    // 2. Admin booking monitor
    const adminBookingsRes = await request('/service-booking/admin/all', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminBookingsRes.status, 200);
    assert.ok(adminBookingsRes.data.data.rows.some(b => b.id === createdBookingId));
  });

  await t.test('Phase 14: Cleanup and Server Shutdown', async () => {
    try {
      await ServiceReview.destroy({ where: { booking_id: createdBookingId } });
      await ServiceBookingTimeline.destroy({ where: { booking_id: createdBookingId } });
      await ServiceBooking.destroy({ where: { id: createdBookingId } });
      await ServiceListing.destroy({ where: { id: createdListingId } });
      await ServiceProviderProfile.destroy({ where: { id: provider1ProfileId } });
      await ServiceCategory.destroy({ where: { serviceCategoryId: createdCategoryId } });
      await User.destroy({ where: { userId: [residentUser.userId, providerUser1.userId, providerUser2.userId, adminUser.userId] } });
    } catch (_) {}

    if (server) {
      server.close();
    }
  });
});
