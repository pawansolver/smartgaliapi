import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';
import ServiceSubcategory from '../src/modules/service_category/service_subcategory.model.js';
import ServiceProviderProfile from '../src/modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../src/modules/service_listing/service_listing.model.js';
import * as listingService from '../src/modules/service_listing/service_listing.service.js';
import * as categoryService from '../src/modules/service_category/service_category.service.js';
import * as providerProfileService from '../src/modules/service_provider_profile/service_provider_profile.service.js';
import AuditLog from '../src/modules/audit_log/audit_log.model.js';
import { isGlobalAdminUser, isSuperAdminUser } from '../src/middleware/auth.middleware.js';

test('SmartGali Admin Category + Subcategory Management & Provider Step 1 E2E Integration Suite', async (t) => {
  const ts = Date.now();
  let adminUser = null;
  let superAdminUser = null;
  let nonAdminUser = null;

  let electricianCategory = null;
  let plumberCategory = null;

  let fanInstallSub = null;
  let smartHomeWiringSub = null;
  let pipeRepairSub = null;
  let inactiveSub = null;

  let verifiedElectricianUser = null;
  let unverifiedElectricianUser = null;
  let createdListingId = null;

  await t.test('Setup: Create Admin Personas, Master Categories, and Verified KYC Provider', async () => {
    // 1. Admin (R002) and Super Admin (R001) users
    adminUser = await User.create({
      userName: 'Admin_R002_' + ts,
      email: 'admin_r002_' + ts + '@smartgali.com',
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });

    superAdminUser = await User.create({
      userName: 'SuperAdmin_R001_' + ts,
      email: 'superadmin_r001_' + ts + '@smartgali.com',
      userRole: 'super_admin',
      is_active: true,
      status: 'active',
    });

    nonAdminUser = await User.create({
      userName: 'ResidentUser_' + ts,
      email: 'resident_' + ts + '@smartgali.com',
      userRole: 'resident',
      is_active: true,
      status: 'active',
    });

    // 2. Initial Categories
    electricianCategory = await ServiceCategory.create({
      serviceCategoryName: 'Electrician_' + ts,
      is_active: true,
      is_deleted: false,
      created_by: adminUser.userId,
    });

    plumberCategory = await ServiceCategory.create({
      serviceCategoryName: 'Plumber_' + ts,
      is_active: true,
      is_deleted: false,
      created_by: adminUser.userId,
    });

    // 3. Existing Subcategories
    fanInstallSub = await ServiceSubcategory.create({
      service_category_id: electricianCategory.serviceCategoryId,
      service_subcategory_name: 'Fan Installation',
      service_subcategory_slug: 'fan-installation',
      is_active: true,
      is_deleted: false,
      created_by: adminUser.userId,
    });

    pipeRepairSub = await ServiceSubcategory.create({
      service_category_id: plumberCategory.serviceCategoryId,
      service_subcategory_name: 'Pipe Repair',
      service_subcategory_slug: 'pipe-repair',
      is_active: true,
      is_deleted: false,
      created_by: adminUser.userId,
    });

    // 4. Provider KYC Personas
    verifiedElectricianUser = await User.create({
      userName: 'VerifiedElectrician_' + ts,
      email: 'ver_elec_e2e_' + ts + '@smartgali.com',
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });
    const p1 = await providerProfileService.getOrCreateProviderProfile(verifiedElectricianUser.userId);
    await p1.update({
      service_category_id: electricianCategory.serviceCategoryId,
      is_verified: true,
      verification_status: 'verified',
    });

    unverifiedElectricianUser = await User.create({
      userName: 'UnverifiedElectrician_' + ts,
      email: 'unver_elec_e2e_' + ts + '@smartgali.com',
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });
    const p2 = await providerProfileService.getOrCreateProviderProfile(unverifiedElectricianUser.userId);
    await p2.update({
      service_category_id: electricianCategory.serviceCategoryId,
      is_verified: false,
      verification_status: 'pending',
    });

    assert.ok(adminUser.userId);
    assert.ok(electricianCategory.serviceCategoryId);
    assert.ok(verifiedElectricianUser.userId);
  });

  // --------------------------------------------------
  // TEST 1 — Admin Category Load
  // --------------------------------------------------
  await t.test('TEST 1 — Admin Category Load: Existing categories load from backend', async () => {
    const categories = await categoryService.getAllCategories();
    assert.ok(Array.isArray(categories), 'Categories must be an array');
    assert.ok(categories.length >= 2, 'Should return at least our 2 test categories');

    const foundElectrician = categories.find(
      (c) => Number(c.serviceCategoryId) === Number(electricianCategory.serviceCategoryId)
    );
    assert.ok(foundElectrician, 'Electrician category must be present in backend response');
    assert.equal(foundElectrician.is_active, true);
    assert.equal(foundElectrician.is_deleted, false);
    assert.ok(Array.isArray(foundElectrician.subcategories), 'Subcategories should be included in response');
  });

  // --------------------------------------------------
  // TEST 2 — Admin Subcategory Load
  // --------------------------------------------------
  await t.test('TEST 2 — Admin Subcategory Load: Subcategories load from backend for category', async () => {
    const subcats = await categoryService.getSubcategoriesByCategory(electricianCategory.serviceCategoryId);
    assert.ok(Array.isArray(subcats), 'Subcategories must be an array');
    assert.ok(subcats.length >= 1, 'Electrician category must contain configured subcategories');

    const foundFan = subcats.find(
      (s) => Number(s.service_subcategory_id) === Number(fanInstallSub.service_subcategory_id)
    );
    assert.ok(foundFan, 'Fan Installation must be present in Electrician subcategories');
    assert.equal(foundFan.service_subcategory_slug, 'fan-installation');
    assert.equal(foundFan.is_active, true);
  });

  // --------------------------------------------------
  // TEST 3 — Admin Creates Subcategory
  // --------------------------------------------------
  await t.test('TEST 3 — Admin Creates Subcategory: "Smart Home Wiring" created via backend service', async () => {
    smartHomeWiringSub = await categoryService.createSubcategory(
      electricianCategory.serviceCategoryId,
      {
        service_subcategory_name: 'Smart Home Wiring',
        service_subcategory_slug: 'smart-home-wiring',
        remark: 'Configured by Admin Panel for IoT smart switch integration',
      },
      adminUser.userId
    );

    assert.ok(smartHomeWiringSub, 'Subcategory must be created');
    assert.ok(smartHomeWiringSub.service_subcategory_id, 'Must have auto-generated ID');
    assert.equal(Number(smartHomeWiringSub.service_category_id), Number(electricianCategory.serviceCategoryId));
    assert.equal(smartHomeWiringSub.service_subcategory_name, 'Smart Home Wiring');
    assert.equal(smartHomeWiringSub.service_subcategory_slug, 'smart-home-wiring');
    assert.equal(smartHomeWiringSub.is_active, true);
    assert.equal(smartHomeWiringSub.is_deleted, false);

    // Verify DB direct query
    const dbSub = await ServiceSubcategory.findByPk(smartHomeWiringSub.service_subcategory_id);
    assert.ok(dbSub, 'Must be stored in service_subcategories table');
    assert.equal(dbSub.service_subcategory_name, 'Smart Home Wiring');
  });

  // --------------------------------------------------
  // TEST 4 — Provider Gets New Subcategory
  // --------------------------------------------------
  await t.test('TEST 4 — Provider Gets New Subcategory: Provider verified as Electrician gets new subcategory dynamically', async () => {
    // Provider fetch simulation: GET /api/v1/service-category/:categoryId/subcategories
    const availableSubs = await categoryService.getSubcategoriesByCategory(electricianCategory.serviceCategoryId);
    assert.ok(Array.isArray(availableSubs));

    const smartWiring = availableSubs.find((s) => s.service_subcategory_name === 'Smart Home Wiring');
    assert.ok(smartWiring, '"Smart Home Wiring" must appear in the backend-fetched subcategories without Flutter changes');
    assert.equal(Number(smartWiring.service_subcategory_id), Number(smartHomeWiringSub.service_subcategory_id));
  });

  // --------------------------------------------------
  // TEST 5 — Provider Selects Valid Subcategory
  // --------------------------------------------------
  await t.test('TEST 5 — Provider Selects Valid Subcategory: Electrician matches verified trade and category belongs', async () => {
    const profile = await ServiceProviderProfile.findOne({
      where: { user_id: verifiedElectricianUser.userId },
    });
    assert.equal(Number(profile.service_category_id), Number(electricianCategory.serviceCategoryId));
    assert.equal(profile.is_verified, true);
    assert.equal(profile.verification_status, 'verified');

    // Verify subcategory matches category
    assert.equal(Number(smartHomeWiringSub.service_category_id), Number(electricianCategory.serviceCategoryId));
  });

  // --------------------------------------------------
  // TEST 6 — Backend Valid Listing
  // --------------------------------------------------
  await t.test('TEST 6 — Backend Valid Listing: 201 Created with verified category and subcategory', async () => {
    const listing = await listingService.createListing({
      title: 'Full Villa Smart Home Automation & Wiring',
      description: 'Complete IoT switchboard wiring, sensor mounting, and electrical safety diagnostics.',
      price: 2499,
      duration: '4 Hours',
      category_id: electricianCategory.serviceCategoryId,
      service_subcategory_id: smartHomeWiringSub.service_subcategory_id,
      highlights: ['Appliance diagnostics', 'Smart relay testing', 'Worksite cleanup'],
      safe_terms: ['Spare parts at MRP', 'Ladder provided by resident'],
    }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });

    assert.ok(listing);
    assert.ok(listing.id);
    createdListingId = listing.id;
    assert.equal(Number(listing.category_id), Number(electricianCategory.serviceCategoryId));
    assert.equal(Number(listing.service_subcategory_id), Number(smartHomeWiringSub.service_subcategory_id));
    assert.equal(listing.title, 'Full Villa Smart Home Automation & Wiring');
  });

  // --------------------------------------------------
  // TEST 7 — Cross-Category Attack
  // --------------------------------------------------
  await t.test('TEST 7 — Cross-Category Attack: Electrician provider claims Plumber category -> 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Unauthorized Plumbing Service Attempt',
          description: 'Electrician attempting to create a plumbing service without verified trade.',
          price: 999,
          category_id: plumberCategory.serviceCategoryId,
          service_subcategory_id: pipeRepairSub.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'Cross-category attack must return 403');
        assert.match(err.message, /Unauthorized category/);
        return true;
      }
    );
  });

  // --------------------------------------------------
  // TEST 8 — Wrong Subcategory Attack
  // --------------------------------------------------
  await t.test('TEST 8 — Wrong Subcategory Attack: Category = Electrician, Subcategory = Plumber subcategory -> 400 Bad Request', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Mismatched Subcategory Exploit Attempt',
          description: 'Using Electrician category with a Plumber subcategory ID.',
          price: 899,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: pipeRepairSub.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 400, 'Mismatched subcategory must return 400');
        assert.match(err.message, /Subcategory does not belong/);
        return true;
      }
    );
  });

  // --------------------------------------------------
  // TEST 9 — Inactive Subcategory
  // --------------------------------------------------
  await t.test('TEST 9 — Inactive Subcategory: Deactivated subcategory disappears from active list and blocks listing creation', async () => {
    // Admin creates then deactivates subcategory
    inactiveSub = await ServiceSubcategory.create({
      service_category_id: electricianCategory.serviceCategoryId,
      service_subcategory_name: 'High Voltage Industrial Fuse Repair',
      service_subcategory_slug: 'high-voltage-fuse-repair',
      is_active: false,
      is_deleted: false,
      created_by: adminUser.userId,
    });

    // Provider fetches subcategories: inactive one must NOT appear
    const subs = await categoryService.getSubcategoriesByCategory(electricianCategory.serviceCategoryId);
    const hasInactive = subs.some((s) => Number(s.service_subcategory_id) === Number(inactiveSub.service_subcategory_id));
    assert.equal(hasInactive, false, 'Inactive subcategory must NOT appear in Provider Step 1 options');

    // Attempting to bypass and create listing with inactive subcategory
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Service Listing With Inactive Subcategory',
          description: 'Attempting to use an inactive subcategory ID.',
          price: 500,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: inactiveSub.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /inactive/);
        return true;
      }
    );
  });

  // --------------------------------------------------
  // TEST 10 — Direct API Bypass
  // --------------------------------------------------
  await t.test('TEST 10 — Direct API Bypass: Arbitrary category_id = 99999 or forged IDs rejected by backend', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Forged Body Injection Bypass Attempt',
          description: 'Hacker sending fictitious category ID to bypass UI lock.',
          price: 1500,
          category_id: 99999,
          service_subcategory_id: smartHomeWiringSub.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Unauthorized category/);
        return true;
      }
    );
  });

  // --------------------------------------------------
  // TEST 11 — Unverified Provider
  // --------------------------------------------------
  await t.test('TEST 11 — Unverified Provider: verification_status = "pending" cannot create listing -> 403', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Unverified Provider Listing Attempt',
          description: 'Provider has not completed KYC verification.',
          price: 300,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: smartHomeWiringSub.service_subcategory_id,
        }, { id: unverifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /KYC verification required/);
        return true;
      }
    );
  });

  // --------------------------------------------------
  // TEST 12 — Admin Authorization
  // --------------------------------------------------
  await t.test('TEST 12 — Admin Authorization: R001 Super Admin and R002 Admin separation', async () => {
    // R002 Admin: possesses global platform admin authority for category/subcategory management
    assert.equal(isGlobalAdminUser(adminUser), true, 'R002 Admin must have category management authority');
    // R002 Admin is NOT Super Admin
    assert.equal(isSuperAdminUser(adminUser), false, 'R002 Admin must NOT possess Super Admin authority');

    // R001 Super Admin: possesses system-level authority
    assert.equal(isGlobalAdminUser(superAdminUser), true, 'R001 Super Admin possesses admin authority');
    assert.equal(isSuperAdminUser(superAdminUser), true, 'R001 Super Admin possesses Super Admin authority');

    // Non-admin (resident/provider) is rejected
    assert.equal(isGlobalAdminUser(nonAdminUser), false, 'Non-admin user cannot access admin management');
    assert.equal(isSuperAdminUser(nonAdminUser), false, 'Non-admin user is not Super Admin');
  });

  // --------------------------------------------------
  // TEST 13 — No Hardcoded Taxonomy
  // --------------------------------------------------
  await t.test('TEST 13 — No Hardcoded Taxonomy: Static audit of Flutter and Admin code', async () => {
    const fsModule = await import('node:fs');

    const adminScreenPath = 'c:/flutter/my_first_app/lib/modules/admin/screens/admin_category_management_screen.dart';
    const providerScreenPath = 'c:/flutter/my_first_app/lib/modules/provider/create_service_screen.dart';

    if (fsModule.existsSync(adminScreenPath)) {
      const adminCode = fsModule.readFileSync(adminScreenPath, 'utf8');
      assert.ok(!adminCode.includes('_categorySubcategories ='), 'Admin screen must not contain hardcoded category subcategories map');
      assert.ok(!adminCode.includes('catMap ='), 'Admin screen must not contain hardcoded category map');
    }

    if (fsModule.existsSync(providerScreenPath)) {
      const providerCode = fsModule.readFileSync(providerScreenPath, 'utf8');
      assert.ok(!providerCode.includes('Map<String, List<String>> _categorySubcategories'), 'Provider Step 1 must not contain hardcoded subcategories taxonomy map');
    }
  });

  // --------------------------------------------------
  // TEST 14 — Persistence
  // --------------------------------------------------
  await t.test('TEST 14 — Persistence: Created records persist across fresh DB queries', async () => {
    const freshCat = await ServiceCategory.findOne({
      where: { serviceCategoryId: electricianCategory.serviceCategoryId },
      include: [{ model: ServiceSubcategory, as: 'subcategories' }],
    });
    assert.ok(freshCat, 'Category must persist in database');
    assert.ok(freshCat.subcategories.length >= 2, 'Subcategories must persist in database');

    const freshSub = await ServiceSubcategory.findByPk(smartHomeWiringSub.service_subcategory_id);
    assert.ok(freshSub, 'Created subcategory must persist in database');
    assert.equal(freshSub.service_subcategory_name, 'Smart Home Wiring');

    const freshListing = await ServiceListing.findByPk(createdListingId);
    assert.ok(freshListing, 'Created listing must persist in database');
  });

  // --------------------------------------------------
  // Cleanup Test Records
  // --------------------------------------------------
  await t.test('Cleanup: Remove test records cleanly', async () => {
    if (createdListingId) {
      await ServiceListing.destroy({ where: { id: createdListingId } });
    }
    await ServiceSubcategory.destroy({
      where: {
        service_category_id: [electricianCategory.serviceCategoryId, plumberCategory.serviceCategoryId],
      },
    });
    await ServiceProviderProfile.destroy({
      where: {
        user_id: [verifiedElectricianUser.userId, unverifiedElectricianUser.userId],
      },
    });
    await ServiceCategory.destroy({
      where: {
        serviceCategoryId: [electricianCategory.serviceCategoryId, plumberCategory.serviceCategoryId],
      },
    });
    await AuditLog.destroy({ where: { actor_id: [adminUser.userId, superAdminUser.userId, nonAdminUser.userId, verifiedElectricianUser.userId, unverifiedElectricianUser.userId] } });
    await User.destroy({
      where: {
        userId: [
          adminUser.userId,
          superAdminUser.userId,
          nonAdminUser.userId,
          verifiedElectricianUser.userId,
          unverifiedElectricianUser.userId,
        ],
      },
    });
  });
});
