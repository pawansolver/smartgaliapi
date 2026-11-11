import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessOffer from './business_offer.model.js';
import BusinessOfferDiscountGroup from './business_offer_discount_group.model.js';
import BusinessOfferTarget from './business_offer_target.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import {
  buildCampaignPreview,
  buildEvaluableCampaigns,
  doesRuleMatchProductOrVariant,
  evaluateProductAutoOffer,
  formatDiscountBadge,
  isOfferCurrentlyValid,
  normalizeCampaignInput,
  parseDiscountNumericFromText,
  resolveCheckoutOffers,
  sanitizeDateOnly,
  toNumberOrNull,
  validateCampaignPayload,
} from './business_offer_engine.helper.js';
import { invalidateSearchQueryCache } from '../business_category/business_search_intelligence.service.js';

export {
  evaluateProductAutoOffer,
  isOfferCurrentlyValid,
  resolveCheckoutOffers,
};

const OFFER_INCLUDE = [
  { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] },
  {
    model: BusinessOfferDiscountGroup,
    as: 'discount_groups',
    where: { is_deleted: false },
    required: false,
    include: [
      {
        model: BusinessOfferTarget,
        as: 'targets',
        where: { is_deleted: false },
        required: false,
      },
    ],
  },
  {
    model: BusinessOfferTarget,
    as: 'targets',
    where: { is_deleted: false },
    required: false,
  },
];

export const normalizeOfferPayload = (raw = {}, { isUpdate = false } = {}) => {
  return normalizeCampaignInput(raw, { isUpdate }).header;
};

const summarizeOfferScope = (plain, groups) => {
  const scope = String(plain.campaign_scope || 'ENTIRE_STORE').toUpperCase();
  if (groups.length > 1 || scope === 'MULTI_GROUP') {
    return `${groups.length} Discount Groups`;
  }
  const firstTargets = groups[0]?.targets?.filter((t) => !t.is_excluded) || [];
  if (scope === 'SELECTED_CATEGORIES') {
    return `${firstTargets.length} Categor${firstTargets.length === 1 ? 'y' : 'ies'}`;
  }
  if (scope === 'SELECTED_PRODUCTS') {
    return `${firstTargets.length} Product${firstTargets.length === 1 ? '' : 's'}`;
  }
  if (scope === 'SELECTED_VARIANTS') {
    return `${firstTargets.length} Variant${firstTargets.length === 1 ? '' : 's'}`;
  }
  return 'Entire Store';
};

export const formatOfferForClient = (offerInstance, storeProducts = null) => {
  if (!offerInstance) return null;
  const plain = typeof offerInstance.toJSON === 'function' ? offerInstance.toJSON() : { ...offerInstance };
  const cleanValidFrom = sanitizeDateOnly(plain.valid_from);
  const cleanValidTo = sanitizeDateOnly(plain.valid_to);
  const fallbackPct =
    toNumberOrNull(plain.discount_percent) ?? parseDiscountNumericFromText(plain.discount);
  const discountType =
    String(plain.discount_type || '').toLowerCase() === 'flat' ? 'flat' : 'percentage';

  const rawGroups = Array.isArray(plain.discount_groups)
    ? [...plain.discount_groups]
        .filter((g) => !g.is_deleted)
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
    : [];

  const allTargets = Array.isArray(plain.targets)
    ? plain.targets.filter((t) => !t.is_deleted)
    : [];

  const groups =
    rawGroups.length > 0
      ? rawGroups.map((g) => {
          const gTargets = (Array.isArray(g.targets) && g.targets.length > 0
            ? g.targets
            : allTargets.filter((t) => Number(t.group_id) === Number(g.id))
          ).filter((t) => !t.is_deleted);
          return {
            ...g,
            discount_value: toNumberOrNull(g.discount_value) ?? fallbackPct ?? 0,
            max_discount_amount: toNumberOrNull(g.max_discount_amount),
            min_order_amount: toNumberOrNull(g.min_order_amount) ?? 0,
            dynamic_include_new: g.dynamic_include_new !== false,
            priority: Number(g.priority || 10),
            badge: formatDiscountBadge(g.discount_type, g.discount_value),
            targets: gTargets,
          };
        })
      : [
          {
            id: null,
            offer_id: plain.id,
            business_id: plain.business_id,
            group_name: plain.title,
            scope_type: 'ENTIRE_STORE',
            discount_type: discountType,
            discount_value: fallbackPct ?? 0,
            max_discount_amount: toNumberOrNull(plain.max_discount_amount),
            min_order_amount: toNumberOrNull(plain.min_order_amount) ?? 0,
            dynamic_include_new: plain.dynamic_include_new !== false,
            priority: Number(plain.priority || 10),
            badge: formatDiscountBadge(discountType, fallbackPct ?? 0),
            targets: allTargets,
          },
        ];

  let affectedProductsCount = null;
  if (Array.isArray(storeProducts)) {
    const campaignObj = { ...plain, discount_groups: groups, targets: allTargets };
    affectedProductsCount = storeProducts.filter((prod) =>
      groups.some((g) =>
        doesRuleMatchProductOrVariant(g, campaignObj, prod, null, {
          ignoreApprovalForPreview: true,
        })
      )
    ).length;
  }

  const exclusions = allTargets.filter((t) => t.is_excluded);
  const campaignScope = String(plain.campaign_scope || 'ENTIRE_STORE').toUpperCase();
  const applicationMode = String(plain.application_mode || (plain.promo_code ? 'COUPON' : 'AUTO')).toUpperCase();
  const conflictPolicy = String(plain.conflict_policy || 'HIGHEST_DISCOUNT').toUpperCase();
  const badge = plain.banner_badge || groups[0]?.badge || formatDiscountBadge(discountType, fallbackPct ?? 0);

  return {
    ...plain,
    discount_type: discountType,
    discount_percent: fallbackPct,
    max_discount_amount: toNumberOrNull(plain.max_discount_amount),
    min_order_amount: toNumberOrNull(plain.min_order_amount) ?? 0,
    valid_from: cleanValidFrom,
    valid_to: cleanValidTo,
    campaign_scope: campaignScope,
    application_mode: applicationMode,
    conflict_policy: conflictPolicy,
    priority: Number(plain.priority || 10),
    stackable: Boolean(plain.stackable),
    dynamic_include_new: plain.dynamic_include_new !== false,
    banner_badge: badge,
    scope_summary: summarizeOfferScope(plain, groups),
    discount_groups: groups,
    targets: allTargets,
    exclusions,
    ...(affectedProductsCount !== null ? { affected_products_count: affectedProductsCount } : {}),
    // camelCase mirrors for seamless Flutter parsing
    isActive: plain.is_active !== false,
    promoCode: plain.promo_code || '',
    discountType,
    discountPercent: fallbackPct ?? 0,
    maxDiscountAmount: toNumberOrNull(plain.max_discount_amount),
    minOrderAmount: toNumberOrNull(plain.min_order_amount) ?? 0,
    validFrom: cleanValidFrom || '',
    validUntil: cleanValidTo || '',
    campaignScope,
    applicationMode,
    conflictPolicy,
    dynamicIncludeNew: plain.dynamic_include_new !== false,
    bannerBadge: badge,
    discountGroups: groups,
    ...(affectedProductsCount !== null ? { affectedProductsCount } : {}),
  };
};

const fetchStoreProductsLightweight = async (businessId) => {
  return await BusinessProduct.findAll({
    attributes: [
      'id',
      'business_id',
      'name',
      'brand',
      'category_id',
      'category_name',
      'subcategory_id',
      'primary_image',
      'images',
      'mrp',
      'selling_price',
      'status',
      'approval_status',
      'stock_status',
      'available_quantity',
      'variants',
      'is_deleted',
      'created_at',
    ],
    where: {
      business_id: Number(businessId),
      is_deleted: false,
    },
    include: [{ model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] }],
    order: [['id', 'DESC']],
  });
};

const serializeCatalogProductForOffer = (prodInstance) => {
  const plain = typeof prodInstance.toJSON === 'function' ? prodInstance.toJSON() : { ...prodInstance };
  const catName = plain.category?.name || plain.category_name || 'Uncategorized';
  const variants = Array.isArray(plain.variants)
    ? plain.variants.map((v) => ({
        id: v.id != null ? String(v.id) : '',
        name: v.name || '',
        value: v.value || '',
        label: [v.name, v.value].filter(Boolean).join(': ') || v.sku || 'Variant',
        sku: v.sku || null,
        mrp: Number(v.mrp ?? plain.mrp ?? 0),
        selling_price: Number(v.selling_price ?? v.sellingPrice ?? plain.selling_price ?? 0),
        stock: Number(v.stock ?? plain.available_quantity ?? 0),
        status: v.status || 'active',
      }))
    : [];

  return {
    id: Number(plain.id),
    business_id: Number(plain.business_id),
    name: plain.name,
    brand: plain.brand || null,
    category_id: plain.category_id ? Number(plain.category_id) : null,
    category_name: catName,
    subcategory_id: plain.subcategory_id ? Number(plain.subcategory_id) : null,
    mrp: Number(plain.mrp || 0),
    selling_price: Number(plain.selling_price || 0),
    status: plain.status || 'active',
    approval_status: plain.approval_status || 'approved',
    stock_status: plain.stock_status || 'in_stock',
    available_quantity: Number(plain.available_quantity || 0),
    image: plain.primary_image || (Array.isArray(plain.images) && plain.images[0]) || null,
    variants,
    is_deleted: Boolean(plain.is_deleted),
    created_at: plain.created_at,
  };
};

/**
 * Returns categories with live product counts + products + variants for the Owner Offer Picker UI.
 */
export const getEligibleCatalogForOffers = async (businessId) => {
  const rawProducts = await fetchStoreProductsLightweight(businessId);
  const products = rawProducts.map(serializeCatalogProductForOffer);

  const catMap = new Map();
  let eligibleCount = 0;

  for (const p of products) {
    const isEligible =
      p.status === 'active' && p.approval_status === 'approved' && Number(p.selling_price) > 0;
    if (isEligible) eligibleCount += 1;

    const catKey = p.category_id != null ? `id:${p.category_id}` : `name:${p.category_name.toLowerCase()}`;
    const existing = catMap.get(catKey) || {
      category_id: p.category_id,
      category_name: p.category_name,
      product_count: 0,
      eligible_count: 0,
    };
    existing.product_count += 1;
    if (isEligible) existing.eligible_count += 1;
    catMap.set(catKey, existing);
  }

  const categories = Array.from(catMap.values()).sort(
    (a, b) => b.eligible_count - a.eligible_count || a.category_name.localeCompare(b.category_name)
  );

  return {
    business_id: Number(businessId),
    total_products: products.length,
    eligible_products: eligibleCount,
    categories,
    products,
  };
};

/**
 * Preview offer impact, sample calculated prices, validation errors & conflicts before publishing.
 */
export const previewOfferCampaign = async (rawPayload = {}) => {
  const businessId = toNumberOrNull(rawPayload.business_id ?? rawPayload.businessId);
  if (!businessId) {
    const err = new Error('business_id is required to preview campaign.');
    err.statusCode = 400;
    throw err;
  }

  const [rawProducts, existingRows] = await Promise.all([
    fetchStoreProductsLightweight(businessId),
    BusinessOffer.findAll({
      where: { business_id: businessId, is_active: true, is_deleted: false },
      include: OFFER_INCLUDE,
    }),
  ]);
  const storeProducts = rawProducts.map(serializeCatalogProductForOffer);
  const existingPlain = existingRows.map((r) => r.toJSON());
  const normalized = normalizeCampaignInput(rawPayload, { isUpdate: false });
  if (rawPayload.id) normalized.header.id = Number(rawPayload.id);

  return buildCampaignPreview(normalized, storeProducts, existingPlain);
};

/**
 * Create a Bulk Offer Campaign with normalized discount groups and targets inside a transaction.
 */
export const createOffer = async (offerData = {}) => {
  const normalized = normalizeCampaignInput(offerData, { isUpdate: false });
  const businessId = normalized.header.business_id;

  const rawProducts = businessId ? await fetchStoreProductsLightweight(businessId) : [];
  const storeProducts = rawProducts.map(serializeCatalogProductForOffer);
  const validation = validateCampaignPayload(normalized, storeProducts);

  if (!validation.valid) {
    const err = new Error(validation.errors.join(' '));
    err.statusCode = 400;
    err.errors = validation.errors;
    throw err;
  }

  const createdId = await sequelize.transaction(async (transaction) => {
    const created = await BusinessOffer.create(normalized.header, { transaction });

    for (const grp of normalized.groups || []) {
      const createdGroup = await BusinessOfferDiscountGroup.create(
        {
          offer_id: created.id,
          business_id: businessId,
          group_name: grp.group_name,
          scope_type: grp.scope_type,
          discount_type: grp.discount_type,
          discount_value: grp.discount_value,
          max_discount_amount: grp.max_discount_amount,
          min_order_amount: grp.min_order_amount ?? 0,
          dynamic_include_new: grp.dynamic_include_new !== false,
          priority: grp.priority ?? 10,
          display_order: grp.display_order ?? 0,
          created_by: normalized.header.created_by || null,
        },
        { transaction }
      );

      if (Array.isArray(grp.targets) && grp.targets.length > 0) {
        await BusinessOfferTarget.bulkCreate(
          grp.targets.map((t) => ({
            ...t,
            offer_id: created.id,
            group_id: createdGroup.id,
            business_id: businessId,
            created_by: normalized.header.created_by || null,
          })),
          { transaction }
        );
      }
    }

    if (Array.isArray(normalized.exclusions) && normalized.exclusions.length > 0) {
      await BusinessOfferTarget.bulkCreate(
        normalized.exclusions.map((t) => ({
          ...t,
          offer_id: created.id,
          group_id: null,
          business_id: businessId,
          is_excluded: true,
          created_by: normalized.header.created_by || null,
        })),
        { transaction }
      );
    }

    return created.id;
  });

  const full = await BusinessOffer.findOne({
    where: { id: createdId, is_deleted: false },
    include: OFFER_INCLUDE,
  });
  invalidateSearchQueryCache().catch(() => {});
  return formatOfferForClient(full, storeProducts);
};

export const getAllOffers = async () => {
  const rows = await BusinessOffer.findAll({
    where: { is_deleted: false },
    include: OFFER_INCLUDE,
    order: [['id', 'DESC']],
  });
  return rows.map((r) => formatOfferForClient(r));
};

export const getOffersByBusiness = async (businessId, { activeOnly = false } = {}) => {
  const bId = Number(businessId);
  const where = {
    business_id: bId,
    is_deleted: false,
  };
  if (activeOnly) {
    where.is_active = true;
  }

  const [rows, rawProducts] = await Promise.all([
    BusinessOffer.findAll({
      where,
      include: OFFER_INCLUDE,
      order: [
        ['priority', 'ASC'],
        ['id', 'DESC'],
      ],
    }),
    fetchStoreProductsLightweight(bId),
  ]);
  const storeProducts = rawProducts.map(serializeCatalogProductForOffer);
  const formatted = rows.map((r) => formatOfferForClient(r, storeProducts));
  return activeOnly ? formatted.filter((o) => isOfferCurrentlyValid(o)) : formatted;
};

export const getOfferById = async (id) => {
  const row = await BusinessOffer.findOne({
    where: { id, is_deleted: false },
    include: OFFER_INCLUDE,
  });
  if (!row) return null;
  const rawProducts = await fetchStoreProductsLightweight(row.business_id);
  const storeProducts = rawProducts.map(serializeCatalogProductForOffer);
  return formatOfferForClient(row, storeProducts);
};

/**
 * Update offer campaign header and optionally replace discount_groups & targets.
 */
export const updateOffer = async (id, updateData = {}) => {
  const offer = await BusinessOffer.findOne({
    where: { id, is_deleted: false },
    include: OFFER_INCLUDE,
  });
  if (!offer) return null;

  const rawMergedForGroups =
    updateData.discount_groups !== undefined ||
    updateData.discountGroups !== undefined ||
    updateData.targets !== undefined ||
    updateData.exclusions !== undefined ||
    updateData.campaign_scope !== undefined ||
    updateData.campaignScope !== undefined;

  const normalized = normalizeCampaignInput(
    {
      business_id: offer.business_id,
      title: offer.title,
      discount_type: offer.discount_type,
      discount_percent: offer.discount_percent,
      application_mode: offer.application_mode,
      campaign_scope: offer.campaign_scope,
      promo_code: offer.promo_code,
      ...updateData,
    },
    { isUpdate: !rawMergedForGroups }
  );

  const rawProducts = await fetchStoreProductsLightweight(offer.business_id);
  const storeProducts = rawProducts.map(serializeCatalogProductForOffer);

  if (rawMergedForGroups) {
    const validation = validateCampaignPayload(normalized, storeProducts);
    if (!validation.valid) {
      const err = new Error(validation.errors.join(' '));
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }
  } else if (
    normalized.header.valid_from &&
    normalized.header.valid_to &&
    normalized.header.valid_from > normalized.header.valid_to
  ) {
    const err = new Error('Offer valid_to date cannot be earlier than valid_from date.');
    err.statusCode = 400;
    throw err;
  }

  await sequelize.transaction(async (transaction) => {
    await offer.update({ ...normalized.header, updatedAt: new Date() }, { transaction });

    if (rawMergedForGroups && Array.isArray(normalized.groups)) {
      await BusinessOfferTarget.update(
        { is_deleted: true, deletedRemarks: 'Replaced on campaign update', updatedAt: new Date() },
        { where: { offer_id: offer.id, is_deleted: false }, transaction }
      );
      await BusinessOfferDiscountGroup.update(
        { is_deleted: true, deletedRemarks: 'Replaced on campaign update', updatedAt: new Date() },
        { where: { offer_id: offer.id, is_deleted: false }, transaction }
      );

      for (const grp of normalized.groups) {
        const createdGroup = await BusinessOfferDiscountGroup.create(
          {
            offer_id: offer.id,
            business_id: offer.business_id,
            group_name: grp.group_name,
            scope_type: grp.scope_type,
            discount_type: grp.discount_type,
            discount_value: grp.discount_value,
            max_discount_amount: grp.max_discount_amount,
            min_order_amount: grp.min_order_amount ?? 0,
            dynamic_include_new: grp.dynamic_include_new !== false,
            priority: grp.priority ?? 10,
            display_order: grp.display_order ?? 0,
            updated_by: updateData.updated_by || null,
          },
          { transaction }
        );

        if (Array.isArray(grp.targets) && grp.targets.length > 0) {
          await BusinessOfferTarget.bulkCreate(
            grp.targets.map((t) => ({
              ...t,
              offer_id: offer.id,
              group_id: createdGroup.id,
              business_id: offer.business_id,
              updated_by: updateData.updated_by || null,
            })),
            { transaction }
          );
        }
      }

      if (Array.isArray(normalized.exclusions) && normalized.exclusions.length > 0) {
        await BusinessOfferTarget.bulkCreate(
          normalized.exclusions.map((t) => ({
            ...t,
            offer_id: offer.id,
            group_id: null,
            business_id: offer.business_id,
            is_excluded: true,
            updated_by: updateData.updated_by || null,
          })),
          { transaction }
        );
      }
    }
  });

  const refreshed = await BusinessOffer.findOne({
    where: { id: offer.id, is_deleted: false },
    include: OFFER_INCLUDE,
  });
  invalidateSearchQueryCache().catch(() => {});
  return formatOfferForClient(refreshed, storeProducts);
};

export const toggleOfferStatus = async (id, isActive) => {
  const offer = await BusinessOffer.findOne({ where: { id, is_deleted: false } });
  if (!offer) return null;
  const nextActive = isActive !== undefined ? Boolean(isActive) : !offer.is_active;
  await offer.update({ is_active: nextActive, updatedAt: new Date() });
  invalidateSearchQueryCache().catch(() => {});
  return await getOfferById(id);
};

export const softDeleteOffer = async (id, deletedRemarks, updated_by) => {
  const offer = await BusinessOffer.findOne({ where: { id, is_deleted: false } });
  if (!offer) return null;
  await sequelize.transaction(async (transaction) => {
    await offer.update(
      { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
      { transaction }
    );
    await BusinessOfferDiscountGroup.update(
      { is_deleted: true, updated_by, updatedAt: new Date() },
      { where: { offer_id: offer.id, is_deleted: false }, transaction }
    );
    await BusinessOfferTarget.update(
      { is_deleted: true, updated_by, updatedAt: new Date() },
      { where: { offer_id: offer.id, is_deleted: false }, transaction }
    );
  });
  invalidateSearchQueryCache().catch(() => {});
  return offer;
};

/**
 * Batch load currently valid evaluable offer campaigns (AUTO + COUPON) keyed by business_id.
 */
export const getActiveEvaluableCampaignsMap = async (businessIds = []) => {
  const ids = [...new Set(businessIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const map = new Map();
  if (ids.length === 0) return map;

  const rows = await BusinessOffer.findAll({
    where: {
      business_id: { [Op.in]: ids },
      is_active: true,
      is_deleted: false,
    },
    include: OFFER_INCLUDE,
    order: [
      ['priority', 'ASC'],
      ['id', 'DESC'],
    ],
  });

  const groupedRaw = new Map();
  for (const r of rows) {
    const bId = Number(r.business_id);
    const arr = groupedRaw.get(bId) || [];
    arr.push(r);
    groupedRaw.set(bId, arr);
  }

  for (const bId of ids) {
    const campaigns = buildEvaluableCampaigns(groupedRaw.get(bId) || []);
    map.set(bId, campaigns);
  }
  return map;
};
