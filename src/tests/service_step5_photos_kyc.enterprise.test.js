import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceListingMedia, { SERVICE_MEDIA_STATUS } from '../modules/service_listing/service_listing_media.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../modules/service_category/service_category.model.js';
import User from '../modules/user/user.model.js';
import AuditLog from '../modules/audit_log/audit_log.model.js';
import Notification from '../modules/notification/notification.model.js';
import * as serviceListingService from '../modules/service_listing/service_listing.service.js';
import { toPublicServiceListing, toPublicProviderProfile } from '../modules/service_listing/service_listing.projection.js';
import { isAllowedImageMime, uploadImage } from '../utils/fileUpload.js';
import { calculateAuthoritativeServicePrice } from '../modules/service_listing/service_pricing.service.js';

let passedCount = 0;
let failedCount = 0;

function runTest(testNumber, testName, testFn) {
  try {
    testFn();
    console.log(`[PASS] Test ${testNumber}: ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Test ${testNumber}: ${testName} ->`, err.message);
    failedCount++;
  }
}

async function runAsyncTest(testNumber, testName, testFn) {
  try {
    await testFn();
    console.log(`[PASS] Test ${testNumber}: ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] Test ${testNumber}: ${testName} ->`, err.message);
    failedCount++;
  }
}

async function runStep5EnterpriseTestSuite() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('SMARTGALI — STEP 5 PHOTOS & KYC ENTERPRISE TEST SUITE');
  console.log('Target: 25 Test Scenarios | 100% PASS');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Connect to DB
  await connectDB();

  // ── FIXTURES SETUP ─────────────────────────────────────────────────────────
  const timestamp = Date.now();

  // Create Category
  const [category] = await ServiceCategory.findOrCreate({
    where: { serviceCategoryName: 'Enterprise AC Maintenance' },
    defaults: {
      serviceCategoryName: 'Enterprise AC Maintenance',
      is_active: true,
      is_deleted: false,
    },
  });

  // Create Provider User A
  const [userA] = await User.findOrCreate({
    where: { email: `step5_provider_a_${timestamp}@smartgali.test` },
    defaults: {
      userName: `Step5 Provider A`,
      phone: `91${String(timestamp).slice(-8)}1`,
      email: `step5_provider_a_${timestamp}@smartgali.test`,
      userRole: 'service_provider',
      is_active: true,
      is_deleted: false,
    },
  });

  // Create Provider User B
  const [userB] = await User.findOrCreate({
    where: { email: `step5_provider_b_${timestamp}@smartgali.test` },
    defaults: {
      userName: `Step5 Provider B`,
      phone: `91${String(timestamp).slice(-8)}2`,
      email: `step5_provider_b_${timestamp}@smartgali.test`,
      userRole: 'service_provider',
      is_active: true,
      is_deleted: false,
    },
  });

  // Provider Profile A (Verified)
  const [profileA] = await ServiceProviderProfile.findOrCreate({
    where: { user_id: userA.userId },
    defaults: {
      user_id: userA.userId,
      business_name: 'CoolTech Services Ltd',
      provider_type: 'Certified Enterprise',
      service_category_id: category.serviceCategoryId,
      is_verified: true,
      verification_status: 'verified',
      is_online: true,
      is_active: true,
      is_deleted: false,
    },
  });
  await profileA.update({ is_verified: true, verification_status: 'verified', service_category_id: category.serviceCategoryId });

  // Provider Profile B (Verified, separate owner)
  const [profileB] = await ServiceProviderProfile.findOrCreate({
    where: { user_id: userB.userId },
    defaults: {
      user_id: userB.userId,
      business_name: 'Rapid Repair Pro',
      provider_type: 'Independent Professional',
      service_category_id: category.serviceCategoryId,
      is_verified: true,
      verification_status: 'verified',
      is_online: true,
      is_active: true,
      is_deleted: false,
    },
  });
  await profileB.update({ is_verified: true, verification_status: 'verified' });

  // Service Listing for Provider A
  const listingA = await ServiceListing.create({
    provider_id: profileA.id,
    category_id: category.serviceCategoryId,
    title: 'Precision AC Deep Cleaning & Gas Refill',
    description: 'Comprehensive 12-point AC inspection and chemical coil wash.',
    price: 1299.00,
    duration: '2 Hours',
    coverage_scope: 'PUBLIC',
    moderation_status: 'draft',
    is_available: true,
    is_active: true,
    is_deleted: false,
    created_by: userA.userId,
  });

  // Service Listing for Provider B
  const listingB = await ServiceListing.create({
    provider_id: profileB.id,
    category_id: category.serviceCategoryId,
    title: 'Emergency Electrical Wiring & Breaker Setup',
    description: 'Industrial and residential breaker installation.',
    price: 850.00,
    duration: '1 Hour',
    coverage_scope: 'PUBLIC',
    moderation_status: 'draft',
    is_available: true,
    is_active: true,
    is_deleted: false,
    created_by: userB.userId,
  });

  const actorUserA = { id: userA.userId, userId: userA.userId, userRole: 'service_provider' };
  const actorUserB = { id: userB.userId, userId: userB.userId, userRole: 'service_provider' };
  const actorAdmin = { id: 99999, userId: 99999, userRole: 'super_admin' };

  let uploadedPhotoIds = [];

  // ── TEST 1: Provider uploads valid photo → PASS ────────────────────────────
  await runAsyncTest(1, 'Provider uploads valid photo → PASS', async () => {
    const photo1 = await serviceListingService.uploadServiceListingMedia(
      listingA.id,
      actorUserA,
      null,
      { media_url: 'https://smartgali.test/uploads/services/portfolio_photo_1.jpg', is_primary: true }
    );
    assert.ok(photo1 && photo1.id, 'Photo record must be created');
    assert.strictEqual(Number(photo1.service_listing_id), Number(listingA.id));
    assert.strictEqual(Number(photo1.provider_id), Number(profileA.id));
    assert.strictEqual(photo1.is_primary, true);
    uploadedPhotoIds.push(photo1.id);
  });

  // ── TEST 2: Provider uploads 5 photos → PASS ───────────────────────────────
  await runAsyncTest(2, 'Provider uploads 5 photos → PASS', async () => {
    for (let i = 2; i <= 5; i++) {
      const p = await serviceListingService.uploadServiceListingMedia(
        listingA.id,
        actorUserA,
        null,
        { media_url: `https://smartgali.test/uploads/services/portfolio_photo_${i}.jpg` }
      );
      uploadedPhotoIds.push(p.id);
    }
    const count = await ServiceListingMedia.count({
      where: { service_listing_id: listingA.id, status: 'active', is_deleted: false }
    });
    assert.strictEqual(count, 5, 'Must have exactly 5 active portfolio photos');
  });

  // ── TEST 3: Provider attempts 6th photo → FAIL ─────────────────────────────
  await runAsyncTest(3, 'Provider attempts 6th photo → FAIL', async () => {
    let errorCaught = false;
    try {
      await serviceListingService.uploadServiceListingMedia(
        listingA.id,
        actorUserA,
        null,
        { media_url: 'https://smartgali.test/uploads/services/portfolio_photo_6.jpg' }
      );
    } catch (err) {
      errorCaught = true;
      assert.ok(
        err.message.includes('Maximum 5 portfolio photos allowed'),
        `Expected max 5 photos error, got: ${err.message}`
      );
    }
    assert.strictEqual(errorCaught, true, 'Server must reject 6th photo with HTTP 400');
  });

  // ── TEST 4: Provider deletes own photo → PASS ──────────────────────────────
  await runAsyncTest(4, 'Provider deletes own photo → PASS', async () => {
    const photoToDeleteId = uploadedPhotoIds.pop();
    const result = await serviceListingService.deleteServiceListingMedia(
      listingA.id,
      photoToDeleteId,
      actorUserA
    );
    assert.ok(result && result.message, 'Must return deletion success message');
    const mediaRow = await ServiceListingMedia.findByPk(photoToDeleteId);
    assert.strictEqual(mediaRow.is_deleted, true);
    assert.strictEqual(mediaRow.status, 'deleted');

    const remainingCount = await ServiceListingMedia.count({
      where: { service_listing_id: listingA.id, status: 'active', is_deleted: false }
    });
    assert.strictEqual(remainingCount, 4, 'Active photos count must decrement to 4');
  });

  // ── TEST 5: Provider cannot delete another provider photo → FAIL ───────────
  await runAsyncTest(5, 'Provider cannot delete another provider photo → FAIL', async () => {
    let errorCaught = false;
    const targetPhotoId = uploadedPhotoIds[0];
    try {
      await serviceListingService.deleteServiceListingMedia(
        listingA.id,
        targetPhotoId,
        actorUserB
      );
    } catch (err) {
      errorCaught = true;
      assert.strictEqual(err.statusCode, 403, 'Must throw 403 Forbidden on cross-provider deletion');
    }
    assert.strictEqual(errorCaught, true, 'Cross-provider photo deletion must be blocked');
  });

  // ── TEST 6: Provider cannot upload to another provider service → FAIL ──────
  await runAsyncTest(6, 'Provider cannot upload to another provider service → FAIL', async () => {
    let errorCaught = false;
    try {
      await serviceListingService.uploadServiceListingMedia(
        listingA.id,
        actorUserB,
        null,
        { media_url: 'https://smartgali.test/uploads/services/hacker_photo.jpg' }
      );
    } catch (err) {
      errorCaught = true;
      assert.strictEqual(err.statusCode, 403, 'Must throw 403 Forbidden on cross-provider upload');
    }
    assert.strictEqual(errorCaught, true, 'Cross-provider photo upload must be blocked');
  });

  // ── TEST 7: Invalid file type → FAIL ───────────────────────────────────────
  runTest(7, 'Invalid file type → FAIL', () => {
    assert.strictEqual(isAllowedImageMime('application/x-msdownload'), false, 'EXE files must be rejected');
    assert.strictEqual(isAllowedImageMime('application/javascript'), false, 'JS files must be rejected');
    assert.strictEqual(isAllowedImageMime('application/pdf'), false, 'PDF is not an allowed portfolio image type');
    assert.strictEqual(isAllowedImageMime('image/jpeg'), true, 'JPEG is allowed');
    assert.strictEqual(isAllowedImageMime('image/png'), true, 'PNG is allowed');
    assert.strictEqual(isAllowedImageMime('image/webp'), true, 'WebP is allowed');
  });

  // ── TEST 8: Oversized file → FAIL ──────────────────────────────────────────
  runTest(8, 'Oversized file → FAIL', () => {
    const multerConfig = uploadImage('services');
    assert.ok(multerConfig && multerConfig.limits, 'Multer must have limits configured');
    assert.strictEqual(multerConfig.limits.fileSize, 5 * 1024 * 1024, 'File size limit must be exactly 5MB');
  });

  // ── TEST 9: KYC verified status loads correctly → PASS ─────────────────────
  await runAsyncTest(9, 'KYC verified status loads correctly → PASS', async () => {
    await profileA.update({ is_verified: true, verification_status: 'verified' });
    const kycStatus = await serviceListingService.getServiceListingKycStatus(listingA.id, actorUserA);
    assert.strictEqual(kycStatus.is_provider_verified, true);
    assert.strictEqual(kycStatus.provider_verification_status, 'VERIFIED');
    assert.strictEqual(kycStatus.is_eligible_for_publish, true);
    assert.strictEqual(kycStatus.documents.length, 3);
    assert.strictEqual(kycStatus.documents[0].status, 'VERIFIED');
  });

  // ── TEST 10: KYC pending status loads correctly → PASS ────────────────────
  await runAsyncTest(10, 'KYC pending status loads correctly → PASS', async () => {
    await profileA.update({ is_verified: false, verification_status: 'underReview' });
    const kycStatus = await serviceListingService.getServiceListingKycStatus(listingA.id, actorUserA);
    assert.strictEqual(kycStatus.is_provider_verified, false);
    assert.strictEqual(kycStatus.provider_verification_status, 'UNDERREVIEW');
    assert.strictEqual(kycStatus.is_eligible_for_publish, false);
    assert.strictEqual(kycStatus.documents[0].status, 'UNDER_REVIEW');
  });

  // ── TEST 11: KYC rejected status loads correctly → PASS ───────────────────
  await runAsyncTest(11, 'KYC rejected status loads correctly → PASS', async () => {
    await profileA.update({ is_verified: false, verification_status: 'rejected' });
    const kycStatus = await serviceListingService.getServiceListingKycStatus(listingA.id, actorUserA);
    assert.strictEqual(kycStatus.is_provider_verified, false);
    assert.strictEqual(kycStatus.provider_verification_status, 'REJECTED');
    assert.strictEqual(kycStatus.documents[0].status, 'REJECTED');
  });

  // ── TEST 12: Missing required KYC blocks submission → FAIL ────────────────
  await runAsyncTest(12, 'Missing required KYC blocks submission → FAIL', async () => {
    await profileA.update({ is_verified: false, verification_status: 'underReview' });
    let errorCaught = false;
    try {
      await serviceListingService.submitServiceListingForReview(listingA.id, actorUserA);
    } catch (err) {
      errorCaught = true;
      assert.ok(
        err.message.includes('Provider KYC verification required'),
        `Expected KYC required error, got: ${err.message}`
      );
    }
    assert.strictEqual(errorCaught, true, 'Submission must be blocked when KYC is not verified');
  });

  // ── TEST 13: Verified required KYC allows submission → PASS ───────────────
  await runAsyncTest(13, 'Verified required KYC allows submission → PASS', async () => {
    await profileA.update({ is_verified: true, verification_status: 'verified' });
    const submittedListing = await serviceListingService.submitServiceListingForReview(listingA.id, actorUserA);
    assert.strictEqual(submittedListing.moderation_status, 'pending');
  });

  // ── TEST 14: Public API exposes portfolio photos safely → PASS ────────────
  await runAsyncTest(14, 'Public API exposes portfolio photos safely → PASS', async () => {
    const rawListing = await ServiceListing.findByPk(listingA.id);
    const publicProjection = toPublicServiceListing(rawListing);
    assert.ok(Array.isArray(publicProjection.images), 'Images must be an array');
    assert.ok(publicProjection.images.length > 0, 'Portfolio photos must be present in public projection');
    assert.ok(publicProjection.images[0].startsWith('http'), 'Safe media URL exposed');
  });

  // ── TEST 15: Public API never exposes KYC documents → PASS ────────────────
  await runAsyncTest(15, 'Public API never exposes KYC documents → PASS', async () => {
    const rawListing = await ServiceListing.findByPk(listingA.id);
    const publicProjection = toPublicServiceListing(rawListing);
    assert.strictEqual(publicProjection.documents, undefined, 'Private KYC documents must NOT exist in public projection');
    assert.strictEqual(publicProjection.aadhaar, undefined, 'Aadhaar must NOT exist in public projection');
    assert.strictEqual(publicProjection.pan, undefined, 'PAN must NOT exist in public projection');
    assert.strictEqual(publicProjection.bank, undefined, 'Bank details must NOT exist in public projection');
    assert.strictEqual(publicProjection.moderation_remarks, undefined, 'Admin notes must NOT be exposed');
  });

  // ── TEST 16: Guest projection does not expose KYC → PASS ──────────────────
  await runAsyncTest(16, 'Guest projection does not expose KYC → PASS', async () => {
    const guestProfile = toPublicProviderProfile(profileA);
    assert.strictEqual(guestProfile.documents, undefined, 'Guest profile must not leak KYC documents');
    assert.strictEqual(guestProfile.kyc, undefined, 'Guest profile must not leak KYC internals');
    assert.ok(guestProfile.verification_status !== undefined, 'Guest profile can see high-level verification badge');
  });

  // ── TEST 17: Admin permission boundaries work → PASS ───────────────────────
  await runAsyncTest(17, 'Admin permission boundaries work → PASS', async () => {
    const mediaAdmin = await serviceListingService.getServiceListingMedia(listingA.id, actorAdmin);
    assert.ok(Array.isArray(mediaAdmin), 'Admin must be able to view listing media');
    const kycAdmin = await serviceListingService.getServiceListingKycStatus(listingA.id, actorAdmin);
    assert.strictEqual(kycAdmin.is_provider_verified, true);
  });

  // ── TEST 18: Audit log created → PASS ─────────────────────────────────────
  await runAsyncTest(18, 'Audit log created → PASS', async () => {
    const auditEntries = await AuditLog.findAll({
      where: { target_type: 'service_listing', target_id: listingA.id },
      order: [['id', 'DESC']],
      limit: 5,
    });
    assert.ok(auditEntries.length > 0, 'Audit log records must exist for state-changing service events');
    const actions = auditEntries.map(a => a.action);
    assert.ok(
      actions.includes('SERVICE_SUBMITTED') || actions.includes('SERVICE_KYC_VALIDATION_FAILED'),
      `Audit trail must contain Step 5 events (found: ${actions.join(', ')})`
    );
  });

  // ── TEST 19: Notification flow works where required → PASS ────────────────
  await runAsyncTest(19, 'Notification flow works where required → PASS', async () => {
    const notifs = await Notification.findAll({
      where: { user_id: userA.userId },
      order: [['id', 'DESC']],
      limit: 5,
    });
    assert.ok(notifs.length > 0, 'Notification must be recorded for provider on service submission');
    assert.ok(notifs[0].title.includes('Service'), 'Notification title relates to service');
  });

  // ── TEST 20: Service ownership protection → PASS ──────────────────────────
  await runAsyncTest(20, 'Service ownership protection → PASS', async () => {
    let errorCaught = false;
    try {
      await serviceListingService.submitServiceListingForReview(listingA.id, actorUserB);
    } catch (err) {
      errorCaught = true;
      assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden on cross-provider submission');
    }
    assert.strictEqual(errorCaught, true, 'Service submission ownership must be enforced');
  });

  // ── TEST 21: Step 1 regression → PASS ─────────────────────────────────────
  await runAsyncTest(21, 'Step 1 regression (Core Attributes & Category) → PASS', async () => {
    const l = await ServiceListing.findByPk(listingA.id);
    assert.ok(l.title && l.title.length > 0, 'Title preserved');
    assert.ok(l.description && l.description.length > 0, 'Description preserved');
    assert.strictEqual(Number(l.category_id), Number(category.serviceCategoryId), 'Category preserved');
  });

  // ── TEST 22: Step 2 pricing regression → PASS ─────────────────────────────
  await runAsyncTest(22, 'Step 2 pricing regression → PASS', async () => {
    const calc = await calculateAuthoritativeServicePrice({
      listingId: listingA.id,
      discountAmount: 100,
    });
    assert.ok(calc && calc.customer_payable != null, 'Price calculation customer_payable operates correctly');
    assert.ok(calc && calc.provider_earnings != null, 'Price calculation provider_earnings operates correctly');
    assert.strictEqual(typeof calc.customer_payable, 'number', 'customer_payable is numeric');
  });

  // ── TEST 23: Step 3 duration regression → PASS ─────────────────────────────
  await runAsyncTest(23, 'Step 3 duration regression → PASS', async () => {
    const l = await ServiceListing.findByPk(listingA.id);
    assert.strictEqual(l.duration, '2 Hours', 'Service duration configuration intact');
  });

  // ── TEST 24: Step 4 coverage regression → PASS ─────────────────────────────
  await runAsyncTest(24, 'Step 4 coverage regression → PASS', async () => {
    const l = await ServiceListing.findByPk(listingA.id);
    assert.strictEqual(l.coverage_scope, 'PUBLIC', 'Service coverage scope intact');
  });

  // ── TEST 25: Existing Provider KYC regression → PASS ───────────────────────
  await runAsyncTest(25, 'Existing Provider KYC regression → PASS', async () => {
    const p = await ServiceProviderProfile.findByPk(profileA.id);
    assert.strictEqual(p.is_verified, true, 'Provider is_verified flag intact');
    assert.strictEqual(p.verification_status, 'verified', 'Provider verification_status intact');
    assert.strictEqual(p.provider_type, 'Certified Enterprise', 'Provider type intact');
  });

  // ── SUMMARY & TEARDOWN ─────────────────────────────────────────────────────
  try {
    await ServiceListingMedia.destroy({ where: { service_listing_id: [listingA.id, listingB.id] } });
    await ServiceListing.destroy({ where: { id: [listingA.id, listingB.id] } });
  } catch (_) {}

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`FINAL RESULTS: ${passedCount} / ${passedCount + failedCount} TESTS PASSED`);
  console.log(`PASS RATE: ${Math.round((passedCount / (passedCount + failedCount)) * 100)}%`);
  console.log('════════════════════════════════════════════════════════════════');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep5EnterpriseTestSuite().catch((err) => {
  console.error('[SUITE ERROR]', err);
  process.exit(1);
});
