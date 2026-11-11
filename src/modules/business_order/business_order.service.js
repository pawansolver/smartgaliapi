import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessOrder from './business_order.model.js';
import BusinessOrderItem from './business_order_item.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import User from '../user/user.model.js';
import * as productService from '../business_product/business_product.service.js';
import * as businessOfferService from '../business_offer/business_offer.service.js';
import * as businessCoverageService from '../business_profile/business_coverage.service.js';

const ORDER_STATUS_LABELS = {
  new: 'Order Placed by Customer',
  accepted: 'Order Accepted by Store',
  preparing: 'Store Started Preparing / Packing',
  ready_for_pickup: 'Ready for Store Pickup',
  out_for_delivery: 'Dispatched for Delivery',
  completed: 'Order Delivered / Completed',
  cancelled: 'Order Cancelled',
  returned: 'Order Returned',
  refunded: 'Amount Refunded',
};

const ALLOWED_TRANSITIONS = {
  new: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: ['returned'],
  returned: ['refunded'],
  cancelled: [],
  refunded: [],
};

const normalizePaymentMode = (raw) => {
  const s = String(raw || 'cod').trim();
  const lower = s.toLowerCase();
  if (lower === 'cod' || lower === 'cash on delivery') return { db: 'cod', display: 'COD' };
  if (lower === 'upi') return { db: 'upi', display: 'UPI' };
  if (lower === 'card') return { db: 'card', display: 'Card' };
  return { db: 'prepaid', display: 'Online Prepaid' };
};

const generateOrderNumber = () => {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900);
  return `SG-ORD-${ts}${rand}`;
};

const formatOrder = (orderInstance) => {
  if (!orderInstance) return null;
  const plain = typeof orderInstance.toJSON === 'function' ? orderInstance.toJSON() : { ...orderInstance };
  const pm = normalizePaymentMode(plain.payment_mode);
  const rawPaymentStatus = String(plain.payment_status || 'pending');
  const displayPaymentStatus =
    rawPaymentStatus.toLowerCase() === 'paid' || rawPaymentStatus.toLowerCase() === 'completed'
      ? 'Paid'
      : rawPaymentStatus.toLowerCase() === 'refunded'
        ? 'Refunded'
        : 'Pending';

  return {
    ...plain,
    payment_mode: pm.display,
    payment_mode_code: pm.db,
    payment_status: displayPaymentStatus,
    business_name: plain.business?.business_name || plain.business?.businessName || plain.business_name || null,
    business_phone: plain.business?.phone || null,
    business_address: plain.business?.address || null,
    createdAt: plain.created_at,
  };
};

const buildTimelineEntry = (status, note = null, customLabel = null) => ({
  status,
  label: customLabel || ORDER_STATUS_LABELS[status] || `Status updated to ${status.toUpperCase()}`,
  note: note || null,
  timestamp: new Date().toISOString(),
  isCompleted: true,
});

const ORDER_INCLUDE = [
  {
    model: BusinessOrderItem,
    as: 'items',
    where: { is_deleted: false },
    required: false,
  },
  {
    model: BusinessProfile,
    as: 'business',
    attributes: ['id', 'userId', 'businessName', 'phone', 'address', 'city_name', 'locality_name', 'logo_url'],
    required: false,
  },
];

const round2 = (n) => Number((Number(n || 0)).toFixed(2));

const parseBulkTiers = (rawTiers) => {
  let list = rawTiers;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((tier) => {
      if (!tier || typeof tier !== 'object') return null;
      const minQty = parseInt(tier.min_qty ?? tier.minQty ?? 0, 10);
      const discountPercent = Number(tier.discount_percent ?? tier.discountPercent ?? 0);
      const rawFixed = tier.fixed_price ?? tier.fixedPrice;
      const fixedPrice = rawFixed !== null && rawFixed !== undefined && rawFixed !== '' ? Number(rawFixed) : null;
      if (!Number.isFinite(minQty) || minQty <= 0) return null;
      return {
        min_qty: minQty,
        discount_percent: Number.isFinite(discountPercent) ? discountPercent : 0,
        fixed_price: fixedPrice !== null && Number.isFinite(fixedPrice) ? fixedPrice : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.min_qty - b.min_qty);
};

const computeTierUnitPrice = (tier, baseUnitPrice) => {
  if (!tier) return round2(baseUnitPrice);
  if (tier.fixed_price !== null && tier.fixed_price > 0) {
    return round2(tier.fixed_price);
  }
  if (tier.discount_percent > 0) {
    return round2(baseUnitPrice * (1 - tier.discount_percent / 100));
  }
  return round2(baseUnitPrice);
};

const resolveBulkPricing = (tiers, qty, baseUnitPrice) => {
  let matchedTier = null;
  let nextTier = null;

  for (const tier of tiers) {
    if (tier.min_qty <= qty) {
      matchedTier = tier;
    } else if (!nextTier) {
      nextTier = tier;
    }
  }

  const effectiveUnitPrice = matchedTier
    ? computeTierUnitPrice(matchedTier, baseUnitPrice)
    : round2(baseUnitPrice);

  const unitBulkSavings = Math.max(0, round2(baseUnitPrice - effectiveUnitPrice));
  const lineBulkDiscount = round2(unitBulkSavings * qty);

  const nextBulkTier = nextTier
    ? {
        min_qty: nextTier.min_qty,
        discount_percent: nextTier.discount_percent,
        fixed_price: nextTier.fixed_price,
        qty_needed: Math.max(1, nextTier.min_qty - qty),
        projected_unit_price: computeTierUnitPrice(nextTier, baseUnitPrice),
      }
    : null;

  return {
    effectiveUnitPrice,
    lineBulkDiscount,
    appliedTier: matchedTier,
    nextBulkTier,
  };
};

const buildPromoValidationMessage = ({
  allStoreOffers,
  promoResult,
  rawPromoCode,
  strict = false,
}) => {
  const code = String(rawPromoCode || '').trim().toUpperCase();
  if (!code) {
    return { offer: null, promo_code: null, discount: 0, applied: false, error: null };
  }

  const matchedAny = (allStoreOffers || []).find(
    (o) => String(o.promo_code || o.promoCode || '').trim().toUpperCase() === code
  );

  if (promoResult.valid && !promoResult.overridden_by_auto_offer) {
    return {
      offer: matchedAny || { id: promoResult.offer_id, title: promoResult.title, promo_code: code },
      promo_code: code,
      discount: Number(promoResult.discount || 0),
      applied: Number(promoResult.discount || 0) > 0,
      error: null,
    };
  }

  let msg = `Promo code "${code}" is invalid for this store.`;
  if (promoResult.overridden_by_auto_offer) {
    msg = `Automatic store offer gives a better discount than coupon "${code}".`;
  } else if (matchedAny && !businessOfferService.isOfferCurrentlyValid(matchedAny)) {
    msg = `Promo code "${code}" is inactive or has expired.`;
  } else if (promoResult.reason === 'NO_ELIGIBLE_ITEMS') {
    msg = `None of the items in your cart are eligible for coupon "${code}".`;
  } else if (promoResult.reason === 'MIN_ORDER_NOT_MET') {
    const minOrder = Number(promoResult.min_order_amount ?? matchedAny?.min_order_amount ?? 0);
    msg = `Minimum qualifying total of ₹${minOrder.toFixed(0)} required for "${code}".`;
  }

  if (strict && !promoResult.overridden_by_auto_offer) {
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }

  return {
    offer: matchedAny || null,
    promo_code: code,
    discount: 0,
    applied: false,
    error: msg,
  };
};

const computeTaxBreakdown = (taxLines, subtotal, couponDiscount) => {
  const netFactor = subtotal > 0 ? Math.max(0, (subtotal - couponDiscount) / subtotal) : 1;
  let totalTaxable = 0;
  let inclusiveTax = 0;
  let exclusiveTax = 0;
  const slabMap = new Map();

  for (const line of taxLines) {
    const discountedAmount = round2(line.lineTotal * netFactor);
    const slab = Number(line.gst_slab || 0);
    const inclusive = line.tax_inclusive !== false;

    let taxable = discountedAmount;
    let lineTax = 0;
    if (slab > 0 && discountedAmount > 0) {
      if (inclusive) {
        taxable = discountedAmount / (1 + slab / 100);
        lineTax = discountedAmount - taxable;
        inclusiveTax += lineTax;
      } else {
        taxable = discountedAmount;
        lineTax = (discountedAmount * slab) / 100;
        exclusiveTax += lineTax;
      }
    }

    totalTaxable += taxable;
    if (slab > 0) {
      const key = `${slab}_${inclusive ? 'inc' : 'exc'}`;
      const existing = slabMap.get(key) || {
        gst_slab: slab,
        tax_inclusive: inclusive,
        taxable_amount: 0,
        cgst: 0,
        sgst: 0,
        tax_amount: 0,
      };
      existing.taxable_amount = round2(existing.taxable_amount + taxable);
      existing.tax_amount = round2(existing.tax_amount + lineTax);
      existing.cgst = round2(existing.tax_amount / 2);
      existing.sgst = round2(existing.tax_amount - existing.cgst);
      slabMap.set(key, existing);
    }
  }

  const slabs = Array.from(slabMap.values()).sort((a, b) => a.gst_slab - b.gst_slab);
  return {
    taxable_amount: round2(totalTaxable),
    inclusive_tax: round2(inclusiveTax),
    exclusive_tax: round2(exclusiveTax),
    total_tax: round2(inclusiveTax + exclusiveTax),
    slabs,
  };
};

const resolveVariantDetails = (product, reqVariantId) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let unitPrice = Number(product.selling_price || 0);
  let mrp = Number(product.mrp || unitPrice);
  let variantId = reqVariantId || null;
  let variantName = null;
  let sku = product.sku;
  let image = product.primary_image || (Array.isArray(product.images) ? product.images[0] : null);
  let matchedVariant = null;
  let variantMissing = false;

  if (variantId) {
    matchedVariant = variants.find((v) => v && String(v.id) === String(variantId)) || null;
    if (!matchedVariant) {
      variantMissing = true;
    } else {
      unitPrice = Number(matchedVariant.selling_price ?? product.selling_price ?? 0);
      mrp = Number(matchedVariant.mrp ?? product.mrp ?? unitPrice);
      variantName = [matchedVariant.name, matchedVariant.value]
        .filter((part) => part && String(part).trim().length > 0)
        .join(': ');
      if (!variantName) variantName = String(variantId);
      sku = matchedVariant.sku || sku;
      if (matchedVariant.image) image = matchedVariant.image;
    }
  }

  return {
    variants,
    matchedVariant,
    variantMissing,
    unitPrice,
    mrp,
    variantId,
    variantName,
    sku,
    image,
  };
};

const evaluateCartOrder = async (
  payload,
  {
    transaction = null,
    strict = false,
    includeOffers = false,
    includeCrossSell = false,
    orderNumber = null,
    reserveCustomerName = null,
  } = {}
) => {
  const {
    business_id: businessId,
    delivery_type: deliveryType = 'home_delivery',
    payment_mode: rawPaymentMode = 'cod',
    promo_code: rawPromoCode = null,
    items: requestedItems = [],
  } = payload;

  const business = await BusinessProfile.findOne({
    where: { id: businessId, is_deleted: false, is_active: true },
  });
  if (!business) {
    const err = new Error('Business store not found.');
    err.statusCode = 404;
    throw err;
  }

  const businessPlain = business.toJSON ? business.toJSON() : { ...business };
  const storeName = businessPlain.businessName || businessPlain.business_name || 'Store';
  const isStoreOpen = businessPlain.is_open !== false;
  if (strict && !isStoreOpen) {
    const err = new Error(`${storeName} is currently closed and not accepting orders.`);
    err.statusCode = 400;
    throw err;
  }

  const pm = normalizePaymentMode(rawPaymentMode);
  const queryLoc = businessCoverageService.parseLocationQuery(payload);
  const coverageData = await businessCoverageService.getBusinessCoverage(business.id);
  const shopEval = businessCoverageService.evaluateBusinessMatch(
    businessPlain,
    coverageData.coverage_areas,
    coverageData.society_accesses,
    queryLoc
  );

  const blockingIssues = [];
  if (!isStoreOpen) {
    blockingIssues.push(`${storeName} is currently closed and not accepting orders.`);
  }
  if (queryLoc.hasLocationFilter && deliveryType === 'home_delivery' && !shopEval.matched) {
    const msg = `${storeName} does not deliver to your selected location.`;
    if (strict) {
      const err = new Error(msg);
      err.statusCode = 400;
      throw err;
    }
    blockingIssues.push(msg);
  }

  // Coalesce identical (product_id, variant_id) lines cleanly
  const mergedMap = new Map();
  for (const entry of requestedItems) {
    const pid = Number(entry.product_id);
    const vid = entry.variant_id ? String(entry.variant_id).trim() : null;
    const qty = Number(entry.quantity || 0);
    const key = `${pid}__${vid || 'base'}`;
    if (mergedMap.has(key)) {
      mergedMap.get(key).quantity += qty;
    } else {
      mergedMap.set(key, { product_id: pid, variant_id: vid, quantity: qty });
    }
  }
  const normalizedItems = Array.from(mergedMap.values());

  let mrpTotal = 0;
  let catalogSubtotal = 0;
  let bulkDiscount = 0;
  let subtotal = 0;
  let packagingFee = 0;
  let maxDeliveryCharge = 0;
  const freeDeliveryThresholds = [];
  let maxEstimatedMinutes = 30;
  const quotedItems = [];
  const orderItemsToCreate = [];
  const lineEvalEntries = [];
  const taxLines = [];
  const productIdsInCart = new Set();

  for (const reqItem of normalizedItems) {
    productIdsInCart.add(reqItem.product_id);
    const findOpts = {
      where: {
        id: reqItem.product_id,
        business_id: businessId,
        is_deleted: false,
      },
    };
    if (transaction) {
      findOpts.transaction = transaction;
      findOpts.lock = transaction.LOCK.UPDATE;
    }
    const product = await BusinessProduct.findOne(findOpts);

    if (!product) {
      if (strict) {
        const err = new Error(`Product #${reqItem.product_id} was not found in this store.`);
        err.statusCode = 404;
        throw err;
      }
      blockingIssues.push(`Product #${reqItem.product_id} is no longer available in ${storeName}.`);
      quotedItems.push({
        product_id: reqItem.product_id,
        variant_id: reqItem.variant_id,
        quantity: reqItem.quantity,
        is_available: false,
        is_deliverable: false,
        availability_issue: 'Product removed from store catalog',
        delivery_message: 'Product unavailable',
      });
      continue;
    }

    const productPlain = product.toJSON ? product.toJSON() : { ...product };
    const qty = reqItem.quantity;
    const itemIssues = [];

    if (productPlain.status !== 'active' || productPlain.approval_status !== 'approved') {
      const msg = `${productPlain.name} is currently unavailable for ordering.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }

    const minQty = Number(productPlain.min_order_quantity || 1);
    const maxQty = productPlain.max_order_quantity != null ? Number(productPlain.max_order_quantity) : null;
    if (qty < minQty) {
      const msg = `Minimum order quantity for ${productPlain.name} is ${minQty}.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }
    if (maxQty !== null && qty > maxQty) {
      const msg = `Maximum order quantity for ${productPlain.name} is ${maxQty}.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }

    if (deliveryType === 'home_delivery' && productPlain.home_delivery === false) {
      const msg = `${productPlain.name} is only available for Store Pickup.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }
    if (deliveryType === 'store_pickup' && productPlain.store_pickup === false) {
      const msg = `${productPlain.name} is only available for Home Delivery.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }
    if (pm.db === 'cod' && productPlain.cash_on_delivery === false) {
      const msg = `${productPlain.name} does not support Cash on Delivery.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }

    const deliveryEligibility =
      deliveryType === 'store_pickup'
        ? { is_deliverable: true, delivery_message: 'Available for Store Pickup' }
        : businessCoverageService.checkProductDeliveryEligibility(productPlain, shopEval, queryLoc);

    if (deliveryType === 'home_delivery' && !deliveryEligibility.is_deliverable) {
      if (strict) {
        const err = new Error(deliveryEligibility.delivery_message || `${productPlain.name} is not deliverable here.`);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(deliveryEligibility.delivery_message || 'Not deliverable to selected location');
    }

    const vDetails = resolveVariantDetails(productPlain, reqItem.variant_id);
    if (vDetails.variantMissing) {
      const msg = `Selected option for ${productPlain.name} is no longer available.`;
      if (strict) {
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
      }
      itemIssues.push(msg);
    }

    const prodAvailableQty = Number(productPlain.available_quantity ?? 0);
    const variantStock = vDetails.matchedVariant
      ? Math.min(Number(vDetails.matchedVariant.stock ?? prodAvailableQty), prodAvailableQty)
      : prodAvailableQty;
    const effectiveStockAvailable =
      productPlain.track_inventory && !productPlain.allow_backorder
        ? variantStock
        : 9999;

    if (
      productPlain.track_inventory &&
      !productPlain.allow_backorder &&
      effectiveStockAvailable < qty
    ) {
      const msg =
        effectiveStockAvailable <= 0
          ? `${productPlain.name} is currently out of stock.`
          : `Only ${effectiveStockAvailable} units left for ${productPlain.name}.`;
      if (!strict) {
        itemIssues.push(msg);
      }
    }

    if (strict) {
      await productService.reserveStock(
        product.id,
        qty,
        orderNumber,
        reserveCustomerName,
        { transaction, variantId: vDetails.variantId }
      );
    }

    const bulkTiers = parseBulkTiers(productPlain.bulk_pricing);
    const bulkInfo = resolveBulkPricing(bulkTiers, qty, vDetails.unitPrice);

    const mrpEffective = Math.max(vDetails.mrp, vDetails.unitPrice);
    const lineTotal = round2(bulkInfo.effectiveUnitPrice * qty);
    const lineCatalogTotal = round2(vDetails.unitPrice * qty);
    const lineMrpTotal = round2(mrpEffective * qty);

    mrpTotal = round2(mrpTotal + lineMrpTotal);
    catalogSubtotal = round2(catalogSubtotal + lineCatalogTotal);
    bulkDiscount = round2(bulkDiscount + bulkInfo.lineBulkDiscount);
    subtotal = round2(subtotal + lineTotal);

    const linePkgFee = round2(Number(productPlain.packaging_charge || 0) * qty);
    packagingFee = round2(packagingFee + linePkgFee);

    const prodDelCharge = Number(productPlain.delivery_charge || 0);
    if (prodDelCharge > maxDeliveryCharge) maxDeliveryCharge = prodDelCharge;
    if (productPlain.free_delivery_above !== null && productPlain.free_delivery_above !== undefined) {
      const th = Number(productPlain.free_delivery_above);
      if (th > 0) freeDeliveryThresholds.push(th);
    }

    const prepMins = Number(productPlain.prep_time_minutes || 30);
    const delMins = deliveryType === 'home_delivery' ? Number(productPlain.delivery_time_minutes || 30) : 0;
    if (prepMins + delMins > maxEstimatedMinutes) {
      maxEstimatedMinutes = prepMins + delMins;
    }

    const gstSlab = Number(productPlain.gst_slab || 0);
    const taxInclusive = productPlain.tax_inclusive !== false;
    taxLines.push({
      product_id: productPlain.id,
      gst_slab: gstSlab,
      tax_inclusive: taxInclusive,
      lineTotal,
    });

    if (itemIssues.length > 0) {
      blockingIssues.push(...itemIssues);
    }

    const orderItemIdx =
      orderItemsToCreate.push({
        business_id: businessId,
        product_id: product.id,
        variant_id: vDetails.variantId,
        variant_name: vDetails.variantName || null,
        product_name: productPlain.name,
        sku: vDetails.sku,
        image: vDetails.image || null,
        quantity: qty,
        mrp: round2(vDetails.mrp),
        original_unit_price: bulkInfo.effectiveUnitPrice,
        unit_price: bulkInfo.effectiveUnitPrice,
        offer_discount_amount: 0,
        applied_offer_id: null,
        applied_group_id: null,
        applied_offer_title: null,
        applied_offer_snapshot: null,
        total_amount: lineTotal,
      }) - 1;

    const quotedItemIdx =
      quotedItems.push({
        product_id: productPlain.id,
        variant_id: vDetails.variantId,
        variant_name: vDetails.variantName || null,
        product_name: productPlain.name,
        sku: vDetails.sku,
        image: vDetails.image || null,
        unit: productPlain.unit || 'Piece',
        quantity: qty,
        mrp: round2(vDetails.mrp),
        base_unit_price: round2(vDetails.unitPrice),
        effective_unit_price: bulkInfo.effectiveUnitPrice,
        line_total: lineTotal,
        offer_discount_amount: 0,
        applied_offer_id: null,
        applied_group_id: null,
        applied_offer_title: null,
        applied_offer_badge: null,
        bulk_discount: bulkInfo.lineBulkDiscount,
        bulk_pricing: bulkTiers,
        applied_bulk_tier: bulkInfo.appliedTier,
        next_bulk_tier: bulkInfo.nextBulkTier,
        gst_slab: gstSlab,
        tax_inclusive: taxInclusive,
        hsn_code: productPlain.hsn_code || null,
        min_order_quantity: minQty,
        max_order_quantity: maxQty,
        low_stock_threshold: Number(productPlain.low_stock_threshold || 5),
        stock_available: effectiveStockAvailable,
        track_inventory: productPlain.track_inventory !== false,
        allow_backorder: productPlain.allow_backorder === true,
        home_delivery: productPlain.home_delivery !== false,
        store_pickup: productPlain.store_pickup !== false,
        cash_on_delivery: productPlain.cash_on_delivery !== false,
        packaging_charge: Number(productPlain.packaging_charge || 0),
        delivery_charge: prodDelCharge,
        free_delivery_above:
          productPlain.free_delivery_above !== null && productPlain.free_delivery_above !== undefined
            ? Number(productPlain.free_delivery_above)
            : null,
        is_returnable: productPlain.is_returnable === true,
        return_window_days: Number(productPlain.return_window_days || 0),
        warranty_details: productPlain.warranty_details || null,
        available_variants: vDetails.variants,
        is_deliverable: deliveryEligibility.is_deliverable,
        delivery_message: deliveryEligibility.delivery_message,
        is_available: itemIssues.length === 0,
        availability_issue: itemIssues[0] || null,
      }) - 1;

    lineEvalEntries.push({
      _product_raw: productPlain,
      _variant_raw: vDetails.matchedVariant,
      product_id: productPlain.id,
      variant_id: vDetails.variantId,
      variant_name: vDetails.variantName || null,
      unit_price: bulkInfo.effectiveUnitPrice,
      quantity: qty,
      line_total: lineTotal,
      orderItemIdx,
      quotedItemIdx,
    });
  }

  // Delivery Fee & Free Delivery Progress
  const freeDeliveryThreshold =
    freeDeliveryThresholds.length > 0 ? Math.min(...freeDeliveryThresholds) : null;
  const rawDeliveryFee = deliveryType === 'store_pickup' ? 0 : round2(maxDeliveryCharge);
  let deliveryFee = rawDeliveryFee;
  let amountForFreeDelivery = 0;
  let isFreeDeliveryUnlocked = deliveryType === 'home_delivery' && rawDeliveryFee === 0;

  if (deliveryType === 'home_delivery' && rawDeliveryFee > 0 && freeDeliveryThreshold !== null) {
    if (subtotal >= freeDeliveryThreshold) {
      deliveryFee = 0;
      isFreeDeliveryUnlocked = true;
      amountForFreeDelivery = 0;
    } else {
      amountForFreeDelivery = round2(freeDeliveryThreshold - subtotal);
      isFreeDeliveryUnlocked = false;
    }
  }

  // Enterprise Scoped Offers & Coupon Evaluation (Auto campaigns + Coupons + Conflict Resolution + Immutable Snapshots)
  const [campaignsMap, allStoreOffers] = await Promise.all([
    businessOfferService.getActiveEvaluableCampaignsMap([businessId]),
    rawPromoCode || includeOffers
      ? businessOfferService.getOffersByBusiness(businessId, { activeOnly: false })
      : Promise.resolve([]),
  ]);
  const evaluableCampaigns = campaignsMap.get(Number(businessId)) || [];
  const offerResolution = businessOfferService.resolveCheckoutOffers({
    evaluatedItems: lineEvalEntries,
    evaluableCampaigns,
    promoCode: rawPromoCode,
    subtotal,
  });

  // Attach authoritative item-level auto offer discounts & immutable snapshots
  lineEvalEntries.forEach((entry, idx) => {
    const ann = offerResolution.item_annotations[idx];
    if (!ann) return;
    const oItem = orderItemsToCreate[entry.orderItemIdx];
    const qItem = quotedItems[entry.quotedItemIdx];
    if (oItem) {
      oItem.original_unit_price = ann.original_unit_price;
      oItem.unit_price = ann.effective_unit_price;
      oItem.offer_discount_amount = ann.offer_discount_amount;
      oItem.applied_offer_id = ann.applied_offer_id;
      oItem.applied_group_id = ann.applied_group_id;
      oItem.applied_offer_title = ann.applied_offer_title;
      oItem.applied_offer_snapshot = ann.applied_offer_snapshot;
      oItem.total_amount = ann.net_line_total;
    }
    if (qItem) {
      qItem.effective_unit_price = ann.effective_unit_price;
      qItem.line_total = ann.net_line_total;
      qItem.offer_discount_amount = ann.offer_discount_amount;
      qItem.applied_offer_id = ann.applied_offer_id;
      qItem.applied_group_id = ann.applied_group_id;
      qItem.applied_offer_title = ann.applied_offer_title;
      qItem.applied_offer_badge = ann.applied_offer_badge;
    }
  });

  const promoEval = buildPromoValidationMessage({
    allStoreOffers,
    promoResult: offerResolution.promo,
    rawPromoCode,
    strict,
  });

  const autoOfferDiscount = round2(offerResolution.auto_offer_discount || 0);
  const totalOfferDiscount = round2(autoOfferDiscount + Number(promoEval.discount || 0));

  // Tax Breakdown (computed after offer & coupon discounts so GST applies accurately on net amount)
  const taxBreakdown = computeTaxBreakdown(taxLines, subtotal, totalOfferDiscount);
  const taxAmount = taxBreakdown.exclusive_tax;

  const productDiscount = Math.max(0, round2(mrpTotal - catalogSubtotal));
  const deliverySavings =
    deliveryType === 'home_delivery' && rawDeliveryFee > 0 && deliveryFee === 0
      ? rawDeliveryFee
      : 0;
  const totalSavings = round2(productDiscount + bulkDiscount + totalOfferDiscount + deliverySavings);
  const totalAmount = round2(
    Math.max(0, subtotal - totalOfferDiscount + deliveryFee + packagingFee + taxAmount)
  );

  let availableOffers = [];
  if (includeOffers) {
    availableOffers = allStoreOffers
      .filter((o) => businessOfferService.isOfferCurrentlyValid(o))
      .map((o) => {
        const minOrder = Number(o.min_order_amount ?? 0);
        const isEligible = subtotal >= minOrder;
        const amountNeeded = isEligible ? 0 : round2(minOrder - subtotal);
        return {
          ...o,
          is_eligible: isEligible,
          amount_needed: amountNeeded,
        };
      });
  }

  let crossSellProducts = [];
  if (includeCrossSell) {
    const candidates = await BusinessProduct.findAll({
      where: {
        business_id: businessId,
        is_deleted: false,
        status: 'active',
        approval_status: 'approved',
        id: { [Op.notIn]: Array.from(productIdsInCart) },
      },
      order: [
        ['is_bestseller', 'DESC'],
        ['is_featured', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: 12,
    });
    crossSellProducts = candidates
      .map((p) => (p.toJSON ? p.toJSON() : p))
      .filter((p) => !p.track_inventory || p.allow_backorder || Number(p.available_quantity || 0) > 0)
      .slice(0, 6);
  }

  return {
    business_id: business.id,
    business_name: storeName,
    business_logo: businessPlain.logo_url || null,
    is_store_open: isStoreOpen,
    delivery_type: deliveryType,
    payment_mode: pm.display,
    payment_mode_code: pm.db,
    is_deliverable: shopEval.matched && quotedItems.every((it) => it.is_deliverable !== false),
    delivery_coverage_message:
      deliveryType === 'store_pickup'
        ? 'Store Pickup available'
        : shopEval.matched
          ? shopEval.distance
            ? `Delivers to your area (${shopEval.distance})`
            : 'Delivers to your selected location'
          : `${storeName} does not deliver to your selected location`,
    estimated_delivery_minutes: maxEstimatedMinutes,
    can_checkout: blockingIssues.length === 0 && quotedItems.length > 0,
    blocking_issues: [...new Set(blockingIssues)],
    mrp_total: mrpTotal,
    catalog_subtotal: catalogSubtotal,
    product_discount: productDiscount,
    bulk_discount: bulkDiscount,
    subtotal,
    auto_offer_discount: autoOfferDiscount,
    discount: promoEval.discount,
    offer_id:
      promoEval.applied && promoEval.offer
        ? Number(promoEval.offer.id)
        : offerResolution.applied_auto_offers[0]?.offer_id ?? null,
    promo_code: promoEval.applied ? promoEval.promo_code : null,
    requested_promo_code: promoEval.promo_code,
    coupon_applied: promoEval.applied,
    coupon_error: promoEval.error,
    applied_offer: promoEval.applied ? promoEval.offer : null,
    applied_auto_offers: offerResolution.applied_auto_offers,
    offer_conflict_note: offerResolution.conflict_note,
    applied_offer_snapshot: offerResolution.order_snapshot,
    packaging_fee: packagingFee,
    raw_delivery_fee: rawDeliveryFee,
    delivery_fee: deliveryFee,
    free_delivery_threshold: freeDeliveryThreshold,
    amount_for_free_delivery: amountForFreeDelivery,
    is_free_delivery_unlocked: isFreeDeliveryUnlocked,
    tax_amount: taxAmount,
    tax_breakdown: taxBreakdown,
    total_amount: totalAmount,
    total_savings: totalSavings,
    items: quotedItems,
    orderItemsToCreate,
    available_offers: availableOffers,
    cross_sell_products: crossSellProducts,
    businessPlain,
    pm,
  };
};

export const quoteOrder = async (payload) => {
  const result = await evaluateCartOrder(payload, {
    strict: false,
    includeOffers: true,
    includeCrossSell: true,
  });
  const { orderItemsToCreate: _omit1, businessPlain: _omit2, pm: _omit3, ...quoteResponse } = result;
  return quoteResponse;
};

export const createOrder = async (payload, currentUser) => {
  const {
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    customer_address: customerAddress,
    delivery_type: deliveryType = 'home_delivery',
    special_instructions: specialInstructions,
    latitude,
    longitude,
  } = payload;

  if (deliveryType === 'home_delivery' && (!customerAddress || !customerAddress.trim())) {
    const err = new Error('Delivery address is required for Home Delivery.');
    err.statusCode = 400;
    throw err;
  }

  const orderNumber = generateOrderNumber();
  const transaction = await sequelize.transaction();

  try {
    const evaluated = await evaluateCartOrder(payload, {
      transaction,
      strict: true,
      orderNumber,
      reserveCustomerName: customerName.trim(),
    });

    const initialTimeline = [
      buildTimelineEntry(
        'new',
        `${evaluated.pm.display} • ${deliveryType === 'store_pickup' ? 'Store Pickup' : 'Home Delivery'}`
      ),
    ];

    const order = await BusinessOrder.create(
      {
        order_number: orderNumber,
        business_id: evaluated.business_id,
        customer_user_id: currentUser?.id || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail?.trim() || null,
        customer_address:
          deliveryType === 'store_pickup'
            ? evaluated.businessPlain.address || 'Store Pickup Counter'
            : customerAddress.trim(),
        delivery_type: deliveryType,
        payment_mode: evaluated.pm.db,
        payment_status: evaluated.pm.db === 'cod' ? 'pending' : 'paid',
        status: 'new',
        subtotal: evaluated.subtotal,
        delivery_fee: evaluated.delivery_fee,
        packaging_fee: evaluated.packaging_fee,
        auto_offer_discount: evaluated.auto_offer_discount,
        discount: evaluated.discount,
        offer_id: evaluated.offer_id,
        promo_code: evaluated.promo_code,
        applied_offer_snapshot: evaluated.applied_offer_snapshot,
        bulk_discount: evaluated.bulk_discount,
        tax_amount: evaluated.tax_amount,
        tax_breakdown: evaluated.tax_breakdown,
        total_amount: evaluated.total_amount,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        estimated_delivery_minutes: evaluated.estimated_delivery_minutes,
        timeline: initialTimeline,
        special_instructions: specialInstructions?.trim() || null,
        created_by: currentUser?.id || null,
        created_at: new Date(),
        updatedAt: new Date(),
      },
      { transaction }
    );

    await BusinessOrderItem.bulkCreate(
      evaluated.orderItemsToCreate.map((item) => ({
        ...item,
        created_by: currentUser?.id || null,
        order_id: order.id,
        created_at: new Date(),
        updatedAt: new Date(),
      })),
      { transaction }
    );

    await transaction.commit();

    const created = await BusinessOrder.findOne({
      where: { id: order.id },
      include: ORDER_INCLUDE,
    });
    return formatOrder(created);
  } catch (err) {
    await transaction.rollback();
    if (String(err.message || '').startsWith('INSUFFICIENT_STOCK:')) {
      err.statusCode = 400;
    }
    throw err;
  }
};

export const getMyOrders = async (userId, query = {}) => {
  const { status, search, page = 1, limit = 50 } = query;
  const where = {
    customer_user_id: userId,
    is_deleted: false,
  };

  if (status && status !== 'all') {
    if (status === 'active') {
      where.status = { [Op.in]: ['new', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'] };
    } else {
      where.status = status;
    }
  }

  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    where[Op.or] = [
      { order_number: { [Op.like]: q } },
      { customer_name: { [Op.like]: q } },
    ];
  }

  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (parsedPage - 1) * parsedLimit;

  const { count, rows } = await BusinessOrder.findAndCountAll({
    where,
    include: ORDER_INCLUDE,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: parsedLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map(formatOrder),
    total: count,
    page: parsedPage,
    totalPages: Math.max(1, Math.ceil(count / parsedLimit)),
  };
};

export const getBusinessOrders = async (businessId, query = {}) => {
  const { status, search, page = 1, limit = 100 } = query;
  const where = {
    business_id: businessId,
    is_deleted: false,
  };

  if (status && status !== 'all') {
    where.status = status;
  }

  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    where[Op.or] = [
      { order_number: { [Op.like]: q } },
      { customer_name: { [Op.like]: q } },
      { customer_phone: { [Op.like]: q } },
    ];
  }

  const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (parsedPage - 1) * parsedLimit;

  const { count, rows } = await BusinessOrder.findAndCountAll({
    where,
    include: [
      ...ORDER_INCLUDE,
      {
        model: User,
        as: 'customer',
        attributes: ['userId', 'userName', 'phone', 'email'],
        required: false,
      },
    ],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: parsedLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map(formatOrder),
    total: count,
    page: parsedPage,
    totalPages: Math.max(1, Math.ceil(count / parsedLimit)),
  };
};

export const findOrderByIdOrNumber = async (idOrNumber) => {
  const numericId = Number(idOrNumber);
  const where = Number.isInteger(numericId) && numericId > 0
    ? { id: numericId, is_deleted: false }
    : { order_number: String(idOrNumber), is_deleted: false };

  return BusinessOrder.findOne({
    where,
    include: ORDER_INCLUDE,
  });
};

export const getOrderDetails = async (idOrNumber) => {
  const order = await findOrderByIdOrNumber(idOrNumber);
  return formatOrder(order);
};

export const updateOrderStatus = async (idOrNumber, nextStatus, options = {}) => {
  const {
    note = null,
    reason = null,
    actorId = null,
    actorName = 'Merchant',
    isCustomerCancel = false,
  } = options;

  const transaction = await sequelize.transaction();
  try {
    const numericId = Number(idOrNumber);
    const where = Number.isInteger(numericId) && numericId > 0
      ? { id: numericId, is_deleted: false }
      : { order_number: String(idOrNumber), is_deleted: false };

    const order = await BusinessOrder.findOne({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      const err = new Error('Order not found.');
      err.statusCode = 404;
      throw err;
    }

    const currentStatus = order.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      const err = new Error(`Invalid status transition from '${currentStatus}' to '${nextStatus}'.`);
      err.statusCode = 400;
      throw err;
    }

    const orderItems = await BusinessOrderItem.findAll({
      where: { order_id: order.id, is_deleted: false },
      transaction,
    });

    // Inventory synchronization tied to order lifecycle
    if (nextStatus === 'cancelled') {
      const stockReason = isCustomerCancel ? 'order_cancelled' : 'merchant_rejected';
      for (const item of orderItems) {
        await productService.releaseReservedStock(
          item.product_id,
          item.quantity,
          order.order_number,
          stockReason,
          actorName,
          { transaction, variantId: item.variant_id }
        );
      }
    } else if (nextStatus === 'completed') {
      for (const item of orderItems) {
        await productService.commitReservedStock(
          item.product_id,
          item.quantity,
          order.order_number,
          actorName,
          { transaction }
        );
      }
    } else if (nextStatus === 'returned') {
      for (const item of orderItems) {
        await productService.restoreStockOnReturn(
          item.product_id,
          item.quantity,
          order.order_number,
          reason || note || 'Customer Return Restock',
          actorName,
          { transaction, variantId: item.variant_id }
        );
      }
    }

    const currentTimeline = Array.isArray(order.timeline) ? [...order.timeline] : [];
    const customLabel =
      nextStatus === 'cancelled'
        ? (isCustomerCancel ? 'Cancelled by Customer' : 'Cancelled / Rejected by Store')
        : null;
    currentTimeline.push(buildTimelineEntry(nextStatus, note || reason, customLabel));

    const updates = {
      status: nextStatus,
      timeline: currentTimeline,
      updated_by: actorId,
      updatedAt: new Date(),
    };

    if (nextStatus === 'cancelled') {
      if (isCustomerCancel) {
        updates.cancellation_reason = reason || note || 'Cancelled by customer';
      } else {
        updates.rejection_reason = reason || note || 'Rejected by store owner';
      }
      if (String(order.payment_status).toLowerCase() === 'paid') {
        updates.payment_status = 'refunded';
      }
    } else if (nextStatus === 'completed') {
      updates.payment_status = 'paid';
    } else if (nextStatus === 'returned') {
      updates.return_reason = reason || note || 'Returned by customer';
    } else if (nextStatus === 'refunded') {
      updates.payment_status = 'refunded';
    }

    await order.update(updates, { transaction });
    await transaction.commit();

    const refreshed = await findOrderByIdOrNumber(order.id);
    return formatOrder(refreshed);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

