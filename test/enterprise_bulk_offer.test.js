import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/db.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import BusinessCategory from '../src/modules/business_category/business_category.model.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import ProductInventoryMovement from '../src/modules/business_product/product_inventory_movement.model.js';
import BusinessOffer from '../src/modules/business_offer/business_offer.model.js';
import BusinessOfferDiscountGroup from '../src/modules/business_offer/business_offer_discount_group.model.js';
import BusinessOfferTarget from '../src/modules/business_offer/business_offer_target.model.js';
import BusinessOrder from '../src/modules/business_order/business_order.model.js';
import BusinessOrderItem from '../src/modules/business_order/business_order_item.model.js';
import * as businessOfferService from '../src/modules/business_offer/business_offer.service.js';
import * as businessProductService from '../src/modules/business_product/business_product.service.js';
import * as businessOrderService from '../src/modules/business_order/business_order.service.js';
import {
  buildCampaignPreview,
  buildEvaluableCampaigns,
  evaluateProductAutoOffer,
  normalizeCampaignInput,
  resolveCheckoutOffers,
  validateCampaignPayload,
} from '../src/modules/business_offer/business_offer_engine.helper.js';

const CREATED_IDS = {
  orders: [],
  offers: [],
  products: [],
  businesses: [],
};

const cleanup = async () => {
  if (CREATED_IDS.orders.length > 0) {
    await BusinessOrderItem.destroy({ where: { order_id: CREATED_IDS.orders }, force: true });
    await BusinessOrder.destroy({ where: { id: CREATED_IDS.orders }, force: true });
  }
  if (CREATED_IDS.offers.length > 0) {
    await BusinessOfferTarget.destroy({ where: { offer_id: CREATED_IDS.offers }, force: true });
    await BusinessOfferDiscountGroup.destroy({ where: { offer_id: CREATED_IDS.offers }, force: true });
    await BusinessOffer.destroy({ where: { id: CREATED_IDS.offers }, force: true });
  }
  if (CREATED_IDS.products.length > 0) {
    await ProductInventoryMovement.destroy({ where: { product_id: CREATED_IDS.products }, force: true });
    await BusinessProduct.destroy({ where: { id: CREATED_IDS.products }, force: true });
  }
  if (CREATED_IDS.businesses.length > 0) {
    await BusinessProfile.destroy({ where: { id: CREATED_IDS.businesses }, force: true });
  }
};

after(async () => {
  await cleanup().catch((e) => console.error('Cleanup error:', e));
  await sequelize.close();
});

// ---------------------------------------------------------------------------
// UNIT TESTS: PURE ENGINE & VALIDATION RULES
// ---------------------------------------------------------------------------

test('Validation engine blocks invalid dates, >95% off, missing targets & foreign product IDs', () => {
  const storeCatalog = [
    { id: 101, business_id: 1, name: 'Nike Shoes', selling_price: 2500, status: 'active', approval_status: 'approved' },
  ];

  const badDates = normalizeCampaignInput({
    business_id: 1,
    title: 'Bad Dates',
    valid_from: '2026-12-20',
    valid_to: '2026-12-10',
    discount_type: 'percentage',
    discount_percent: 20,
  });
  const resDates = validateCampaignPayload(badDates, storeCatalog);
  assert.equal(resDates.valid, false);
  assert.ok(resDates.errors.some((e) => e.includes('earlier than valid_from')));

  const badPct = normalizeCampaignInput({
    business_id: 1,
    title: 'Too High',
    discount_type: 'percentage',
    discount_percent: 98,
  });
  assert.equal(validateCampaignPayload(badPct, storeCatalog).valid, false);

  const missingCatTargets = normalizeCampaignInput({
    business_id: 1,
    title: 'Missing Cat',
    campaign_scope: 'SELECTED_CATEGORIES',
    discount_type: 'percentage',
    discount_percent: 25,
    targets: [],
  });
  assert.equal(validateCampaignPayload(missingCatTargets, storeCatalog).valid, false);

  const foreignProduct = normalizeCampaignInput({
    business_id: 1,
    title: 'Foreign Product Attempt',
    campaign_scope: 'SELECTED_PRODUCTS',
    discount_type: 'percentage',
    discount_percent: 15,
    targets: [{ target_type: 'PRODUCT', product_id: 999999 }],
  });
  const resForeign = validateCampaignPayload(foreignProduct, storeCatalog);
  assert.equal(resForeign.valid, false);
  assert.ok(resForeign.errors.some((e) => e.includes('does not belong to this store')));
});

test('Scope 1-4 + dynamic_include_new + Multi Discount Groups resolve accurately', () => {
  const baseDate = new Date('2026-10-01T10:00:00Z');
  const newerDate = new Date('2026-10-15T10:00:00Z');

  const products = [
    {
      id: 1,
      name: 'Nike Shoes',
      category_id: 10,
      category_name: 'Footwear',
      selling_price: 2500,
      status: 'active',
      approval_status: 'approved',
      created_at: baseDate,
    },
    {
      id: 2,
      name: 'Nike T-Shirt',
      category_id: 20,
      category_name: "Men's Clothing",
      selling_price: 800,
      status: 'active',
      approval_status: 'approved',
      variants: [
        { id: 'v_blk_m', name: 'Size/Color', value: 'Black - M', selling_price: 800 },
        { id: 'v_blk_s', name: 'Size/Color', value: 'Black - S', selling_price: 800 },
      ],
      created_at: baseDate,
    },
    {
      id: 3,
      name: 'Nike Bag',
      category_id: 30,
      category_name: 'Accessories',
      selling_price: 1500,
      status: 'active',
      approval_status: 'approved',
      created_at: baseDate,
    },
    {
      id: 4,
      name: 'Future Sneaker Launch',
      category_id: 10,
      category_name: 'Footwear',
      selling_price: 4000,
      status: 'active',
      approval_status: 'approved',
      created_at: newerDate,
    },
  ];

  // Multi-group campaign created on Oct 10: Shoes 20%, Bags flat 200, Variant Black-M 15%
  const campaignCreatedAt = new Date('2026-10-10T10:00:00Z');
  const multiCamp = buildEvaluableCampaigns([
    {
      id: 50,
      business_id: 1,
      title: 'Nike Multi-Group Sale',
      campaign_scope: 'MULTI_GROUP',
      application_mode: 'AUTO',
      conflict_policy: 'HIGHEST_DISCOUNT',
      is_active: true,
      is_deleted: false,
      created_at: campaignCreatedAt,
      discount_groups: [
        {
          id: 501,
          group_name: 'Group A - Footwear',
          scope_type: 'SELECTED_CATEGORIES',
          discount_type: 'percentage',
          discount_value: 20,
          max_discount_amount: 500,
          dynamic_include_new: true,
          created_at: campaignCreatedAt,
          targets: [{ target_type: 'CATEGORY', category_id: 10, category_name: 'Footwear' }],
        },
        {
          id: 502,
          group_name: 'Group B - Bags',
          scope_type: 'SELECTED_PRODUCTS',
          discount_type: 'flat',
          discount_value: 200,
          targets: [{ target_type: 'PRODUCT', product_id: 3 }],
        },
        {
          id: 503,
          group_name: 'Group C - T-Shirt Black M Only',
          scope_type: 'SELECTED_VARIANTS',
          discount_type: 'percentage',
          discount_value: 15,
          targets: [{ target_type: 'VARIANT', product_id: 2, variant_id: 'v_blk_m', variant_label: 'Size/Color: Black - M' }],
        },
      ],
    },
  ]);

  // Shoes: 20% of 2500 = 500 -> final 2000
  const shoeOffer = evaluateProductAutoOffer(products[0], multiCamp);
  assert.equal(shoeOffer.discount_amount, 500);
  assert.equal(shoeOffer.effective_price, 2000);
  assert.equal(shoeOffer.group_name, 'Group A - Footwear');

  // Future Sneaker added after Oct 10 with dynamic_include_new=true -> 20% of 4000 capped at 500 -> 3500
  const futureOffer = evaluateProductAutoOffer(products[3], multiCamp);
  assert.equal(futureOffer.discount_amount, 500);
  assert.equal(futureOffer.effective_price, 3500);

  // T-Shirt Black M discounted 15% (120 OFF), Black S NOT discounted!
  const tshirtOffer = evaluateProductAutoOffer(products[1], multiCamp);
  assert.equal(tshirtOffer.variant_specific_only, true);
  assert.equal(tshirtOffer.variant_offers['v_blk_m'].effective_price, 680);
  assert.equal(tshirtOffer.variant_offers['v_blk_s'], undefined);

  // Bags: Flat ₹200 OFF -> 1300
  const bagOffer = evaluateProductAutoOffer(products[2], multiCamp);
  assert.equal(bagOffer.discount_amount, 200);
  assert.equal(bagOffer.effective_price, 1300);

  // Turn dynamic_include_new = false -> Future Sneaker is excluded!
  multiCamp[0].discount_groups[0].dynamic_include_new = false;
  assert.equal(evaluateProductAutoOffer(products[3], multiCamp), null);
});

test('Conflict resolution: Storewide 10% vs Category 20% never stack unintentionally & obeys PRIORITY vs HIGHEST_DISCOUNT', () => {
  const shoe = {
    id: 1,
    name: 'Nike Shoes',
    category_id: 10,
    category_name: 'Footwear',
    selling_price: 2500,
    status: 'active',
    approval_status: 'approved',
  };

  const storewide = {
    id: 10,
    business_id: 1,
    title: 'Storewide 10%',
    campaign_scope: 'ENTIRE_STORE',
    application_mode: 'AUTO',
    conflict_policy: 'PRIORITY',
    priority: 1,
    stackable: false,
    is_active: true,
    is_deleted: false,
    discount_groups: [{ id: 1001, scope_type: 'ENTIRE_STORE', discount_type: 'percentage', discount_value: 10, priority: 1, targets: [] }],
  };
  const footwearCat = {
    id: 11,
    business_id: 1,
    title: 'Footwear 20%',
    campaign_scope: 'SELECTED_CATEGORIES',
    application_mode: 'AUTO',
    conflict_policy: 'HIGHEST_DISCOUNT',
    priority: 10,
    stackable: false,
    is_active: true,
    is_deleted: false,
    discount_groups: [
      {
        id: 1002,
        scope_type: 'SELECTED_CATEGORIES',
        discount_type: 'percentage',
        discount_value: 20,
        priority: 10,
        targets: [{ target_type: 'CATEGORY', category_id: 10, category_name: 'Footwear' }],
      },
    ],
  };

  // Since storewide has PRIORITY policy & priority 1 < 10, storewide 10% (250) wins over 20% (500)
  const prioWin = evaluateProductAutoOffer(shoe, buildEvaluableCampaigns([storewide, footwearCat]));
  assert.equal(prioWin.offer_id, 10);
  assert.equal(prioWin.discount_amount, 250);
  assert.equal(prioWin.competing_offers.length, 1);

  // Switch storewide policy to HIGHEST_DISCOUNT -> Footwear 20% (500) wins cleanly (NOT combined 30%)!
  storewide.conflict_policy = 'HIGHEST_DISCOUNT';
  const highWin = evaluateProductAutoOffer(shoe, buildEvaluableCampaigns([storewide, footwearCat]));
  assert.equal(highWin.offer_id, 11);
  assert.equal(highWin.discount_amount, 500);
  assert.equal(highWin.effective_price, 2000);
});

test('Checkout engine enforces min_order, prevents AUTO + COUPON double stacking & produces snapshots', () => {
  const shoe = { id: 1, name: 'Nike Shoes', category_id: 10, category_name: 'Footwear', selling_price: 2500, status: 'active', approval_status: 'approved' };
  const campaigns = buildEvaluableCampaigns([
    {
      id: 71,
      business_id: 1,
      title: 'Footwear 20%',
      campaign_scope: 'SELECTED_CATEGORIES',
      application_mode: 'AUTO',
      conflict_policy: 'HIGHEST_DISCOUNT',
      stackable: false,
      is_active: true,
      is_deleted: false,
      discount_groups: [
        {
          id: 711,
          group_name: 'Shoes 20%',
          scope_type: 'SELECTED_CATEGORIES',
          discount_type: 'percentage',
          discount_value: 20,
          targets: [{ target_type: 'CATEGORY', category_id: 10, category_name: 'Footwear' }],
        },
      ],
    },
    {
      id: 72,
      business_id: 1,
      title: 'Promo ₹300 OFF',
      promo_code: 'SAVE300',
      campaign_scope: 'ENTIRE_STORE',
      application_mode: 'COUPON',
      conflict_policy: 'HIGHEST_DISCOUNT',
      stackable: false,
      min_order_amount: 1000,
      is_active: true,
      is_deleted: false,
      discount_groups: [{ id: 721, scope_type: 'ENTIRE_STORE', discount_type: 'flat', discount_value: 300, min_order_amount: 1000, targets: [] }],
    },
  ]);

  // Shoes 2500 -> AUTO gives ₹500 OFF vs Coupon SAVE300 gives ₹300 OFF -> AUTO retains ₹500 (no ₹800 double stack!)
  const checkoutRes = resolveCheckoutOffers({
    evaluatedItems: [{ _product_raw: shoe, product_id: 1, unit_price: 2500, quantity: 1, line_total: 2500 }],
    evaluableCampaigns: campaigns,
    promoCode: 'SAVE300',
    subtotal: 2500,
  });

  assert.equal(checkoutRes.auto_offer_discount, 500);
  assert.equal(checkoutRes.promo.discount, 0);
  assert.equal(checkoutRes.promo.overridden_by_auto_offer, true);
  assert.equal(checkoutRes.total_discount, 500);
  assert.equal(checkoutRes.item_annotations[0].offer_discount_amount, 500);
  assert.equal(checkoutRes.item_annotations[0].applied_offer_title, 'Footwear 20%');
});

// ---------------------------------------------------------------------------
// LIVE DB INTEGRATION TESTS: PERSISTENCE, CATALOG HYDRATION & IMMUTABLE ORDERS
// ---------------------------------------------------------------------------

test('Live MariaDB: Bulk campaign CRUD, preview, catalog hydration & immutable order snapshots', async () => {
  // Create temporary store & 3 products cleanly
  const biz = await BusinessProfile.create({
    businessName: 'Test Bulk Offer Store',
    serviceCategory: 'Retail',
    phone: '9999900011',
    city_name: 'Patna',
    is_active: true,
    is_open: true,
    is_verified: true,
    is_deleted: false,
    created_at: new Date(),
    updatedAt: new Date(),
  });
  CREATED_IDS.businesses.push(biz.id);

  const realCats = await BusinessCategory.findAll({ where: { is_deleted: false }, limit: 3 });
  const cat0 = realCats[0] || { id: null, name: 'Footwear' };
  const cat1 = realCats[1] || { id: null, name: "Men's Clothing" };
  const cat2 = realCats[2] || { id: null, name: 'Accessories' };

  const pShoes = await BusinessProduct.create({
    business_id: biz.id,
    name: 'Test Runner Pro',
    sku: `TST-SHOE-${Date.now()}`,
    category_id: cat0.id,
    category_name: cat0.name,
    mrp: 3000,
    selling_price: 2500,
    status: 'active',
    approval_status: 'approved',
    track_inventory: false,
    home_delivery: true,
    store_pickup: true,
    is_deleted: false,
    created_at: new Date(),
    updatedAt: new Date(),
  });
  const pTee = await BusinessProduct.create({
    business_id: biz.id,
    name: 'Test DryFit Tee',
    sku: `TST-TEE-${Date.now()}`,
    category_id: cat1.id,
    category_name: cat1.name,
    mrp: 1000,
    selling_price: 800,
    has_variants: true,
    variants: [
      { id: 'blk-m', name: 'Color/Size', value: 'Black - M', mrp: 1000, selling_price: 800, stock: 10 },
      { id: 'wht-l', name: 'Color/Size', value: 'White - L', mrp: 1000, selling_price: 800, stock: 10 },
    ],
    status: 'active',
    approval_status: 'approved',
    track_inventory: false,
    home_delivery: true,
    store_pickup: true,
    is_deleted: false,
    created_at: new Date(),
    updatedAt: new Date(),
  });
  const pSocks = await BusinessProduct.create({
    business_id: biz.id,
    name: 'Test Sport Socks',
    sku: `TST-SOCK-${Date.now()}`,
    category_id: cat2.id,
    category_name: cat2.name,
    mrp: 350,
    selling_price: 300,
    status: 'active',
    approval_status: 'approved',
    track_inventory: false,
    home_delivery: true,
    store_pickup: true,
    is_deleted: false,
    created_at: new Date(),
    updatedAt: new Date(),
  });
  CREATED_IDS.products.push(pShoes.id, pTee.id, pSocks.id);

  // 1. Eligible catalog picker endpoint service
  const catalog = await businessOfferService.getEligibleCatalogForOffers(biz.id);
  assert.equal(catalog.total_products, 3);
  assert.equal(catalog.eligible_products, 3);
  assert.equal(catalog.categories.length, 3);

  // 2. Preview multi-group campaign
  const campPayload = {
    business_id: biz.id,
    title: 'Mega Sport Fest',
    campaign_scope: 'MULTI_GROUP',
    application_mode: 'AUTO',
    conflict_policy: 'HIGHEST_DISCOUNT',
    valid_from: '2026-01-01',
    valid_to: '2027-12-31',
    discount_groups: [
      {
        group_name: 'Footwear Group',
        scope_type: 'SELECTED_CATEGORIES',
        discount_type: 'percentage',
        discount_value: 20,
        max_discount_amount: 500,
        targets: [{ target_type: 'CATEGORY', category_id: cat0.id, category_name: cat0.name }],
      },
      {
        group_name: 'Tee Black M Variant',
        scope_type: 'SELECTED_VARIANTS',
        discount_type: 'flat',
        discount_value: 150,
        targets: [{ target_type: 'VARIANT', product_id: pTee.id, variant_id: 'blk-m', variant_label: 'Color/Size: Black - M' }],
      },
    ],
  };

  const preview = await businessOfferService.previewOfferCampaign(campPayload);
  assert.equal(preview.valid, true);
  assert.equal(preview.affected_products_count, 2); // Shoes + Tee (Socks untouched)

  // 3. Create campaign in DB
  const createdOffer = await businessOfferService.createOffer(campPayload);
  CREATED_IDS.offers.push(createdOffer.id);
  assert.equal(createdOffer.discount_groups.length, 2);
  assert.equal(createdOffer.affected_products_count, 2);

  // 4. Verify public product catalog reflects AUTO offer & variant offer cleanly
  const publicProds = await businessProductService.getPublicProductsByBusiness(biz.id, {});
  const pubShoe = publicProds.find((p) => Number(p.id) === Number(pShoes.id));
  const pubTee = publicProds.find((p) => Number(p.id) === Number(pTee.id));
  const pubSocks = publicProds.find((p) => Number(p.id) === Number(pSocks.id));

  assert.equal(pubShoe.offer_price, 2000);
  assert.equal(pubShoe.offer_badge, '20% OFF');
  assert.equal(pubTee.variants.find((v) => v.id === 'blk-m').offer_price, 650);
  assert.equal(pubTee.variants.find((v) => v.id === 'wht-l').offer_price, undefined);
  assert.equal(pubSocks.active_offer, null);

  // 5. Checkout Quote + CreateOrder persists offer snapshots
  const orderItemsPayload = [
    { product_id: pShoes.id, quantity: 1 }, // 2500 -> 500 OFF -> 2000
    { product_id: pTee.id, variant_id: 'blk-m', quantity: 1 }, // 800 -> 150 OFF -> 650
    { product_id: pSocks.id, quantity: 1 }, // 300 -> 0 OFF -> 300
  ];
  const createdOrder = await businessOrderService.createOrder(
    {
      business_id: biz.id,
      customer_name: 'Test Customer',
      customer_phone: '9999900022',
      customer_address: 'Boring Road, Patna',
      delivery_type: 'store_pickup',
      payment_mode: 'cod',
      items: orderItemsPayload,
    },
    null
  );
  CREATED_IDS.orders.push(createdOrder.id);

  assert.equal(Number(createdOrder.subtotal), 3600);
  assert.equal(Number(createdOrder.auto_offer_discount), 650);
  assert.equal(Number(createdOrder.total_amount), 2950);
  assert.ok(createdOrder.applied_offer_snapshot);

  const ordShoeItem = createdOrder.items.find((it) => Number(it.product_id) === Number(pShoes.id));
  assert.equal(Number(ordShoeItem.original_unit_price), 2500);
  assert.equal(Number(ordShoeItem.offer_discount_amount), 500);
  assert.equal(Number(ordShoeItem.unit_price), 2000);
  assert.equal(ordShoeItem.applied_offer_title, 'Mega Sport Fest');

  // 6. Modify/Delete offer afterwards -> existing order MUST stay immutable!
  await businessOfferService.softDeleteOffer(createdOffer.id, 'Campaign ended', null);
  const fetchedOrderAfter = await BusinessOrder.findOne({
    where: { id: createdOrder.id },
    include: [{ model: BusinessOrderItem, as: 'items' }],
  });
  assert.equal(Number(fetchedOrderAfter.total_amount), 2950);
  assert.equal(Number(fetchedOrderAfter.auto_offer_discount), 650);
  assert.equal(fetchedOrderAfter.items.find((it) => Number(it.product_id) === Number(pShoes.id)).applied_offer_title, 'Mega Sport Fest');
});
