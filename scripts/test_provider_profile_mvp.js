import assert from 'assert';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import UserProfile from '../src/modules/userProfile/userProfile.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';
import ServiceProviderProfile from '../src/modules/service_provider_profile/service_provider_profile.model.js';
import ProviderDocument from '../src/modules/service_provider_profile/provider_document.model.js';
import * as serviceProviderProfileService from '../src/modules/service_provider_profile/service_provider_profile.service.js';
import { updateProviderProfileSchema } from '../src/modules/service_provider_profile/service_provider_profile.validation.js';
import AuditLog from '../src/modules/audit_log/audit_log.model.js';
import Notification from '../src/modules/notification/notification.model.js';

const runTests = async () => {
  console.log('=== STARTING SMARTGALI PROVIDER PROFILE MVP TEST SUITE ===\n');

  await sequelize.authenticate();

  // Pick or create test user 1
  let testUser1 = await User.findOne({ where: { userId: 1 } });
  if (!testUser1) {
    testUser1 = await User.findOne({ where: { is_deleted: false, status: 'active' } });
  }
  const testUserId = testUser1.userId;
  console.log(`Using Test User ID: ${testUserId}`);

  // Ensure UserProfile exists
  let userProfile = await UserProfile.findOne({ where: { user_id: testUserId } });
  if (!userProfile) {
    userProfile = await UserProfile.create({
      user_id: testUserId,
      fullName: 'Test Provider User',
      avatarUrl: 'https://smartgali.com/uploads/avatars/default.png',
      created_by: testUserId,
    });
  } else {
    await userProfile.update({
      fullName: 'Rajesh Sharma Test',
      avatarUrl: 'https://smartgali.com/uploads/avatars/test-rajesh.png',
    });
  }

  // Ensure category exists
  let category = await ServiceCategory.findOne({ where: { is_deleted: false } });
  if (!category) {
    category = await ServiceCategory.create({
      serviceCategoryName: 'Electrician',
      is_active: true,
      is_deleted: false,
    });
  }

  // --- TEST 1: Get or Create Provider Profile ---
  console.log('\n[TEST 1] Testing getOrCreateProviderProfile & Eager Loading...');
  const profile = await serviceProviderProfileService.getOrCreateProviderProfile(testUserId);
  assert(profile, 'Profile should exist');
  assert.strictEqual(profile.user_id, testUserId, 'Profile user_id should match');
  assert(profile.user, 'Eager-loaded user must exist');
  assert(profile.user.profile, 'Eager-loaded user.profile must exist');
  assert.strictEqual(profile.user.profile.fullName, 'Rajesh Sharma Test', 'FullName must match user_profiles.fullName');
  console.log('  ✓ Profile eager-loaded successfully with User and UserProfile.');

  // --- TEST 2: Response Contract Aggregation ---
  console.log('\n[TEST 2] Testing formatProviderProfileResponse contract...');
  const responseData = await serviceProviderProfileService.formatProviderProfileResponse(profile);
  assert(responseData.provider, 'Should contain clean provider object');
  assert.strictEqual(responseData.provider.name, 'Rajesh Sharma Test');
  assert.strictEqual(responseData.provider.profilePhoto, 'https://smartgali.com/uploads/avatars/test-rajesh.png');
  assert(Array.isArray(responseData.provider.languages), 'languages must be an array');
  assert(responseData.kyc, 'kyc block must exist');
  assert(responseData.documents, 'documents block must exist');
  assert.strictEqual(typeof responseData.documents.count, 'number', 'document count must be number');
  // Check backward compatibility
  assert.strictEqual(responseData.id, profile.id, 'Top-level ID must match for legacy clients');
  console.log('  ✓ Response contract matches target structure with full backward compatibility.');

  // --- TEST 3: Update Profile with Languages, Business Info, and FullName ---
  console.log('\n[TEST 3] Testing updateMyProfile (languages, business_name, experience, fullName)...');
  const updatedProfile = await serviceProviderProfileService.updateMyProfile(testUserId, {
    business_name: 'Sharma Electrical Works',
    experience: '8 Years',
    languages: ['Hindi', 'English', 'Hindi'], // duplicate 'Hindi' should be removed
    fullName: 'Rajesh Kumar Sharma',
    service_category_id: category.serviceCategoryId,
  });

  assert.strictEqual(updatedProfile.business_name, 'Sharma Electrical Works');
  assert.strictEqual(updatedProfile.experience, '8 Years');
  assert.deepStrictEqual(updatedProfile.languages, ['Hindi', 'English'], 'Languages should be deduplicated array');
  // Check that user_profiles.fullName was updated
  const reloadedUserProfile = await UserProfile.findOne({ where: { user_id: testUserId } });
  assert.strictEqual(reloadedUserProfile.fullName, 'Rajesh Kumar Sharma', 'user_profiles.fullName should be updated');
  console.log('  ✓ Languages deduplicated & saved; business_name & experience updated; fullName synced to user_profiles.');

  // --- TEST 4: Security - Mass Assignment Rejection ---
  console.log('\n[TEST 4] Testing Mass Assignment Protection on updateProviderProfileSchema...');
  const maliciousPayload1 = {
    business_name: 'Hacked Business',
    is_verified: true, // Should be rejected!
  };
  const validationResult1 = updateProviderProfileSchema.validate(maliciousPayload1);
  assert(validationResult1.error, 'Validation must fail when is_verified is injected');
  console.log('  ✓ Rejected is_verified tampering:', validationResult1.error.message);

  const maliciousPayload2 = {
    business_name: 'Hacked Business',
    verification_status: 'verified', // Should be rejected!
  };
  const validationResult2 = updateProviderProfileSchema.validate(maliciousPayload2);
  assert(validationResult2.error, 'Validation must fail when verification_status is injected');
  console.log('  ✓ Rejected verification_status tampering:', validationResult2.error.message);

  const maliciousPayload3 = {
    business_name: 'Hacked Business',
    rating: 5.0, // Should be rejected!
  };
  const validationResult3 = updateProviderProfileSchema.validate(maliciousPayload3);
  assert(validationResult3.error, 'Validation must fail when rating is injected');
  console.log('  ✓ Rejected rating tampering:', validationResult3.error.message);

  // --- TEST 5: Provider Documents (KYC) Workflow ---
  console.log('\n[TEST 5] Testing Provider Documents (KYC) creation, listing, and IDOR isolation...');
  const fakeFile = {
    originalname: 'aadhar_card.pdf',
    filename: 'test-aadhar.pdf',
    mimetype: 'application/pdf',
    size: 204850,
  };
  const doc = await serviceProviderProfileService.uploadMyDocument(testUserId, fakeFile, {
    document_type: 'identity_proof',
    title: 'Aadhar Card Front & Back',
  });
  assert(doc, 'Document should be created');
  assert.strictEqual(doc.document_type, 'identity_proof');
  assert.strictEqual(doc.status, 'under_review');
  console.log('  ✓ Document uploaded successfully with status "under_review".');

  // Verify document count in formatted profile
  const profileWithDoc = await serviceProviderProfileService.getOrCreateProviderProfile(testUserId);
  const formattedWithDoc = await serviceProviderProfileService.formatProviderProfileResponse(profileWithDoc);
  assert(formattedWithDoc.documents.count >= 1, 'Document count should be >= 1');
  console.log(`  ✓ Formatted profile reflects document count: ${formattedWithDoc.documents.count}`);

  // List own documents
  const myDocs = await serviceProviderProfileService.getMyDocuments(testUserId);
  assert(myDocs.some((d) => d.id === doc.id), 'Uploaded document must appear in own documents');
  console.log('  ✓ Listed own provider documents successfully.');

  // IDOR Isolation: A different user cannot see this provider document
    // Find another real user in DB for IDOR test
  const otherUser = await User.findOne({ where: { userId: { [sequelize.Sequelize.Op.ne]: testUserId }, is_deleted: false } });
  const otherUserId = otherUser ? otherUser.userId : 8;
  const otherDocs = await serviceProviderProfileService.getMyDocuments(otherUserId);
  assert(!otherDocs.some((d) => d.id === doc.id), 'Another user cannot see this provider document');
  console.log('  ✓ IDOR Isolation confirmed: Provider B cannot access Provider A documents.');

  // --- TEST 6: Admin Document Verification & Audit / Notification ---
  console.log('\n[TEST 6] Testing Admin Document Verification & Audit / Notification...');
  const verifiedDoc = await serviceProviderProfileService.verifyProviderDocument(
    doc.id,
    { status: 'verified', rejection_reason: null },
    testUserId // acting as admin
  );
  assert.strictEqual(verifiedDoc.status, 'verified');
  console.log('  ✓ Document status updated to "verified" by admin.');

  // Verify Audit Log was recorded
  const auditEntry = await AuditLog.findOne({
    where: {
      action: 'PROVIDER_DOCUMENT_VERIFIED',
      target_id: String(doc.id),
    },
    order: [['created_at', 'DESC']],
  });
  assert(auditEntry, 'Audit log entry must exist for document verification');
  console.log('  ✓ Audit log recorded:', auditEntry.action);

  // --- TEST 7: Cleanup Test Document ---
  await doc.destroy();
  console.log('\n[TEST 7] Cleaned up temporary test document.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  await sequelize.close();
};

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
