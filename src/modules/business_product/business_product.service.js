import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessProduct from './business_product.model.js';
import ProductInventoryMovement from './product_inventory_movement.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessCoverageArea from '../business_profile/business_coverage_area.model.js';
import SocietyBusinessAccess from '../business_profile/society_business_access.model.js';
import businessCoverageService from '../business_profile/business_coverage.service.js';
import {
  normalizeText,
  parseStringList,
  resolveCategoryFromMaster,
  resolveFilterTarget,
  productMatchesCategoryFilter,
  buildProductSearchHaystack,
  scoreProductSearch,
  scoreBusinessSearch,
  computeDidYouMean,
  buildSqlSearchSignals,
  buildEffectiveSynonymDictionaries,
  findBestFuzzyMatch,
} from '../business_category/category_matcher.helper.js';
import {
  getDynamicSynonymConfig,
  buildGeoBoundingBoxWhere,
  getCachedSearchPayload,
  setCachedSearchPayload,
  invalidateSearchQueryCache,
  logSearchEvent,
  getTrendingSearchTerms,
} from '../business_category/business_search_intelligence.service.js';
import * as businessOfferService from '../business_offer/business_offer.service.js';

/**
 * Derive stock status from quantity and threshold
 */
const deriveStockStatus = (trackInventory, availableQty, threshold = 5) => {
  if (!trackInventory) return 'in_stock';
  const qty = parseInt(availableQty, 10) || 0;
  const thresh = parseInt(threshold, 10) || 5;
  if (qty <= 0) return 'out_of_stock';
  if (qty <= thresh) return 'low_stock';
  return 'in_stock';
};

/**
 * Calculate profit margin
 */
const calculateProfitMargin = (sellingPrice, costPrice) => {
  const sp = parseFloat(sellingPrice) || 0;
  const cp = parseFloat(costPrice);
  if (!cp || isNaN(cp) || sp <= 0) return null;
  const margin = ((sp - cp) / sp) * 100;
  return parseFloat(margin.toFixed(2));
};

/**
 * Validate delivery coverage against active Location Master records
 */
export const validateLocationCoverage = async (coverage) => {
  if (!coverage || typeof coverage !== 'object') return;

  if (coverage.state_id) {
    const [states] = await sequelize.query(
      'SELECT id FROM states WHERE id = ? AND is_active = 1 AND is_deleted = 0',
      { replacements: [coverage.state_id] }
    );
    if (states.length === 0) {
      throw new Error(`Invalid or inactive state_id: ${coverage.state_id} in Location Master.`);
    }
  }

  if (coverage.district_id) {
    const [dists] = await sequelize.query(
      'SELECT id FROM districts WHERE id = ? AND is_active = 1 AND is_deleted = 0',
      { replacements: [coverage.district_id] }
    );
    if (dists.length === 0) {
      throw new Error(`Invalid or inactive district_id: ${coverage.district_id} in Location Master.`);
    }
  }

  const localityIds = Array.isArray(coverage.locality_ids)
    ? coverage.locality_ids
    : (Array.isArray(coverage.localities) ? coverage.localities.map(l => (typeof l === 'object' ? l.id : l)).filter(Boolean) : []);

  if (localityIds.length > 0) {
    const [localities] = await sequelize.query(
      `SELECT id FROM localities WHERE id IN (?) AND is_active = 1 AND is_deleted = 0`,
      { replacements: [localityIds] }
    );
    if (localities.length !== localityIds.length) {
      throw new Error('One or more selected localities do not exist or are inactive in Location Master.');
    }
  }

  const pincodes = Array.isArray(coverage.pincodes)
    ? coverage.pincodes.map(p => (typeof p === 'object' ? p.pincode : p)).filter(Boolean)
    : [];

  if (pincodes.length > 0) {
    const [pins] = await sequelize.query(
      `SELECT pincode FROM pincodes WHERE pincode IN (?) AND is_active = 1 AND is_deleted = 0`,
      { replacements: [pincodes] }
    );
    if (pins.length !== pincodes.length) {
      throw new Error('One or more selected pincodes do not exist or are inactive in Location Master.');
    }
  }
};

const normalizeNullableFields = (data, keys) => {
  for (const k of keys) {
    if (data[k] === '' || data[k] === undefined) {
      if (k in data && data[k] === '') data[k] = null;
    }
  }
};

const parseJsonArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

/**
 * Enterprise Validation & Sanitization helper for all product fields
 */
export const validateAndSanitizeProductPayload = async (raw, isUpdate = false, productId = null) => {
  const data = { ...raw };

  // Never allow client-supplied primary keys (e.g. 'prod_...') to overwrite DB AUTO_INCREMENT id
  delete data.id;
  if (!isUpdate) {
    delete data.created_at;
    delete data.updatedAt;
    delete data.is_deleted;
    delete data.deletedRemarks;
  }

  // Normalize business_id alias and verify parent business exists on creation
  const rawBizId = data.business_id ?? data.businessId;
  if (rawBizId !== undefined && rawBizId !== null) {
    data.business_id = parseInt(rawBizId, 10);
  }
  delete data.businessId;

  if (!isUpdate) {
    if (!data.business_id || isNaN(data.business_id)) {
      throw new Error('A valid numeric business_id is required.');
    }
    const biz = await BusinessProfile.findOne({ where: { id: data.business_id, is_deleted: false } });
    if (!biz) {
      throw new Error(`Business profile #${data.business_id} does not exist or has been removed.`);
    }
  }

  // Convert empty strings on optional numeric/date/string columns to null for strict MySQL/MariaDB types
  normalizeNullableFields(data, [
    'brand', 'subcategory_id', 'subcategory_name', 'primary_image', 'video_url',
    'cost_price', 'hsn_code', 'min_selling_price', 'max_stock_capacity',
    'free_delivery_above', 'max_order_quantity', 'barcode', 'batch_number',
    'mfg_date', 'expiry_date', 'shelf_life', 'storage_instructions',
    'manufacturer_details', 'fssai_license', 'replacement_policy',
    'warranty_details', 'care_instructions', 'disclaimer', 'store_warehouse',
  ]);

  // 0. Validate, resolve & inherit category metadata cleanly against business_categories & parent shop
  const shouldResolveCategory =
    !isUpdate || 'category_id' in data || 'category_name' in data;
  if (shouldResolveCategory) {
    const categoryMaster = await BusinessCategory.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'name'],
      raw: true,
    });
    let resolved = resolveCategoryFromMaster(data.category_id, data.category_name, categoryMaster);

    // On create (or if explicitly empty), inherit the parent business shop's category
    if (!isUpdate && !resolved.category_id && !resolved.category_name && data.business_id) {
      const parentShop = await BusinessProfile.findOne({
        where: { id: data.business_id, is_deleted: false },
        include: [
          {
            model: BusinessCategory,
            as: 'category',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      });
      if (parentShop) {
        resolved = resolveCategoryFromMaster(
          parentShop.category_id,
          parentShop.category?.name || parentShop.serviceCategory,
          categoryMaster
        );
      }
    }

    data.category_id = resolved.category_id || null;
    if (resolved.master_category_name || resolved.category_name) {
      data.category_name = resolved.master_category_name || resolved.category_name;
    } else if ('category_name' in data && !data.category_name) {
      data.category_name = 'General';
    }
  }

  // 1. SKU validation (unique index covers ALL rows in business_products regardless of is_deleted)
  if (!isUpdate && (!data.sku || String(data.sku).trim().length === 0)) {
    data.sku = `SKU-${Date.now().toString().slice(-7)}`;
  }
  if (data.sku !== undefined && data.sku !== null) {
    const trimmedSku = String(data.sku).trim().slice(0, 90);
    if (trimmedSku.length === 0) {
      if (isUpdate) {
        delete data.sku;
      } else {
        data.sku = `SKU-${Date.now().toString().slice(-7)}`;
      }
    } else {
      data.sku = trimmedSku;
    }
  }
  const businessId = data.business_id;
  if (businessId && data.sku) {
    const existingSkuWhere = {
      business_id: businessId,
      sku: data.sku,
    };
    if (productId) {
      existingSkuWhere.id = { [Op.ne]: productId };
    }
    const existing = await BusinessProduct.findOne({ where: existingSkuWhere });
    if (existing) {
      data.sku = `${data.sku.slice(0, 84)}-${Date.now().toString().slice(-5)}`;
    }
  }

  // 2. Pricing validation
  if (data.mrp !== undefined || data.selling_price !== undefined) {
    let mrp = data.mrp !== undefined ? parseFloat(data.mrp) : 0;
    let sellingPrice = data.selling_price !== undefined ? parseFloat(data.selling_price) : 0;
    if (isNaN(sellingPrice) || sellingPrice < 0) sellingPrice = 0;
    if (isNaN(mrp) || mrp <= 0) mrp = sellingPrice;
    if (sellingPrice > mrp) {
      mrp = sellingPrice;
    }
    data.mrp = mrp;
    data.selling_price = sellingPrice;
    if (data.cost_price !== undefined && data.cost_price !== null) {
      const cp = parseFloat(data.cost_price);
      data.cost_price = isNaN(cp) || cp < 0 ? null : cp;
    }
  }

  // 3. Media & JSON array fields (satisfy MariaDB json_valid check constraints)
  if (data.images !== undefined) {
    data.images = parseJsonArray(data.images)
      .filter((u) => typeof u === 'string' && u.trim().length > 0)
      .slice(0, 10);
  }
  if (data.tags !== undefined) {
    data.tags = parseJsonArray(data.tags).map((t) => String(t).trim()).filter(Boolean);
  }
  if (data.search_keywords !== undefined) {
    data.search_keywords = parseJsonArray(data.search_keywords).map((k) => String(k).trim()).filter(Boolean);
  }
  if (data.bulk_pricing !== undefined) {
    data.bulk_pricing = parseJsonArray(data.bulk_pricing).filter((b) => b && typeof b === 'object');
  }

  if (data.video_url !== undefined && data.video_url !== null) {
    data.video_url = String(data.video_url).trim();
    if (data.video_url.length === 0) data.video_url = null;
  }

  // 4. Dynamic & Custom Specifications (attributes)
  if (data.attributes !== undefined && data.attributes !== null) {
    let attrs = data.attributes;
    if (typeof attrs === 'string') {
      try {
        attrs = JSON.parse(attrs);
      } catch {
        attrs = {};
      }
    }
    if (typeof attrs === 'object' && !Array.isArray(attrs)) {
      const cleanAttrs = {};
      for (const [key, val] of Object.entries(attrs)) {
        const cleanKey = String(key).trim();
        if (cleanKey.length > 0 && val !== null && val !== undefined) {
          cleanAttrs[cleanKey] = typeof val === 'string' ? val.trim() : val;
        }
      }
      data.attributes = cleanAttrs;
    } else {
      data.attributes = {};
    }
  }

  // 5. Variants validation
  if (data.has_variants === true || data.has_variants === 'true') {
    data.has_variants = true;
    let variantsArr = data.variants;
    if (typeof variantsArr === 'string') {
      try {
        variantsArr = JSON.parse(variantsArr);
      } catch {
        variantsArr = [];
      }
    }
    if (Array.isArray(variantsArr) && variantsArr.length > 0) {
      const seenSkus = new Set();
      data.variants = variantsArr.map((v, idx) => {
        const vSku = v.sku ? String(v.sku).trim() : `${data.sku || 'SKU'}-V${idx + 1}`;
        if (seenSkus.has(vSku.toLowerCase())) {
          throw new Error(`Duplicate variant SKU detected: "${vSku}". Each variant must have a unique SKU.`);
        }
        seenSkus.add(vSku.toLowerCase());

        const vMrp = parseFloat(v.mrp) || parseFloat(data.mrp) || 0;
        const vSp = parseFloat(v.selling_price ?? v.sellingPrice) || parseFloat(data.selling_price) || 0;
        if (vMrp > 0 && vSp > vMrp) {
          throw new Error(`Variant "${v.name || vSku}" selling price (${vSp}) cannot exceed MRP (${vMrp}).`);
        }

        return {
          id: v.id || `var-${Date.now()}-${idx}`,
          name: v.name || '',
          value: v.value || '',
          sku: vSku,
          image: v.image || null,
          mrp: vMrp,
          selling_price: vSp,
          cost_price: v.cost_price !== undefined ? parseFloat(v.cost_price) : null,
          stock: Math.max(0, parseInt(v.stock, 10) || 0),
          barcode: v.barcode ? String(v.barcode).trim() : null,
          status: v.status || 'active',
          attributes: v.attributes && typeof v.attributes === 'object' ? v.attributes : {},
        };
      });
    } else {
      data.variants = [];
    }
  } else if (data.has_variants === false || data.has_variants === 'false') {
    data.has_variants = false;
  }

  // 6. Delivery coverage validation
  if (data.delivery_coverage) {
    await validateLocationCoverage(data.delivery_coverage);
  }

  return data;
};

/**
 * Create a new product with optional initial inventory movement
 */
export const createProduct = async (rawProductData, userId, isGlobalAdmin = false) => {
  const productData = await validateAndSanitizeProductPayload(rawProductData, false);

  const transaction = await sequelize.transaction();
  try {
    const mrp = parseFloat(productData.mrp) || 0;
    const sellingPrice = parseFloat(productData.selling_price) || 0;
    const costPrice = productData.cost_price ? parseFloat(productData.cost_price) : null;
    const trackInventory = productData.track_inventory !== false;
    const availableQty = parseInt(productData.available_quantity, 10) || 0;
    const lowStockThreshold = parseInt(productData.low_stock_threshold, 10) || 5;

    const stockStatus = deriveStockStatus(trackInventory, availableQty, lowStockThreshold);
    const profitMargin = calculateProfitMargin(sellingPrice, costPrice);

    // If category_id provided and category_name missing, fetch it
    let categoryName = productData.category_name;
    if (productData.category_id && !categoryName) {
      const cat = await BusinessCategory.findByPk(productData.category_id);
      if (cat) categoryName = cat.name;
    }

    // Auto-approve newly created active products so they immediately appear in catalog and storefront; keep drafts as 'draft'
    const normalizedStatus = productData.status || 'active';
    const approvalStatus = normalizedStatus === 'draft'
      ? (productData.approval_status === 'approved' ? 'approved' : 'draft')
      : (productData.approval_status && productData.approval_status !== 'pending'
          ? productData.approval_status
          : 'approved');

    const payload = {
      ...productData,
      mrp,
      selling_price: sellingPrice,
      cost_price: costPrice,
      profit_margin: profitMargin,
      track_inventory: trackInventory,
      available_quantity: availableQty,
      low_stock_threshold: lowStockThreshold,
      stock_status: stockStatus,
      category_name: categoryName,
      status: normalizedStatus,
      approval_status: approvalStatus,
      attributes: productData.attributes || {},
      images: productData.images || [],
      video_url: productData.video_url || null,
      variants: productData.variants || [],
      created_by: userId || productData.created_by || null,
      created_at: new Date(),
      updatedAt: new Date(),
    };

    const product = await BusinessProduct.create(payload, { transaction });
    const createdProductId = Number(product.id);
    if (!createdProductId || isNaN(createdProductId)) {
      throw new Error('Failed to generate numeric database ID for product.');
    }

    // If initial stock is tracked and > 0, log initial movement
    if (trackInventory && availableQty > 0) {
      await ProductInventoryMovement.create({
        product_id: createdProductId,
        business_id: product.business_id,
        previous_quantity: 0,
        new_quantity: availableQty,
        adjustment_quantity: availableQty,
        reason: 'initial_stock',
        performed_by: userId ? `User #${userId}` : 'Business Owner',
        notes: 'Initial inventory added on product creation',
        timestamp: new Date(),
      }, { transaction });
    }

    await transaction.commit();
    invalidateSearchQueryCache().catch(() => {});
    return await getProductById(createdProductId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Get products for a business with filtering, pagination and sorting
 */
export const getProductsByBusiness = async (businessId, query = {}) => {
  const where = {
    business_id: businessId,
    is_deleted: false,
  };

  // Status Filter
  if (query.status && query.status !== 'all') {
    if (query.status === 'low_stock' || query.status === 'out_of_stock') {
      where.stock_status = query.status;
    } else {
      where.status = query.status;
    }
  }

  // Approval Status filter
  if (query.approval_status && query.approval_status !== 'all') {
    where.approval_status = query.approval_status;
  }

  // Stock status filter
  if (query.stock_status && query.stock_status !== 'all') {
    where.stock_status = query.stock_status;
  }

  // Category filter
  if (query.category_id) {
    where.category_id = query.category_id;
  }

  // Subcategory filter
  if (query.subcategory_id) {
    where.subcategory_id = query.subcategory_id;
  }

  // Brand filter
  if (query.brand) {
    where.brand = query.brand;
  }

  // Search keyword in name, brand, SKU or barcode
  if (query.search) {
    const s = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: s } },
      { brand: { [Op.like]: s } },
      { sku: { [Op.like]: s } },
      { barcode: { [Op.like]: s } },
    ];
  }

  // Price Range
  if (query.min_price || query.max_price) {
    where.selling_price = {};
    if (query.min_price) where.selling_price[Op.gte] = parseFloat(query.min_price);
    if (query.max_price) where.selling_price[Op.lte] = parseFloat(query.max_price);
  }

  // Sorting
  let order = [['created_at', 'DESC']];
  if (query.sort === 'oldest') {
    order = [['created_at', 'ASC']];
  } else if (query.sort === 'price_asc') {
    order = [['selling_price', 'ASC']];
  } else if (query.sort === 'price_desc') {
    order = [['selling_price', 'DESC']];
  } else if (query.sort === 'stock_asc' || query.sort === 'lowest_stock') {
    order = [['available_quantity', 'ASC']];
  } else if (query.sort === 'stock_desc') {
    order = [['available_quantity', 'DESC']];
  } else if (query.sort === 'name_asc') {
    order = [['name', 'ASC']];
  } else if (query.sort === 'recently_updated') {
    order = [['updatedAt', 'DESC']];
  } else if (query.sort === 'best_selling') {
    order = [['is_bestseller', 'DESC'], ['created_at', 'DESC']];
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 50;
  const offset = (page - 1) * limit;

  const { rows, count } = await BusinessProduct.findAndCountAll({
    where,
    order,
    limit,
    offset,
    include: [
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
    ],
  });

  return {
    items: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
};

/**
 * Get product counts by status & stock for dashboard stats cards
 */
export const getProductStats = async (businessId) => {
  const baseWhere = { business_id: businessId, is_deleted: false };

  const [total, active, draft, lowStock, outOfStock, pendingApproval] = await Promise.all([
    BusinessProduct.count({ where: baseWhere }),
    BusinessProduct.count({ where: { ...baseWhere, status: 'active' } }),
    BusinessProduct.count({ where: { ...baseWhere, status: 'draft' } }),
    BusinessProduct.count({ where: { ...baseWhere, stock_status: 'low_stock' } }),
    BusinessProduct.count({ where: { ...baseWhere, stock_status: 'out_of_stock' } }),
    BusinessProduct.count({ where: { ...baseWhere, approval_status: 'pending' } }),
  ]);

  return {
    total,
    active,
    draft,
    lowStock,
    outOfStock,
    pendingApproval,
  };
};

/**
 * Get product details by ID including recent inventory movements
 */
export const getProductById = async (id) => {
  return await BusinessProduct.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
      {
        model: ProductInventoryMovement,
        as: 'inventory_movements',
        limit: 20,
        order: [['timestamp', 'DESC']],
      },
    ],
  });
};

/**
 * Update an existing product
 */
export const updateProduct = async (id, rawUpdateData, userId, isGlobalAdmin = false) => {
  const product = await BusinessProduct.findOne({ where: { id, is_deleted: false } });
  if (!product) return null;

  const updateData = await validateAndSanitizeProductPayload(rawUpdateData, true, id);

  const sellingPrice = updateData.selling_price !== undefined ? parseFloat(updateData.selling_price) : product.selling_price;
  const costPrice = updateData.cost_price !== undefined ? parseFloat(updateData.cost_price) : product.cost_price;
  const trackInventory = updateData.track_inventory !== undefined ? updateData.track_inventory : product.track_inventory;
  const availableQty = updateData.available_quantity !== undefined ? parseInt(updateData.available_quantity, 10) : product.available_quantity;
  const lowStockThreshold = updateData.low_stock_threshold !== undefined ? parseInt(updateData.low_stock_threshold, 10) : product.low_stock_threshold;

  const stockStatus = deriveStockStatus(trackInventory, availableQty, lowStockThreshold);
  const profitMargin = calculateProfitMargin(sellingPrice, costPrice);

  const cleanData = { ...updateData };
  if (product.approval_status === 'draft' && cleanData.status === 'active' && !cleanData.approval_status) {
    cleanData.approval_status = 'approved';
  }
  // Non-admin users cannot self-approve pending/rejected products
  if (!isGlobalAdmin) {
    if (!(product.approval_status === 'draft' && cleanData.status === 'active')) {
      delete cleanData.approval_status;
    }
  }

  const payload = {
    ...cleanData,
    stock_status: stockStatus,
    profit_margin: profitMargin,
    updated_by: userId || updateData.updated_by || null,
    updatedAt: new Date(),
  };

  // If quantity changed directly in updateData, log movement
  if (updateData.available_quantity !== undefined && availableQty !== product.available_quantity) {
    const diff = availableQty - product.available_quantity;
    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: product.available_quantity,
      new_quantity: availableQty,
      adjustment_quantity: diff,
      reason: diff > 0 ? 'restock' : 'correction',
      performed_by: userId ? `User #${userId}` : 'Business Owner',
      notes: updateData.adjustment_notes || 'Product stock updated via edit form',
      timestamp: new Date(),
    });
  }

  await product.update(payload);
  invalidateSearchQueryCache().catch(() => {});
  return await getProductById(id);
};

/**
 * Admin: Approve a product
 */
export const approveProduct = async (productId, adminUserId, notes = null) => {
  const product = await BusinessProduct.findOne({
    where: { id: productId, is_deleted: false },
  });
  if (!product) return null;

  const approvalHistory = Array.isArray(product.approval_history)
    ? [...product.approval_history]
    : [];

  approvalHistory.push({
    action: 'approved',
    admin_id: adminUserId,
    timestamp: new Date().toISOString(),
    notes: notes || 'Product approved by administrator',
  });

  await product.update({
    approval_status: 'approved',
    rejection_reason: null,
    approval_history: approvalHistory,
    status: product.status === 'draft' ? 'active' : product.status,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  invalidateSearchQueryCache().catch(() => {});
  return product;
};

/**
 * Admin: Reject a product
 */
export const rejectProduct = async (productId, adminUserId, reason) => {
  const product = await BusinessProduct.findOne({
    where: { id: productId, is_deleted: false },
  });
  if (!product) return null;

  const approvalHistory = Array.isArray(product.approval_history)
    ? [...product.approval_history]
    : [];

  approvalHistory.push({
    action: 'rejected',
    admin_id: adminUserId,
    timestamp: new Date().toISOString(),
    notes: reason || 'Product rejected by administrator',
  });

  await product.update({
    approval_status: 'rejected',
    rejection_reason: reason || 'Product details did not meet marketplace guidelines.',
    approval_history: approvalHistory,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  invalidateSearchQueryCache().catch(() => {});
  return product;
};

/**
 * Adjust stock transactionally with audit ledger
 */
export const adjustStock = async (id, { adjustment, newQuantity, reason, performedBy, orderId, notes }) => {
  const transaction = await sequelize.transaction();
  try {
    const product = await BusinessProduct.findOne({
      where: { id, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      await transaction.rollback();
      return null;
    }

    const prevQty = product.available_quantity;
    let nextQty = prevQty;
    let delta = 0;

    if (newQuantity !== undefined && newQuantity !== null) {
      nextQty = Math.max(0, parseInt(newQuantity, 10));
      delta = nextQty - prevQty;
    } else if (adjustment !== undefined && adjustment !== null) {
      delta = parseInt(adjustment, 10);
      nextQty = Math.max(0, prevQty + delta);
    }

    const stockStatus = deriveStockStatus(product.track_inventory, nextQty, product.low_stock_threshold);

    await product.update({
      available_quantity: nextQty,
      stock_status: stockStatus,
      updatedAt: new Date(),
    }, { transaction });

    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: prevQty,
      new_quantity: nextQty,
      adjustment_quantity: delta,
      reason: reason || (delta >= 0 ? 'restock' : 'correction'),
      performed_by: performedBy || 'Business Owner',
      order_id: orderId || null,
      notes: notes || null,
      timestamp: new Date(),
    }, { transaction });

    await transaction.commit();
    invalidateSearchQueryCache().catch(() => {});
    return await getProductById(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * ── INVENTORY LIFECYCLE FOR ORDERS ──
 */

const adjustVariantStock = (variants, variantId, delta, enforceAvailable = false) => {
  if (!variantId || !Array.isArray(variants) || variants.length === 0) {
    return { matched: false, updatedVariants: variants };
  }
  let matched = false;
  const updatedVariants = variants.map((v) => {
    if (!v || String(v.id) !== String(variantId)) return v;
    matched = true;
    const prevStock = Number(v.stock ?? 0);
    if (enforceAvailable && prevStock + delta < 0) {
      throw new Error(`INSUFFICIENT_STOCK: Only ${prevStock} available for variant ${v.name || ''}: ${v.value || v.id}.`);
    }
    return {
      ...v,
      stock: Math.max(0, prevStock + delta),
    };
  });
  return { matched, updatedVariants };
};

export const reserveStock = async (
  productId,
  quantity,
  orderId,
  performedBy = 'System Checkout',
  options = {}
) => {
  const { transaction: externalTx = null, variantId = null } = options || {};
  const ownsTx = !externalTx;
  const transaction = externalTx || (await sequelize.transaction());
  try {
    const product = await BusinessProduct.findOne({
      where: { id: productId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      if (ownsTx) await transaction.rollback();
      throw new Error(`Product #${productId} not found.`);
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      if (ownsTx) await transaction.rollback();
      throw new Error('Quantity must be greater than zero.');
    }

    if (product.track_inventory && product.available_quantity < qty && !product.allow_backorder) {
      if (ownsTx) await transaction.rollback();
      throw new Error(`INSUFFICIENT_STOCK: Only ${product.available_quantity} available for ${product.name}.`);
    }

    const variantUpdate = adjustVariantStock(
      product.variants,
      variantId,
      -qty,
      Boolean(product.track_inventory && !product.allow_backorder)
    );

    const prevAvailable = product.available_quantity;
    const nextAvailable = Math.max(0, prevAvailable - qty);
    const prevReserved = product.reserved_quantity || 0;
    const nextReserved = prevReserved + qty;
    const stockStatus = deriveStockStatus(product.track_inventory, nextAvailable, product.low_stock_threshold);

    await product.update({
      available_quantity: nextAvailable,
      reserved_quantity: nextReserved,
      stock_status: stockStatus,
      ...(variantUpdate.matched ? { variants: variantUpdate.updatedVariants } : {}),
      updatedAt: new Date(),
    }, { transaction });

    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: prevAvailable,
      new_quantity: nextAvailable,
      adjustment_quantity: -qty,
      reason: 'reservation',
      performed_by: performedBy,
      order_id: orderId ? String(orderId) : null,
      notes: `Reserved ${qty} units for Order #${orderId}${variantId ? ` (variant ${variantId})` : ''}`,
      timestamp: new Date(),
    }, { transaction });

    if (ownsTx) await transaction.commit();
    return { success: true, availableQuantity: nextAvailable, reservedQuantity: nextReserved };
  } catch (err) {
    if (ownsTx) await transaction.rollback();
    throw err;
  }
};

export const commitReservedStock = async (
  productId,
  quantity,
  orderId,
  performedBy = 'Payment Gateway',
  options = {}
) => {
  const { transaction: externalTx = null } = options || {};
  const ownsTx = !externalTx;
  const transaction = externalTx || (await sequelize.transaction());
  try {
    const product = await BusinessProduct.findOne({
      where: { id: productId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      if (ownsTx) await transaction.rollback();
      throw new Error(`Product #${productId} not found.`);
    }

    const qty = parseInt(quantity, 10);
    const prevReserved = product.reserved_quantity || 0;
    const nextReserved = Math.max(0, prevReserved - qty);

    await product.update({
      reserved_quantity: nextReserved,
      updatedAt: new Date(),
    }, { transaction });

    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: product.available_quantity,
      new_quantity: product.available_quantity,
      adjustment_quantity: 0,
      reason: 'order_fulfilled',
      performed_by: performedBy,
      order_id: orderId ? String(orderId) : null,
      notes: `Order #${orderId} completed. Reserved stock fulfilled.`,
      timestamp: new Date(),
    }, { transaction });

    if (ownsTx) await transaction.commit();
    return { success: true, reservedQuantity: nextReserved };
  } catch (err) {
    if (ownsTx) await transaction.rollback();
    throw err;
  }
};

export const releaseReservedStock = async (
  productId,
  quantity,
  orderId,
  reason = 'payment_failed',
  performedBy = 'System',
  options = {}
) => {
  const { transaction: externalTx = null, variantId = null } = options || {};
  const ownsTx = !externalTx;
  const transaction = externalTx || (await sequelize.transaction());
  try {
    const product = await BusinessProduct.findOne({
      where: { id: productId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      if (ownsTx) await transaction.rollback();
      throw new Error(`Product #${productId} not found.`);
    }

    const qty = parseInt(quantity, 10);
    const prevAvailable = product.available_quantity;
    const nextAvailable = prevAvailable + qty;
    const prevReserved = product.reserved_quantity || 0;
    const nextReserved = Math.max(0, prevReserved - qty);
    const stockStatus = deriveStockStatus(product.track_inventory, nextAvailable, product.low_stock_threshold);
    const variantUpdate = adjustVariantStock(product.variants, variantId, qty, false);

    await product.update({
      available_quantity: nextAvailable,
      reserved_quantity: nextReserved,
      stock_status: stockStatus,
      ...(variantUpdate.matched ? { variants: variantUpdate.updatedVariants } : {}),
      updatedAt: new Date(),
    }, { transaction });

    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: prevAvailable,
      new_quantity: nextAvailable,
      adjustment_quantity: qty,
      reason: reason,
      performed_by: performedBy,
      order_id: orderId ? String(orderId) : null,
      notes: `Released ${qty} units back to stock for Order #${orderId} (${reason})`,
      timestamp: new Date(),
    }, { transaction });

    if (ownsTx) await transaction.commit();
    return { success: true, availableQuantity: nextAvailable, reservedQuantity: nextReserved };
  } catch (err) {
    if (ownsTx) await transaction.rollback();
    throw err;
  }
};

export const restoreStockOnReturn = async (
  productId,
  quantity,
  orderId,
  notes = 'Customer Return Restock',
  performedBy = 'Merchant',
  options = {}
) => {
  const { transaction: externalTx = null, variantId = null } = options || {};
  const ownsTx = !externalTx;
  const transaction = externalTx || (await sequelize.transaction());
  try {
    const product = await BusinessProduct.findOne({
      where: { id: productId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      if (ownsTx) await transaction.rollback();
      throw new Error(`Product #${productId} not found.`);
    }

    const qty = parseInt(quantity, 10);
    const prevAvailable = product.available_quantity;
    const nextAvailable = prevAvailable + qty;
    const stockStatus = deriveStockStatus(product.track_inventory, nextAvailable, product.low_stock_threshold);
    const variantUpdate = adjustVariantStock(product.variants, variantId, qty, false);

    await product.update({
      available_quantity: nextAvailable,
      stock_status: stockStatus,
      ...(variantUpdate.matched ? { variants: variantUpdate.updatedVariants } : {}),
      updatedAt: new Date(),
    }, { transaction });

    await ProductInventoryMovement.create({
      product_id: product.id,
      business_id: product.business_id,
      previous_quantity: prevAvailable,
      new_quantity: nextAvailable,
      adjustment_quantity: qty,
      reason: 'customer_return',
      performed_by: performedBy,
      order_id: orderId ? String(orderId) : null,
      notes: notes,
      timestamp: new Date(),
    }, { transaction });

    if (ownsTx) await transaction.commit();
    return { success: true, availableQuantity: nextAvailable };
  } catch (err) {
    if (ownsTx) await transaction.rollback();
    throw err;
  }
};

/**
 * Bulk action on products (publish, unpublish, archive, delete, update_category)
 */
export const bulkUpdateStatus = async (productIds = [], action, extraData = {}, userId, isGlobalAdmin = false) => {
  if (!productIds.length) return { updated: 0 };

  // Security: Check tenant ownership of all productIds unless admin
  if (!isGlobalAdmin) {
    const products = await BusinessProduct.findAll({
      where: { id: { [Op.in]: productIds }, is_deleted: false },
      attributes: ['id', 'business_id'],
    });

    if (products.length !== productIds.length) {
      throw new Error('UNAUTHORIZED_PRODUCTS: Some products do not exist or are not accessible.');
    }

    const businessIds = [...new Set(products.map(p => p.business_id))];
    const userBusinesses = await BusinessProfile.findAll({
      where: { id: { [Op.in]: businessIds }, userId, is_deleted: false },
      attributes: ['id'],
    });
    const ownedIds = new Set(userBusinesses.map(b => b.id.toString()));

    const unauthorized = products.filter(p => !ownedIds.has(p.business_id.toString()));
    if (unauthorized.length > 0) {
      throw new Error('UNAUTHORIZED_PRODUCTS: One or more selected products do not belong to your business.');
    }
  }

  const updates = { updatedAt: new Date(), updated_by: userId || null };

  if (action === 'publish') {
    updates.status = 'active';
  } else if (action === 'unpublish') {
    updates.status = 'draft';
  } else if (action === 'pause') {
    updates.status = 'paused';
  } else if (action === 'resume') {
    updates.status = 'active';
  } else if (action === 'archive') {
    updates.status = 'archived';
  } else if (action === 'delete') {
    updates.is_deleted = true;
    updates.deletedRemarks = extraData.reason || 'Bulk deleted by business owner';
  } else if (action === 'update_category' && extraData.category_id) {
    updates.category_id = extraData.category_id;
    if (extraData.category_name) updates.category_name = extraData.category_name;
  } else if (action === 'adjust_stock' && extraData.available_quantity !== undefined) {
    const qty = Math.max(0, parseInt(extraData.available_quantity, 10) || 0);
    updates.available_quantity = qty;
    updates.stock_status = qty <= 0 ? 'out_of_stock' : (qty <= 5 ? 'low_stock' : 'in_stock');
  } else if (action === 'adjust_price' && extraData.selling_price !== undefined) {
    updates.selling_price = parseFloat(extraData.selling_price) || 0;
  }

  const [affectedCount] = await BusinessProduct.update(updates, {
    where: {
      id: { [Op.in]: productIds },
      is_deleted: false,
    },
  });

  invalidateSearchQueryCache().catch(() => {});
  return { updated: affectedCount };
};

/**
 * Soft delete product
 */
export const softDeleteProduct = async (id, reason, userId) => {
  const product = await BusinessProduct.findOne({ where: { id, is_deleted: false } });
  if (!product) return null;

  const updated = await product.update({
    is_deleted: true,
    status: 'archived',
    deletedRemarks: reason || 'Deleted by business owner',
    updated_by: userId || null,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return updated;
};

/**
 * PUBLIC storefront endpoint for Residents/Customers
 * CRITICAL SECURITY REQUIREMENT:
 * 1. Never expose cost_price or profit_margin to customers!
 * 2. Sanitize nested variants so cost_price is never leaked!
 * 3. Only return active, approved, non-deleted products.
 */
const PUBLIC_PRODUCT_ATTRIBUTES = [
  'id', 'business_id', 'name', 'brand', 'category_id', 'category_name',
  'subcategory_id', 'subcategory_name', 'product_type', 'sku',
  'short_description', 'detailed_description', 'tags', 'search_keywords', 'unit',
  'primary_image', 'images', 'video_url', 'attributes',
  'mrp', 'selling_price', 'discount_type', 'discount_value',
  'gst_slab', 'tax_inclusive', 'track_inventory', 'available_quantity',
  'stock_status', 'allow_backorder', 'has_variants', 'variants',
  'home_delivery', 'store_pickup', 'delivery_charge', 'free_delivery_above',
  'min_order_quantity', 'max_order_quantity', 'prep_time_minutes', 'delivery_time_minutes',
  'packaging_charge', 'cash_on_delivery', 'delivery_coverage',
  'barcode', 'batch_number', 'mfg_date', 'expiry_date', 'shelf_life', 'storage_instructions',
  'country_of_origin', 'fssai_license',
  'bulk_pricing', 'is_featured', 'is_bestseller',
  'is_returnable', 'return_window_days', 'replacement_policy', 'warranty_details',
  'care_instructions', 'status', 'approval_status', 'created_at',
];

const attachActiveOfferToProductPlain = (plain, activeCampaigns = []) => {
  const offerMatch = businessOfferService.evaluateProductAutoOffer(plain, activeCampaigns);
  if (offerMatch) {
    plain.active_offer = offerMatch;
    plain.offer_price = offerMatch.effective_price;
    plain.offer_discount_amount = offerMatch.discount_amount;
    plain.offer_badge = offerMatch.badge;
    plain.offer_campaign_id = offerMatch.offer_id;
    if (offerMatch.variant_offers && Array.isArray(plain.variants)) {
      plain.variants = plain.variants.map((v) => {
        const vo = v && v.id != null ? offerMatch.variant_offers[String(v.id)] : null;
        return vo
          ? { ...v, active_offer: vo, offer_price: vo.effective_price, offer_badge: vo.badge }
          : v;
      });
    }
  } else {
    plain.active_offer = null;
    plain.offer_price = null;
    plain.offer_discount_amount = 0;
    plain.offer_badge = null;
    plain.offer_campaign_id = null;
  }
  return plain;
};

const sanitizePublicProduct = (productInstance, shopEval, queryLoc, activeCampaigns = []) => {
  const plain = productInstance.toJSON ? productInstance.toJSON() : { ...productInstance.dataValues };
  delete plain.cost_price;
  delete plain.costPrice;
  delete plain.profit_margin;
  delete plain.store_warehouse;
  if (Array.isArray(plain.variants)) {
    plain.variants = plain.variants.map((v) => {
      const { cost_price, costPrice, ...publicVariant } = v || {};
      return publicVariant;
    });
  }
  attachActiveOfferToProductPlain(plain, activeCampaigns);
  if (queryLoc && queryLoc.hasLocationFilter) {
    const eligibility = businessCoverageService.checkProductDeliveryEligibility(plain, shopEval, queryLoc);
    Object.assign(plain, eligibility);
  }
  return plain;
};

export const getPublicProductsByBusiness = async (businessId, query = {}) => {
  const where = {
    business_id: businessId,
    status: 'active',
    approval_status: 'approved',
    is_deleted: false,
  };

  if (query.category_id) {
    where.category_id = query.category_id;
  }

  if (query.search) {
    const s = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: s } },
      { brand: { [Op.like]: s } },
    ];
  }

  const products = await BusinessProduct.findAll({
    where,
    attributes: PUBLIC_PRODUCT_ATTRIBUTES,
    order: [['is_featured', 'DESC'], ['created_at', 'DESC']],
  });

  const queryLoc = businessCoverageService.parseLocationQuery(query);
  let shopEval = null;
  if (queryLoc.hasLocationFilter) {
    const shop = await BusinessProfile.findOne({
      where: { id: businessId, is_deleted: false },
      include: [
        { model: BusinessCoverageArea, as: 'coverageAreas', where: { is_deleted: false, is_active: true }, required: false },
        { model: SocietyBusinessAccess, as: 'societyAccesses', where: { is_deleted: false }, required: false },
      ],
    });
    if (shop) {
      const shopPlain = shop.toJSON();
      shopEval = businessCoverageService.evaluateBusinessMatch(
        shopPlain,
        shopPlain.coverageAreas || [],
        shopPlain.societyAccesses || [],
        queryLoc
      );
    }
  }

  const campaignsMap = await businessOfferService.getActiveEvaluableCampaignsMap([businessId]);
  const activeCampaigns = campaignsMap.get(Number(businessId)) || [];
  const mapped = products.map((p) => sanitizePublicProduct(p, shopEval, queryLoc, activeCampaigns));

  if (query.filter_undeliverable === true || query.filter_undeliverable === 'true') {
    return mapped.filter((item) => item.is_deliverable !== false);
  }
  return mapped;
};

/**
 * Public geo-synced product discovery across businesses covering the pinned location/radius.
 * Supports SQL geo bounding-box pre-filter, FULLTEXT search, Hinglish & live DB synonyms,
 * bounded Damerau-Levenshtein typo tolerance, weighted relevance ranking & search analytics.
 */
export const getPublicProductsNearby = async (query = {}) => {
  const startedAt = Date.now();
  const queryLoc = businessCoverageService.parseLocationQuery(query);
  const searchTerm = (query.search ?? query.q ?? '').toString().trim();
  const filterUndeliverable =
    query.filter_undeliverable === true || query.filter_undeliverable === 'true';
  const shouldLog =
    Boolean(searchTerm) && query.skip_log !== 'true' && query._skipLog !== true;

  // Check short-TTL Redis query cache when enabled
  let cacheEntryKey = null;
  if (!query._skipCache) {
    const cacheRes = await getCachedSearchPayload('products_nearby', {
      lat: queryLoc.latitude,
      lng: queryLoc.longitude,
      rad: queryLoc.radius_km,
      cid: queryLoc.city_id,
      cname: queryLoc.city_name,
      lid: queryLoc.locality_id,
      lname: queryLoc.locality_name,
      pin: queryLoc.pincode,
      soc: queryLoc.society_id,
      bid: query.business_id,
      catId: query.category_id,
      cat: query.category,
      q: normalizeText(searchTerm),
      open: query.is_open,
      ver: query.is_verified,
      stock: query.in_stock_only,
      freeDel: query.free_delivery,
      minP: query.min_price,
      maxP: query.max_price,
      fUndel: filterUndeliverable,
      sort: query.sort || (searchTerm ? 'relevance' : 'distance'),
      page: query.page || 1,
      limit: query.limit || 60,
    });
    cacheEntryKey = cacheRes.key;
    if (cacheRes.cached) {
      if (shouldLog) {
        logSearchEvent({
          query: searchTerm,
          categoryId: query.category_id ? Number(query.category_id) : null,
          categoryName: query.category || null,
          productResultCount: Number(cacheRes.cached.total || 0),
          matchedViaTypo: Boolean(cacheRes.cached.search_meta?.matched_via_typo),
          didYouMean: cacheRes.cached.search_meta?.did_you_mean || null,
          latencyMs: Date.now() - startedAt,
          locationContext: queryLoc,
          userId: query._viewerUserId || null,
          source: query.source || 'resident_search',
        }).catch(() => {});
      }
      return cacheRes.cached;
    }
  }

  const shopWhere = { is_deleted: false, is_active: true };
  if (query.business_id) {
    const bId = parseInt(query.business_id, 10);
    if (Number.isInteger(bId) && bId > 0) shopWhere.id = bId;
  }
  if (query.is_open !== undefined && query.is_open !== '') {
    shopWhere.is_open = query.is_open === true || query.is_open === 'true' || query.is_open === '1';
  }
  if (query.is_verified !== undefined && query.is_verified !== '') {
    shopWhere.is_verified =
      query.is_verified === true || query.is_verified === 'true' || query.is_verified === '1';
  }
  const geoBBox = buildGeoBoundingBoxWhere(queryLoc);
  if (geoBBox) {
    Object.assign(shopWhere, geoBBox);
  }

  const [candidateShops, categoryMaster, dynamicSynonyms] = await Promise.all([
    BusinessProfile.findAll({
      where: shopWhere,
      include: [
        { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'], required: false },
        { model: BusinessCoverageArea, as: 'coverageAreas', where: { is_deleted: false, is_active: true }, required: false },
        { model: SocietyBusinessAccess, as: 'societyAccesses', where: { is_deleted: false }, required: false },
      ],
    }),
    BusinessCategory.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'name'],
      raw: true,
    }),
    getDynamicSynonymConfig(),
  ]);

  const matchedShopMap = new Map();
  const matchedBusinesses = [];
  for (const shopInst of candidateShops) {
    const plain = shopInst.toJSON();
    const shopEval = businessCoverageService.evaluateBusinessMatch(
      plain,
      plain.coverageAreas || [],
      plain.societyAccesses || [],
      queryLoc
    );
    if (!shopEval.matched) continue;

    const summary = {
      id: Number(plain.id),
      business_name: plain.businessName,
      businessName: plain.businessName,
      category_id: plain.category_id ?? null,
      category_name: plain.category?.name ?? plain.serviceCategory ?? 'Local Business',
      serviceCategory: plain.serviceCategory ?? plain.category?.name ?? null,
      locality_name: plain.locality_name ?? null,
      city_name: plain.city_name ?? null,
      pincode: plain.pincode ?? null,
      address: plain.address ?? null,
      latitude: plain.latitude != null ? Number(plain.latitude) : null,
      longitude: plain.longitude != null ? Number(plain.longitude) : null,
      default_radius_km: plain.default_radius_km != null ? Number(plain.default_radius_km) : 10.0,
      logo_url: plain.logo_url ?? null,
      is_open: plain.is_open !== undefined ? Boolean(plain.is_open) : true,
      is_verified: Boolean(plain.is_verified),
      distance_km: shopEval.distance_km ?? null,
      distance: shopEval.distance ?? null,
      matched_by: shopEval.matched_by ?? null,
      coverage_areas: plain.coverageAreas || [],
    };
    matchedShopMap.set(Number(plain.id), { summary, shopEval });
    matchedBusinesses.push(summary);
  }

  matchedBusinesses.sort((a, b) => {
    const da = a.distance_km;
    const db = b.distance_km;
    if (da !== null && db !== null && da !== db) return da - db;
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    return Number(b.id) - Number(a.id);
  });

  if (matchedBusinesses.length === 0) {
    const emptyPayload = {
      total: 0,
      page: 1,
      limit: parseInt(query.limit || 50, 10),
      location_context: queryLoc,
      businesses: [],
      items: [],
      products: [],
      search_meta: {
        query: searchTerm || null,
        normalized_query: searchTerm ? normalizeText(searchTerm) : null,
        sort: (query.sort || (searchTerm ? 'relevance' : 'distance')).toString().toLowerCase(),
        did_you_mean: null,
        corrected_query: null,
        matched_via_typo: false,
        expanded_canonical_keys: [],
        latency_ms: Date.now() - startedAt,
      },
    };
    if (shouldLog) {
      logSearchEvent({
        query: searchTerm,
        categoryId: query.category_id ? Number(query.category_id) : null,
        categoryName: query.category || null,
        productResultCount: 0,
        latencyMs: Date.now() - startedAt,
        locationContext: queryLoc,
        userId: query._viewerUserId || null,
        source: query.source || 'resident_search',
      }).catch(() => {});
    }
    return emptyPayload;
  }

  const filterTarget = resolveFilterTarget(
    query.category_id,
    query.category,
    categoryMaster,
    dynamicSynonyms
  );

  const matchedIds = matchedBusinesses.map((b) => b.id);
  const baseProdWhere = {
    business_id: { [Op.in]: matchedIds },
    status: 'active',
    approval_status: 'approved',
    is_deleted: false,
  };

  if (query.in_stock_only === true || query.in_stock_only === 'true') {
    baseProdWhere.stock_status = { [Op.ne]: 'out_of_stock' };
  }
  if (query.free_delivery === true || query.free_delivery === 'true') {
    baseProdWhere.home_delivery = true;
    baseProdWhere.delivery_charge = 0;
  }

  const minPrice =
    query.min_price !== undefined && query.min_price !== '' ? parseFloat(query.min_price) : null;
  const maxPrice =
    query.max_price !== undefined && query.max_price !== '' ? parseFloat(query.max_price) : null;
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    baseProdWhere.selling_price = {};
    if (Number.isFinite(minPrice)) baseProdWhere.selling_price[Op.gte] = minPrice;
    if (Number.isFinite(maxPrice)) baseProdWhere.selling_price[Op.lte] = maxPrice;
  }

  const signals = searchTerm
    ? buildSqlSearchSignals(searchTerm, filterTarget, categoryMaster, dynamicSynonyms)
    : null;

  // SQL FULLTEXT + indexed category + shop-hit + typo-probe prefilter for large catalogs
  const prodWhere = { ...baseProdWhere };
  if (signals && (signals.fulltextBooleanQuery || signals.likeProbes.length > 0)) {
    const shopHitIds = matchedBusinesses
      .filter((b) => scoreBusinessSearch(b, searchTerm, categoryMaster, dynamicSynonyms).matched)
      .map((b) => b.id);

    const orClauses = [];
    if (signals.fulltextBooleanQuery) {
      orClauses.push(
        sequelize.literal(
          `MATCH(name, brand, category_name, subcategory_name, short_description) AGAINST(${sequelize.escape(
            signals.fulltextBooleanQuery
          )} IN BOOLEAN MODE)`
        )
      );
    }
    if (signals.matchedCategoryIds.length > 0) {
      orClauses.push({ category_id: { [Op.in]: signals.matchedCategoryIds } });
    }
    if (shopHitIds.length > 0) {
      orClauses.push({ business_id: { [Op.in]: shopHitIds } });
    }
    for (const ck of signals.matchedCanonicalKeys) {
      orClauses.push({ category_name: { [Op.like]: `%${ck}%` } });
    }
    if (signals.matchedCanonicalKeys.length === 0) {
      for (const probe of signals.likeProbes) {
        if (!probe || probe.length < 3) continue;
        const p = `%${probe}%`;
        orClauses.push(
          { name: { [Op.like]: p } },
          { brand: { [Op.like]: p } },
          { subcategory_name: { [Op.like]: p } },
          { tags: { [Op.like]: p } },
          { search_keywords: { [Op.like]: p } }
        );
      }
    }
    if (orClauses.length > 0) {
      prodWhere[Op.or] = orClauses;
    }
  }

  let products = await BusinessProduct.findAll({
    where: prodWhere,
    attributes: PUBLIC_PRODUCT_ATTRIBUTES,
    order: [['is_bestseller', 'DESC'], ['is_featured', 'DESC'], ['id', 'DESC']],
    limit: 500,
  });

  // Safe fuzzy fallback if strict SQL pre-filter returned 0 items on an extreme typo
  if (products.length === 0 && searchTerm && prodWhere[Op.or]) {
    products = await BusinessProduct.findAll({
      where: baseProdWhere,
      attributes: PUBLIC_PRODUCT_ATTRIBUTES,
      order: [['is_bestseller', 'DESC'], ['is_featured', 'DESC'], ['id', 'DESC']],
      limit: 250,
    });
  }

  const productCountByBiz = {};
  const enriched = [];
  const typoCorrections = {};
  let anyMatchedViaTypo = false;
  const vocabSet = new Set();

  const { aliasToCanonical } = buildEffectiveSynonymDictionaries(dynamicSynonyms);
  for (const cat of categoryMaster) {
    const n = normalizeText(cat.name);
    if (n) vocabSet.add(n);
  }
  for (const aliasWord of Object.keys(aliasToCanonical)) {
    for (const w of aliasWord.split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }
  for (const b of matchedBusinesses) {
    for (const w of normalizeText(b.businessName).split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }

  const bizIds = [...new Set(matchedBusinesses.map((b) => Number(b.id)).filter(Boolean))];
  const activeCampaignsMap = await businessOfferService.getActiveEvaluableCampaignsMap(bizIds);

  for (const prodInst of products) {
    const entry = matchedShopMap.get(Number(prodInst.business_id));
    if (!entry) continue;

    const bizCampaigns = activeCampaignsMap.get(Number(prodInst.business_id)) || [];
    const item = sanitizePublicProduct(prodInst, entry.shopEval, queryLoc, bizCampaigns);
    item.business = entry.summary;
    item.business_name = entry.summary.business_name;
    if (item.distance_km == null) item.distance_km = entry.summary.distance_km;
    if (item.distance == null) item.distance = entry.summary.distance;

    for (const w of normalizeText(`${item.name || ''} ${item.brand || ''} ${item.subcategory_name || ''}`).split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }

    if (
      filterTarget &&
      !productMatchesCategoryFilter(item, filterTarget, categoryMaster, dynamicSynonyms)
    ) {
      continue;
    }

    if (searchTerm) {
      const searchEval = scoreProductSearch(
        item,
        entry.summary,
        searchTerm,
        categoryMaster,
        dynamicSynonyms
      );
      if (!searchEval.matched) continue;
      item.relevance_score = searchEval.score;
      item.matched_via_typo = searchEval.matchedViaTypo;
      if (searchEval.matchedViaTypo) {
        anyMatchedViaTypo = true;
        Object.assign(typoCorrections, searchEval.typoCorrections);
      }
    }

    if (filterUndeliverable && item.is_deliverable === false) continue;

    productCountByBiz[entry.summary.id] = (productCountByBiz[entry.summary.id] || 0) + 1;
    enriched.push(item);
  }

  const sortMode = (query.sort || (searchTerm ? 'relevance' : 'distance'))
    .toString()
    .toLowerCase();
  enriched.sort((a, b) => {
    if (sortMode === 'relevance' && searchTerm) {
      const relDiff = Number(b.relevance_score || 0) - Number(a.relevance_score || 0);
      if (Math.abs(relDiff) > 0.01) return relDiff;
    }
    if (sortMode === 'price_asc') return Number(a.selling_price || 0) - Number(b.selling_price || 0);
    if (sortMode === 'price_desc') return Number(b.selling_price || 0) - Number(a.selling_price || 0);
    if (sortMode === 'discount') {
      const discA = a.mrp > 0 ? (a.mrp - a.selling_price) / a.mrp : 0;
      const discB = b.mrp > 0 ? (b.mrp - b.selling_price) / b.mrp : 0;
      return discB - discA;
    }
    if (sortMode === 'bestseller') {
      const ba = a.is_bestseller ? 1 : 0;
      const bb = b.is_bestseller ? 1 : 0;
      if (ba !== bb) return bb - ba;
    }
    const delivA = a.is_deliverable === false ? 1 : 0;
    const delivB = b.is_deliverable === false ? 1 : 0;
    if (delivA !== delivB) return delivA - delivB;

    const da = a.distance_km;
    const db = b.distance_km;
    if (da !== null && db !== null && da !== db) return da - db;
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    return Number(b.id) - Number(a.id);
  });

  const didYouMean = searchTerm
    ? computeDidYouMean(searchTerm, Array.from(vocabSet), typoCorrections)
    : null;

  const hasProdFilter = Boolean(filterTarget || searchTerm);
  const hydratedBusinesses = matchedBusinesses
    .map((b) => ({
      ...b,
      product_count: productCountByBiz[b.id] || 0,
    }))
    .filter((b) => !hasProdFilter || b.product_count > 0);

  const page = Math.max(1, parseInt(query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || 60, 10)));
  const start = (page - 1) * limit;
  const paged = enriched.slice(start, start + limit);
  const latencyMs = Date.now() - startedAt;

  const resultPayload = {
    total: enriched.length,
    page,
    limit,
    location_context: queryLoc,
    businesses: hydratedBusinesses,
    items: paged,
    products: paged,
    search_meta: {
      query: searchTerm || null,
      normalized_query: searchTerm ? normalizeText(searchTerm) : null,
      sort: sortMode,
      did_you_mean: didYouMean,
      corrected_query: didYouMean,
      matched_via_typo: anyMatchedViaTypo,
      expanded_canonical_keys: signals?.matchedCanonicalKeys || [],
      latency_ms: latencyMs,
    },
  };

  if (cacheEntryKey && !query._skipCache) {
    setCachedSearchPayload(cacheEntryKey, resultPayload).catch(() => {});
  }

  if (shouldLog) {
    logSearchEvent({
      query: searchTerm,
      categoryId: filterTarget?.category_id || (query.category_id ? Number(query.category_id) : null),
      categoryName: filterTarget?.category_name || query.category || null,
      productResultCount: enriched.length,
      matchedViaTypo: anyMatchedViaTypo,
      didYouMean,
      latencyMs,
      locationContext: queryLoc,
      userId: query._viewerUserId || null,
      source: query.source || 'resident_search',
    }).catch(() => {});
  }

  return resultPayload;
};

/**
 * Public: Typeahead autocomplete & spell-correction suggestions for search box
 */
export const getPublicSearchSuggestions = async (query = {}) => {
  const startedAt = Date.now();
  const qText = (query.q ?? query.search ?? '').toString().trim();
  const limit = Math.min(12, Math.max(2, parseInt(query.limit || 6, 10)));
  const queryLoc = businessCoverageService.parseLocationQuery(query);

  const [nearbyCatalog, categoryMaster, dynamicSynonyms, trending] = await Promise.all([
    getPublicProductsNearby({
      ...query,
      q: undefined,
      search: undefined,
      page: 1,
      limit: 100,
      sort: 'distance',
      _skipLog: true,
    }),
    BusinessCategory.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'name', 'icon'],
      raw: true,
    }),
    getDynamicSynonymConfig(),
    getTrendingSearchTerms({ cityName: queryLoc.city_name, limit: 6 }),
  ]);

  const products = nearbyCatalog.products || [];
  const businesses = nearbyCatalog.businesses || [];

  if (!qText) {
    return {
      query: '',
      did_you_mean: null,
      corrected_query: null,
      categories: categoryMaster.slice(0, 6).map((cat) => ({
        category_id: Number(cat.id),
        category_name: cat.name,
        icon: cat.icon || null,
      })),
      products: products.slice(0, limit).map((p) => ({
        id: Number(p.id),
        name: p.name,
        brand: p.brand || null,
        category_id: p.category_id || null,
        category_name: p.category_name || null,
        selling_price: Number(p.selling_price || 0),
        primary_image: p.primary_image || null,
        business_id: Number(p.business_id),
        business_name: p.business_name || p.business?.business_name || null,
        distance_km: p.distance_km ?? null,
      })),
      businesses: businesses.slice(0, Math.min(4, limit)),
      trending_searches: trending,
      latency_ms: Date.now() - startedAt,
    };
  }

  const { aliasToCanonical } = buildEffectiveSynonymDictionaries(dynamicSynonyms);
  const vocabSet = new Set();
  for (const cat of categoryMaster) vocabSet.add(normalizeText(cat.name));
  for (const aliasWord of Object.keys(aliasToCanonical)) {
    for (const w of aliasWord.split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }
  for (const p of products) {
    for (const w of normalizeText(`${p.name || ''} ${p.brand || ''} ${p.subcategory_name || ''}`).split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }
  for (const b of businesses) {
    for (const w of normalizeText(b.businessName || b.business_name || '').split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }

  const typoCorrections = {};
  const scoredProducts = [];
  for (const p of products) {
    const s = scoreProductSearch(p, p.business || null, qText, categoryMaster, dynamicSynonyms);
    if (s.matched) {
      if (s.matchedViaTypo) Object.assign(typoCorrections, s.typoCorrections);
      scoredProducts.push({ ...p, relevance_score: s.score });
    }
  }
  scoredProducts.sort((a, b) => Number(b.relevance_score || 0) - Number(a.relevance_score || 0));

  const scoredBusinesses = [];
  for (const b of businesses) {
    const s = scoreBusinessSearch(b, qText, categoryMaster, dynamicSynonyms);
    if (s.matched) {
      if (s.matchedViaTypo) Object.assign(typoCorrections, s.typoCorrections);
      scoredBusinesses.push({ ...b, relevance_score: s.score });
    }
  }
  scoredBusinesses.sort((a, b) => Number(b.relevance_score || 0) - Number(a.relevance_score || 0));

  const qNorm = normalizeText(qText);
  const suggestedCategories = [];
  const matchedSignals = buildSqlSearchSignals(qText, null, categoryMaster, dynamicSynonyms);
  for (const cat of categoryMaster) {
    const cNorm = normalizeText(cat.name);
    const resolved = resolveCategoryFromMaster(cat.id, cat.name, categoryMaster, dynamicSynonyms);
    const isDirectPrefix = cNorm.startsWith(qNorm) || qNorm.includes(cNorm);
    const isCanonicalHit =
      resolved.canonical_key && matchedSignals.matchedCanonicalKeys.includes(resolved.canonical_key);
    const fuzzyCat = qNorm.length >= 4 ? findBestFuzzyMatch(qNorm, [cNorm]) : null;
    if (isDirectPrefix || isCanonicalHit || fuzzyCat) {
      const catProductCount = products.filter((p) =>
        productMatchesCategoryFilter(
          p,
          { category_id: Number(cat.id), canonical_key: resolved.canonical_key },
          categoryMaster,
          dynamicSynonyms
        )
      ).length;
      suggestedCategories.push({
        category_id: Number(cat.id),
        category_name: cat.name,
        icon: cat.icon || null,
        product_count: catProductCount,
      });
    }
  }

  const didYouMean = computeDidYouMean(qText, Array.from(vocabSet), typoCorrections);

  return {
    query: qText,
    did_you_mean: didYouMean,
    corrected_query: didYouMean,
    categories: suggestedCategories.slice(0, 4),
    products: scoredProducts.slice(0, limit).map((p) => ({
      id: Number(p.id),
      name: p.name,
      brand: p.brand || null,
      category_id: p.category_id || null,
      category_name: p.category_name || null,
      selling_price: Number(p.selling_price || 0),
      mrp: Number(p.mrp || 0),
      primary_image: p.primary_image || null,
      business_id: Number(p.business_id),
      business_name: p.business_name || p.business?.business_name || null,
      distance_km: p.distance_km ?? null,
      relevance_score: p.relevance_score ?? 0,
    })),
    businesses: scoredBusinesses.slice(0, Math.min(4, limit)),
    trending_searches: trending,
    latency_ms: Date.now() - startedAt,
  };
};

/**
 * Public: Get single product details for customers/residents
 * Strips confidential merchant fields (cost price, profit margin, warehouse rack, audit logs)
 */
export const getPublicProductById = async (id, query = {}) => {
  const product = await BusinessProduct.findOne({
    where: {
      id,
      status: 'active',
      approval_status: 'approved',
      is_deleted: false,
    },
    include: [
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
    ],
  });

  if (!product) return null;

  const plain = product.toJSON ? product.toJSON() : { ...product.dataValues };

  // Strip private merchant fields
  delete plain.cost_price;
  delete plain.costPrice;
  delete plain.profit_margin;
  delete plain.store_warehouse;
  delete plain.inventoryMovements;
  delete plain.inventory_movements;

  if (Array.isArray(plain.variants)) {
    plain.variants = plain.variants.map((v) => {
      const { cost_price, costPrice, ...publicVariant } = v;
      return publicVariant;
    });
  }

  const queryLoc = businessCoverageService.parseLocationQuery(query);
  if (queryLoc.hasLocationFilter && plain.business_id) {
    const shop = await BusinessProfile.findOne({
      where: { id: plain.business_id, is_deleted: false },
      include: [
        { model: BusinessCoverageArea, as: 'coverageAreas', where: { is_deleted: false, is_active: true }, required: false },
        { model: SocietyBusinessAccess, as: 'societyAccesses', where: { is_deleted: false }, required: false },
      ],
    });
    const shopEval = shop
      ? businessCoverageService.evaluateBusinessMatch(
          shop.toJSON(),
          shop.coverageAreas || [],
          shop.societyAccesses || [],
          queryLoc
        )
      : null;
    const eligibility = businessCoverageService.checkProductDeliveryEligibility(plain, shopEval, queryLoc);
    Object.assign(plain, eligibility);
  }

  return plain;
};
