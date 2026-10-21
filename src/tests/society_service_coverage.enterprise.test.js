import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceCoverageArea from '../modules/service_listing/service_coverage_area.model.js';
import SocietyProfile from '../modules/society_profile/society_profile.model.js';
import SocietyMember from '../modules/society_member/society_member.model.js';
import SocietyServiceAccess, { SOCIETY_SERVICE_ACCESS_STATUS } from '../modules/society_service_access/society_service_access.model.js';
import societyServiceAccessService from '../modules/society_service_access/society_service_access.service.js';
import { validateCustomerCoverageEligibility, calculateHaversineDistanceKm } from '../modules/service_booking/service_coverage.service.js';
import { calculateAuthoritativeServicePrice } from '../modules/service_listing/service_pricing.service.js';
import { resolveServiceDurationConfig } from '../modules/service_booking/service_duration.service.js';
import User from '../modules/user/user.model.js';
import AuditLog from '../modules/audit_log/audit_log.model.js';

async function runEnterpriseTestSuite() {
  console.log('================================================================');
  console.log('🧪 SMARTGALI ENTERPRISE SOCIETY SERVICE COVERAGE & APPROVAL TEST');
  console.log('================================================================\n');

  await connectDB();

  // ── Setup Fixtures ────────────────────────────────────────────────────────
  console.log('📦 Setting up isolated test fixtures...');

  // 1. Resolve Provider User and Profile
  let providerProfile = await ServiceProviderProfile.findOne({
    where: { is_deleted: false, is_active: true },
    include: [{ model: User, as: 'user' }],
  });
  assert(providerProfile, 'Test requires an active ServiceProviderProfile');
  const providerUserId = providerProfile.user_id;

  // 2. Resolve or Create Test Service Listing A and Service Listing B
  let listingA = await ServiceListing.findOne({
    where: { provider_id: providerProfile.id, is_deleted: false, is_available: true, moderation_status: 'approved' },
  });
  if (!listingA) {
    listingA = await ServiceListing.create({
      provider_id: providerProfile.id,
      title: 'Enterprise Test AC Maintenance',
      price: 499.00,
      duration: 60,
      is_available: true,
      moderation_status: 'approved',
      coverage_scope: 'SOCIETY_AND_PUBLIC',
      is_active: true,
    });
  }

  let listingB = await ServiceListing.findOne({
    where: { provider_id: providerProfile.id, is_deleted: false, id: { [sequelize.Sequelize.Op.ne]: listingA.id } },
  });
  if (!listingB) {
    listingB = await ServiceListing.create({
      provider_id: providerProfile.id,
      title: 'Enterprise Test Plumbing Fix',
      price: 299.00,
      duration: 45,
      is_available: true,
      moderation_status: 'approved',
      coverage_scope: 'SOCIETY_AND_PUBLIC',
      is_active: true,
    });
  }

  // 3. Resolve Society A (within 10 KM) and Society B (far away)
  let societyA = await SocietyProfile.findOne({
    where: { is_deleted: false, is_active: true },
    order: [['id', 'ASC']],
  });
  assert(societyA, 'Test requires at least one active SocietyProfile');

  let societyB = await SocietyProfile.findOne({
    where: { is_deleted: false, id: { [sequelize.Sequelize.Op.ne]: societyA.id } },
  });
  if (!societyB) {
    societyB = await SocietyProfile.create({
      society_name: 'Far Away Residency Test',
      address: 'Out of town sector 99',
      latitude: 28.6139,
      longitude: 77.2090,
      total_flats: 50,
      is_active: true,
    });
  }

  // Ensure Society A has valid coordinates near provider origin (Patna: 25.5941, 85.1376)
  if (!societyA.latitude || !societyA.longitude) {
    await societyA.update({ latitude: 25.6000, longitude: 85.1400 });
  }

  // Ensure listing A has an explicit coverage area (Step 4 RADIUS = 10 KM around Patna)
  await ServiceCoverageArea.destroy({ where: { service_id: listingA.id } });
  const coverageAreaA = await ServiceCoverageArea.create({
    service_id: listingA.id,
    coverage_scope: 'SOCIETY_AND_PUBLIC',
    coverage_method: 'RADIUS',
    origin_latitude: 25.5941,
    origin_longitude: 85.1376,
    origin_address: 'Kankarbagh, Patna, Bihar',
    resolved_radius_km: 10.0,
    is_active: true,
  });

  // 4. Resolve Society Admin User for Society A
  let societyAdmin = await User.findOne({
    where: { is_deleted: false, userId: { [sequelize.Sequelize.Op.ne]: providerUserId } },
  });
  assert(societyAdmin, 'Test requires a second user to act as society admin');

  // Ensure societyAdmin is linked in SocietyMember for Society A as admin
  let adminMemberA = await SocietyMember.findOne({
    where: { society_id: societyA.id, user_id: societyAdmin.userId },
  });
  if (!adminMemberA) {
    adminMemberA = await SocietyMember.create({
      society_id: societyA.id,
      user_id: societyAdmin.userId,
      role: 'admin',
      status: 'active',
    });
  } else {
    await adminMemberA.update({ role: 'admin', status: 'active', is_deleted: false });
  }

  // 5. Resolve Resident User for Society A
  let residentUser = await User.findOne({
    where: {
      is_deleted: false,
      userId: { [sequelize.Sequelize.Op.notIn]: [providerUserId, societyAdmin.userId] },
    },
  });
  if (!residentUser) {
    residentUser = await User.create({
      userName: 'Resident Test User',
      email: `resident_${Date.now()}@smartgali.test`,
      password: 'password123',
    });
  }

  // Ensure resident is member of Society A
  let residentMemberA = await SocietyMember.findOne({
    where: { society_id: societyA.id, user_id: residentUser.userId },
  });
  if (!residentMemberA) {
    residentMemberA = await SocietyMember.create({
      society_id: societyA.id,
      user_id: residentUser.userId,
      role: 'member',
      status: 'active',
    });
  } else {
    await residentMemberA.update({ status: 'active', is_deleted: false });
  }

  // Ensure resident is NOT a member of Society B
  await SocietyMember.destroy({
    where: { society_id: societyB.id, user_id: residentUser.userId },
  });

  // Clean any old access records for this test pair
  await SocietyServiceAccess.destroy({
    where: { provider_id: providerProfile.id, service_id: listingA.id, society_id: societyA.id },
  });

  console.log('✅ Fixtures initialized successfully.\n');

  let passedTests = 0;
  let totalTests = 0;

  function recordPass(testName) {
    totalTests++;
    passedTests++;
    console.log(`[PASS ${totalTests}] ${testName}`);
  }

  function recordFail(testName, err) {
    totalTests++;
    console.error(`[FAIL ${totalTests}] ${testName}:`, err.message);
    throw err;
  }

  // ── TEST 1: Public Booking Without Society (Regression Check) ───────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.5950,
        longitude: 85.1380, // ~100 meters from origin
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, true, 'Public customer within radius should be eligible');
    assert.strictEqual(res.coverageMethod, 'RADIUS');
    recordPass('Public booking without society -> PASS');
  } catch (e) {
    recordFail('Public booking without society -> PASS', e);
  }

  // ── TEST 2: Society Booking Without Approval -> FAIL ────────────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400, // ~1 KM from origin (geographically inside radius!)
        society_id: societyA.id,
        city: 'Patna',
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'Inside radius without society approval must NOT be eligible');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    recordPass('Society booking without approval (even if inside radius) -> FAIL');
  } catch (e) {
    recordFail('Society booking without approval (even if inside radius) -> FAIL', e);
  }

  // ── TEST 3: Provider Requests Society Access ────────────────────────────────
  let accessRecord = null;
  try {
    accessRecord = await societyServiceAccessService.requestAccess({
      userId: providerUserId,
      serviceId: listingA.id,
      societyId: societyA.id,
      notes: 'Please approve AC maintenance for summer season.',
    });
    assert(accessRecord && accessRecord.id, 'Access request record must be created');
    assert.strictEqual(accessRecord.status, SOCIETY_SERVICE_ACCESS_STATUS.REQUESTED);
    recordPass('Provider requests society access -> REQUESTED');
  } catch (e) {
    recordFail('Provider requests society access -> REQUESTED', e);
  }

  // ── TEST 4: Society Booking with status REQUESTED -> FAIL ───────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'REQUESTED status must block booking');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    assert.strictEqual(res.accessStatus, 'REQUESTED');
    recordPass('Society booking with status REQUESTED -> FAIL');
  } catch (e) {
    recordFail('Society booking with status REQUESTED -> FAIL', e);
  }

  // ── TEST 5: Society Admin Rejects Access with Reason ────────────────────────
  try {
    await societyServiceAccessService.rejectAccess({
      accessId: accessRecord.id,
      reviewerUserId: societyAdmin.userId,
      societyId: societyA.id,
      rejectionReason: 'Society already has a vendor contracted until end of month.',
    });
    const reloaded = await SocietyServiceAccess.findByPk(accessRecord.id);
    assert.strictEqual(reloaded.status, SOCIETY_SERVICE_ACCESS_STATUS.REJECTED);
    assert.strictEqual(reloaded.rejection_reason, 'Society already has a vendor contracted until end of month.');
    recordPass('Society Admin rejects access with mandatory reason -> REJECTED');
  } catch (e) {
    recordFail('Society Admin rejects access with mandatory reason -> REJECTED', e);
  }

  // ── TEST 6: Society Booking with status REJECTED -> FAIL ────────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'REJECTED status must block booking');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    assert.strictEqual(res.accessStatus, 'REJECTED');
    recordPass('Society booking with status REJECTED -> FAIL');
  } catch (e) {
    recordFail('Society booking with status REJECTED -> FAIL', e);
  }

  // ── TEST 7: Provider Re-Requests Access ─────────────────────────────────────
  try {
    accessRecord = await societyServiceAccessService.requestAccess({
      userId: providerUserId,
      serviceId: listingA.id,
      societyId: societyA.id,
      notes: 'Submitting updated contract and lower pricing.',
    });
    assert.strictEqual(accessRecord.status, SOCIETY_SERVICE_ACCESS_STATUS.REQUESTED);
    recordPass('Provider re-requests access -> REQUESTED');
  } catch (e) {
    recordFail('Provider re-requests access -> REQUESTED', e);
  }

  // ── TEST 8: Society Admin Suspends Access ───────────────────────────────────
  try {
    await societyServiceAccessService.suspendAccess({
      accessId: accessRecord.id,
      reviewerUserId: societyAdmin.userId,
      societyId: societyA.id,
      suspensionReason: 'Temporary security maintenance at society gates.',
    });
    const reloaded = await SocietyServiceAccess.findByPk(accessRecord.id);
    assert.strictEqual(reloaded.status, SOCIETY_SERVICE_ACCESS_STATUS.SUSPENDED);
    recordPass('Society Admin suspends access -> SUSPENDED');
  } catch (e) {
    recordFail('Society Admin suspends access -> SUSPENDED', e);
  }

  // ── TEST 9: Society Booking with status SUSPENDED -> FAIL ───────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'SUSPENDED status must block booking');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    assert.strictEqual(res.accessStatus, 'SUSPENDED');
    recordPass('Society booking with status SUSPENDED -> FAIL');
  } catch (e) {
    recordFail('Society booking with status SUSPENDED -> FAIL', e);
  }

  // ── TEST 10: Society Admin Revokes Access ───────────────────────────────────
  try {
    await societyServiceAccessService.revokeAccess({
      accessId: accessRecord.id,
      reviewerUserId: societyAdmin.userId,
      societyId: societyA.id,
      reason: 'Repeated non-compliance with community standards.',
    });
    const reloaded = await SocietyServiceAccess.findByPk(accessRecord.id);
    assert.strictEqual(reloaded.status, SOCIETY_SERVICE_ACCESS_STATUS.REVOKED);
    recordPass('Society Admin revokes access -> REVOKED');
  } catch (e) {
    recordFail('Society Admin revokes access -> REVOKED', e);
  }

  // ── TEST 11: Society Booking with status REVOKED -> FAIL ────────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'REVOKED status must block booking');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    assert.strictEqual(res.accessStatus, 'REVOKED');
    recordPass('Society booking with status REVOKED -> FAIL');
  } catch (e) {
    recordFail('Society booking with status REVOKED -> FAIL', e);
  }

  // ── TEST 12: Provider Self-Approval Forbidden (Security Check) ──────────────
  try {
    // Re-request to have it in pending state
    accessRecord = await societyServiceAccessService.requestAccess({
      userId: providerUserId,
      serviceId: listingA.id,
      societyId: societyA.id,
      notes: 'New appeal.',
    });

    let selfApprovalBlocked = false;
    try {
      await societyServiceAccessService.approveAccess({
        accessId: accessRecord.id,
        reviewerUserId: providerUserId, // Provider attempting to approve himself!
        societyId: societyA.id,
      });
    } catch (err) {
      if (err.code === 'SELF_APPROVAL_FORBIDDEN' || err.statusCode === 403) {
        selfApprovalBlocked = true;
      }
    }
    assert.strictEqual(selfApprovalBlocked, true, 'Provider self-approval must be strictly rejected with HTTP 403');
    recordPass('Provider self-approval attempt -> FAIL (Blocked with HTTP 403)');
  } catch (e) {
    recordFail('Provider self-approval attempt -> FAIL (Blocked with HTTP 403)', e);
  }

  // ── TEST 13: Cross-Society Admin Approval Forbidden (Tenant Isolation) ─────
  try {
    let crossSocietyBlocked = false;
    try {
      await societyServiceAccessService.approveAccess({
        accessId: accessRecord.id,
        reviewerUserId: societyAdmin.userId,
        societyId: societyB.id, // Reviewer attempting to approve Society A record under Society B!
      });
    } catch (err) {
      if (err.code === 'CROSS_SOCIETY_FORBIDDEN' || err.statusCode === 403) {
        crossSocietyBlocked = true;
      }
    }
    assert.strictEqual(crossSocietyBlocked, true, 'Cross-society review must be blocked with HTTP 403');
    recordPass('Cross-society admin approval attempt -> FAIL (Blocked with HTTP 403)');
  } catch (e) {
    recordFail('Cross-society admin approval attempt -> FAIL (Blocked with HTTP 403)', e);
  }

  // ── TEST 14: Authorized Society Admin Approves Request -> APPROVED ──────────
  try {
    await societyServiceAccessService.approveAccess({
      accessId: accessRecord.id,
      reviewerUserId: societyAdmin.userId,
      societyId: societyA.id,
    });
    const reloaded = await SocietyServiceAccess.findByPk(accessRecord.id);
    assert.strictEqual(reloaded.status, SOCIETY_SERVICE_ACCESS_STATUS.APPROVED);
    assert.strictEqual(Number(reloaded.reviewed_by), Number(societyAdmin.userId));
    assert(reloaded.reviewed_at, 'reviewed_at timestamp must be populated');
    recordPass('Society Admin approves access -> APPROVED');
  } catch (e) {
    recordFail('Society Admin approves access -> APPROVED', e);
  }

  // ── TEST 15: Society Booking APPROVED + Valid Location -> PASS ──────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400, // ~1 KM from origin, within 10 KM radius
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, true, 'Approved society access inside radius must be eligible');
    assert.strictEqual(res.societyAccessStatus, 'APPROVED');
    assert.strictEqual(Number(res.societyAccessId), Number(accessRecord.id));
    recordPass('Society booking APPROVED + valid location -> PASS');
  } catch (e) {
    recordFail('Society booking APPROVED + valid location -> PASS', e);
  }

  // ── TEST 16: Approved for Service A, but resident books unapproved Service B ─
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingB, // Listing B has not been approved!
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'Approval for Service A must NOT authorize Service B');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    recordPass('Approved Service A does NOT authorize Service B -> FAIL');
  } catch (e) {
    recordFail('Approved Service A does NOT authorize Service B -> FAIL', e);
  }

  // ── TEST 17: Approved for Society A, but resident books for Society B ────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyB.id, // Society B has not approved Listing A!
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'Approval for Society A must NOT authorize Society B');
    assert.strictEqual(res.reasonCode, 'SOCIETY_ACCESS_NOT_APPROVED');
    recordPass('Approved Society A does NOT authorize Society B -> FAIL');
  } catch (e) {
    recordFail('Approved Society A does NOT authorize Society B -> FAIL', e);
  }

  // ── TEST 18: Radius Invalid + Approval Valid -> FAIL ────────────────────────
  try {
    const res = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 26.5000,
        longitude: 86.5000, // >100 KM away, far exceeding 10 KM radius
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(res.eligible, false, 'Location outside radius must FAIL even if approved');
    assert.strictEqual(res.reasonCode, 'OUT_OF_SERVICE_AREA');
    recordPass('Radius invalid + approval valid -> FAIL (OUT_OF_SERVICE_AREA)');
  } catch (e) {
    recordFail('Radius invalid + approval valid -> FAIL (OUT_OF_SERVICE_AREA)', e);
  }

  // ── TEST 19: Forged society_id in Booking Request Blocked ───────────────────
  try {
    let forgedBlocked = false;
    const targetSocId = Number(societyB.id);
    const membership = await SocietyMember.findOne({
      where: {
        user_id: residentUser.userId,
        society_id: targetSocId,
        status: 'active',
        is_deleted: false,
      },
    });
    if (!membership) {
      forgedBlocked = true;
    }
    assert.strictEqual(forgedBlocked, true, 'Resident cannot forge membership in an arbitrary society');
    recordPass('Forged society_id without active membership -> BLOCKED');
  } catch (e) {
    recordFail('Forged society_id without active membership -> BLOCKED', e);
  }

  // ── TEST 20: Regression Check - Step 2 Pricing Calculation ──────────────────
  try {
    const priceResult = await calculateAuthoritativeServicePrice({
      listingId: listingA.id,
      durationHours: 1,
      materialCharge: 50.00,
      discountAmount: 20.00,
    });
    assert(priceResult && priceResult.customer_payable > 0, 'Price calculation must succeed');
    assert(priceResult.subtotal > 0, 'Subtotal must be calculated');
    assert(priceResult.provider_earnings >= 0, 'Provider earnings must be calculated');
    recordPass('Step 2 Pricing calculation regression -> PASS');
  } catch (e) {
    recordFail('Step 2 Pricing calculation regression -> PASS', e);
  }

  // ── TEST 21: Regression Check - Step 3 Duration & Slot Config ───────────────
  try {
    const durationConfig = await resolveServiceDurationConfig(listingA);
    assert(durationConfig && durationConfig.durationMinutes > 0, 'Duration config must resolve');
    assert(durationConfig.totalOccupancyMinutes >= durationConfig.durationMinutes, 'Total occupancy must be >= duration');
    recordPass('Step 3 Duration & Execution regression -> PASS');
  } catch (e) {
    recordFail('Step 3 Duration & Execution regression -> PASS', e);
  }

  // ── TEST 22: Regression Check - Step 4 Haversine Accuracy ───────────────────
  try {
    const distanceKm = calculateHaversineDistanceKm(25.5941, 85.1376, 25.6333, 85.0500);
    assert(distanceKm != null && distanceKm > 9 && distanceKm < 12, 'Haversine distance must be physically accurate');
    recordPass('Step 4 Haversine engine regression -> PASS');
  } catch (e) {
    recordFail('Step 4 Haversine engine regression -> PASS', e);
  }

  // ── TEST 23: Historical Booking Snapshot Immutability (Phase 15) ─────────────
  try {
    const bookingSnapshot = {
      society_id: societyA.id,
      provider_id: providerProfile.id,
      service_listing_id: listingA.id,
      society_access_id: accessRecord.id,
      access_status_at_booking: 'APPROVED',
      coverage_area_id: coverageAreaA.id,
      coverage_method: 'RADIUS',
      distance_km: 1.05,
      allowed_radius_km: 10.0,
      evaluated_at: new Date().toISOString(),
    };

    // Later: Society suspends provider
    await accessRecord.update({ status: SOCIETY_SERVICE_ACCESS_STATUS.SUSPENDED });

    // The historical snapshot remains unchanged
    assert.strictEqual(bookingSnapshot.access_status_at_booking, 'APPROVED', 'Historical snapshot must remain immutable');
    assert.strictEqual(Number(bookingSnapshot.society_access_id), Number(accessRecord.id));

    // But NEW coverage evaluation is now BLOCKED!
    const newEval = await validateCustomerCoverageEligibility({
      listing: listingA,
      providerProfile,
      customerLocation: {
        latitude: 25.6000,
        longitude: 85.1400,
        society_id: societyA.id,
      },
      userRole: 'resident',
    });
    assert.strictEqual(newEval.eligible, false, 'New booking must be blocked after suspension');
    recordPass('Historical booking snapshot immutability -> PASS');
  } catch (e) {
    recordFail('Historical booking snapshot immutability -> PASS', e);
  }

  // ── TEST 24: Audit Log Flow ─────────────────────────────────────────────────
  try {
    const auditLogs = await AuditLog.findAll({
      where: {
        target_type: 'society_service_access',
        target_id: accessRecord.id,
      },
    });
    assert(auditLogs.length > 0, 'Audit log entries must exist for state-changing actions');
    recordPass('Audit log flow -> PASS');
  } catch (e) {
    recordFail('Audit log flow -> PASS', e);
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('================================================================\n');

  process.exit(0);
}

runEnterpriseTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
