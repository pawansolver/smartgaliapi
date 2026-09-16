import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import app from '../src/app.js';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import ComplaintCategory from '../src/modules/complaint_master/complaint_category.model.js';
import ComplaintSubCategory from '../src/modules/complaint_master/complaint_sub_category.model.js';
import ComplaintLocationType from '../src/modules/complaint_master/complaint_location_type.model.js';

let server;
let baseUrl;

const issueToken = (user) => {
  return jwt.sign(
    {
      id: user.userId || user.id,
      userId: user.userId || user.id,
      userRole: user.userRole || user.role,
      role: user.userRole || user.role,
    },
    env.jwt.secret,
    { expiresIn: '1h' }
  );
};

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await sequelize.close();
  } catch {}
});

test('Super Admin Complaint Master & Oversight Integration Tests', async (t) => {
  let superAdminUser;
  let residentUser;
  let superAdminToken;
  let residentToken;

  await t.test('Setup test users and tokens', async () => {
    [superAdminUser] = await User.findOrCreate({
      where: { email: 'superadmin_test@smartgali.com' },
      defaults: {
        userName: 'Test SuperAdmin',
        phone: '9999900001',
        password: 'Password123!',
        userRole: 'super_admin',
        is_verified: true,
        status: 'active',
      },
    });
    await superAdminUser.update({ userRole: 'super_admin', is_active: true, status: 'active' });
    superAdminToken = issueToken(superAdminUser);

    [residentUser] = await User.findOrCreate({
      where: { email: 'resident_test@smartgali.com' },
      defaults: {
        userName: 'Test Resident',
        phone: '9999900002',
        password: 'Password123!',
        userRole: 'resident',
        is_verified: true,
        status: 'active',
      },
    });
    await residentUser.update({ userRole: 'resident', is_active: true, status: 'active' });
    residentToken = issueToken(residentUser);

    assert.ok(superAdminToken, 'Super admin token created');
    assert.ok(residentToken, 'Resident token created');
  });

  // ── 1. Authorization Tests ───────────────────────────────────────────────────

  await t.test('RBAC: Anonymous access to admin complaints returns 401', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints`);
    assert.equal(res.status, 401);
  });

  await t.test('RBAC: Resident access to admin complaints returns 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test('RBAC: Resident access to create master category returns 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Category' }),
    });
    assert.equal(res.status, 403);
  });

  await t.test('RBAC: Super Admin access to admin complaints returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
  });

  // ── 2. Category Master CRUD ──────────────────────────────────────────────────

  let createdCatId;
  const testCatName = `Water Supply Test ${Date.now()}`;
  const testCatSlug = `water_supply_${Date.now()}`;

  await t.test('Master: Super Admin can create a new category', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: testCatName,
        slug: testCatSlug,
        description: 'Test category description',
        icon: 'water_drop',
        display_order: 10,
        is_active: true,
      }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.name, testCatName);
    createdCatId = json.data.id;
  });

  await t.test('Master: Duplicate category name is rejected with 409', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: testCatName,
        slug: `other_slug_${Date.now()}`,
      }),
    });
    assert.equal(res.status, 409);
  });

  await t.test('Master: Super Admin can edit a category', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/categories/${createdCatId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Updated test description',
        display_order: 15,
      }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.description, 'Updated test description');
    assert.equal(json.data.display_order, 15);
  });

  // ── 3. Sub-Category Master CRUD ──────────────────────────────────────────────

  let createdSubCatId;
  const testSubCatName = `Low Pressure Test ${Date.now()}`;

  await t.test('Master: Super Admin can create a sub-category under category', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/sub-categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category_id: createdCatId,
        name: testSubCatName,
        description: 'Sub-category test description',
        display_order: 1,
        is_active: true,
      }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.name, testSubCatName);
    assert.equal(json.data.category_id, createdCatId);
    createdSubCatId = json.data.id;
  });

  await t.test('Master: Sub-category queries filter by category_id', async () => {
    const res = await fetch(`${baseUrl}/complaint-sub-categories?category_id=${createdCatId}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.data.length >= 1);
    assert.equal(json.data[0].name, testSubCatName);
  });

  // ── 4. Location Type Master CRUD ─────────────────────────────────────────────

  let createdLocId;
  const testLocName = `Water Tank Area ${Date.now()}`;
  const testLocCode = `water_tank_${Date.now()}`;

  await t.test('Master: Super Admin can create a location type', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/location-types`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: testLocName,
        code: testLocCode,
        description: 'Test location type',
        display_order: 1,
        is_active: true,
      }),
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.name, testLocName);
    createdLocId = json.data.id;
  });

  // ── 5. Inactive Master Behavior ──────────────────────────────────────────────

  await t.test('Master: Super Admin deactivates sub-category', async () => {
    const res = await fetch(`${baseUrl}/admin/complaint-masters/admin/sub-categories/${createdSubCatId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.is_active, false);
  });

  await t.test('Master: Inactive sub-category is hidden from default resident query', async () => {
    const res = await fetch(`${baseUrl}/complaint-sub-categories?category_id=${createdCatId}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    const found = json.data.some((item) => item.id === createdSubCatId);
    assert.equal(found, false, 'Inactive sub-category should not be returned to residents');
  });

  await t.test('Master: Inactive sub-category IS visible to Super Admin with include_inactive=true', async () => {
    const res = await fetch(
      `${baseUrl}/complaint-sub-categories?category_id=${createdCatId}&include_inactive=true`,
      {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      }
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    const found = json.data.some((item) => item.id === createdSubCatId);
    assert.equal(found, true, 'Super Admin should see inactive items with flag');
  });

  // ── 6. Super Admin Global Oversight & Summary ────────────────────────────────

  await t.test('Oversight: Global summary returns accurate statistics schema', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints/summary`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(typeof json.data.total, 'number');
    assert.equal(typeof json.data.open, 'number');
    assert.equal(typeof json.data.assigned, 'number');
    assert.equal(typeof json.data.in_progress, 'number');
    assert.equal(typeof json.data.resolved, 'number');
    assert.equal(typeof json.data.closed, 'number');
    assert.equal(typeof json.data.unassigned, 'number');
  });

  await t.test('Oversight: Global complaints query returns pagination and society info', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.pagination.total >= 0);
    assert.equal(json.pagination.page, 1);
    assert.equal(json.pagination.limit, 5);
    if (json.data.length > 0) {
      assert.ok(json.data[0].id, 'Complaint has id');
      assert.ok(json.data[0].society, 'Complaint includes society metadata');
      assert.ok(json.data[0].user, 'Complaint includes resident metadata');
    }
  });

  await t.test('Oversight: Societies list returns array for dropdowns', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints/societies`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.data));
  });

  // Cleanup test artifacts
  try {
    if (createdSubCatId) await ComplaintSubCategory.destroy({ where: { id: createdSubCatId } });
    if (createdCatId) await ComplaintCategory.destroy({ where: { id: createdCatId } });
    if (createdLocId) await ComplaintLocationType.destroy({ where: { id: createdLocId } });
  } catch {}
});
