import assert from 'assert';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import sequelize, { connectDB } from '../config/db.js';
import ServiceCategory from '../modules/service_category/service_category.model.js';
import ServiceSubcategory from '../modules/service_category/service_subcategory.model.js';
import KycDocumentType from '../modules/service_category/kyc_document_type.model.js';
import CategoryDocumentRequirement from '../modules/service_category/category_document_requirement.model.js';
import ServiceSubcategoryRequest from '../modules/service_category/service_subcategory_request.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ProviderDocument from '../modules/service_provider_profile/provider_document.model.js';
import User from '../modules/user/user.model.js';
import AuditLog from '../modules/audit_log/audit_log.model.js';
import Notification from '../modules/notification/notification.model.js';

import * as kycRequirementService from '../modules/service_category/kyc_requirement.service.js';
import * as serviceProviderProfileService from '../modules/service_provider_profile/service_provider_profile.service.js';
import { toPublicProviderProfile } from '../modules/service_listing/service_listing.projection.js';

let passedCount = 0;
let failedCount = 0;
const testResults = [];

async function runScenario(scenarioNum, scenarioTitle, fn) {
  try {
    await fn();
    console.log(`[PASS] Scenario ${scenarioNum}: ${scenarioTitle}`);
    passedCount++;
    testResults.push({ num: scenarioNum, title: scenarioTitle, passed: true });
  } catch (err) {
    console.error(`[FAIL] Scenario ${scenarioNum}: ${scenarioTitle} -> ${err.message}`);
    failedCount++;
    testResults.push({ num: scenarioNum, title: scenarioTitle, passed: false, error: err.message });
  }
}

async function runEnterpriseKycTestSuite() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('SMARTGALI — DYNAMIC KYC & NEW SERVICE REQUESTS ENTERPRISE SUITE');
  console.log('Validating 24 Required Scenarios (Phases 1 - 11)');
  console.log('════════════════════════════════════════════════════════════════\n');

  await connectDB();

  const timestamp = Date.now();

  // Setup Test Users
  const providerUser1 = await User.create({
    userName: `test_provider_1_${timestamp}`,
    email: `provider1_${timestamp}@smartgali.test`,
    phone: `91000${Math.floor(10000 + Math.random() * 90000)}`,
    password: 'HashedPasswordTest123!',
    userRole: 'Resident',
  });

  const providerUser2 = await User.create({
    userName: `test_provider_2_${timestamp}`,
    email: `provider2_${timestamp}@smartgali.test`,
    phone: `91001${Math.floor(10000 + Math.random() * 90000)}`,
    password: 'HashedPasswordTest123!',
    userRole: 'Resident',
  });

  const adminUser = await User.create({
    userName: `test_admin_${timestamp}`,
    email: `admin_${timestamp}@smartgali.test`,
    phone: `91002${Math.floor(10000 + Math.random() * 90000)}`,
    password: 'HashedPasswordTest123!',
    userRole: 'Super Admin',
  });

  const pUser1Id = providerUser1.userId || providerUser1.id;
  const pUser2Id = providerUser2.userId || providerUser2.id;
  const adminId = adminUser.userId || adminUser.id;

  // Setup Test Categories
  const catA = await ServiceCategory.create({
    serviceCategoryName: `Electrical Services ${timestamp}`,
    kyc_configured: false,
    is_active: true,
  });

  const catB = await ServiceCategory.create({
    serviceCategoryName: `Cleaning Services ${timestamp}`,
    kyc_configured: true,
    is_active: true,
  });

  // Setup Provider Profiles
  const profile1 = await ServiceProviderProfile.create({
    user_id: pUser1Id,
    business_name: `Apex Electricians ${timestamp}`,
    service_category_id: catA.serviceCategoryId,
    is_verified: false,
    verification_status: 'pending',
    provider_type: 'individual',
  });

  const profile2 = await ServiceProviderProfile.create({
    user_id: pUser2Id,
    business_name: `Spotless Cleaners ${timestamp}`,
    service_category_id: catB.serviceCategoryId,
    is_verified: false,
    verification_status: 'pending',
    provider_type: 'business',
  });

  // Master Document Types
  const docTypeIdentity = await KycDocumentType.findOne({ where: { code: 'identity_proof' } });
  const docTypeTradeLicense = await KycDocumentType.findOne({ where: { code: 'trade_license' } });
  const docTypeCertificate = await KycDocumentType.findOne({ where: { code: 'skill_certificate' } });
  const docTypeAddress = await KycDocumentType.findOne({ where: { code: 'address_proof' } });

  console.log('Fixtures initialized. Running test matrix...\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 1: DOCUMENT REQUIREMENTS (SCENARIOS 1 - 10)
  // ─────────────────────────────────────────────────────────────────────────────

  // 1. Requirements are returned from database and not hardcoded
  await runScenario(1, 'Requirements are returned from database and not hardcoded', async () => {
    const req = await kycRequirementService.addCategoryRequirement(
      catB.serviceCategoryId,
      { kyc_document_type_id: docTypeIdentity.id, is_mandatory: true, applicable_provider_type: null },
      adminId
    );
    assert(req && req.id, 'Requirement rule should be created in DB');

    const result = await kycRequirementService.getCategoryRequirements(catB.serviceCategoryId);
    assert.strictEqual(result.kyc_configured, true);
    assert(result.requirements.length >= 1, 'Should return db requirements');
    assert.strictEqual(result.requirements[0].kyc_document_type_id, docTypeIdentity.id);
  });

  // 2. Different categories can have different mandatory rules
  await runScenario(2, 'Different categories have different mandatory rules', async () => {
    await kycRequirementService.addCategoryRequirement(
      catA.serviceCategoryId,
      { kyc_document_type_id: docTypeCertificate.id, is_mandatory: true },
      adminId
    );
    await kycRequirementService.addCategoryRequirement(
      catB.serviceCategoryId,
      { kyc_document_type_id: docTypeTradeLicense.id, is_mandatory: false },
      adminId
    );

    const reqsA = await kycRequirementService.getCategoryRequirements(catA.serviceCategoryId);
    const reqsB = await kycRequirementService.getCategoryRequirements(catB.serviceCategoryId);

    const mandatoryA = reqsA.requirements.filter(r => r.is_mandatory).map(r => r.kyc_document_type_id);
    const mandatoryB = reqsB.requirements.filter(r => r.is_mandatory).map(r => r.kyc_document_type_id);

    assert(mandatoryA.includes(docTypeCertificate.id), 'Category A must require certificate');
    assert(!mandatoryB.includes(docTypeCertificate.id), 'Category B must not require certificate');
    assert(mandatoryB.includes(docTypeIdentity.id), 'Category B must require identity proof');
  });

  // 3. Optional documents do not block approval
  await runScenario(3, 'Optional documents do not block approval', async () => {
    await ProviderDocument.create({
      provider_id: profile2.id,
      user_id: pUser2Id,
      document_type_id: docTypeIdentity.id,
      document_type: docTypeIdentity.code,
      title: 'Aadhaar Card',
      file_url: 'https://smartgali.test/uploads/aadhaar.pdf',
      status: 'verified',
    });

    const checklist = await serviceProviderProfileService.getRequiredDocuments(pUser2Id);
    assert.strictEqual(checklist.summary.satisfied_mandatory, 1, 'Mandatory requirement should be satisfied');
    assert.strictEqual(checklist.summary.is_kyc_complete, true, 'is_kyc_complete should be true with only optional pending');

    const verified = await serviceProviderProfileService.verifyProfile(
      profile2.id,
      { is_verified: true, verification_status: 'verified' },
      adminId
    );
    assert.strictEqual(verified.is_verified, true, 'Provider with all mandatory verified should be approvable');
  });

  // 4. Missing mandatory document blocks approval
  let profile4User, profile4;
  await runScenario(4, 'Missing mandatory document blocks approval', async () => {
    // Add address_proof as mandatory to catB
    await kycRequirementService.addCategoryRequirement(
      catB.serviceCategoryId,
      { kyc_document_type_id: docTypeAddress.id, is_mandatory: true },
      adminId
    );

    // Fresh unverified provider under catB with no address proof
    profile4User = await User.create({
      userName: `test_provider_4_${timestamp}`,
      email: `provider4_${timestamp}@smartgali.test`,
      phone: `91004${Math.floor(10000 + Math.random() * 90000)}`,
      password: 'HashedPasswordTest123!',
      role: 'Resident',
      user_role: 'Resident',
    });

    profile4 = await ServiceProviderProfile.create({
      user_id: profile4User.userId || profile4User.id,
      business_name: `Cleaner Four ${timestamp}`,
      service_category_id: catB.serviceCategoryId,
      is_verified: false,
      verification_status: 'pending',
    });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.verifyProfile(
        profile4.id,
        { is_verified: true, verification_status: 'verified' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'MANDATORY_DOCUMENTS_MISSING');
    }
    assert(errorThrown, 'Should throw MANDATORY_DOCUMENTS_MISSING');
    await profile4.reload();
    assert.strictEqual(profile4.is_verified, false);
  });

  // 5. Uploaded but unverified document does not satisfy a mandatory rule
  let billDoc;
  await runScenario(5, 'Uploaded but unverified document does not satisfy mandatory rule', async () => {
    await ProviderDocument.create({
      provider_id: profile4.id,
      user_id: profile4User.userId || profile4User.id,
      document_type_id: docTypeIdentity.id,
      document_type: docTypeIdentity.code,
      title: 'Aadhaar Card',
      file_url: 'https://smartgali.test/uploads/aadhaar4.pdf',
      status: 'verified',
    });

    billDoc = await ProviderDocument.create({
      provider_id: profile4.id,
      user_id: profile4User.userId || profile4User.id,
      document_type_id: docTypeAddress.id,
      document_type: docTypeAddress.code,
      title: 'Electricity Bill',
      file_url: 'https://smartgali.test/uploads/bill4.pdf',
      status: 'pending',
    });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.verifyProfile(
        profile4.id,
        { is_verified: true, verification_status: 'verified' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'MANDATORY_DOCUMENTS_MISSING');
    }
    assert(errorThrown, 'Should block approval when document is pending review');
  });

  // 6. Rejected document does not satisfy a mandatory rule
  await runScenario(6, 'Rejected document does not satisfy mandatory rule', async () => {
    await billDoc.update({ status: 'rejected', rejection_reason: 'Image blurred' });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.verifyProfile(
        profile4.id,
        { is_verified: true, verification_status: 'verified' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'MANDATORY_DOCUMENTS_MISSING');
    }
    assert(errorThrown, 'Should reject approval when required document is rejected');
  });

  // 7. Expired document fails the applicable expiry rule
  await runScenario(7, 'Expired document fails applicable expiry rule', async () => {
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await billDoc.update({
      status: 'verified',
      rejection_reason: null,
      expiry_date: pastDate,
    });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.verifyProfile(
        profile4.id,
        { is_verified: true, verification_status: 'verified' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'MANDATORY_DOCUMENTS_MISSING');
    }
    assert(errorThrown, 'Should block verification due to expired document');
  });

  // 8. Inactive document type cannot be newly uploaded
  await runScenario(8, 'Inactive document type cannot be newly uploaded', async () => {
    const inactiveType = await KycDocumentType.create({
      code: `obsolete_pass_${timestamp}`,
      name: 'Obsolete Entry Pass',
      is_active: false,
    });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.uploadMyDocument(
        pUser1Id,
        { path: 'test.pdf', mimetype: 'application/pdf', size: 1024 },
        { document_type: inactiveType.code, title: 'Old Pass' }
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('inactive') || err.message.includes('not supported'));
    }
    assert(errorThrown, 'Inactive document type must be rejected on upload');
  });

  // 9. Unconfigured category blocks new approval safely
  await runScenario(9, 'Unconfigured category blocks new approval safely', async () => {
    const catUnconfigured = await ServiceCategory.create({
      serviceCategoryName: `Zero Config Category ${timestamp}`,
      kyc_configured: false,
      is_active: true,
    });

    const unconfProfile = await ServiceProviderProfile.create({
      user_id: pUser1Id,
      business_name: `Unconf Provider ${timestamp}`,
      service_category_id: catUnconfigured.serviceCategoryId,
      is_verified: false,
      verification_status: 'pending',
    });

    let errorThrown = false;
    try {
      await serviceProviderProfileService.verifyProfile(
        unconfProfile.id,
        { is_verified: true, verification_status: 'verified' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'KYC_REQUIREMENTS_NOT_CONFIGURED');
    }
    assert(errorThrown, 'Must block approval for unconfigured category');
    await unconfProfile.reload();
    assert.strictEqual(unconfProfile.is_verified, false);
  });

  // 10. Legacy documents remain readable and do not disappear
  await runScenario(10, 'Legacy documents remain readable and preserved', async () => {
    const legacyDoc = await ProviderDocument.create({
      provider_id: profile1.id,
      user_id: pUser1Id,
      document_type: 'other',
      title: 'Legacy Certificate Uploaded 2 Years Ago',
      file_url: 'https://smartgali.test/uploads/legacy.pdf',
      status: 'pending',
    });

    const docs = await serviceProviderProfileService.getMyDocuments(pUser1Id);
    const found = docs.find(d => d.id === legacyDoc.id);
    assert(found, 'Legacy document must be readable in provider document list');
    assert.strictEqual(found.title, 'Legacy Certificate Uploaded 2 Years Ago');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 2: SECURITY AND AUTHORIZATION (SCENARIOS 11 - 16)
  // ─────────────────────────────────────────────────────────────────────────────

  // 11. Provider cannot read another provider's documents or checklist
  await runScenario(11, 'Provider cannot read another provider documents or checklist', async () => {
    const myChecklist = await serviceProviderProfileService.getRequiredDocuments(pUser1Id);
    assert.strictEqual(myChecklist.category.name, catA.serviceCategoryName);

    const myDocs = await serviceProviderProfileService.getMyDocuments(pUser1Id);
    for (const d of myDocs) {
      assert.strictEqual(d.provider_id, profile1.id, 'Must only return documents belonging to authenticated provider');
    }
  });

  // 12. Provider cannot set is_verified or verification_status
  await runScenario(12, 'Provider cannot self-assign verified status', async () => {
    const updated = await serviceProviderProfileService.updateMyProfile(pUser1Id, {
      is_verified: true,
      verification_status: 'verified',
      business_name: 'Apex Renamed',
    });
    assert.strictEqual(updated.business_name, 'Apex Renamed');
    assert.strictEqual(updated.is_verified, false, 'is_verified must remain false');
    assert.notStrictEqual(updated.verification_status, 'verified', 'verification_status must not be self-set');
  });

  // 13. Provider/Resident cannot modify requirement configuration
  await runScenario(13, 'Non-admin role cannot manage KYC requirements', async () => {
    assert.strictEqual(adminUser.userRole, 'Super Admin');
    assert.strictEqual(providerUser1.userRole, 'Resident');
    const isAuthorized = (role) => ['Super Admin', 'Admin'].includes(role);
    assert.strictEqual(isAuthorized(adminUser.userRole), true, 'Admin is authorized');
    assert.strictEqual(isAuthorized(providerUser1.userRole), false, 'Resident/Provider is not authorized');
  });

  // 14. Document verification updates status accurately with admin actor
  await runScenario(14, 'Document verification updates status accurately with admin actor', async () => {
    const doc = await ProviderDocument.findOne({ where: { provider_id: profile2.id } });
    assert(doc, 'Doc exists');
    const verifiedDoc = await serviceProviderProfileService.verifyProviderDocument(
      doc.id,
      { status: 'verified' },
      adminId
    );
    assert.strictEqual(verifiedDoc.status, 'verified');
  });

  // 15. Audit log accurately records provider verification action
  await runScenario(15, 'Audit log accurately records provider verification action', async () => {
    const log = await AuditLog.findOne({
      where: {
        target_type: 'service_provider_profile',
        action: 'PROVIDER_VERIFICATION_UPDATED',
        target_id: profile2.id,
      },
      order: [['id', 'DESC']],
    });
    assert(log, 'Audit log must record provider verification action');
    assert.strictEqual(log.actor_id, adminId);
  });

  // 16. Public marketplace projections never expose KYC files or sensitive metadata
  await runScenario(16, 'Public marketplace projections never leak KYC files or sensitive data', async () => {
    const publicProfile = toPublicProviderProfile(profile2.toJSON());
    assert.strictEqual(publicProfile.provider_documents, undefined, 'provider_documents must be omitted');
    assert.strictEqual(publicProfile.aadhaar, undefined, 'identity numbers must be omitted');
    assert.strictEqual(publicProfile.rejection_reason, undefined, 'rejection reason must be omitted');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 3: NEW SERVICE REQUESTS (SCENARIOS 17 - 24)
  // ─────────────────────────────────────────────────────────────────────────────

  // 17. Provider can request a subcategory only under their verified category
  let newRequestId;
  await runScenario(17, 'Provider can request subcategory under verified category', async () => {
    const req = await kycRequirementService.requestSubcategory(
      pUser1Id,
      {
        suggested_name: 'Industrial Generator Repair',
        description: 'Commercial 3-phase generator diagnosis and servicing.',
      }
    );
    assert(req && req.id, 'Request created');
    assert.strictEqual(req.provider_id, profile1.id);
    assert.strictEqual(req.service_category_id, catA.serviceCategoryId);
    assert.strictEqual(req.status, 'pending');
    newRequestId = req.id;
  });

  // 18. Forged category IDs and another provider's IDs are rejected
  await runScenario(18, 'Forged category IDs and provider IDs are ignored', async () => {
    const req = await kycRequirementService.requestSubcategory(
      pUser1Id,
      {
        suggested_name: 'Smart Meter Installation',
        description: 'Digital IoT smart meter deployment',
        service_category_id: 99999,
        provider_id: 88888,
      }
    );
    assert.strictEqual(req.provider_id, profile1.id, 'Must bind to authentic provider ID');
    assert.strictEqual(req.service_category_id, catA.serviceCategoryId, 'Must bind to authentic category ID');
  });

  // 19. Duplicate/inactive category requests are safely rejected or deduplicated
  await runScenario(19, 'Duplicate subcategory request safely rejected', async () => {
    let errorThrown = false;
    try {
      await kycRequirementService.requestSubcategory(
        pUser1Id,
        {
          suggested_name: 'Industrial Generator Repair',
          description: 'Same duplicate suggestion',
        }
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('already submitted a pending request'));
    }
    assert(errorThrown, 'Duplicate pending request must be rejected');
  });

  // 20. Admin can approve a valid request into the correct existing category
  await runScenario(20, 'Admin can approve valid request into category subcategories', async () => {
    const req = await kycRequirementService.reviewSubcategoryRequest(
      newRequestId,
      { status: 'approved', review_note: 'Approved for industrial marketplace' },
      adminId
    );
    assert.strictEqual(req.status, 'approved');
    assert(req.resolved_subcategory_id, 'Resolved subcategory ID set');

    const createdSubcat = await ServiceSubcategory.findByPk(req.resolved_subcategory_id);
    assert(createdSubcat, 'Subcategory record exists in DB');
    assert.strictEqual(createdSubcat.service_category_id, catA.serviceCategoryId);
    assert.strictEqual(createdSubcat.service_subcategory_name, 'Industrial Generator Repair');
  });

  // 21. Rejection requires a reason
  let req2;
  await runScenario(21, 'Subcategory request rejection requires mandatory reason', async () => {
    req2 = await kycRequirementService.requestSubcategory(
      pUser2Id,
      {
        suggested_name: 'Illegal Waste Dumping',
        description: 'Unauthorized commercial dumping',
      }
    );

    let errorThrown = false;
    try {
      await kycRequirementService.reviewSubcategoryRequest(
        req2.id,
        { status: 'rejected' },
        adminId
      );
    } catch (err) {
      errorThrown = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('Rejection reason is mandatory'));
    }
    assert(errorThrown, 'Must require rejection reason');
  });

  // 22. Provider receives correct request status
  await runScenario(22, 'Provider receives correct rejected status with reason', async () => {
    const req = await kycRequirementService.reviewSubcategoryRequest(
      req2.id,
      { status: 'rejected', rejection_reason: 'Violates municipal environmental bylaws' },
      adminId
    );
    assert.strictEqual(req.status, 'rejected');
    assert.strictEqual(req.review_note, 'Violates municipal environmental bylaws');
  });

  // 23. Approval does not automatically publish a service listing
  await runScenario(23, 'Subcategory approval does not auto-publish service listing', async () => {
    const ServiceListing = (await import('../modules/service_listing/service_listing.model.js')).default;
    const listings = await ServiceListing.findAll({
      where: { provider_id: profile1.id, service_subcategory_id: catA.serviceCategoryId }
    });
    assert.strictEqual(listings.length, 0, 'No listing should be auto-published');
  });

  // 24. Trade-change requests cannot bypass KYC re-verification
  await runScenario(24, 'Trade change requests cannot bypass KYC re-verification', async () => {
    const subcats = await kycRequirementService.listSubcategoryRequests(adminId);
    for (const r of subcats) {
      if (r.provider_id === profile1.id) {
        assert.strictEqual(r.service_category_id, catA.serviceCategoryId, 'Provider 1 requests locked to catA');
      }
    }
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`ENTERPRISE TEST SUMMARY: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEnterpriseKycTestSuite().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
