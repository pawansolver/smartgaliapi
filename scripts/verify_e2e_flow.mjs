import sequelize from '../src/config/db.js';
import '../src/modules/complaint_master/index.js';
import app from '../src/app.js';
import jwt from 'jsonwebtoken';

async function runE2ETest() {
  console.log('==================================================');
  console.log('RUNNING MANDATORY END-TO-END DYNAMIC MASTER TEST');
  console.log('==================================================');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const requestHelper = async (endpoint, method = 'GET', body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json();
    return { status: res.status, body: data };
  };

  try {
    // 1. Setup tokens
    const superAdminPayload = {
      userId: 6,
      sub: 6,
      userRole: 'super_admin',
      email: 'admin@smartgali.com',
      role: 'super_admin',
    };
    const superAdminToken = jwt.sign(
      superAdminPayload,
      process.env.JWT_SECRET || 'smartgali_super_secure_jwt_secret_key_2026_dev',
      { expiresIn: '1h' }
    );

    const residentPayload = {
      userId: 4,
      sub: 4,
      userRole: 'resident',
      email: 'resident@smartgali.com',
      role: 'resident',
    };
    const residentToken = jwt.sign(
      residentPayload,
      process.env.JWT_SECRET || 'smartgali_super_secure_jwt_secret_key_2026_dev',
      { expiresIn: '1h' }
    );

    console.log('\n[STEP 1] Super Admin -> Create/Ensure Category: "Water Supply"');
    let catRes = await requestHelper(
      '/complaint-categories',
      'POST',
      {
        name: 'Water Supply',
        description: 'Potable water supply and pipeline network',
        display_order: 10,
      },
      superAdminToken
    );

    let categoryId;
    if (catRes.status === 201) {
      categoryId = catRes.body.data.id;
      console.log(`✓ Created category "Water Supply" (ID: ${categoryId})`);
    } else if (catRes.status === 409) {
      const list = await requestHelper(
        '/complaint-categories?include_inactive=true',
        'GET',
        null,
        superAdminToken
      );
      const existing = list.body.data.find((c) => c.name === 'Water Supply');
      categoryId = existing.id;
      await requestHelper(
        `/complaint-categories/${categoryId}/status`,
        'PATCH',
        { is_active: true },
        superAdminToken
      );
      console.log(`✓ Reused & activated existing category "Water Supply" (ID: ${categoryId})`);
    } else {
      throw new Error(`Failed to create category: ${JSON.stringify(catRes.body)}`);
    }

    console.log('\n[STEP 2] Super Admin -> Create/Ensure Sub-Category: "Low Water Pressure"');
    let subRes = await requestHelper(
      '/complaint-sub-categories',
      'POST',
      {
        category_id: categoryId,
        name: 'Low Water Pressure',
        description: 'Low water pressure at flat fixtures',
        display_order: 1,
      },
      superAdminToken
    );

    let subCategoryId;
    if (subRes.status === 201) {
      subCategoryId = subRes.body.data.id;
      console.log(`✓ Created sub-category "Low Water Pressure" (ID: ${subCategoryId})`);
    } else if (subRes.status === 409) {
      const list = await requestHelper(
        `/complaint-sub-categories?category_id=${categoryId}&include_inactive=true`,
        'GET',
        null,
        superAdminToken
      );
      const existing = list.body.data.find((s) => s.name === 'Low Water Pressure');
      subCategoryId = existing.id;
      await requestHelper(
        `/complaint-sub-categories/${subCategoryId}/status`,
        'PATCH',
        { is_active: true },
        superAdminToken
      );
      console.log(`✓ Reused & activated existing sub-category "Low Water Pressure" (ID: ${subCategoryId})`);
    } else {
      throw new Error(`Failed to create sub-category: ${JSON.stringify(subRes.body)}`);
    }

    console.log('\n[STEP 3] Super Admin -> Create/Ensure Location Type: "Water Tank Area"');
    let locRes = await requestHelper(
      '/complaint-location-types',
      'POST',
      {
        name: 'Water Tank Area',
        code: 'water_tank_area',
        description: 'Rooftop and ground overhead water reservoir area',
        display_order: 7,
      },
      superAdminToken
    );

    let locationTypeId;
    if (locRes.status === 201) {
      locationTypeId = locRes.body.data.id;
      console.log(`✓ Created location type "Water Tank Area" (ID: ${locationTypeId})`);
    } else if (locRes.status === 409) {
      const list = await requestHelper(
        '/complaint-location-types?include_inactive=true',
        'GET',
        null,
        superAdminToken
      );
      const existing = list.body.data.find((l) => l.name === 'Water Tank Area');
      locationTypeId = existing.id;
      await requestHelper(
        `/complaint-location-types/${locationTypeId}/status`,
        'PATCH',
        { is_active: true },
        superAdminToken
      );
      console.log(`✓ Reused & activated existing location type "Water Tank Area" (ID: ${locationTypeId})`);
    } else {
      throw new Error(`Failed to create location type: ${JSON.stringify(locRes.body)}`);
    }

    console.log('\n[STEP 4] Resident / Mobile API Consumption Verification');
    const residentCats = await requestHelper(
      '/complaint-categories',
      'GET',
      null,
      residentToken
    );
    const catFound = residentCats.body.data.some((c) => c.name === 'Water Supply' && c.is_active);
    console.log(`✓ Resident API: "Water Supply" category visible: ${catFound}`);
    if (!catFound) throw new Error('Water Supply category missing in resident API');

    const residentSubs = await requestHelper(
      `/complaint-sub-categories?category_id=${categoryId}`,
      'GET',
      null,
      residentToken
    );
    const subFound = residentSubs.body.data.some((s) => s.name === 'Low Water Pressure' && s.is_active);
    console.log(`✓ Resident API: "Low Water Pressure" sub-category visible: ${subFound}`);
    if (!subFound) throw new Error('Low Water Pressure sub-category missing in resident API');

    const residentLocs = await requestHelper(
      '/complaint-location-types',
      'GET',
      null,
      residentToken
    );
    const locFound = residentLocs.body.data.some((l) => l.name === 'Water Tank Area' && l.is_active);
    console.log(`✓ Resident API: "Water Tank Area" location type visible: ${locFound}`);
    if (!locFound) throw new Error('Water Tank Area location type missing in resident API');

    console.log('\n[STEP 5] Resident Creates Complaint using the Dynamic Master Data');
    const createComplaintRes = await requestHelper(
      '/society-complaint',
      'POST',
      {
        society_id: 8,
        title: 'Low pressure in bathroom tap',
        description: 'Very little water coming from tap since this morning in Water Tank Area.',
        category: 'Water Supply',
        sub_category: 'Low Water Pressure',
        location_type: 'Water Tank Area',
        priority: 'high',
        flat_number: 'B-304',
      },
      residentToken
    );

    let complaintId;
    let complaintNumber;
    if (createComplaintRes.status === 201) {
      complaintId = createComplaintRes.body.data.id;
      complaintNumber = createComplaintRes.body.data.complaint_number;
      console.log(`✓ Complaint created successfully! ID: ${complaintId}, Number: ${complaintNumber}`);
      console.log(`  - Category: ${createComplaintRes.body.data.category}`);
      console.log(`  - Sub-Category: ${createComplaintRes.body.data.sub_category}`);
      console.log(`  - Location Type: ${createComplaintRes.body.data.location_type}`);
    } else {
      console.log('Complaint response status:', createComplaintRes.status, createComplaintRes.body);
      throw new Error(`Failed to create complaint: ${JSON.stringify(createComplaintRes.body)}`);
    }

    console.log('\n[STEP 6] Super Admin Deactivates: "Low Water Pressure"');
    const deactivateRes = await requestHelper(
      `/complaint-sub-categories/${subCategoryId}/status`,
      'PATCH',
      { is_active: false },
      superAdminToken
    );

    if (deactivateRes.status !== 200 || deactivateRes.body.data.is_active !== false) {
      throw new Error(`Failed to deactivate sub-category: ${JSON.stringify(deactivateRes.body)}`);
    }
    console.log('✓ Sub-category "Low Water Pressure" successfully deactivated (is_active = false)');

    console.log('\n[STEP 7] Historical Complaint Safety: Verify existing complaint STILL displays "Low Water Pressure"');
    const getComplaintRes = await requestHelper(
      `/super-admin/complaints/${complaintId}`,
      'GET',
      null,
      superAdminToken
    );

    if (getComplaintRes.status !== 200) {
      throw new Error(`Failed to fetch complaint: ${JSON.stringify(getComplaintRes.body)}`);
    }
    const fetched = getComplaintRes.body.data;
    console.log(`✓ Retrieved Historical Complaint #${fetched.complaint_number}:`);
    console.log(`  - category: "${fetched.category}"`);
    console.log(`  - sub_category: "${fetched.sub_category}"`);
    console.log(`  - location_type: "${fetched.location_type}"`);
    if (fetched.sub_category !== 'Low Water Pressure') {
      throw new Error(
        `Historical complaint sub_category mutated! Expected "Low Water Pressure", got: ${fetched.sub_category}`
      );
    }
    console.log('✓ PROVEN: Historical complaint retains stored sub-category value seamlessly!');

    console.log('\n[STEP 8] New Resident Selection: Verify inactive sub-category MUST NOT appear in active list');
    const activeSubsAfter = await requestHelper(
      `/complaint-sub-categories?category_id=${categoryId}`,
      'GET',
      null,
      residentToken
    );

    const stillPresent = activeSubsAfter.body.data.some((s) => s.id === subCategoryId);
    if (stillPresent) {
      throw new Error('Deactivated sub-category still returned to resident for new complaints!');
    }
    console.log('✓ PROVEN: Inactive sub-category is hidden from active resident selection!');

    console.log('\n==================================================');
    console.log('✅ ALL MANDATORY E2E TEST CHECKS PASSED PERFECTLY!');
    console.log('==================================================');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    server.close();
    process.exit(1);
  }
}

runE2ETest();
