import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';
import ServiceProviderProfile from '../src/modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../src/modules/service_listing/service_listing.model.js';
import ServiceCoverageArea from '../src/modules/service_listing/service_coverage_area.model.js';
import ServiceBooking from '../src/modules/service_booking/service_booking.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import {
  Country,
  State,
  City,
  Locality,
  Pincode,
} from '../src/modules/location_master/location_master.models.js';
import {
  ServicePricingModel,
  ServiceDurationOption,
  ServiceBufferOption,
  ServiceExecutionMethod,
  ServiceRadiusOption,
  ServiceSlotDuration,
  ServiceBookingCapacity,
} from '../src/modules/service_config/service_config.models.js';
import * as listingService from '../src/modules/service_listing/service_listing.service.js';
import * as bookingService from '../src/modules/service_booking/service_booking.service.js';
import {
  calculateHaversineDistanceKm,
  validateCustomerCoverageEligibility,
} from '../src/modules/service_booking/service_coverage.service.js';
import { toPublicServiceListing } from '../src/modules/service_listing/service_listing.projection.js';

test('SMARTGALI — STEP 4 ENTERPRISE LOCATION & SERVICE COVERAGE HARDENING SUITE', async (t) => {
  let residentUser, guestUser, providerUser1, providerUser2, adminUser;
  let testCategory, testCity, testLocalityRN, testLocalityKB, testPincodeRN, testSociety;
  let radiusOption5KM, radiusOption10KM, radiusOption15KM, inactiveRadiusOption;
  let fixedPricingModel, duration2Hrs, buffer30Min, customerExecMethod, slot1Hr, cap2Slots;
  let multiAreaListing;

  await t.test('Phase 0: Bootstrap Master Data & Test Entities', async () => {
    // Ensure DB connection is active with retries for remote MySQL
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await sequelize.authenticate();
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    const ts = Date.now();

    residentUser = await User.create({
      userName: `Res_${ts}`,
      email: `res_${ts}@test.com`,
      userRole: 'resident',
      is_active: true,
      status: 'active',
    });

    guestUser = await User.create({
      userName: `Guest_${ts}`,
      email: `guest_${ts}@test.com`,
      userRole: 'guest',
      is_active: true,
      status: 'active',
    });

    providerUser1 = await User.create({
      userName: `Prov1_${ts}`,
      email: `prov1_${ts}@test.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    providerUser2 = await User.create({
      userName: `Prov2_${ts}`,
      email: `prov2_${ts}@test.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });

    adminUser = await User.create({
      userName: `Admin_${ts}`,
      email: `admin_${ts}@test.com`,
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });

    testCategory = await ServiceCategory.create({
      serviceCategoryName: `AC & Electrical ${ts}`,
      is_active: true,
    });

    // Setup Verified Provider Profiles
    await ServiceProviderProfile.create({
      user_id: providerUser1.userId,
      service_category_id: testCategory.serviceCategoryId,
      business_name: 'Patna Cool Tech',
      is_verified: true,
      verification_status: 'verified',
    });

    await ServiceProviderProfile.create({
      user_id: providerUser2.userId,
      service_category_id: testCategory.serviceCategoryId,
      business_name: 'Boring Road HVAC',
      is_verified: true,
      verification_status: 'verified',
    });

    // Masters
    testCity = await City.findOne({ where: { name: 'Patna' } });
    assert.ok(testCity, 'Patna city master exists');

    testLocalityRN = await Locality.findOne({ where: { name: 'Rajendra Nagar' } });
    testLocalityKB = await Locality.findOne({ where: { name: 'Kankarbagh' } });
    assert.ok(testLocalityRN, 'Rajendra Nagar locality exists');
    assert.ok(testLocalityKB, 'Kankarbagh locality exists');

    testPincodeRN = await Pincode.findOne({ where: { pincode: '800016' } });
    assert.ok(testPincodeRN, '800016 pincode master exists');

    radiusOption5KM = await ServiceRadiusOption.findOne({ where: { code: '5_KM' } });
    radiusOption10KM = await ServiceRadiusOption.findOne({ where: { code: '10_KM' } });
    radiusOption15KM = await ServiceRadiusOption.findOne({ where: { code: '15_KM' } });
    assert.ok(radiusOption5KM && radiusOption10KM, 'Radius options master exist');

    // Inactive radius option for security testing
    inactiveRadiusOption = await ServiceRadiusOption.create({
      code: `INACTIVE_100KM_${ts}`,
      label: '100 KM Inactive',
      radius_km: 100.0,
      is_active: false,
    });

    // Masters for Step 2 & 3
    fixedPricingModel = await ServicePricingModel.findOne({ where: { code: 'FIXED' } });
    duration2Hrs = await ServiceDurationOption.findOne({ where: { minutes: 120 } }) ||
      await ServiceDurationOption.findOne({ where: { is_active: true } });
    buffer30Min = await ServiceBufferOption.findOne({ where: { minutes: 30 } }) ||
      await ServiceBufferOption.findOne({ where: { is_active: true } });
    customerExecMethod = await ServiceExecutionMethod.findOne({ where: { code: 'CUSTOMER_LOCATION' } }) ||
      await ServiceExecutionMethod.findOne({ where: { is_active: true } });
    slot1Hr = await ServiceSlotDuration.findOne({ where: { minutes: 60 } }) ||
      await ServiceSlotDuration.findOne({ where: { is_active: true } });
    cap2Slots = await ServiceBookingCapacity.findOne({ where: { capacity: 2 } }) ||
      await ServiceBookingCapacity.findOne({ where: { is_active: true } });

    // Society Profile for Society coverage tests
    testSociety = await SocietyProfile.create({
      society_name: `Ashiana Elegance ${ts}`,
      address: 'Bailey Road, Patna',
      latitude: 25.6105,
      longitude: 85.0932,
    });
  });

  await t.test('1. Haversine Distance Engine Accuracy', async () => {
    // Distance between Rajendra Nagar (25.6022, 85.1610) and Kankarbagh (25.5912, 85.1528) is ~1.48 KM
    const dist = calculateHaversineDistanceKm(25.6022, 85.1610, 25.5912, 85.1528);
    assert.ok(dist >= 1.3 && dist <= 1.7, `Expected ~1.5 KM, got ${dist}`);

    // Exact same point must be 0 KM
    const zeroDist = calculateHaversineDistanceKm(25.6022, 85.1610, 25.6022, 85.1610);
    assert.strictEqual(zeroDist, 0);

    // Invalid coordinates return null
    assert.strictEqual(calculateHaversineDistanceKm('abc', 85, 25, 85), null);
  });

  await t.test('2. Multi-Coverage Area Creation & Explicit Origin Storage', async () => {
    // Provider creates AC service with 3 distinct coverage areas:
    // 1. Kankarbagh Origin (25.5912, 85.1528) -> 10 KM Radius
    // 2. Rajendra Nagar Origin (25.6022, 85.1610) -> 5 KM Radius
    // 3. Society coverage for Ashiana Elegance
    multiAreaListing = await listingService.createListing({
      title: 'Enterprise Multi-Area AC Service',
      description: 'Serving designated hubs with separate radius rules',
      price: 899.00,
      category_id: testCategory.serviceCategoryId,
      pricing_model_id: fixedPricingModel.id,
      duration_option_id: duration2Hrs.id,
      buffer_option_id: buffer30Min.id,
      execution_method_id: customerExecMethod.id,
      slot_duration_id: slot1Hr.id,
      booking_capacity_id: cap2Slots.id,
      coverage_scope: 'SOCIETY_AND_PUBLIC',
      coverage_areas: [
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          city_id: testCity.id,
          locality_id: testLocalityKB.id,
          origin_latitude: 25.5912,
          origin_longitude: 85.1528,
          origin_address: 'Kankarbagh Hub, Patna',
          radius_option_id: radiusOption10KM.id,
        },
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          city_id: testCity.id,
          locality_id: testLocalityRN.id,
          origin_latitude: 25.6022,
          origin_longitude: 85.1610,
          origin_address: 'Rajendra Nagar Hub, Patna',
          radius_option_id: radiusOption5KM.id,
        },
        {
          coverage_scope: 'SOCIETY',
          coverage_method: 'SOCIETY',
          society_id: testSociety.id,
        },
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'PINCODE',
          pincode_id: testPincodeRN.id,
        },
      ],
    }, providerUser1);

    assert.ok(multiAreaListing.id);
    assert.strictEqual(multiAreaListing.coverage_areas.length, 4);

    const kbArea = multiAreaListing.coverage_areas.find(a => a.locality_id === testLocalityKB.id);
    assert.ok(kbArea);
    assert.strictEqual(Number(kbArea.origin_latitude).toFixed(4), '25.5912');
    assert.strictEqual(Number(kbArea.resolved_radius_km), 10.0);

    const rnArea = multiAreaListing.coverage_areas.find(a => a.locality_id === testLocalityRN.id);
    assert.ok(rnArea);
    assert.strictEqual(Number(rnArea.resolved_radius_km), 5.0);
  });

  await t.test('3. Test Security 1 & 2: Radius Inside PASS vs Radius Outside BLOCK', async () => {
    // Customer at 3 KM from Rajendra Nagar origin -> PASS (within 5 KM)
    const insideResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 25.6150, // ~1.8 KM from Rajendra Nagar origin
        longitude: 85.1700,
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(insideResult.isEligible, true);
    assert.strictEqual(insideResult.coverageMethod, 'RADIUS');
    assert.ok(insideResult.distanceKm <= 5.0);

    // Customer far away in Gaya (~95 KM south of Patna) -> BLOCK
    const outsideResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 24.7914, // Gaya, Bihar
        longitude: 85.0002,
        city: 'Gaya',
      },
      userRole: 'resident',
    });
    assert.strictEqual(outsideResult.isEligible, false);
    assert.strictEqual(outsideResult.reasonCode, 'OUT_OF_SERVICE_AREA');
  });

  await t.test('4. Test Security 3: Exact Radius Boundary Defined and Tested', async () => {
    const originLat = 25.6022;
    const originLon = 85.1610;
    const boundaryRadius = 5.0; // KM

    // Point exactly inside boundary (e.g. ~4.9 KM) -> PASS
    const justInsideDist = calculateHaversineDistanceKm(originLat, originLon, originLat + 0.044, originLon);
    assert.ok(justInsideDist < boundaryRadius, `Distance ${justInsideDist} should be < 5.0`);

    const boundaryCheck = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: originLat + 0.044,
        longitude: originLon,
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(boundaryCheck.isEligible, true);
  });

  await t.test('5. Test Security 4: Different City BLOCK', async () => {
    const diffCityResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 28.6139, // New Delhi
        longitude: 77.2090,
        city: 'New Delhi',
      },
      userRole: 'resident',
    });
    assert.strictEqual(diffCityResult.isEligible, false);
  });

  await t.test('6. Test Security 7 & 8: Allowed Pincode PASS vs Disallowed Pincode BLOCK', async () => {
    // Create a listing with ONLY Pincode coverage to test strict pincode evaluation
    const pincodeOnlyListing = await listingService.createListing({
      title: 'Pincode Only Service',
      price: 500,
      category_id: testCategory.serviceCategoryId,
      pricing_model_id: fixedPricingModel.id,
      duration_option_id: duration2Hrs.id,
      coverage_areas: [
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'PINCODE',
          pincode_id: testPincodeRN.id, // 800016
        },
      ],
    }, providerUser1);

    // Matching Pincode -> PASS
    const allowedPinResult = await validateCustomerCoverageEligibility({
      listing: pincodeOnlyListing,
      customerLocation: {
        pincode: '800016',
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(allowedPinResult.isEligible, true);
    assert.strictEqual(allowedPinResult.coverageMethod, 'PINCODE');

    // Disallowed Pincode -> BLOCK
    const disallowedPinResult = await validateCustomerCoverageEligibility({
      listing: pincodeOnlyListing,
      customerLocation: {
        pincode: '800099', // Disallowed pincode
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(disallowedPinResult.isEligible, false);
  });

  await t.test('7. Test Security 9, 10 & 22: Society Coverage & Guest Protection', async () => {
    // 9. Allowed Society for Resident -> PASS
    const societyPassResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        society_id: testSociety.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(societyPassResult.isEligible, true);

    // 10. Disallowed Society for Society-only service -> BLOCK
    const societyOnlyListing = await listingService.createListing({
      title: 'Private Society Only Service',
      price: 600,
      category_id: testCategory.serviceCategoryId,
      pricing_model_id: fixedPricingModel.id,
      duration_option_id: duration2Hrs.id,
      coverage_scope: 'SOCIETY',
      coverage_areas: [
        {
          coverage_scope: 'SOCIETY',
          coverage_method: 'SOCIETY',
          society_id: testSociety.id,
        },
      ],
    }, providerUser1);

    const disallowedSocietyResult = await validateCustomerCoverageEligibility({
      listing: societyOnlyListing,
      customerLocation: {
        society_id: 999999, // Unknown / Different society
      },
      userRole: 'resident',
    });
    assert.strictEqual(disallowedSocietyResult.isEligible, false);

    // 22. Guest CANNOT book private society-only service -> BLOCK
    const guestSocietyResult = await validateCustomerCoverageEligibility({
      listing: societyOnlyListing,
      customerLocation: {
        society_id: testSociety.id,
      },
      userRole: 'guest',
    });
    assert.strictEqual(guestSocietyResult.isEligible, false);
  });

  await t.test('8. Test Security 11 & 12: Multiple Coverage Areas — ANY Match Allows, ALL Fail Blocks', async () => {
    // Customer is 8 KM from Kankarbagh (passes 10 KM Kankarbagh area, but exceeds 5 KM Rajendra Nagar)
    // Because ANY matching active area allows -> PASS
    const anyMatchResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 25.5912 + 0.07, // ~7.8 KM north-east
        longitude: 85.1528,
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(anyMatchResult.isEligible, true);
    assert.strictEqual(anyMatchResult.coverageMethod, 'RADIUS');

    // Customer outside ALL areas (40 KM away in Hajipur/Vaishali) -> BLOCK
    const allFailResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 25.9800,
        longitude: 85.3500,
        city: 'Hajipur',
      },
      userRole: 'resident',
    });
    assert.strictEqual(allFailResult.isEligible, false);
  });

  await t.test('9. Test Security 13 & 14: Client Distance & Raw Radius Forgery Ignored', async () => {
    // Client attempts to submit forged distance_km: 1 when actual distance is 80 KM
    const forgedResult = await validateCustomerCoverageEligibility({
      listing: multiAreaListing,
      customerLocation: {
        latitude: 25.0000,
        longitude: 85.0000,
        distance_km: 1.0, // FORGERY!
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(forgedResult.isEligible, false, 'Client forged distance must be ignored');

    // Client attempts to pass arbitrary client radius_km when creating listing
    const customRadiusListing = await listingService.createListing({
      title: 'Attempt Custom Radius Listing',
      price: 500,
      category_id: testCategory.serviceCategoryId,
      pricing_model_id: fixedPricingModel.id,
      duration_option_id: duration2Hrs.id,
      coverage_areas: [
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          origin_latitude: 25.6022,
          origin_longitude: 85.1610,
          radius_km: 999.0, // CLIENT FORGERY!
          radius_option_id: radiusOption5KM.id, // Authoritative master says 5 KM
        },
      ],
    }, providerUser1);

    const customArea = customRadiusListing.coverage_areas[0];
    assert.strictEqual(Number(customArea.resolved_radius_km), 5.0, 'Backend must resolve from radius_option_id');
  });

  await t.test('10. Test Security 15: Inactive Radius Master Rejected', async () => {
    try {
      await listingService.createListing({
        title: 'Listing With Inactive Radius Option',
        price: 500,
        category_id: testCategory.serviceCategoryId,
        pricing_model_id: fixedPricingModel.id,
        duration_option_id: duration2Hrs.id,
        coverage_areas: [
          {
            coverage_scope: 'PUBLIC',
            coverage_method: 'RADIUS',
            radius_option_id: inactiveRadiusOption.id, // Inactive!
          },
        ],
      }, providerUser1);
      assert.fail('Should have rejected inactive radius master');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.match(err.message, /Inactive Radius Option/i);
    }
  });

  await t.test('11. Test Security 17: Provider Cannot Edit Another Provider\'s Coverage', async () => {
    try {
      await listingService.updateListing(multiAreaListing.id, {
        title: 'Hacked Title',
        coverage_areas: [],
      }, providerUser2); // Provider 2 does not own Provider 1's listing!
      assert.fail('Should have blocked unauthorized update');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  await t.test('12. Test Security 18: Provider Private Coordinates Not Exposed to Public', async () => {
    const publicProjection = toPublicServiceListing(multiAreaListing);
    assert.ok(publicProjection);
    assert.strictEqual(publicProjection.id, Number(multiAreaListing.id));
    assert.ok(Array.isArray(publicProjection.coverage_areas));

    for (const ca of publicProjection.coverage_areas) {
      assert.strictEqual(ca.origin_latitude, undefined, 'Raw origin_latitude must not be exposed');
      assert.strictEqual(ca.origin_longitude, undefined, 'Raw origin_longitude must not be exposed');
      if (ca.coverage_method === 'RADIUS') {
        assert.ok(ca.radius_km != null);
      }
    }
  });

  await t.test('13. Test Security 19 & 20: Booking Enforces Coverage & Changed Location Revalidates', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    // Resident creates booking within valid radius -> PASS
    const validBooking = await bookingService.createBooking({
      listing_id: multiAreaListing.id,
      scheduled_at: tomorrow.toISOString(),
      time_slot: '10:00 - 12:00',
      service_address: 'Rajendra Nagar Main Road, Patna',
      latitude: 25.6025,
      longitude: 85.1615,
      city: 'Patna',
      locality_id: testLocalityRN.id,
    }, residentUser);

    assert.ok(validBooking.id);
    assert.strictEqual(validBooking.status, 'requested');
    assert.ok(validBooking.coverage_snapshot, 'Historical coverage_snapshot must be stored');
    assert.strictEqual(validBooking.coverage_snapshot.coverage_method, 'RADIUS');
    assert.ok(validBooking.coverage_snapshot.distance_km != null);

    // If customer changes location to an out-of-service area (50 KM away in Muzaffarpur) -> BLOCK
    try {
      await bookingService.createBooking({
        listing_id: multiAreaListing.id,
        scheduled_at: tomorrow.toISOString(),
        time_slot: '14:00 - 16:00',
        service_address: 'Muzaffarpur Bus Stand',
        latitude: 26.1209,
        longitude: 85.3647,
        city: 'Muzaffarpur',
      }, residentUser);
      assert.fail('Should have blocked out-of-area booking');
    } catch (err) {
      assert.strictEqual(err.statusCode, 409);
    }
  });

  await t.test('14. Test Security 21: Historical Booking Remains Valid After Provider Changes Coverage', async () => {
    // 1. Create a booking at 7 KM when provider offers 10 KM
    const tomorrow2 = new Date();
    tomorrow2.setDate(tomorrow2.getDate() + 2);
    tomorrow2.setHours(11, 0, 0, 0);

    const booking7KM = await bookingService.createBooking({
      listing_id: multiAreaListing.id,
      scheduled_at: tomorrow2.toISOString(),
      time_slot: '11:00 - 13:00',
      service_address: 'Kankarbagh Colony, 7 KM away',
      latitude: 25.5912 + 0.06,
      longitude: 85.1528,
      city: 'Patna',
    }, residentUser);

    assert.ok(booking7KM.id);
    const originalBookingSnapshot = booking7KM.coverage_snapshot;
    assert.ok(originalBookingSnapshot);

    // 2. Provider shrinks coverage tomorrow to 5 KM
    await listingService.updateListing(multiAreaListing.id, {
      coverage_areas: [
        {
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          city_id: testCity.id,
          origin_latitude: 25.5912,
          origin_longitude: 85.1528,
          radius_option_id: radiusOption5KM.id, // Now 5 KM!
        },
      ],
    }, providerUser1);

    // 3. Historical booking must still exist, remain valid, and preserve original evaluated snapshot
    const fetchedBooking = await bookingService.getBookingById(booking7KM.id);
    assert.ok(fetchedBooking);
    assert.strictEqual(fetchedBooking.status, 'requested');
    assert.strictEqual(fetchedBooking.coverage_snapshot.evaluated_at, originalBookingSnapshot.evaluated_at);
  });

  await t.test('15. Step 2 & Step 3 Regressions: Pricing, Duration & Concurrency Intact', async () => {
    const booking = await ServiceBooking.findOne({
      where: { listing_id: multiAreaListing.id },
      order: [['id', 'DESC']],
    });
    assert.ok(booking);
    assert.ok(Number(booking.amount) > 0, 'Customer payable must be positive');
    assert.ok(booking.doorstep_pin);
    assert.strictEqual(booking.doorstep_pin.length, 4);
    assert.ok(booking.occupied_until > booking.scheduled_at);
  });
});
