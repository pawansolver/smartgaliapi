import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import env from '../config/env.js';
import BusinessProduct from '../modules/business_product/business_product.model.js';
import BusinessProfile from '../modules/business_profile/business_profile.model.js';
import User from '../modules/user/user.model.js';

// Helper to make native HTTP requests
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
  console.log('   PHASE 1: SECURITY & TENANT ISOLATION CODE-LEVEL TEST SUITE   ');
  console.log('================================================================\n');

  // 1. Start server on random ephemeral port
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
    // 2. Identify / Setup Test Users & Businesses
    // Business 8 is owned by User 319 (Business A)
    // Business 9 is owned by User 320 (Business B)
    const userA = await User.findByPk(319);
    const userB = await User.findByPk(320);
    const userAdmin = await User.findByPk(6);
    const businessA = await BusinessProfile.findByPk(8);
    const businessB = await BusinessProfile.findByPk(9);

    assert(userA && businessA && businessA.userId == 319, 'Business A (ID: 8) exists and belongs to User A (ID: 319)');
    assert(userB && businessB && businessB.userId == 320, 'Business B (ID: 9) exists and belongs to User B (ID: 320)');
    assert(userAdmin && userAdmin.userRole === 'super_admin', 'Admin User (ID: 6) exists with super_admin role');

    // Ensure Product exists for Business A (ID: 8)
    let productA = await BusinessProduct.findOne({ where: { business_id: 8, is_deleted: false } });
    if (!productA) {
      productA = await BusinessProduct.create({
        business_id: 8,
        name: 'Berger Paint 1L - Biz A',
        sku: 'BRG-01-SEC-A',
        mrp: 500,
        selling_price: 450,
        cost_price: 350,
        profit_margin: 22.2,
        status: 'active',
        approval_status: 'approved',
        variants: [{ id: 'v1', mrp: 500, selling_price: 450, cost_price: 350 }],
      });
    }

    // Generate JWT Tokens
    const tokenA = jwt.sign({ id: userA.userId, userRole: userA.userRole }, env.jwt.secret, { expiresIn: '1h' });
    const tokenB = jwt.sign({ id: userB.userId, userRole: userB.userRole }, env.jwt.secret, { expiresIn: '1h' });
    const tokenAdmin = jwt.sign({ id: userAdmin.userId, userRole: userAdmin.userRole }, env.jwt.secret, { expiresIn: '1h' });

    console.log('\n--- SUITE 1: UNAUTHENTICATED REQUESTS (NO TOKEN) ---');
    {
      const resList = await request(server, 'GET', '/api/v1/business-product/business/8');
      assert(resList.status === 401, 'GET /business-product/business/8 without token returns 401');

      const resStats = await request(server, 'GET', '/api/v1/business-product/business/8/stats');
      assert(resStats.status === 401, 'GET /business-product/business/8/stats without token returns 401');

      const resPost = await request(server, 'POST', '/api/v1/business-product', {}, { business_id: 8, name: 'Hack', sku: 'HACK-01' });
      assert(resPost.status === 401, 'POST /business-product without token returns 401');

      const resPut = await request(server, 'PUT', `/api/v1/business-product/${productA.id}`, {}, { name: 'Hacked' });
      assert(resPut.status === 401, `PUT /business-product/${productA.id} without token returns 401`);

      const resPatch = await request(server, 'PATCH', `/api/v1/business-product/${productA.id}/stock`, {}, { adjustment: -10 });
      assert(resPatch.status === 401, `PATCH /business-product/${productA.id}/stock without token returns 401`);

      const resDelete = await request(server, 'DELETE', `/api/v1/business-product/${productA.id}`);
      assert(resDelete.status === 401, `DELETE /business-product/${productA.id} without token returns 401`);

      const resBulk = await request(server, 'POST', '/api/v1/business-product/bulk-status', {}, { productIds: [productA.id], action: 'delete' });
      assert(resBulk.status === 401, 'POST /business-product/bulk-status without token returns 401');
    }

    console.log('\n--- SUITE 2: RESIDENT PUBLIC STOREFRONT (PRIVACY & SANITIZATION) ---');
    {
      const resPub = await request(server, 'GET', '/api/v1/business-product/public/8');
      assert(resPub.status === 200, 'GET /business-product/public/8 allows unauthenticated resident access');
      const items = resPub.body.data;
      assert(Array.isArray(items), 'Public endpoint returns array of products');

      let leakedCostPrice = false;
      let leakedProfitMargin = false;
      let leakedVariantCostPrice = false;

      for (const item of items) {
        if ('cost_price' in item || 'costPrice' in item) leakedCostPrice = true;
        if ('profit_margin' in item || 'profitMargin' in item) leakedProfitMargin = true;
        if (Array.isArray(item.variants)) {
          for (const v of item.variants) {
            if ('cost_price' in v || 'costPrice' in v) leakedVariantCostPrice = true;
          }
        }
      }

      assert(!leakedCostPrice, 'Resident public endpoint strictly hides cost_price');
      assert(!leakedProfitMargin, 'Resident public endpoint strictly hides profit_margin');
      assert(!leakedVariantCostPrice, 'Resident public endpoint strictly hides cost_price from nested variants');
    }

    console.log('\n--- SUITE 3: CROSS-TENANT ISOLATION (USER B CANNOT TOUCH BUSINESS A) ---');
    {
      // User B tries to view Business A's private product catalog
      const resList = await request(server, 'GET', '/api/v1/business-product/business/8', {
        Authorization: `Bearer ${tokenB}`,
      });
      assert(resList.status === 403, 'User B cannot view Business A products (HTTP 403 Forbidden)');

      // User B tries to view Business A's private stats
      const resStats = await request(server, 'GET', '/api/v1/business-product/business/8/stats', {
        Authorization: `Bearer ${tokenB}`,
      });
      assert(resStats.status === 403, 'User B cannot view Business A stats (HTTP 403 Forbidden)');

      // User B tries to inject a product into Business A
      const resCreate = await request(server, 'POST', '/api/v1/business-product', {
        Authorization: `Bearer ${tokenB}`,
      }, {
        business_id: 8,
        name: 'Injected Fake Product',
        sku: 'INJECT-01',
        mrp: 100,
        selling_price: 90,
      });
      assert(resCreate.status === 403, 'User B cannot create product under Business A (HTTP 403 Forbidden)');

      // User B tries to edit Business A's product
      const resEdit = await request(server, 'PUT', `/api/v1/business-product/${productA.id}`, {
        Authorization: `Bearer ${tokenB}`,
      }, {
        name: 'Defaced Name By User B',
      });
      assert(resEdit.status === 403, 'User B cannot edit Business A product (HTTP 403 Forbidden)');

      // User B tries to adjust Business A's stock
      const resStock = await request(server, 'PATCH', `/api/v1/business-product/${productA.id}/stock`, {
        Authorization: `Bearer ${tokenB}`,
      }, {
        adjustment: -999,
      });
      assert(resStock.status === 403, 'User B cannot adjust Business A stock (HTTP 403 Forbidden)');

      // User B tries to delete Business A's product
      const resDelete = await request(server, 'DELETE', `/api/v1/business-product/${productA.id}`, {
        Authorization: `Bearer ${tokenB}`,
      });
      assert(resDelete.status === 403, 'User B cannot delete Business A product (HTTP 403 Forbidden)');

      // User B tries bulk action targeting Business A's product
      const resBulk = await request(server, 'POST', '/api/v1/business-product/bulk-status', {
        Authorization: `Bearer ${tokenB}`,
      }, {
        productIds: [productA.id],
        action: 'delete',
      });
      assert(resBulk.status === 403, 'User B cannot bulk delete Business A products (HTTP 403 Forbidden)');
    }

    console.log('\n--- SUITE 4: LEGITIMATE MERCHANT & APPROVAL BYPASS PREVENTION ---');
    {
      // User A accesses their own business products
      const resListA = await request(server, 'GET', '/api/v1/business-product/business/8', {
        Authorization: `Bearer ${tokenA}`,
      });
      assert(resListA.status === 200, 'User A can view their own Business A products (HTTP 200)');
      assert(Array.isArray(resListA.body.data) && resListA.body.data.length > 0, 'User A receives their catalog items');

      // User A accesses their own business stats
      const resStatsA = await request(server, 'GET', '/api/v1/business-product/business/8/stats', {
        Authorization: `Bearer ${tokenA}`,
      });
      assert(resStatsA.status === 200, 'User A can view their own Business A stats (HTTP 200)');

      // User A creates a product and attempts to self-approve it
      const resCreateA = await request(server, 'POST', '/api/v1/business-product', {
        Authorization: `Bearer ${tokenA}`,
      }, {
        business_id: 8,
        name: 'Honest Seller Product',
        sku: `SKU-AUTO-${Date.now()}`,
        mrp: 300,
        selling_price: 250,
        cost_price: 200,
        approval_status: 'approved', // Merchant attempts self-approval
      });
      assert(resCreateA.status === 201, 'User A can create product for Business A (HTTP 201)');
      assert(
        resCreateA.body.data.approval_status === 'pending',
        'Backend overrides self-approval: new product defaults to "pending"'
      );

      // User A attempts to edit product and force approval_status = 'approved'
      const newProdId = resCreateA.body.data.id;
      const resEditA = await request(server, 'PUT', `/api/v1/business-product/${newProdId}`, {
        Authorization: `Bearer ${tokenA}`,
      }, {
        name: 'Updated Name',
        approval_status: 'approved', // Merchant attempts self-approval update
      });
      assert(resEditA.status === 200, 'User A can edit their own product (HTTP 200)');
      assert(
        resEditA.body.data.approval_status === 'pending',
        'Backend ignores merchant attempt to update approval_status to "approved"'
      );
    }

    console.log('\n--- SUITE 5: GLOBAL ADMIN PRIVILEGES ---');
    {
      // Admin accesses Business A products
      const resAdminA = await request(server, 'GET', '/api/v1/business-product/business/8', {
        Authorization: `Bearer ${tokenAdmin}`,
      });
      assert(resAdminA.status === 200, 'Platform Admin can view Business A products (HTTP 200)');

      // Admin accesses Business B products
      const resAdminB = await request(server, 'GET', '/api/v1/business-product/business/9', {
        Authorization: `Bearer ${tokenAdmin}`,
      });
      assert(resAdminB.status === 200, 'Platform Admin can view Business B products (HTTP 200)');
    }

  } catch (err) {
    console.error('[UNEXPECTED ERROR]:', err);
    failCount++;
  } finally {
    server.close();
    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================\n');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
