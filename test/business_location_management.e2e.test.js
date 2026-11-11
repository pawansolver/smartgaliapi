import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import app from '../src/app.js';
import sequelize from '../src/config/db.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import BusinessCoverageArea from '../src/modules/business_profile/business_coverage_area.model.js';
import SocietyBusinessAccess from '../src/modules/business_profile/society_business_access.model.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import { Locality } from '../src/modules/location_master/location_master.models.js';

const signToken = (user) =>
  jwt.sign(
    {
      id: user.userId,
      userId: user.userId,
      userRole: user.userRole,
    },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

async function apiRequest(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

test('E2E Business Location Management: Create -> Nearby Filtering -> Product Delivery -> Society Governance', async (t) => {
  let server;
  let baseUrl = '';
  let createdBusinessId = null;
  let createdAccessId = null;
  let createdProductId = null;

  await sequelize.authenticate();

  // Start ephemeral HTTP server
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
      resolve();
    });
  });

  t.after(async () => {
    try {
      if (createdProductId) {
        await BusinessProduct.destroy({ where: { id: createdProductId }, force: true });
      }
      if (createdAccessId) {
        await SocietyBusinessAccess.destroy({ where: { id: createdAccessId }, force: true });
      }
      if (createdBusinessId) {
        await SocietyBusinessAccess.destroy({ where: { business_id: createdBusinessId }, force: true });
        await BusinessCoverageArea.destroy({ where: { business_id: createdBusinessId }, force: true });
        await BusinessProfile.destroy({ where: { id: createdBusinessId }, force: true });
      }
    } finally {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
      await sequelize.close();
    }
  });

  // Bootstrap real DB actors & master locations
  const shopOwner = await User.findOne({
    where: { userId: 1, is_deleted: false, is_active: true, status: 'active' },
  });
  assert.ok(shopOwner, 'Shop owner user #1 must be active in DB');

  const baileyRoad = await Locality.findOne({
    where: { id: 4, is_deleted: false },
  });
  assert.ok(baileyRoad, 'Patna Bailey Road locality #4 must exist in DB');

  // Find a society NOT owned by user 1, whose owner is active (or fallback to any society with active owner)
  const societies = await SocietyProfile.findAll({ where: { is_deleted: false } });
  let targetSociety = null;
  let societyAdminUser = null;
  for (const soc of societies) {
    if (!soc.user_id) continue;
    const owner = await User.findOne({
      where: { userId: soc.user_id, is_deleted: false, is_active: true, status: 'active' },
    });
    if (owner) {
      targetSociety = soc;
      societyAdminUser = owner;
      if (Number(soc.user_id) !== Number(shopOwner.userId)) break;
    }
  }
  assert.ok(targetSociety && societyAdminUser, 'Active society and admin user must exist in DB');

  // Pick another distinct society id for isolation checks
  const otherSociety = societies.find((s) => Number(s.id) !== Number(targetSociety.id));

  const shopToken = signToken(shopOwner);
  const societyAdminToken = signToken(societyAdminUser);

  await t.test('1. POST /business-profile saves Patna Location Master IDs & GPS and auto-creates default radius coverage', async () => {
    const payload = {
      userId: shopOwner.userId,
      businessName: `E2E Bailey Mart ${Date.now()}`,
      serviceCategory: 'Grocery & Daily Needs',
      description: 'Fresh grocery delivery in Bailey Road Patna',
      address: 'Boring Crossing, Bailey Road, Patna',
      phone: '9876543210',
      state_id: 1,
      district_id: 41,
      city_id: 1,
      locality_id: baileyRoad.id,
      pincode: '800014',
      latitude: 25.6105,
      longitude: 85.0932,
      coverage_scope: 'PUBLIC',
      default_radius_km: 4.0,
      is_verified: true,
      is_open: true,
    };

    const res = await apiRequest(baseUrl, '/business-profile', {
      method: 'POST',
      token: shopToken,
      body: payload,
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(res.json)}`);
    const biz = res.json.data;
    assert.ok(biz?.id, 'Created business must return ID');
    createdBusinessId = biz.id;

    assert.equal(biz.city_name, 'Patna');
    assert.equal(biz.locality_name, 'Bailey Road');
    assert.equal(biz.coverage_scope, 'PUBLIC');
    assert.equal(Number(biz.default_radius_km), 4);
    assert.ok(Array.isArray(biz.coverage_areas) && biz.coverage_areas.length >= 1, 'Auto default coverage area must be created');
  });

  await t.test('2. GET /business-profile/nearby enforces Haversine GPS, strict radius_km, city_name & Delhi non-match', async () => {
    // 2a. Bailey Road GPS query -> matches BOTH E2E Bailey Mart (~0 km) and Nike Store #101 (~5.9 km)
    const nearbyAll = await apiRequest(
      baseUrl,
      '/business-profile/nearby?latitude=25.6105&longitude=85.0932'
    );
    assert.equal(nearbyAll.status, 200);
    const itemsAll = nearbyAll.json.data?.items || [];
    const baileyMatch = itemsAll.find((b) => Number(b.id) === Number(createdBusinessId));
    const nikeMatch = itemsAll.find((b) => Number(b.id) === 101);
    assert.ok(baileyMatch, 'Newly created Bailey Road business must appear in Patna GPS nearby query');
    assert.ok(baileyMatch.distance_km < 0.5, `Expected Bailey Mart < 0.5km, got ${baileyMatch.distance_km}`);
    assert.ok(nikeMatch, 'Seeded Nike Store #101 must appear in Bailey Road Patna nearby query (within 15km)');
    assert.ok(nikeMatch.distance_km > 4 && nikeMatch.distance_km < 8, `Expected Nike Store ~5.9km, got ${nikeMatch.distance_km}`);

    // 2b. Strict radius_km=2 near Bailey Road -> keeps Bailey Mart (~0km) & filters out Nike Store (~5.9km)
    const nearbyStrict = await apiRequest(
      baseUrl,
      '/business-profile/nearby?latitude=25.6105&longitude=85.0932&radius_km=2'
    );
    assert.equal(nearbyStrict.status, 200);
    const strictIds = (nearbyStrict.json.data?.items || []).map((b) => Number(b.id));
    assert.ok(strictIds.includes(Number(createdBusinessId)), 'Bailey Mart must match radius_km=2');
    assert.ok(!strictIds.includes(101), 'Nike Store (5.9 km) must be filtered out when radius_km=2');

    // 2c. City filter without GPS -> city_name=Patna returns Patna businesses
    const byCity = await apiRequest(baseUrl, '/business-profile/nearby?city_name=Patna');
    assert.equal(byCity.status, 200);
    const cityIds = (byCity.json.data?.items || []).map((b) => Number(b.id));
    assert.ok(cityIds.includes(Number(createdBusinessId)), 'city_name=Patna must include Bailey Mart');
    assert.ok(cityIds.includes(101), 'city_name=Patna must include Nike Store #101');

    // 2d. Non-matching city coordinates (Delhi) -> 0 businesses
    const delhi = await apiRequest(
      baseUrl,
      '/business-profile/nearby?latitude=28.6139&longitude=77.2090'
    );
    assert.equal(delhi.status, 200);
    assert.equal(delhi.json.data?.total, 0, 'Delhi GPS should return 0 Patna businesses');
  });

  await t.test('3. Public storefront product delivery eligibility checks location context (inherit + override)', async () => {
    // 3a. Nike Store #101 public catalog at Bailey Road (Patna, ~5.9km -> deliverable)
    const nikePatna = await apiRequest(
      baseUrl,
      '/business-product/public/101?latitude=25.6105&longitude=85.0932'
    );
    assert.equal(nikePatna.status, 200);
    const patnaProds = Array.isArray(nikePatna.json.data) ? nikePatna.json.data : [];
    assert.ok(patnaProds.length >= 1, 'Nike Store must return public active approved products');
    assert.equal(patnaProds[0].is_deliverable, true);
    assert.match(patnaProds[0].delivery_message, /Delivers to your area/i);

    // 3b. Nike Store #101 public catalog from Delhi -> non-deliverable
    const nikeDelhi = await apiRequest(
      baseUrl,
      '/business-product/public/101?latitude=28.6139&longitude=77.2090'
    );
    assert.equal(nikeDelhi.status, 200);
    const delhiProds = Array.isArray(nikeDelhi.json.data) ? nikeDelhi.json.data : [];
    assert.ok(delhiProds.length >= 1);
    assert.equal(delhiProds[0].is_deliverable, false);

    // 3c. Product-level delivery_coverage override on temporary shop
    // Shop covers 4km radius around Bailey Road (covers both Bailey Road #4 and Boring Road #3 at ~2.7km),
    // but this product overrides delivery_coverage strictly to Bailey Road #4 only.
    const prod = await BusinessProduct.create({
      business_id: createdBusinessId,
      name: 'Locality Override Exclusive Item',
      sku: `E2E-LOC-${Date.now()}`,
      mrp: 249,
      selling_price: 199,
      unit: '1 Pack',
      available_quantity: 10,
      stock_status: 'in_stock',
      status: 'active',
      approval_status: 'approved',
      is_active: true,
      is_deleted: false,
      created_at: new Date(),
      updatedAt: new Date(),
      delivery_coverage: {
        mode: 'CUSTOM',
        locality_ids: [4],
        locality_names: ['Bailey Road'],
      },
    });
    createdProductId = prod.id;

    // Matching shop radius + matching product override locality (#4 Bailey Road) -> deliverable = true
    const matchOverride = await apiRequest(
      baseUrl,
      `/business-product/public/${createdBusinessId}?locality_id=4&latitude=25.6105&longitude=85.0932`
    );
    assert.equal(matchOverride.status, 200);
    const matchList = Array.isArray(matchOverride.json.data) ? matchOverride.json.data : [];
    assert.equal(matchList[0]?.is_deliverable, true);

    // Within shop 4km radius (#3 Boring Road ~2.7km away) -> shop matches, yet product override blocks -> deliverable = false
    const missOverride = await apiRequest(
      baseUrl,
      `/business-product/public/${createdBusinessId}?locality_id=3&latitude=25.6186&longitude=85.1189`
    );
    assert.equal(missOverride.status, 200);
    const missList = Array.isArray(missOverride.json.data) ? missOverride.json.data : [];
    assert.equal(missList[0]?.is_deliverable, false);
    assert.match(missList[0]?.delivery_message || '', /restricted to specific localities/i);
  });

  await t.test('4. Hybrid SOCIETY coverage & Society Admin approval workflow', async () => {
    // 4a. Restrict shop coverage strictly to SOCIETY (targetSociety)
    const putCov = await apiRequest(baseUrl, `/business-profile/${createdBusinessId}/coverage`, {
      method: 'PUT',
      token: shopToken,
      body: {
        coverage_scope: 'SOCIETY',
        coverage_areas: [
          {
            coverage_scope: 'SOCIETY',
            coverage_method: 'SOCIETY',
            society_id: targetSociety.id,
            label: targetSociety.society_name,
          },
        ],
      },
    });
    assert.equal(putCov.status, 200, `Expected 200 updating coverage, got ${putCov.status}: ${JSON.stringify(putCov.json)}`);
    assert.equal(putCov.json.data?.coverage_scope, 'SOCIETY');

    // 4b. Verify shop disappears from public Patna GPS query when scope = SOCIETY
    const pubQuery = await apiRequest(
      baseUrl,
      '/business-profile/nearby?latitude=25.6105&longitude=85.0932'
    );
    assert.equal(pubQuery.status, 200);
    const pubIds = (pubQuery.json.data?.items || []).map((b) => Number(b.id));
    assert.ok(!pubIds.includes(Number(createdBusinessId)), 'SOCIETY-scoped shop must NOT appear in public GPS discovery');

    // 4c. Verify shop is still NOT visible in targetSociety BEFORE society admin approval
    const beforeApprove = await apiRequest(
      baseUrl,
      `/business-profile/nearby?society_id=${targetSociety.id}`
    );
    assert.equal(beforeApprove.status, 200);
    const preIds = (beforeApprove.json.data?.items || []).map((b) => Number(b.id));
    assert.ok(!preIds.includes(Number(createdBusinessId)), 'Unapproved shop must NOT appear in target society discovery');

    // 4d. Shop requests society access
    const reqAccess = await apiRequest(
      baseUrl,
      `/business-profile/${createdBusinessId}/society-access`,
      {
        method: 'POST',
        token: shopToken,
        body: { society_id: targetSociety.id, notes: 'Delivering daily essentials' },
      }
    );
    assert.ok(reqAccess.status === 200 || reqAccess.status === 201, `Unexpected status ${reqAccess.status}: ${JSON.stringify(reqAccess.json)}`);
    createdAccessId = reqAccess.json.data?.id;
    assert.ok(createdAccessId, 'Society access request ID must be returned');
    assert.equal(reqAccess.json.data?.status, 'REQUESTED');

    // 4e. Society Admin views pending request & approves it
    const listPending = await apiRequest(
      baseUrl,
      `/business-profile/society-access/requests?society_id=${targetSociety.id}&status=REQUESTED`,
      { token: societyAdminToken }
    );
    assert.equal(listPending.status, 200);
    const foundPending = (listPending.json.data || []).find((a) => Number(a.id) === Number(createdAccessId));
    assert.ok(foundPending, 'Pending society access request should appear for society admin');

    const approveRes = await apiRequest(
      baseUrl,
      `/business-profile/society-access/${createdAccessId}/approve`,
      { method: 'POST', token: societyAdminToken, body: { remarks: 'Verified local vendor' } }
    );
    assert.equal(approveRes.status, 200, `Expected 200 approve, got ${approveRes.status}: ${JSON.stringify(approveRes.json)}`);
    assert.equal(approveRes.json.data?.status, 'APPROVED');

    // 4f. Now shop IS visible when resident searches with society_id = targetSociety.id
    const afterApprove = await apiRequest(
      baseUrl,
      `/business-profile/nearby?society_id=${targetSociety.id}`
    );
    assert.equal(afterApprove.status, 200);
    const postItems = afterApprove.json.data?.items || [];
    const approvedMatch = postItems.find((b) => Number(b.id) === Number(createdBusinessId));
    assert.ok(approvedMatch, 'Approved shop MUST appear inside approved society discovery');

    // 4g. Other society STILL does NOT see the shop
    if (otherSociety) {
      const otherQuery = await apiRequest(
        baseUrl,
        `/business-profile/nearby?society_id=${otherSociety.id}`
      );
      assert.equal(otherQuery.status, 200);
      const otherIds = (otherQuery.json.data?.items || []).map((b) => Number(b.id));
      assert.ok(!otherIds.includes(Number(createdBusinessId)), 'Other society must NOT see shop approved only for targetSociety');
    }
  });
});
