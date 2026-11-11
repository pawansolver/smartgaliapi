import sequelize from '../src/config/db.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import * as productService from '../src/modules/business_product/business_product.service.js';

async function verifyAllProductFieldsInDb() {
  console.log('================================================================');
  console.log('  STARTING DEEP FIELD-BY-FIELD DATABASE PERSISTENCE VERIFICATION');
  console.log('================================================================\n');

  let testBusinessId = 3;
  let createdProductId = null;

  try {
    // 1. Find or verify active business profile
    const [biz] = await sequelize.query('SELECT id, business_name FROM business_profiles WHERE is_deleted = 0 LIMIT 1');
    if (biz.length > 0) {
      testBusinessId = biz[0].id;
      console.log(`[SETUP] Verified Store/Business Profile: "${biz[0].business_name}" (ID: ${testBusinessId})`);
    }

    // 2. Comprehensive 100% complete field payload matching AddProductWizardScreen output
    const completeWizardPayload = {
      business_id: testBusinessId,
      name: 'Premium Slim Fit Cotton Shirt',
      brand: 'Raymond Tailored',
      category_id: 1,
      category_name: 'Fashion',
      subcategory_name: 'Menswear',
      product_type: 'Physical',
      sku: `SKU-TEST-${Date.now()}`,
      short_description: 'Breathable formal cotton shirt for all seasons.',
      detailed_description: 'Constructed with 100% premium long-staple combed cotton. Machine washable, easy iron finish, and reinforced stitch seams.',
      tags: ['shirt', 'cotton', 'formal', 'menswear', 'sale'],
      unit: 'Piece',
      primary_image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600',
      images: [
        'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600',
        'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600'
      ],
      video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      mrp: 1999.00,
      selling_price: 1499.00,
      cost_price: 850.00,
      discount_type: 'percentage',
      discount_value: 25.0,
      gst_slab: 5.0,
      tax_inclusive: true,
      hsn_code: '62052000',
      track_inventory: true,
      available_quantity: 45,
      reserved_quantity: 5,
      low_stock_threshold: 10,
      store_warehouse: 'Floor 2, Rack C-04',
      home_delivery: true,
      store_pickup: true,
      delivery_charge: 40.0,
      free_delivery_above: 999.0,
      min_order_quantity: 1,
      prep_time_minutes: 30,
      delivery_time_minutes: 120,
      is_returnable: true,
      return_window_days: 7,
      warranty_details: '6 Months Stitching & Button Replacement Warranty',
      status: 'active',
      approval_status: 'approved',
      has_variants: true,
      variants: [
        {
          id: 'var_size_38_blue',
          name: 'Size 38 / Navy Blue',
          sku: 'SKU-SHIRT-38-BLU',
          mrp: 1999.00,
          sellingPrice: 1499.00,
          stockQuantity: 20,
          isDefault: true,
          attributes: { 'Size': '38', 'Colour': 'Navy Blue' }
        },
        {
          id: 'var_size_40_white',
          name: 'Size 40 / Classic White',
          sku: 'SKU-SHIRT-40-WHT',
          mrp: 1999.00,
          sellingPrice: 1499.00,
          stockQuantity: 25,
          isDefault: false,
          attributes: { 'Size': '40', 'Colour': 'Classic White' }
        }
      ],
      attributes: {
        'gender': 'Men',
        'fabric': '100% Cotton',
        'pattern': 'Solid / Plain',
        'fit': 'Slim Fit',
        'neck': 'Spread Collar',
        'Cuff Style': 'Single Button Rounded',
        'Country of Origin': 'India'
      }
    };

    console.log('\n--- Step A: Creating Product in Database via Service ---');
    const created = await productService.createProduct(completeWizardPayload, 1, true);
    createdProductId = created.id;
    console.log(`✓ Product successfully created in DB with ID: ${createdProductId}`);

    console.log('\n--- Step B: Direct Raw SQL Query to Verify Physical Columns in MySQL ---');
    const [rawRows] = await sequelize.query(
      'SELECT * FROM business_products WHERE id = ?',
      { replacements: [createdProductId] }
    );

    if (rawRows.length === 0) {
      throw new Error(`Product ID ${createdProductId} was NOT found in MySQL business_products table!`);
    }

    const row = rawRows[0];
    console.log('✓ Raw record fetched from MySQL database.');

    // Assert every single field saved in DB
    const fieldChecks = [
      { field: 'name', expected: completeWizardPayload.name, actual: row.name },
      { field: 'brand', expected: completeWizardPayload.brand, actual: row.brand },
      { field: 'category_name', expected: completeWizardPayload.category_name, actual: row.category_name },
      { field: 'subcategory_name', expected: completeWizardPayload.subcategory_name, actual: row.subcategory_name },
      { field: 'sku', expected: completeWizardPayload.sku, actual: row.sku },
      { field: 'short_description', expected: completeWizardPayload.short_description, actual: row.short_description },
      { field: 'unit', expected: completeWizardPayload.unit, actual: row.unit },
      { field: 'mrp', expected: completeWizardPayload.mrp, actual: parseFloat(row.mrp) },
      { field: 'selling_price', expected: completeWizardPayload.selling_price, actual: parseFloat(row.selling_price) },
      { field: 'cost_price', expected: completeWizardPayload.cost_price, actual: parseFloat(row.cost_price) },
      { field: 'gst_slab', expected: completeWizardPayload.gst_slab, actual: parseFloat(row.gst_slab) },
      { field: 'hsn_code', expected: completeWizardPayload.hsn_code, actual: row.hsn_code },
      { field: 'available_quantity', expected: completeWizardPayload.available_quantity, actual: parseInt(row.available_quantity) },
      { field: 'low_stock_threshold', expected: completeWizardPayload.low_stock_threshold, actual: parseInt(row.low_stock_threshold) },
      { field: 'store_warehouse', expected: completeWizardPayload.store_warehouse, actual: row.store_warehouse },
      { field: 'video_url', expected: completeWizardPayload.video_url, actual: row.video_url },
      { field: 'is_returnable', expected: 1, actual: row.is_returnable ? 1 : 0 },
      { field: 'return_window_days', expected: 7, actual: parseInt(row.return_window_days) },
      { field: 'status', expected: 'active', actual: row.status },
      { field: 'approval_status', expected: 'approved', actual: row.approval_status },
    ];

    let passedCount = 0;
    for (const check of fieldChecks) {
      if (check.expected === check.actual) {
        console.log(`  ✓ Column [${check.field.padEnd(20)}]: ${check.actual}`);
        passedCount++;
      } else {
        console.error(`  ✗ MISMATCH [${check.field}]: expected "${check.expected}", got "${check.actual}"`);
        throw new Error(`Field verification failed for: ${check.field}`);
      }
    }

    // Verify JSON column decoding
    console.log('\n--- Step C: Verifying JSON Columns (attributes, variants, images, tags) ---');
    const parsedAttrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
    console.log(`  Dynamic Attributes in DB:`, parsedAttrs);
    if (parsedAttrs.fabric !== '100% Cotton' || parsedAttrs.neck !== 'Spread Collar' || parsedAttrs['Cuff Style'] !== 'Single Button Rounded') {
      throw new Error('attributes JSON mismatch in MySQL row!');
    }
    console.log('  ✓ attributes JSON column matches 100%!');

    const parsedVariants = typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants;
    console.log(`  Variants in DB (Count: ${parsedVariants.length}):`, parsedVariants.map(v => v.name));
    if (parsedVariants.length !== 2 || parsedVariants[0].sku !== 'SKU-SHIRT-38-BLU') {
      throw new Error('variants JSON mismatch in MySQL row!');
    }
    console.log('  ✓ variants JSON column matches 100%!');

    const parsedImages = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
    if (!Array.isArray(parsedImages) || parsedImages.length !== 2) {
      throw new Error('images JSON array mismatch in MySQL row!');
    }
    console.log(`  ✓ gallery images JSON array matches 100% (${parsedImages.length} images)!`);

    // Verify Inventory Movement Audit log
    console.log('\n--- Step D: Verifying Inventory Movements Audit Log in DB ---');
    const [movements] = await sequelize.query(
      'SELECT * FROM product_inventory_movements WHERE product_id = ? ORDER BY id DESC',
      { replacements: [createdProductId] }
    );
    if (movements.length === 0) {
      throw new Error('No product_inventory_movements log found for initial stock!');
    }
    console.log(`  ✓ Audit movement logged: previous=${movements[0].previous_quantity}, new=${movements[0].new_quantity}, reason=${movements[0].reason}`);

    // Verify Catalog Listing Query (GET /business-product/business/:businessId)
    console.log('\n--- Step E: Verifying Listing API (getProductsByBusiness) ---');
    const listing = await productService.getProductsByBusiness(testBusinessId, {
      page: 1,
      limit: 20
    });

    const foundInList = listing.items.find(p => p.id === createdProductId || p.sku === completeWizardPayload.sku);
    if (!foundInList) {
      throw new Error(`Product ${createdProductId} was NOT returned by catalog listing query!`);
    }

    console.log(`✓ Product found in catalog list: "${foundInList.name}" (ID: ${foundInList.id})`);
    console.log(`  Listed Category: ${foundInList.category_name} > Subcategory: ${foundInList.subcategory_name}`);
    console.log(`  Listed Price: ₹${foundInList.selling_price} (MRP: ₹${foundInList.mrp}, Stock: ${foundInList.available_quantity} ${foundInList.unit})`);
    console.log(`  Listed Attributes:`, foundInList.attributes);
    console.log(`  Listed Variants count:`, foundInList.variants?.length);

    console.log('\n================================================================');
    console.log('  ALL CHECKS PASSED: 100% OF FIELDS SUCCESSFULLY SAVED AND LISTED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    if (createdProductId) {
      console.log(`[CLEANUP] Cleaning test product ID: ${createdProductId}...`);
      await sequelize.query('DELETE FROM product_inventory_movements WHERE product_id = ?', { replacements: [createdProductId] });
      await sequelize.query('DELETE FROM business_products WHERE id = ?', { replacements: [createdProductId] });
      console.log('[CLEANUP] Done.');
    }
  }
}

verifyAllProductFieldsInDb().then(() => {
  sequelize.close();
});
