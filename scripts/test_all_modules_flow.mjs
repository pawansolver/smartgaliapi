import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import sequelize from '../src/config/db.js';

const superAdminPayload = {
  userId: 6,
  sub: 6,
  userRole: 'super_admin',
  email: 'admin@smartgali.com',
  role: 'super_admin',
};

const token = jwt.sign(
  superAdminPayload,
  'smartgali_super_secure_jwt_secret_key_2026_dev',
  { expiresIn: '2h' }
);

async function testAllModules() {
  console.log('================================================================');
  console.log('FULL ADMIN PANEL FUNCTIONAL CHECK — EVERY MODULE VERIFICATION');
  console.log('================================================================');

  const server = app.listen(0);
  const port = server.address().port;
  const API_BASE = `http://127.0.0.1:${port}/api/v1`;

  const request = async (endpoint, method = 'GET', body = null) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // ==========================================
    // MODULE 1: OVERVIEW DASHBOARD
    // ==========================================
    console.log('\n--- 1. OVERVIEW DASHBOARD MODULE ---');
    const summaryRes = await request('/super-admin/complaints/summary');
    assert(summaryRes.status === 200, 'GET /super-admin/complaints/summary responds with 200');
    assert(typeof summaryRes.data.data.total === 'number', 'Summary contains numeric "total" metric');
    assert(typeof summaryRes.data.data.open === 'number', 'Summary contains numeric "open" metric');
    assert(typeof summaryRes.data.data.resolved === 'number', 'Summary contains numeric "resolved" metric');

    const societiesRes = await request('/super-admin/complaints/societies');
    assert(societiesRes.status === 200, 'GET /super-admin/complaints/societies responds with 200');
    assert(Array.isArray(societiesRes.data.data), 'Societies list returns array for dropdown filter');

    const filteredSummaryRes = await request('/super-admin/complaints/summary?society_id=8');
    assert(filteredSummaryRes.status === 200, 'GET /super-admin/complaints/summary with society_id filter responds with 200');

    // ==========================================
    // MODULE 2: ALL COMPLAINTS (SEARCH & FILTERS)
    // ==========================================
    console.log('\n--- 2. ALL COMPLAINTS & FILTER MODULE ---');
    const allComplaintsRes = await request('/super-admin/complaints?page=1&limit=10');
    assert(allComplaintsRes.status === 200, 'GET /super-admin/complaints (paginated) responds with 200');
    assert(Array.isArray(allComplaintsRes.data.data), 'Complaints data returns array');
    assert(typeof allComplaintsRes.data.pagination.total === 'number', 'Pagination returns total count');

    const searchRes = await request('/super-admin/complaints?search=water');
    assert(searchRes.status === 200, 'Search filter query responds with 200');

    const statusFilterRes = await request('/super-admin/complaints?status=open');
    assert(statusFilterRes.status === 200, 'Status filter query responds with 200');
    if (statusFilterRes.data.data.length > 0) {
      assert(statusFilterRes.data.data.every(c => c.status === 'open'), 'All results match status=open');
    }

    const priorityFilterRes = await request('/super-admin/complaints?priority=urgent');
    assert(priorityFilterRes.status === 200, 'Priority filter query responds with 200');

    // ==========================================
    // MODULE 3: COMPLAINT DETAIL VIEW
    // ==========================================
    console.log('\n--- 3. COMPLAINT DETAIL MODULE ---');
    const firstComplaint = allComplaintsRes.data.data[0];
    if (firstComplaint) {
      const detailRes = await request(`/super-admin/complaints/${firstComplaint.id}`);
      assert(detailRes.status === 200, `GET /super-admin/complaints/${firstComplaint.id} responds with 200`);
      assert(detailRes.data.data.id === firstComplaint.id, 'Retrieved complaint ID matches requested ID');
      assert(detailRes.data.data.category !== undefined, 'Complaint includes category field');
      assert(detailRes.data.data.society_name !== undefined, 'Complaint includes society context');
    }

    // ==========================================
    // MODULE 4: CATEGORY MASTER MANAGEMENT
    // ==========================================
    console.log('\n--- 4. CATEGORY MASTER MODULE ---');
    const catListRes = await request('/complaint-categories?include_inactive=true');
    assert(catListRes.status === 200, 'GET /complaint-categories responds with 200');
    assert(Array.isArray(catListRes.data.data), 'Categories return array');

    // Create Category
    const uniqueCatName = `Test HVAC ${Date.now()}`;
    const createCatRes = await request('/complaint-categories', 'POST', {
      name: uniqueCatName,
      description: 'Heating, ventilation, and air conditioning maintenance',
      display_order: 99,
    });
    assert(createCatRes.status === 201, 'POST /complaint-categories creates new category (201)');
    const createdCatId = createCatRes.data.data.id;

    // Update Category
    const updateCatRes = await request(`/complaint-categories/${createdCatId}`, 'PUT', {
      name: `${uniqueCatName} Updated`,
      description: 'Updated description for HVAC issues',
      display_order: 100,
    });
    assert(updateCatRes.status === 200, 'PUT /complaint-categories/:id updates category (200)');
    assert(updateCatRes.data.data.name.includes('Updated'), 'Updated category name persisted in DB');

    // Toggle Inactive
    const deactCatRes = await request(`/complaint-categories/${createdCatId}/status`, 'PATCH', {
      is_active: false,
    });
    assert(deactCatRes.status === 200 && deactCatRes.data.data.is_active === false, 'Category deactivated (is_active = false)');

    // Toggle Active
    const actCatRes = await request(`/complaint-categories/${createdCatId}/status`, 'PATCH', {
      is_active: true,
    });
    assert(actCatRes.status === 200 && actCatRes.data.data.is_active === true, 'Category re-activated (is_active = true)');

    // ==========================================
    // MODULE 5: SUB-CATEGORY MASTER MANAGEMENT
    // ==========================================
    console.log('\n--- 5. SUB-CATEGORY MASTER MODULE ---');
    const uniqueSubName = `AC Thermostat Fault ${Date.now()}`;
    const createSubRes = await request('/complaint-sub-categories', 'POST', {
      category_id: createdCatId,
      name: uniqueSubName,
      description: 'Thermostat sensor error or unresponsive display',
      display_order: 1,
    });
    assert(createSubRes.status === 201, 'POST /complaint-sub-categories creates new sub-category (201)');
    const createdSubId = createSubRes.data.data.id;

    // Filter Sub-Categories by Category ID
    const filterSubRes = await request(`/complaint-sub-categories?category_id=${createdCatId}&include_inactive=true`);
    assert(filterSubRes.status === 200, 'GET /complaint-sub-categories with category_id responds with 200');
    assert(filterSubRes.data.data.some(s => s.id === createdSubId), 'Created sub-category present under parent category');

    // Update Sub-Category
    const updateSubRes = await request(`/complaint-sub-categories/${createdSubId}`, 'PUT', {
      category_id: createdCatId,
      name: `${uniqueSubName} Fixed`,
      display_order: 2,
    });
    assert(updateSubRes.status === 200, 'PUT /complaint-sub-categories/:id updates sub-category (200)');

    // Toggle Deactivate / Reactivate
    const deactSubRes = await request(`/complaint-sub-categories/${createdSubId}/status`, 'PATCH', {
      is_active: false,
    });
    assert(deactSubRes.status === 200 && deactSubRes.data.data.is_active === false, 'Sub-category deactivated (is_active = false)');

    const actSubRes = await request(`/complaint-sub-categories/${createdSubId}/status`, 'PATCH', {
      is_active: true,
    });
    assert(actSubRes.status === 200 && actSubRes.data.data.is_active === true, 'Sub-category re-activated (is_active = true)');

    // ==========================================
    // MODULE 6: LOCATION TYPES MASTER MANAGEMENT
    // ==========================================
    console.log('\n--- 6. LOCATION TYPES MASTER MODULE ---');
    const locListRes = await request('/complaint-location-types?include_inactive=true');
    assert(locListRes.status === 200, 'GET /complaint-location-types responds with 200');
    assert(Array.isArray(locListRes.data.data), 'Location types return array');

    // Create Location Type
    const uniqueLocName = `Solar Deck ${Date.now()}`;
    const createLocRes = await request('/complaint-location-types', 'POST', {
      name: uniqueLocName,
      code: `solar_deck_${Date.now()}`,
      description: 'Rooftop solar panel terrace area',
      display_order: 20,
    });
    assert(createLocRes.status === 201, 'POST /complaint-location-types creates new location type (201)');
    const createdLocId = createLocRes.data.data.id;

    // Update Location Type
    const updateLocRes = await request(`/complaint-location-types/${createdLocId}`, 'PUT', {
      name: `${uniqueLocName} Updated`,
      description: 'Updated solar terrace area',
      display_order: 21,
    });
    assert(updateLocRes.status === 200, 'PUT /complaint-location-types/:id updates location type (200)');

    // Toggle Status
    const deactLocRes = await request(`/complaint-location-types/${createdLocId}/status`, 'PATCH', {
      is_active: false,
    });
    assert(deactLocRes.status === 200 && deactLocRes.data.data.is_active === false, 'Location type deactivated (is_active = false)');

    const actLocRes = await request(`/complaint-location-types/${createdLocId}/status`, 'PATCH', {
      is_active: true,
    });
    assert(actLocRes.status === 200 && actLocRes.data.data.is_active === true, 'Location type re-activated (is_active = true)');

    // ==========================================
    // MODULE 7: AUDIT LOGS ACTIVITY MODULE
    // ==========================================
    console.log('\n--- 7. AUDIT LOGS ACTIVITY MODULE ---');
    const auditRes = await request('/super-admin/complaints/audit/logs?limit=10');
    assert(auditRes.status === 200, 'GET /super-admin/complaints/audit/logs responds with 200');
    assert(Array.isArray(auditRes.data.data), 'Audit logs return array of activity records');
    assert(auditRes.data.data.length > 0, 'Audit logs contains recent activity stream');

    const firstLog = auditRes.data.data[0];
    assert(firstLog.action !== undefined, 'Audit record contains action badge name');
    assert(firstLog.entity_type !== undefined, 'Audit record contains entity type');
    assert(firstLog.user_name !== undefined || firstLog.user_id !== undefined, 'Audit record contains actor attribution');

    console.log('\n================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    server.close();

    if (failed === 0) {
      console.log('🎉 ALL ADMIN PANEL MODULES ARE WORKING 100% PROPERLY!');
      process.exit(0);
    } else {
      console.error('❌ SOME MODULE CHECKS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Crash during verification:', err);
    server.close();
    process.exit(1);
  }
}

testAllModules();
