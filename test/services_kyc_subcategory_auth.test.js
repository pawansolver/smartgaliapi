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

test('SmartGali Enterprise Category + Subcategory + KYC Trade Authorization Security Test Suite', async (t) => {
  const ts = Date.now();
  let electricianCategory = null;
  let plumberCategory = null;
  let electricianSub1 = null;
  let electricianSub2 = null;
  let plumberSub1 = null;

  let verifiedElectricianUser = null;
  let unverifiedElectricianUser = null;
  let underReviewElectricianUser = null;
  let rejectedElectricianUser = null;

  await t.test('Setup: Create Master Categories, Subcategories, and KYC Personas', async () => {
    // Categories
    electricianCategory = await ServiceCategory.create({
      serviceCategoryName: `Electrician_${ts}`,
      is_active: true,
      is_deleted: false,
    });

    plumberCategory = await ServiceCategory.create({
      serviceCategoryName: `Plumber_${ts}`,
      is_active: true,
      is_deleted: false,
    });

    // Subcategories under Electrician
    electricianSub1 = await ServiceSubcategory.create({
      service_category_id: electricianCategory.serviceCategoryId,
      service_subcategory_name: 'Fan Installation & Repair',
      service_subcategory_slug: 'fan-installation-repair',
      is_active: true,
      is_deleted: false,
    });

    electricianSub2 = await ServiceSubcategory.create({
      service_category_id: electricianCategory.serviceCategoryId,
      service_subcategory_name: 'Switch & Socket Wiring',
      service_subcategory_slug: 'switch-socket-wiring',
      is_active: true,
      is_deleted: false,
    });

    // Subcategory under Plumber
    plumberSub1 = await ServiceSubcategory.create({
      service_category_id: plumberCategory.serviceCategoryId,
      service_subcategory_name: 'Pipe Leakage Repair',
      service_subcategory_slug: 'pipe-leakage-repair',
      is_active: true,
      is_deleted: false,
    });

    // 1. Verified Electrician
    verifiedElectricianUser = await User.create({
      userName: `VerElectrician_${ts}`,
      email: `ver_elec_${ts}@smartgali.com`,
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

    // 2. Unverified Electrician
    unverifiedElectricianUser = await User.create({
      userName: `UnverElectrician_${ts}`,
      email: `unver_elec_${ts}@smartgali.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });
    const p2 = await providerProfileService.getOrCreateProviderProfile(unverifiedElectricianUser.userId);
    await p2.update({
      service_category_id: electricianCategory.serviceCategoryId,
      is_verified: false,
      verification_status: 'notSubmitted',
    });

    // 3. Under-Review Electrician
    underReviewElectricianUser = await User.create({
      userName: `ReviewElectrician_${ts}`,
      email: `review_elec_${ts}@smartgali.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });
    const p3 = await providerProfileService.getOrCreateProviderProfile(underReviewElectricianUser.userId);
    await p3.update({
      service_category_id: electricianCategory.serviceCategoryId,
      is_verified: false,
      verification_status: 'underReview',
    });

    // 4. Rejected Electrician
    rejectedElectricianUser = await User.create({
      userName: `RejElectrician_${ts}`,
      email: `rej_elec_${ts}@smartgali.com`,
      userRole: 'service_provider',
      is_active: true,
      status: 'active',
    });
    const p4 = await providerProfileService.getOrCreateProviderProfile(rejectedElectricianUser.userId);
    await p4.update({
      service_category_id: electricianCategory.serviceCategoryId,
      is_verified: false,
      verification_status: 'rejected',
    });

    assert.ok(electricianCategory.serviceCategoryId);
    assert.ok(plumberCategory.serviceCategoryId);
    assert.ok(electricianSub1.service_subcategory_id);
  });

  await t.test('TEST 1: Verified Electrician creates Electrician service -> 201 Created', async () => {
    const listing = await listingService.createListing({
      title: 'Ceiling Fan Installation',
      description: 'Professional high-speed fan installation with balancing.',
      price: 299,
      duration: '45 mins',
      category_id: electricianCategory.serviceCategoryId,
    }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });

    assert.ok(listing.id);
    assert.equal(Number(listing.category_id), Number(electricianCategory.serviceCategoryId));
    assert.equal(listing.title, 'Ceiling Fan Installation');
  });

  await t.test('TEST 2: Verified Electrician tries Plumber category -> 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Bathroom Tap Leakage Repair',
          description: 'Fix dripping faucets and washers.',
          price: 199,
          duration: '30 mins',
          category_id: plumberCategory.serviceCategoryId, // Unauthorized trade
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Unauthorized category/);
        return true;
      }
    );
  });

  await t.test('TEST 3: Unverified Electrician tries Electrician service -> 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Switch Board Repair',
          description: 'Replace faulty switches and wiring.',
          price: 150,
          category_id: electricianCategory.serviceCategoryId,
        }, { id: unverifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /KYC verification required/);
        return true;
      }
    );
  });

  await t.test('TEST 4: Under-review provider tries service -> 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Fuse Repair Service',
          description: 'Emergency fuse and main switch repair.',
          price: 200,
          category_id: electricianCategory.serviceCategoryId,
        }, { id: underReviewElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /KYC verification is still in progress/);
        return true;
      }
    );
  });

  await t.test('TEST 5: Rejected provider tries service -> 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Light Point Fixing',
          description: 'Add new light points in rooms.',
          price: 180,
          category_id: electricianCategory.serviceCategoryId,
        }, { id: rejectedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /KYC verification was rejected/);
        return true;
      }
    );
  });

  await t.test('TEST 6: Electrician + valid Electrician subcategory -> 201 Created', async () => {
    const listing = await listingService.createListing({
      title: 'Switch & Socket Wiring Check',
      description: 'Comprehensive switchboard testing and socket replacement.',
      price: 349,
      duration: '60 mins',
      category_id: electricianCategory.serviceCategoryId,
      service_subcategory_id: electricianSub2.service_subcategory_id,
    }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });

    assert.ok(listing.id);
    assert.equal(Number(listing.service_subcategory_id), Number(electricianSub2.service_subcategory_id));
    assert.equal(listing.subcategory.service_subcategory_name, 'Switch & Socket Wiring');
  });

  await t.test('TEST 7: Electrician + Plumber subcategory -> 400 Bad Request', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Hacked Service with Wrong Subcategory',
          description: 'Trying to sneak a plumbing subcategory into electrician listing.',
          price: 499,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: plumberSub1.service_subcategory_id, // Belongs to Plumber, not Electrician!
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Subcategory does not belong to the selected service category/);
        return true;
      }
    );
  });

  await t.test('TEST 8: Invalid/nonexistent subcategory -> 400 Bad Request', async () => {
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Fake Subcategory Test',
          description: 'Testing non-existent subcategory ID 99999999.',
          price: 499,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: 99999999,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Selected subcategory does not exist or is inactive/);
        return true;
      }
    );
  });

  await t.test('TEST 9: Inactive/deleted category -> 400 Bad Request', async () => {
    const inactiveCat = await ServiceCategory.create({
      serviceCategoryName: `InactiveCat_${ts}`,
      is_active: false,
    });

    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Service in Inactive Category',
          price: 199,
          category_id: inactiveCat.serviceCategoryId,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.ok(err.statusCode === 400 || err.statusCode === 403);
        return true;
      }
    );
  });

  await t.test('TEST 10: Inactive/deleted subcategory -> 400 Bad Request', async () => {
    const inactiveSub = await ServiceSubcategory.create({
      service_category_id: electricianCategory.serviceCategoryId,
      service_subcategory_name: 'Obsolete Fan Repair',
      service_subcategory_slug: 'obsolete-fan-repair',
      is_active: false, // Inactive
      is_deleted: false,
    });

    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Service in Inactive Subcategory',
          price: 199,
          category_id: electricianCategory.serviceCategoryId,
          service_subcategory_id: inactiveSub.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Selected subcategory does not exist or is inactive/);
        return true;
      }
    );
  });

  await t.test('TEST 11: GET /api/v1/service-category/:categoryId/subcategories returns only matching active subcategories', async () => {
    const subs = await categoryService.getSubcategoriesByCategory(electricianCategory.serviceCategoryId);
    assert.ok(Array.isArray(subs));
    assert.ok(subs.length >= 2);
    // Verify all returned subcategories belong to electricianCategory
    for (const s of subs) {
      assert.equal(Number(s.service_category_id), Number(electricianCategory.serviceCategoryId));
      assert.equal(s.is_active, true);
      assert.equal(s.is_deleted, false);
    }
    // Verify plumberSub1 is NOT present in electrician results
    assert.ok(!subs.some(s => Number(s.service_subcategory_id) === Number(plumberSub1.service_subcategory_id)));
  });

  await t.test('TEST 12: Direct API manipulation with forged category or subcategory is completely blocked', async () => {
    // Malicious request attempt: user manipulates body to claim category_id = 9999 or mismatch
    await assert.rejects(
      async () => {
        await listingService.createListing({
          title: 'Direct API Injection Exploit Attempt',
          description: 'Hacker attempting to bypass UI constraints directly via API.',
          price: 999,
          category_id: plumberCategory.serviceCategoryId,
          service_subcategory_id: electricianSub1.service_subcategory_id,
        }, { id: verifiedElectricianUser.userId, userRole: 'service_provider' });
      },
      (err) => {
        // Backend blocks at category ownership check (403) before even saving!
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Unauthorized category/);
        return true;
      }
    );
  });

  await t.test('Cleanup test records', async () => {
    await ServiceListing.destroy({ where: { created_by: [verifiedElectricianUser.userId, unverifiedElectricianUser.userId] } });
    await ServiceSubcategory.destroy({ where: { service_category_id: [electricianCategory.serviceCategoryId, plumberCategory.serviceCategoryId] } });
    await ServiceProviderProfile.destroy({ where: { user_id: [verifiedElectricianUser.userId, unverifiedElectricianUser.userId, underReviewElectricianUser.userId, rejectedElectricianUser.userId] } });
    await ServiceCategory.destroy({ where: { serviceCategoryId: [electricianCategory.serviceCategoryId, plumberCategory.serviceCategoryId] } });
    await User.destroy({ where: { userId: [verifiedElectricianUser.userId, unverifiedElectricianUser.userId, underReviewElectricianUser.userId, rejectedElectricianUser.userId] } });
  });
});
