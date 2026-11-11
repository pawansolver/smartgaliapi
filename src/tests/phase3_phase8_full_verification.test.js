import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import env from '../config/env.js';
import BusinessProduct from '../modules/business_product/business_product.model.js';
import BusinessProfile from '../modules/business_profile/business_profile.model.js';
import User from '../modules/user/user.model.js';
import ProductInventoryMovement from '../modules/business_product/product_inventory_movement.model.js';
import * as productService from '../modules/business_product/business_product.service.js';

function request(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('   PHASES 3 TO 8: ENTERPRISE VERIFICATION TEST SUITE            ');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[INFO] Test server running on http://127.0.0.1:${port}`);

  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failCount++;
    }
  }

  try {
    const userA = await User.findByPk(319) || await User.findOne();
    const userAdmin = await User.findByPk(6) || { id: 6, userRole: 'super_admin' };
    const businessA = await BusinessProfile.findByPk(8) || await BusinessProfile.findOne({ where: { is_deleted: false } });

    const tokenMerchantA = jwt.sign(
      { id: userA.userId || userA.id, userId: userA.userId || userA.id, userRole: userA.userRole || 'business_owner' },
      env.jwt.secret,
      { expiresIn: '1h' }
    );
    const tokenAdmin = jwt.sign(
      { id: userAdmin.userId || userAdmin.id, userId: userAdmin.userId || userAdmin.id, userRole: 'super_admin' },
      env.jwt.secret,
      { expiresIn: '1h' }
    );

    console.log(`\n── TEST GROUP 1: Phase 4 — Database Integrity & Unique SKU ──`);
    const uniqueSkuTest = `TEST-SKU-${Date.now()}`;
    const p1 = await BusinessProduct.create({
      business_id: businessA.id,
      name: 'Integrity Test Product 1',
      sku: uniqueSkuTest,
      mrp: 100,
      selling_price: 90,
      available_quantity: 20,
      track_inventory: true,
      status: 'active',
      approval_status: 'approved',
      created_at: new Date(),
      updatedAt: new Date(),
    });
    assert(p1.id != null, 'Product 1 created successfully with SKU');

    let duplicateThrew = false;
    try {
      await BusinessProduct.create({
        business_id: businessA.id,
        name: 'Integrity Test Duplicate SKU',
        sku: uniqueSkuTest, // Same SKU on same business!
        mrp: 120,
        selling_price: 110,
        available_quantity: 10,
        track_inventory: true,
        status: 'active',
        approval_status: 'approved',
        created_at: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      duplicateThrew = true;
    }
    assert(duplicateThrew, 'Database composite unique index strictly rejects duplicate (business_id, sku)');

    console.log(`\n── TEST GROUP 2: Phase 5 — Location Master Validation ──`);
    let invalidLocationThrew = false;
    try {
      await productService.validateLocationCoverage({
        state_id: 999999, // Non-existent state
      });
    } catch (e) {
      invalidLocationThrew = true;
    }
    assert(invalidLocationThrew, 'Rejects non-existent state_id in Location Master');

    let invalidPincodeThrew = false;
    try {
      await productService.validateLocationCoverage({
        pincodes: ['999999-FAKE-PIN'],
      });
    } catch (e) {
      invalidPincodeThrew = true;
    }
    assert(invalidPincodeThrew, 'Rejects non-existent pincode in Location Master');

    console.log(`\n── TEST GROUP 3: Phase 6 — Product Approval Workflow ──`);
    // Create a product as merchant (should be pending)
    const createRes = await request(
      server,
      'POST',
      '/api/v1/business-product',
      { Authorization: `Bearer ${tokenMerchantA}` },
      {
        business_id: businessA.id,
        name: 'Merchant New Submission',
        sku: `SUB-${Date.now()}`,
        mrp: 200,
        selling_price: 180,
        approval_status: 'approved', // Merchant attempting self-approval
      }
    );
    assert(createRes.status === 201, 'Product submission returns 201 Created');
    assert(createRes.body.data.approval_status === 'pending', 'Merchant cannot self-approve; default is strictly "pending"');

    const submittedId = createRes.body.data.id;

    // Non-admin cannot call /approve
    const unauthApprove = await request(
      server,
      'PATCH',
      `/api/v1/business-product/${submittedId}/approve`,
      { Authorization: `Bearer ${tokenMerchantA}` },
      { notes: 'Merchant attempting admin approval' }
    );
    assert(unauthApprove.status === 403, 'Merchant cannot approve products (403 Forbidden)');

    // Admin approves product
    const adminApprove = await request(
      server,
      'PATCH',
      `/api/v1/business-product/${submittedId}/approve`,
      { Authorization: `Bearer ${tokenAdmin}` },
      { notes: 'Product approved by catalog team' }
    );
    assert(adminApprove.status === 200, 'Admin can approve product (200 OK)');
    assert(adminApprove.body.data.approval_status === 'approved', 'approval_status updated to "approved"');
    assert(Array.isArray(adminApprove.body.data.approval_history), 'approval_history log created');

    // Admin rejects product
    const adminReject = await request(
      server,
      'PATCH',
      `/api/v1/business-product/${submittedId}/reject`,
      { Authorization: `Bearer ${tokenAdmin}` },
      { reason: 'Images blurry and missing mandatory FSSAI certification' }
    );
    assert(adminReject.status === 200, 'Admin can reject product with reason');
    assert(adminReject.body.data.approval_status === 'rejected', 'approval_status updated to "rejected"');
    assert(adminReject.body.data.rejection_reason.includes('FSSAI'), 'rejection_reason recorded');

    console.log(`\n── TEST GROUP 4: Phase 7 — Inventory Order Lifecycle ──`);
    // 1. Stock reservation
    const reserveRes = await productService.reserveStock(p1.id, 5, 'ORD-1001');
    assert(reserveRes.success === true, 'Stock reservation succeeds');
    assert(reserveRes.availableQuantity === 15, 'Available quantity deducted from 20 to 15');
    assert(reserveRes.reservedQuantity === 5, 'Reserved quantity increased to 5');

    // 2. Prevent negative stock / overselling
    let oversellThrew = false;
    try {
      await productService.reserveStock(p1.id, 50, 'ORD-1002');
    } catch (e) {
      oversellThrew = true;
    }
    assert(oversellThrew, 'Negative stock prevented on overselling attempt');

    // 3. Payment confirmation -> Commit stock
    const commitRes = await productService.commitReservedStock(p1.id, 5, 'ORD-1001');
    assert(commitRes.success === true, 'Payment confirmation commits reserved stock');
    assert(commitRes.reservedQuantity === 0, 'Reserved quantity decreased to 0');

    // 4. Customer cancel / payment failure -> Release stock
    await productService.reserveStock(p1.id, 3, 'ORD-1003');
    const releaseRes = await productService.releaseReservedStock(p1.id, 3, 'ORD-1003', 'customer_cancelled');
    assert(releaseRes.success === true, 'Order cancellation releases reserved stock');
    assert(releaseRes.availableQuantity === 15, 'Available quantity restored');

    // 5. Customer return -> Restore stock
    const returnRes = await productService.restoreStockOnReturn(p1.id, 2, 'ORD-1001', 'Defective box replaced/returned');
    assert(returnRes.success === true, 'Customer return restocks inventory');
    assert(returnRes.availableQuantity === 17, 'Available quantity increased by return quantity');

    // Clean up test movements and products
    await ProductInventoryMovement.destroy({ where: { product_id: [p1.id, submittedId] } });
    await BusinessProduct.destroy({ where: { id: [p1.id, submittedId] } });

    console.log('\n================================================================');
    console.log(`   TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED        `);
    console.log('================================================================\n');

    server.close();
    process.exit(failCount === 0 ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
