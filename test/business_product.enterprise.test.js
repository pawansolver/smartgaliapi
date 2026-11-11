import sequelize from '../src/config/db.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import * as productService from '../src/modules/business_product/business_product.service.js';
import * as categoryService from '../src/modules/business_category/business_category.service.js';

async function runEnterpriseProductTests() {
  console.log('====================================================');
  console.log('  STARTING ENTERPRISE PRODUCT SYSTEM BACKEND VERIFICATION');
  console.log('====================================================\n');

  let testProductId = null;
  let testBusinessId = 1;

  try {
    // 0. Ensure a test business profile exists
    const [bizProfiles] = await sequelize.query('SELECT id FROM business_profiles WHERE is_deleted = 0 LIMIT 1');
    if (bizProfiles.length > 0) {
      testBusinessId = bizProfiles[0].id;
    } else {
      console.log('Creating fallback business profile for testing...');
      const [newBiz] = await sequelize.query(
        'INSERT INTO business_profiles (business_name, category_name, is_active, is_deleted, created_at, updatedAt) VALUES (?, ?, 1, 0, NOW(), NOW())',
        { replacements: ['Test Enterprise Store', 'Fashion'] }
      );
      testBusinessId = newBiz;
    }
    console.log(`[TEST SETUP] Using Business Profile ID: ${testBusinessId}`);

    // 1. Verify Category Specification Templates & Subcategories
    console.log('\n--- 1. Testing Category Templates & Specifications ---');
    const categories = await categoryService.getAllCategories();
    console.log(`Found ${categories.length} active business categories.`);
    if (categories.length === 0) throw new Error('No categories found.');

    const fashionCat = categories.find(c => c.name.toLowerCase() === 'fashion');
    if (!fashionCat) throw new Error('Fashion category not found in categories.');
    console.log(`Fashion subcategories:`, fashionCat.subcategories);
    console.log(`Fashion specification fields count: ${fashionCat.specifications.length}`);
    if (!fashionCat.specifications.some(s => s.key === 'gender') || !fashionCat.specifications.some(s => s.key === 'fabric')) {
      throw new Error('Fashion specifications missing gender or fabric!');
    }
    console.log('✓ Category dynamic specifications and subcategories loaded successfully.');

    // 2. Enterprise Product Creation (All 7 Steps)
    console.log('\n--- 2. Testing Enterprise Product Creation (All 7 Steps) ---');
    const testSku = `TEST-ENT-${Date.now()}`;
    const productPayload = {
      business_id: testBusinessId,
      name: 'Premium Cotton Polo T-Shirt',
      brand: 'SmartGali Select',
      sku: testSku,
      category_id: fashionCat.id,
      category_name: 'Fashion',
      subcategory_id: 1,
      subcategory_name: 'Menswear',
      product_type: 'Physical',
      short_description: 'Breathable combed cotton polo with ribbed collar.',
      detailed_description: 'Engineered for comfort and durability. Bio-washed for extra softness with double-needle stitching.',
      tags: ['fashion', 'tshirt', 'cotton', 'summer'],
      search_keywords: ['polo', 'tshirt', 'menswear', 'cotton'],
      unit: 'Piece',

      // Media (Primary Image, Sub-images Gallery, Video URL)
      primary_image: 'https://cdn.smartgali.in/products/polo-navy-front.jpg',
      images: [
        'https://cdn.smartgali.in/products/polo-navy-back.jpg',
        'https://cdn.smartgali.in/products/polo-navy-collar.jpg',
        'https://cdn.smartgali.in/products/polo-navy-fabric.jpg',
      ],
      video_url: 'https://cdn.smartgali.in/videos/polo-fabric-feel-demo.mp4',

      // Category Specifications + Merchant Custom Attributes
      attributes: {
        gender: 'Men',
        fabric: '100% Cotton',
        pattern: 'Solid / Plain',
        fit_type: 'Regular Fit',
        neck_style: 'Polo Collar',
        'Wash Care': 'Gentle Machine Wash in Cold Water',
        'Gsm Count': '220 GSM Heavy Combed Cotton',
      },

      // Pricing, Tax & Margin
      mrp: 1499.00,
      selling_price: 999.00,
      cost_price: 450.00,
      discount_type: 'percentage',
      discount_value: 33.36,
      gst_slab: 5.00,
      tax_inclusive: true,
      hsn_code: '61091000',

      // Inventory & Stock
      track_inventory: true,
      available_quantity: 45,
      low_stock_threshold: 10,

      // Variants
      has_variants: true,
      variants: [
        {
          id: 'var-1',
          name: 'Navy Blue / Medium',
          value: 'Navy Blue - M',
          sku: `${testSku}-M`,
          mrp: 1499.00,
          selling_price: 999.00,
          cost_price: 450.00,
          stock: 20,
          barcode: '8901234567891',
          attributes: { Size: 'M', Color: 'Navy Blue' },
        },
        {
          id: 'var-2',
          name: 'Navy Blue / Large',
          value: 'Navy Blue - L',
          sku: `${testSku}-L`,
          mrp: 1499.00,
          selling_price: 999.00,
          cost_price: 450.00,
          stock: 25,
          barcode: '8901234567892',
          attributes: { Size: 'L', Color: 'Navy Blue' },
        },
      ],

      // Fulfillment
      home_delivery: true,
      store_pickup: true,
      delivery_charge: 40.00,
      free_delivery_above: 1500.00,
      prep_time_minutes: 20,
      delivery_time_minutes: 45,

      // Compliance & Policies
      barcode: '8901234567890',
      batch_number: 'BATCH-2026-Q1',
      mfg_date: '2026-01-15',
      expiry_date: null,
      shelf_life: 'Indefinite',
      storage_instructions: 'Store in dry place, avoid direct prolonged sunlight.',
      country_of_origin: 'India',
      is_returnable: true,
      return_window_days: 7,
      warranty_details: '6 Months Stitching & Color Guarantee',
      care_instructions: 'Do not bleach. Warm iron if needed. Wash with similar colors.',
      approval_status: 'approved',
      status: 'active',
    };

    const created = await productService.createProduct(productPayload, 1, true);
    testProductId = created.id;
    console.log(`✓ Product created successfully! ID: ${created.id}`);
    console.log(`  Name: ${created.name}`);
    console.log(`  Calculated Profit Margin: ${created.profit_margin}%`);
    console.log(`  Derived Stock Status: ${created.stock_status}`);
    console.log(`  Saved Gallery Images Count: ${created.images.length}`);
    console.log(`  Saved Video URL: ${created.video_url}`);
    console.log(`  Saved Dynamic & Custom Attributes:`, created.attributes);
    console.log(`  Saved Variants Count: ${created.variants.length}`);

    if (created.profit_margin !== 54.95) {
      console.warn(`  Warning: Expected profit margin ~54.95%, got: ${created.profit_margin}`);
    }
    if (created.stock_status !== 'in_stock') {
      throw new Error(`Expected stock_status 'in_stock', got ${created.stock_status}`);
    }
    if (!created.attributes['Wash Care'] || created.attributes.fabric !== '100% Cotton') {
      throw new Error('Attributes not saved correctly in MySQL!');
    }

    // 3. Testing Enterprise Validation & Constraints
    console.log('\n--- 3. Testing Enterprise Validation Rules ---');
    // 3a: Selling Price > MRP rejection
    try {
      await productService.createProduct({
        business_id: testBusinessId,
        name: 'Invalid Price Product',
        sku: `INV-PRICE-${Date.now()}`,
        mrp: 500,
        selling_price: 600, // Invalid!
      });
      throw new Error('FAILED: Selling price > MRP was not rejected!');
    } catch (err) {
      if (err.message.includes('Selling price cannot exceed MRP')) {
        console.log('✓ Validation 1 PASSED: Selling price > MRP rejected successfully.');
      } else {
        throw err;
      }
    }

    // 3b: Duplicate variant SKU rejection
    try {
      await productService.createProduct({
        business_id: testBusinessId,
        name: 'Duplicate Variant SKU Product',
        sku: `DUP-VAR-${Date.now()}`,
        mrp: 1000,
        selling_price: 900,
        has_variants: true,
        variants: [
          { sku: 'DUP-SKU-01', mrp: 1000, selling_price: 900 },
          { sku: 'dup-sku-01', mrp: 1000, selling_price: 900 }, // Duplicate!
        ],
      });
      throw new Error('FAILED: Duplicate variant SKU was not rejected!');
    } catch (err) {
      if (err.message.includes('Duplicate variant SKU detected')) {
        console.log('✓ Validation 2 PASSED: Duplicate variant SKU rejected successfully.');
      } else {
        throw err;
      }
    }

    // 4. Product Retrieval & Data Integrity
    console.log('\n--- 4. Testing Product Retrieval by ID ---');
    const fetched = await productService.getProductById(testProductId);
    if (!fetched) throw new Error('Could not fetch created product by ID.');
    if (fetched.images.length !== 3) throw new Error('Sub-images gallery length mismatch.');
    if (fetched.video_url !== 'https://cdn.smartgali.in/videos/polo-fabric-feel-demo.mp4') {
      throw new Error('Video URL mismatch.');
    }
    if (fetched.attributes.gender !== 'Men') throw new Error('Gender attribute mismatch.');
    if (fetched.attributes['Gsm Count'] !== '220 GSM Heavy Combed Cotton') throw new Error('Custom specification mismatch.');
    console.log('✓ Product retrieval verified with intact gallery images, video URL, and specifications.');

    // 5. Public Storefront Endpoint & Security Protection
    console.log('\n--- 5. Testing Public Storefront Catalog Endpoint & Security ---');
    const publicProducts = await productService.getPublicProductsByBusiness(testBusinessId);
    const pubProduct = publicProducts.find(p => String(p.id) === String(testProductId));
    if (!pubProduct) throw new Error('Product not found in public storefront listing.');

    // Security Check: cost_price and profit_margin MUST NOT exist!
    if (pubProduct.cost_price !== undefined || pubProduct.profit_margin !== undefined) {
      throw new Error('SECURITY VIOLATION: cost_price or profit_margin leaked in public catalog!');
    }

    // Verify variants do NOT leak cost_price
    if (Array.isArray(pubProduct.variants)) {
      for (const v of pubProduct.variants) {
        if (v.cost_price !== undefined || v.costPrice !== undefined) {
          throw new Error('SECURITY VIOLATION: Variant cost_price leaked to public!');
        }
      }
    }

    // Verify public product includes attributes, images, video_url
    if (!pubProduct.attributes || pubProduct.attributes.fabric !== '100% Cotton') {
      throw new Error('Public storefront product missing attributes/specifications!');
    }
    if (!pubProduct.images || pubProduct.images.length !== 3) {
      throw new Error('Public storefront product missing sub-images gallery!');
    }
    if (!pubProduct.video_url) {
      throw new Error('Public storefront product missing video URL!');
    }
    console.log('✓ Public catalog projection verified: cost_price & profit_margin are securely hidden, while specifications, gallery images, and video URL are cleanly exposed.');

    // 6. Testing Product Update
    console.log('\n--- 6. Testing Enterprise Product Update ---');
    const updated = await productService.updateProduct(testProductId, {
      selling_price: 899.00,
      attributes: {
        ...created.attributes,
        'Fabric Blend': '95% Combed Cotton, 5% Spandex Elastane',
        'Bio-Washed': 'Yes, Silicon Washed',
      },
    }, 1, true);

    if (updated.selling_price !== '899.00' && updated.selling_price !== 899) {
      throw new Error(`Selling price did not update to 899. Got: ${updated.selling_price}`);
    }
    if (updated.attributes['Bio-Washed'] !== 'Yes, Silicon Washed') {
      throw new Error('Dynamic specification did not update.');
    }
    console.log(`✓ Product updated successfully: Price updated to ${updated.selling_price}, New Profit Margin: ${updated.profit_margin}%`);

    console.log('\n====================================================');
    console.log('  ALL ENTERPRISE PRODUCT SYSTEM TESTS PASSED SUCCESSFULLY!  ');
    console.log('====================================================');

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup test product
    if (testProductId) {
      try {
        await sequelize.query('DELETE FROM product_inventory_movements WHERE product_id = ?', { replacements: [testProductId] });
        await sequelize.query('DELETE FROM business_products WHERE id = ?', { replacements: [testProductId] });
        console.log(`\n[CLEANUP] Deleted test product #${testProductId} and test inventory movements.`);
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
    }
    await sequelize.close();
  }
}

runEnterpriseProductTests();
