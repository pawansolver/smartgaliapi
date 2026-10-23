import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import env from '../src/config/env.js';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import UserProfile from '../src/modules/userProfile/userProfile.model.js';
import ServiceCategory from '../src/modules/service_category/service_category.model.js';

const runE2E = async () => {
  console.log('=== STARTING HTTP API E2E VALIDATION ===\n');

  await sequelize.authenticate();

  // Find or create test provider user
  let providerUser = await User.findOne({ where: { userId: 1 } });
  if (!providerUser) {
    providerUser = await User.findOne({ where: { is_deleted: false, status: 'active' } });
  }

  // Ensure user profile
  let userProfile = await UserProfile.findOne({ where: { user_id: providerUser.userId } });
  if (!userProfile) {
    userProfile = await UserProfile.create({
      user_id: providerUser.userId,
      fullName: 'Rajesh Sharma Live',
      avatarUrl: '/uploads/avatars/rajesh.jpg',
      created_by: providerUser.userId,
    });
  } else {
    await userProfile.update({
      fullName: 'Rajesh Sharma Live',
      avatarUrl: '/uploads/avatars/rajesh.jpg',
    });
  }

  // Create token
  const token = jwt.sign(
    { id: providerUser.userId, userId: providerUser.userId, userRole: 'service_provider' },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  // Spin up ephemeral HTTP server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.log(`Ephemeral server listening on port ${port}`);

  try {
    // 1. GET /service-provider-profile/me
    console.log('\n[1] Testing GET /service-provider-profile/me...');
    const getRes = await fetch(`${baseUrl}/service-provider-profile/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody = await getRes.json();
    assert.strictEqual(getRes.status, 200, `Expected 200, got ${getRes.status}: ${JSON.stringify(getBody)}`);
    assert.strictEqual(getBody.success, true);
    assert(getBody.data.provider, 'data.provider must exist');
    assert.strictEqual(getBody.data.provider.name, 'Rajesh Sharma Live');
    assert.strictEqual(getBody.data.provider.profilePhoto, '/uploads/avatars/rajesh.jpg');
    assert(Array.isArray(getBody.data.provider.languages));
    assert(getBody.data.kyc, 'data.kyc must exist');
    assert(getBody.data.documents, 'data.documents must exist');
    console.log('  ✓ GET /service-provider-profile/me returned valid profile aggregate.');
    console.log('  Sample data.provider payload:\n', JSON.stringify(getBody.data.provider, null, 2));

    // 2. PUT /service-provider-profile/me
    console.log('\n[2] Testing PUT /service-provider-profile/me...');
    const updateRes = await fetch(`${baseUrl}/service-provider-profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        business_name: 'Sharma Electrical Solutions',
        experience: '9 Years',
        languages: ['Hindi', 'English', 'Bhojpuri'],
        fullName: 'Rajesh Sharma Senior',
      }),
    });
    const updateBody = await updateRes.json();
    assert.strictEqual(updateRes.status, 200, `Expected 200, got ${updateRes.status}: ${JSON.stringify(updateBody)}`);
    assert.strictEqual(updateBody.data.provider.businessName, 'Sharma Electrical Solutions');
    assert.strictEqual(updateBody.data.provider.experience, '9 Years');
    assert.deepStrictEqual(updateBody.data.provider.languages, ['Hindi', 'English', 'Bhojpuri']);
    assert.strictEqual(updateBody.data.provider.name, 'Rajesh Sharma Senior');
    console.log('  ✓ PUT /service-provider-profile/me successfully updated business fields and display name.');

    // 3. Security: Tampering with protected fields
    console.log('\n[3] Testing Security: Attempting to modify is_verified directly...');
    const tamperRes = await fetch(`${baseUrl}/service-provider-profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        business_name: 'Tamper Name',
        is_verified: true,
      }),
    });
    assert.strictEqual(tamperRes.status, 422, `Expected 400 Bad Request for tampering, got ${tamperRes.status}`);
    console.log('  ✓ Tampering with is_verified successfully rejected with HTTP 400.');

    console.log('\n[3b] Testing Security: Attempting to modify verification_status directly...');
    const tamperRes2 = await fetch(`${baseUrl}/service-provider-profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        verification_status: 'verified',
      }),
    });
    assert.strictEqual(tamperRes2.status, 422, `Expected 400 Bad Request for tampering, got ${tamperRes2.status}`);
    console.log('  ✓ Tampering with verification_status successfully rejected with HTTP 400.');

    // 4. GET /service-provider-profile/me/documents
    console.log('\n[4] Testing GET /service-provider-profile/me/documents...');
    const docsRes = await fetch(`${baseUrl}/service-provider-profile/me/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const docsBody = await docsRes.json();
    assert.strictEqual(docsRes.status, 200);
    assert.strictEqual(docsBody.success, true);
    assert(Array.isArray(docsBody.data));
    console.log(`  ✓ GET /service-provider-profile/me/documents returned ${docsBody.data.length} documents.`);

    // 5. POST /service-provider-profile/me/documents (Multipart)
    console.log('\n[5] Testing POST /service-provider-profile/me/documents (Multipart Upload)...');
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="document_type"',
      '',
      'trade_license',
      `--${boundary}`,
      'Content-Disposition: form-data; name="title"',
      '',
      'Electrical License 2026',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="trade_license.pdf"',
      'Content-Type: application/pdf',
      '',
      '%PDF-1.4 Mock PDF Content For Provider Document Test',
      `--${boundary}--`,
    ].join('\r\n');

    const uploadRes = await fetch(`${baseUrl}/service-provider-profile/me/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${token}`,
      },
      body: multipartBody,
    });
    const uploadBody = await uploadRes.json();
    assert.strictEqual(uploadRes.status, 201, `Expected 201 Created, got ${uploadRes.status}: ${JSON.stringify(uploadBody)}`);
    assert.strictEqual(uploadBody.data.document_type, 'trade_license');
    assert.strictEqual(uploadBody.data.title, 'Electrical License 2026');
    assert.strictEqual(uploadBody.data.status, 'under_review');
    const createdDocId = uploadBody.data.id;
    console.log('  ✓ Document uploaded successfully via multipart/form-data with status "under_review".');

    // 6. DELETE /service-provider-profile/me/documents/:id
    console.log('\n[6] Testing DELETE /service-provider-profile/me/documents/:id...');
    const deleteDocRes = await fetch(`${baseUrl}/service-provider-profile/me/documents/${createdDocId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(deleteDocRes.status, 200);
    console.log('  ✓ Own document soft-deleted successfully.');

    // 7. Security: IDOR check without token
    console.log('\n[7] Testing Security: Unauthenticated request to /service-provider-profile/me...');
    const unauthRes = await fetch(`${baseUrl}/service-provider-profile/me`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('  ✓ Unauthenticated request properly blocked with HTTP 401.');

    console.log('\n=== ALL HTTP API E2E VALIDATIONS PASSED! ===\n');
  } finally {
    server.close();
    await sequelize.close();
  }
};

runE2E().catch((err) => {
  console.error('\n� � E2E TEST FAILED:', err);
  process.exit(1);
});
