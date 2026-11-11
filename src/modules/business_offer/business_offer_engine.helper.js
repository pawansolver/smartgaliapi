/**
 * Pure Enterprise Bulk Offer Rule, Target, Conflict Resolution & Snapshot Engine.
 * Zero direct DB calls here — accepts plain objects so both live services,
 * preview endpoints, catalog hydration, checkout calculations, and unit tests
 * share one authoritative deterministic engine.
 */

export const CAMPAIGN_SCOPES = new Set([
  'ENTIRE_STORE',
  'SELECTED_CATEGORIES',
  'SELECTED_PRODUCTS',
  'SELECTED_VARIANTS',
  'MULTI_GROUP',
]);

export const RULE_SCOPES = new Set([
  'ENTIRE_STORE',
  'SELECTED_CATEGORIES',
  'SELECTED_PRODUCTS',
  'SELECTED_VARIANTS',
]);

export const CONFLICT_POLICIES = new Set([
  'HIGHEST_DISCOUNT',
  'PRIORITY',
  'NON_STACKABLE',
]);

export const APPLICATION_MODES = new Set(['AUTO', 'COUPON']);

export const toNumberOrNull = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

export const roundMoney = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

export const parseDiscountNumericFromText = (raw) => {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

export const sanitizeDateOnly = (val) => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  const str = String(val).trim();
  if (!str || str === '0000-00-00' || str.toLowerCase() === 'limited period') {
    return null;
  }
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : isoMatch[1];
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const normStr = (val) =>
  String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const formatVariantLabel = (variant) => {
  if (!variant) return '';
  if (variant.label) return String(variant.label).trim();
  const n = String(variant.name || '').trim();
  const v = String(variant.value || '').trim();
  if (n && v) return `${n}: ${v}`;
  return v || n || '';
};

export const formatDiscountBadge = (discountType, discountValue) => {
  const val = Number(discountValue || 0);
  if (val <= 0) return 'Special Offer';
  const cleanVal = Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, '');
  if (String(discountType || '').toLowerCase() === 'flat') {
    return `₹${cleanVal} OFF`;
  }
  return `${cleanVal}% OFF`;
};

export const isOfferCurrentlyValid = (offerPlain, now = new Date()) => {
  if (!offerPlain || offerPlain.is_deleted || offerPlain.is_active === false) {
    return false;
  }
  const todayStr = now.toISOString().slice(0, 10);
  const validFrom = sanitizeDateOnly(offerPlain.valid_from);
  const validTo = sanitizeDateOnly(offerPlain.valid_to);
  if (validFrom && todayStr < validFrom) return false;
  if (validTo && todayStr > validTo) return false;
  return true;
};

/**
 * Normalize raw target items sent by UI/API into canonical target rows.
 */
export const normalizeTargetsList = (rawTargets = [], { businessId = null } = {}) => {
  if (!Array.isArray(rawTargets)) return [];
  const dedup = new Map();

  for (const t of rawTargets) {
    if (!t || typeof t !== 'object') continue;
    const rawType = String(t.target_type ?? t.targetType ?? '')
      .trim()
      .toUpperCase();
    let targetType = rawType;
    if (!['CATEGORY', 'PRODUCT', 'VARIANT'].includes(targetType)) {
      if (t.variant_id !== undefined || t.variantId !== undefined || t.variant_label !== undefined || t.variantLabel !== undefined) {
        targetType = 'VARIANT';
      } else if (t.product_id !== undefined || t.productId !== undefined) {
        targetType = 'PRODUCT';
      } else if (t.category_id !== undefined || t.categoryId !== undefined || t.category_name !== undefined || t.categoryName !== undefined) {
        targetType = 'CATEGORY';
      }
    }
    if (!['CATEGORY', 'PRODUCT', 'VARIANT'].includes(targetType)) continue;

    const categoryId = toNumberOrNull(t.category_id ?? t.categoryId);
    const categoryNameRaw = t.category_name ?? t.categoryName ?? null;
    const categoryName = categoryNameRaw ? String(categoryNameRaw).trim() : null;
    const productId = toNumberOrNull(t.product_id ?? t.productId);
    const variantIdRaw = t.variant_id ?? t.variantId ?? null;
    const variantId = variantIdRaw !== null && variantIdRaw !== '' ? String(variantIdRaw).trim() : null;
    const variantLabelRaw = t.variant_label ?? t.variantLabel ?? null;
    const variantLabel = variantLabelRaw ? String(variantLabelRaw).trim() : null;
    const isExcluded = Boolean(t.is_excluded ?? t.isExcluded ?? false);

    if (targetType === 'CATEGORY' && categoryId == null && !categoryName) continue;
    if (targetType === 'PRODUCT' && productId == null) continue;
    if (targetType === 'VARIANT' && (productId == null || (!variantId && !variantLabel))) continue;

    const key = [
      targetType,
      categoryId ?? '',
      normStr(categoryName),
      productId ?? '',
      variantId ?? '',
      normStr(variantLabel),
      isExcluded ? '1' : '0',
    ].join('|');

    if (!dedup.has(key)) {
      dedup.set(key, {
        ...(businessId != null ? { business_id: Number(businessId) } : {}),
        target_type: targetType,
        category_id: categoryId,
        category_name: categoryName,
        product_id: productId,
        variant_id: variantId,
        variant_label: variantLabel,
        is_excluded: isExcluded,
      });
    }
  }
  return Array.from(dedup.values());
};

/**
 * Normalize campaign payload including discount_groups and targets.
 * Remains 100% compatible with legacy flat offer payloads.
 */
export const normalizeCampaignInput = (raw = {}, { isUpdate = false } = {}) => {
  const businessId = toNumberOrNull(raw.business_id ?? raw.businessId);
  const rawPromo = raw.promo_code !== undefined ? raw.promo_code : raw.promoCode;
  const promoCode =
    rawPromo === undefined
      ? undefined
      : rawPromo === null
        ? null
        : String(rawPromo).trim().toUpperCase() || null;

  const rawType = raw.discount_type !== undefined ? raw.discount_type : raw.discountType;
  const normalizedType =
    rawType !== undefined
      ? String(rawType).trim().toLowerCase() === 'flat' ||
        String(rawType).trim().toLowerCase() === 'fixed'
        ? 'flat'
        : 'percentage'
      : undefined;

  const rawPercent = raw.discount_percent !== undefined ? raw.discount_percent : raw.discountPercent;
  const rawDiscount = raw.discount;
  let numericValue = toNumberOrNull(rawPercent);
  if (numericValue === null && rawDiscount !== undefined) {
    numericValue = parseDiscountNumericFromText(rawDiscount);
  }

  const rawMax = raw.max_discount_amount !== undefined ? raw.max_discount_amount : raw.maxDiscountAmount;
  const rawMin = raw.min_order_amount !== undefined ? raw.min_order_amount : raw.minOrderAmount;
  const rawValidFrom = raw.valid_from !== undefined ? raw.valid_from : raw.validFrom;
  const rawValidTo =
    raw.valid_to !== undefined
      ? raw.valid_to
      : raw.validTo !== undefined
        ? raw.validTo
        : raw.validUntil;

  const rawScope = String(raw.campaign_scope ?? raw.campaignScope ?? '')
    .trim()
    .toUpperCase();
  const rawGroups = raw.discount_groups ?? raw.discountGroups;
  const rawTopTargets = raw.targets;

  let campaignScope = CAMPAIGN_SCOPES.has(rawScope) ? rawScope : undefined;
  const hasExplicitGroups = Array.isArray(rawGroups) && rawGroups.length > 0;
  if (!campaignScope && !isUpdate) {
    if (hasExplicitGroups && rawGroups.length > 1) {
      campaignScope = 'MULTI_GROUP';
    } else if (hasExplicitGroups && RULE_SCOPES.has(String(rawGroups[0]?.scope_type ?? rawGroups[0]?.scopeType ?? '').toUpperCase())) {
      campaignScope = String(rawGroups[0]?.scope_type ?? rawGroups[0]?.scopeType).toUpperCase();
    } else {
      campaignScope = 'ENTIRE_STORE';
    }
  } else if (hasExplicitGroups && rawGroups.length > 1 && campaignScope !== 'MULTI_GROUP') {
    campaignScope = 'MULTI_GROUP';
  }

  const rawAppMode = String(raw.application_mode ?? raw.applicationMode ?? '')
    .trim()
    .toUpperCase();
  let applicationMode = APPLICATION_MODES.has(rawAppMode) ? rawAppMode : undefined;
  if (!applicationMode && !isUpdate) {
    // Preserve coupon mode when promo_code was passed without explicit mode; otherwise AUTO for modern campaigns
    applicationMode = promoCode ? 'COUPON' : 'AUTO';
  }

  const rawConflict = String(raw.conflict_policy ?? raw.conflictPolicy ?? '')
    .trim()
    .toUpperCase();
  const conflictPolicy = CONFLICT_POLICIES.has(rawConflict)
    ? rawConflict
    : isUpdate
      ? undefined
      : 'HIGHEST_DISCOUNT';

  const rawPriority = raw.priority !== undefined ? toNumberOrNull(raw.priority) : undefined;
  const priority =
    rawPriority !== undefined && rawPriority !== null
      ? Math.max(1, Math.round(rawPriority))
      : isUpdate
        ? undefined
        : 10;

  const stackable =
    raw.stackable !== undefined
      ? Boolean(raw.stackable)
      : isUpdate
        ? undefined
        : false;

  const dynamicIncludeNew =
    raw.dynamic_include_new !== undefined || raw.dynamicIncludeNew !== undefined
      ? Boolean(raw.dynamic_include_new ?? raw.dynamicIncludeNew)
      : isUpdate
        ? undefined
        : true;

  // Normalize Discount Groups
  let groups = null;
  if (hasExplicitGroups) {
    groups = rawGroups.map((g, idx) => {
      const gScopeRaw = String(g.scope_type ?? g.scopeType ?? campaignScope ?? 'ENTIRE_STORE')
        .trim()
        .toUpperCase();
      const scopeType = RULE_SCOPES.has(gScopeRaw) ? gScopeRaw : 'ENTIRE_STORE';
      const gDiscTypeRaw = String(g.discount_type ?? g.discountType ?? normalizedType ?? 'percentage')
        .trim()
        .toLowerCase();
      const gDiscType = gDiscTypeRaw === 'flat' || gDiscTypeRaw === 'fixed' ? 'flat' : 'percentage';
      const gVal =
        toNumberOrNull(g.discount_value ?? g.discountValue ?? g.discount_percent ?? g.discountPercent) ??
        0;
      const gTargets = normalizeTargetsList(g.targets || [], { businessId });
      return {
        group_name:
          String(g.group_name ?? g.groupName ?? `Group ${String.fromCharCode(65 + idx)}`).trim() ||
          `Rule ${idx + 1}`,
        scope_type: scopeType,
        discount_type: gDiscType,
        discount_value: roundMoney(gVal),
        max_discount_amount:
          g.max_discount_amount !== undefined || g.maxDiscountAmount !== undefined
            ? toNumberOrNull(g.max_discount_amount ?? g.maxDiscountAmount)
            : null,
        min_order_amount:
          toNumberOrNull(g.min_order_amount ?? g.minOrderAmount) ?? 0,
        dynamic_include_new:
          g.dynamic_include_new !== undefined || g.dynamicIncludeNew !== undefined
            ? Boolean(g.dynamic_include_new ?? g.dynamicIncludeNew)
            : dynamicIncludeNew ?? true,
        priority: Math.max(1, Math.round(toNumberOrNull(g.priority) ?? priority ?? 10)),
        display_order: idx,
        targets: gTargets,
      };
    });
  } else if (!isUpdate || Array.isArray(rawTopTargets)) {
    // Synthesize single rule when top-level scope/targets passed
    const topTargets = normalizeTargetsList(rawTopTargets || [], { businessId });
    const effScope = RULE_SCOPES.has(campaignScope) ? campaignScope : 'ENTIRE_STORE';
    const effDiscType = normalizedType || 'percentage';
    const effDiscVal = numericValue ?? 0;
    if (!isUpdate || rawScope || Array.isArray(rawTopTargets) || rawPercent !== undefined || rawType !== undefined) {
      groups = [
        {
          group_name: String(raw.title || 'Campaign Discount Rule').trim(),
          scope_type: effScope,
          discount_type: effDiscType,
          discount_value: roundMoney(effDiscVal),
          max_discount_amount: rawMax !== undefined ? toNumberOrNull(rawMax) : null,
          min_order_amount: toNumberOrNull(rawMin) ?? 0,
          dynamic_include_new: dynamicIncludeNew ?? true,
          priority: priority ?? 10,
          display_order: 0,
          targets: topTargets,
        },
      ];
    }
  }

  // Keep header summary columns synced with primary discount group for quick badges & legacy clients
  const primaryGroup = groups && groups.length > 0 ? groups[0] : null;
  const headerPayload = {};
  if (businessId !== null) headerPayload.business_id = businessId;
  if (raw.title !== undefined) headerPayload.title = String(raw.title).trim();
  if (raw.description !== undefined) headerPayload.description = raw.description;
  if (raw.image !== undefined) headerPayload.image = raw.image;
  if (raw.is_active !== undefined || raw.isActive !== undefined) {
    headerPayload.is_active = Boolean(raw.is_active ?? raw.isActive);
  }
  if (promoCode !== undefined) headerPayload.promo_code = promoCode;
  if (campaignScope !== undefined) headerPayload.campaign_scope = campaignScope;
  if (applicationMode !== undefined) headerPayload.application_mode = applicationMode;
  if (conflictPolicy !== undefined) headerPayload.conflict_policy = conflictPolicy;
  if (priority !== undefined) headerPayload.priority = priority;
  if (stackable !== undefined) headerPayload.stackable = stackable;
  if (dynamicIncludeNew !== undefined) headerPayload.dynamic_include_new = dynamicIncludeNew;

  if (raw.banner_badge !== undefined || raw.bannerBadge !== undefined) {
    const b = raw.banner_badge ?? raw.bannerBadge;
    headerPayload.banner_badge = b ? String(b).trim() : null;
  }

  if (normalizedType !== undefined) {
    headerPayload.discount_type = normalizedType;
  } else if (primaryGroup && !isUpdate) {
    headerPayload.discount_type = primaryGroup.discount_type;
  }

  if (numericValue !== null) {
    headerPayload.discount_percent = numericValue;
  } else if (primaryGroup && !isUpdate) {
    headerPayload.discount_percent = primaryGroup.discount_value;
  }

  if (rawDiscount !== undefined) {
    headerPayload.discount = rawDiscount === null ? null : String(rawDiscount).trim();
  } else if (headerPayload.discount_percent !== undefined && headerPayload.discount_percent !== null) {
    headerPayload.discount = String(headerPayload.discount_percent);
  }

  if (rawMax !== undefined) {
    headerPayload.max_discount_amount = toNumberOrNull(rawMax);
  } else if (primaryGroup && !isUpdate) {
    headerPayload.max_discount_amount = primaryGroup.max_discount_amount;
  }

  if (rawMin !== undefined) {
    headerPayload.min_order_amount = toNumberOrNull(rawMin) ?? 0;
  } else if (primaryGroup && !isUpdate) {
    headerPayload.min_order_amount = primaryGroup.min_order_amount ?? 0;
  }

  if (rawValidFrom !== undefined) headerPayload.valid_from = sanitizeDateOnly(rawValidFrom);
  if (rawValidTo !== undefined) headerPayload.valid_to = sanitizeDateOnly(rawValidTo);
  if (raw.created_by !== undefined) headerPayload.created_by = raw.created_by;
  if (raw.updated_by !== undefined) headerPayload.updated_by = raw.updated_by;
  if (raw.remark !== undefined) headerPayload.remark = raw.remark;

  if (groups && !headerPayload.banner_badge) {
    if (groups.length === 1) {
      headerPayload.banner_badge = formatDiscountBadge(
        primaryGroup.discount_type,
        primaryGroup.discount_value
      );
    } else {
      const best = [...groups].sort((a, b) => Number(b.discount_value || 0) - Number(a.discount_value || 0))[0];
      headerPayload.banner_badge = `Up to ${formatDiscountBadge(best.discount_type, best.discount_value)}`;
    }
  }

  return {
    header: headerPayload,
    groups,
    exclusions: normalizeTargetsList(raw.exclusions || [], { businessId }).map((e) => ({
      ...e,
      is_excluded: true,
    })),
  };
};

/**
 * Validate campaign payload + catalog ownership / price safety.
 * Returns { valid: boolean, errors: string[], warnings: string[] }.
 */
export const validateCampaignPayload = (normalized, catalogProducts = null) => {
  const errors = [];
  const warnings = [];
  const { header, groups } = normalized;

  if (!header.business_id) {
    errors.push('business_id is required.');
  }
  if (!header.title || String(header.title).trim().length < 2) {
    errors.push('Campaign title must be at least 2 characters.');
  }
  if (header.valid_from && header.valid_to && header.valid_from > header.valid_to) {
    errors.push('Offer valid_to date cannot be earlier than valid_from date.');
  }
  if (header.application_mode === 'COUPON') {
    const code = String(header.promo_code || '').trim();
    if (!code || code.length < 3) {
      errors.push('Coupon offers require a promo_code of at least 3 characters.');
    }
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    errors.push('At least one discount rule/group is required.');
  } else {
    groups.forEach((g, idx) => {
      const label = g.group_name || `Rule ${idx + 1}`;
      if (!Number.isFinite(g.discount_value) || g.discount_value <= 0) {
        errors.push(`${label}: discount_value must be greater than 0.`);
      }
      if (g.discount_type === 'percentage' && g.discount_value > 95) {
        errors.push(`${label}: percentage discount cannot exceed 95%.`);
      }
      if (g.max_discount_amount !== null && g.max_discount_amount !== undefined && g.max_discount_amount <= 0) {
        errors.push(`${label}: max_discount_amount must be greater than 0.`);
      }
      if ((g.min_order_amount ?? 0) < 0) {
        errors.push(`${label}: min_order_amount cannot be negative.`);
      }

      const includes = (g.targets || []).filter((t) => !t.is_excluded);
      if (g.scope_type === 'SELECTED_CATEGORIES' && !includes.some((t) => t.target_type === 'CATEGORY')) {
        errors.push(`${label}: please select at least 1 category.`);
      }
      if (g.scope_type === 'SELECTED_PRODUCTS' && !includes.some((t) => t.target_type === 'PRODUCT')) {
        errors.push(`${label}: please select at least 1 product.`);
      }
      if (g.scope_type === 'SELECTED_VARIANTS' && !includes.some((t) => t.target_type === 'VARIANT')) {
        errors.push(`${label}: please select at least 1 variant.`);
      }
    });
  }

  // Ownership + price integrity checks if store catalog was loaded
  if (Array.isArray(catalogProducts) && Array.isArray(groups)) {
    const byId = new Map(catalogProducts.map((p) => [Number(p.id), p]));
    for (const g of groups) {
      for (const t of g.targets || []) {
        if (t.is_excluded) continue;
        if ((t.target_type === 'PRODUCT' || t.target_type === 'VARIANT') && t.product_id != null) {
          const prod = byId.get(Number(t.product_id));
          if (!prod) {
            errors.push(`Product #${t.product_id} does not belong to this store or does not exist.`);
          } else {
            const sp = Number(prod.selling_price || 0);
            if (sp <= 0) {
              warnings.push(`Product "${prod.name}" has zero selling price and will be skipped.`);
            } else if (g.discount_type === 'flat' && g.discount_value >= sp) {
              warnings.push(
                `Flat ₹${g.discount_value} on "${prod.name}" (₹${sp}) will be capped at product price.`
              );
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

const isProductEligibleForCatalogOffer = (product, { ignoreApprovalForPreview = false } = {}) => {
  if (!product || product.is_deleted) return false;
  if (String(product.status || 'active').toLowerCase() !== 'active') return false;
  if (!ignoreApprovalForPreview) {
    const appr = String(product.approval_status || 'approved').toLowerCase();
    if (appr !== 'approved') return false;
  }
  const sp = Number(product.selling_price || 0);
  return Number.isFinite(sp) && sp > 0;
};

const targetMatchesCategory = (target, product) => {
  if (target.target_type !== 'CATEGORY') return false;
  if (target.category_id != null) {
    const pCat = toNumberOrNull(product.category_id);
    const pSub = toNumberOrNull(product.subcategory_id);
    if (pCat !== null && pCat === Number(target.category_id)) return true;
    if (pSub !== null && pSub === Number(target.category_id)) return true;
  }
  if (target.category_name && product.category_name) {
    if (normStr(target.category_name) === normStr(product.category_name)) return true;
  }
  return false;
};

const targetMatchesVariant = (target, productId, variant) => {
  if (target.target_type !== 'VARIANT' || Number(target.product_id) !== Number(productId)) {
    return false;
  }
  if (!variant) return false;
  if (target.variant_id != null && variant.id != null) {
    if (String(target.variant_id) === String(variant.id)) return true;
  }
  if (target.variant_label) {
    const label = formatVariantLabel(variant);
    if (normStr(target.variant_label) === normStr(label)) return true;
  }
  return false;
};

const passesDynamicInclusionCheck = (rule, campaign, product) => {
  const dynFlag =
    rule.dynamic_include_new !== undefined
      ? Boolean(rule.dynamic_include_new)
      : campaign?.dynamic_include_new !== undefined
        ? Boolean(campaign.dynamic_include_new)
        : true;
  if (dynFlag) return true;

  // When dynamic inclusion is OFF, ignore products created strictly after the rule was created
  const ruleCreatedAt = rule.created_at || campaign?.created_at;
  const prodCreatedAt = product.created_at || product.createdAt;
  if (!ruleCreatedAt || !prodCreatedAt) return true;
  const rTime = new Date(ruleCreatedAt).getTime();
  const pTime = new Date(prodCreatedAt).getTime();
  if (Number.isNaN(rTime) || Number.isNaN(pTime)) return true;
  return pTime <= rTime;
};

/**
 * Check if a normalized discount rule (with `.targets`) matches a product and optional variant.
 */
export const doesRuleMatchProductOrVariant = (
  rule,
  campaign,
  product,
  variant = null,
  { ignoreApprovalForPreview = false, excludeVariantOnlyScopesForBase = false } = {}
) => {
  if (!isProductEligibleForCatalogOffer(product, { ignoreApprovalForPreview })) {
    return false;
  }

  const allTargets = [
    ...(Array.isArray(rule.targets) ? rule.targets : []),
    ...(Array.isArray(campaign?.targets)
      ? campaign.targets.filter((t) => !t.group_id || Number(t.group_id) === Number(rule.id))
      : []),
  ];

  // Exclusions override everything
  for (const t of allTargets) {
    if (!t.is_excluded) continue;
    if (t.target_type === 'VARIANT' && variant && targetMatchesVariant(t, product.id, variant)) {
      return false;
    }
    if (t.target_type === 'PRODUCT' && Number(t.product_id) === Number(product.id)) {
      return false;
    }
    if (t.target_type === 'CATEGORY' && targetMatchesCategory(t, product)) {
      return false;
    }
  }

  const scope = String(rule.scope_type || 'ENTIRE_STORE').toUpperCase();
  if (scope === 'ENTIRE_STORE') {
    return true;
  }

  const includes = allTargets.filter((t) => !t.is_excluded);
  if (scope === 'SELECTED_CATEGORIES') {
    const matchedCat = includes.some((t) => targetMatchesCategory(t, product));
    if (!matchedCat) return false;
    return passesDynamicInclusionCheck(rule, campaign, product);
  }

  if (scope === 'SELECTED_PRODUCTS') {
    return includes.some(
      (t) => t.target_type === 'PRODUCT' && Number(t.product_id) === Number(product.id)
    );
  }

  if (scope === 'SELECTED_VARIANTS') {
    if (variant) {
      return includes.some((t) => targetMatchesVariant(t, product.id, variant));
    }
    if (excludeVariantOnlyScopesForBase) {
      return false;
    }
    // Product-level summary check: true if any variant of product matches
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 0) {
      return variants.some((v) => includes.some((t) => targetMatchesVariant(t, product.id, v)));
    }
    return includes.some(
      (t) => t.target_type === 'VARIANT' && Number(t.product_id) === Number(product.id)
    );
  }

  return false;
};

/**
 * Compute discount for a unit price under a rule.
 * Note: flat rules at checkout distribute across the eligible basket, whereas on a
 * single item preview we compute the single-unit promotional savings capped at price.
 */
export const computeUnitRuleSavings = (rule, unitPrice) => {
  const price = Number(unitPrice || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  const val = Number(rule.discount_value || 0);
  if (!Number.isFinite(val) || val <= 0) return 0;

  let discount = 0;
  if (String(rule.discount_type || '').toLowerCase() === 'flat') {
    discount = val;
  } else {
    discount = (price * val) / 100;
  }

  const maxCap = toNumberOrNull(rule.max_discount_amount);
  if (maxCap !== null && maxCap > 0) {
    discount = Math.min(discount, maxCap);
  }
  return roundMoney(Math.min(price, Math.max(0, discount)));
};

/**
 * Deterministic winner selection among matching offer candidates for one item/variant.
 * Supports:
 * - HIGHEST_DISCOUNT: highest rupee discount wins (tie-break lower numeric priority)
 * - PRIORITY: lowest priority integer wins (e.g. priority 1 beats priority 10)
 * - NON_STACKABLE: mutually exclusive best single offer (never combines)
 */
export const resolveWinningCandidate = (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aPolicy = String(a.conflict_policy || 'HIGHEST_DISCOUNT').toUpperCase();
    const bPolicy = String(b.conflict_policy || 'HIGHEST_DISCOUNT').toUpperCase();
    const usePriorityOrder = aPolicy === 'PRIORITY' || bPolicy === 'PRIORITY';

    if (usePriorityOrder) {
      const pDiff = Number(a.priority || 10) - Number(b.priority || 10);
      if (pDiff !== 0) return pDiff;
    }

    const dDiff = Number(b.discount_amount || 0) - Number(a.discount_amount || 0);
    if (Math.abs(dDiff) > 0.001) return dDiff;

    const pDiff = Number(a.priority || 10) - Number(b.priority || 10);
    if (pDiff !== 0) return pDiff;

    return Number(b.offer_id || 0) - Number(a.offer_id || 0);
  });

  const winner = sorted[0];
  return {
    ...winner,
    conflict_candidates_count: sorted.length,
    competing_offers:
      sorted.length > 1
        ? sorted.slice(1).map((c) => ({
            offer_id: c.offer_id,
            group_id: c.group_id,
            title: c.offer_title,
            discount_amount: c.discount_amount,
            policy: c.conflict_policy,
          }))
        : [],
  };
};

/**
 * Normalize campaign row (with groups & targets) for internal evaluation & API formatting.
 */
export const buildEvaluableCampaigns = (campaignRows = [], now = new Date()) => {
  const out = [];
  for (const row of campaignRows) {
    const plain = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    if (!isOfferCurrentlyValid(plain, now)) continue;

    const groupsRaw =
      Array.isArray(plain.discount_groups) && plain.discount_groups.length > 0
        ? plain.discount_groups
        : [
            {
              id: null,
              group_name: plain.title,
              scope_type: RULE_SCOPES.has(String(plain.campaign_scope || '').toUpperCase())
                ? String(plain.campaign_scope).toUpperCase()
                : 'ENTIRE_STORE',
              discount_type:
                String(plain.discount_type || '').toLowerCase() === 'flat' ? 'flat' : 'percentage',
              discount_value:
                toNumberOrNull(plain.discount_percent) ??
                parseDiscountNumericFromText(plain.discount) ??
                0,
              max_discount_amount: toNumberOrNull(plain.max_discount_amount),
              min_order_amount: toNumberOrNull(plain.min_order_amount) ?? 0,
              dynamic_include_new: plain.dynamic_include_new !== false,
              priority: Number(plain.priority || 10),
              targets: plain.targets || [],
            },
          ];

    out.push({
      ...plain,
      campaign_scope: CAMPAIGN_SCOPES.has(String(plain.campaign_scope || '').toUpperCase())
        ? String(plain.campaign_scope).toUpperCase()
        : 'ENTIRE_STORE',
      application_mode:
        String(plain.application_mode || '').toUpperCase() === 'AUTO'
          ? 'AUTO'
          : plain.promo_code
            ? 'COUPON'
            : String(plain.application_mode || 'COUPON').toUpperCase(),
      conflict_policy: CONFLICT_POLICIES.has(String(plain.conflict_policy || '').toUpperCase())
        ? String(plain.conflict_policy).toUpperCase()
        : 'HIGHEST_DISCOUNT',
      priority: Number(plain.priority || 10),
      stackable: Boolean(plain.stackable),
      discount_groups: groupsRaw.filter((g) => !g.is_deleted),
    });
  }
  return out;
};

/**
 * Evaluate all matching AUTO campaigns/rules for a single catalog product (and its variants).
 * Used to enrich resident search, shop detail, and product detail views cleanly.
 */
export const evaluateProductAutoOffer = (
  product,
  evaluableCampaigns = [],
  { ignoreApprovalForPreview = false } = {}
) => {
  const autoCampaigns = evaluableCampaigns.filter(
    (c) => String(c.application_mode || '').toUpperCase() === 'AUTO'
  );
  const basePrice = Number(product.selling_price || 0);
  if (!isProductEligibleForCatalogOffer(product, { ignoreApprovalForPreview }) || autoCampaigns.length === 0) {
    return null;
  }

  const collectCandidatesForVariant = (variant, priceToUse) => {
    const cands = [];
    for (const camp of autoCampaigns) {
      for (const group of camp.discount_groups || []) {
        if (
          !doesRuleMatchProductOrVariant(group, camp, product, variant, {
            ignoreApprovalForPreview,
            excludeVariantOnlyScopesForBase: variant === null,
          })
        ) {
          continue;
        }
        const savings = computeUnitRuleSavings(group, priceToUse);
        if (savings <= 0) continue;
        cands.push({
          offer_id: Number(camp.id),
          group_id: group.id ? Number(group.id) : null,
          offer_title: camp.title,
          group_name: group.group_name,
          scope_type: group.scope_type,
          discount_type: group.discount_type,
          discount_value: Number(group.discount_value || 0),
          max_discount_amount: toNumberOrNull(group.max_discount_amount),
          min_order_amount: Number(group.min_order_amount ?? camp.min_order_amount ?? 0),
          discount_amount: savings,
          effective_price: roundMoney(Math.max(0, priceToUse - savings)),
          original_price: roundMoney(priceToUse),
          badge: formatDiscountBadge(group.discount_type, group.discount_value),
          conflict_policy: camp.conflict_policy,
          priority: Math.min(Number(camp.priority || 10), Number(group.priority || 10)),
          stackable: Boolean(camp.stackable),
        });
      }
    }
    return resolveWinningCandidate(cands);
  };

  // Evaluate variants if product has variants
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantOffers = {};
  let bestVariantWinner = null;

  for (const v of variants) {
    const vPrice = Number(v.selling_price || v.sellingPrice || basePrice || 0);
    if (vPrice <= 0) continue;
    const vWin = collectCandidatesForVariant(v, vPrice);
    if (vWin && v.id != null) {
      variantOffers[String(v.id)] = vWin;
      if (
        !bestVariantWinner ||
        Number(vWin.discount_amount) > Number(bestVariantWinner.discount_amount)
      ) {
        bestVariantWinner = vWin;
      }
    }
  }

  // Evaluate base product (only matches non-variant-exclusive or product-wide rules cleanly)
  const directWinner = collectCandidatesForVariant(null, basePrice);

  // If SELECTED_VARIANTS matched specific variants without a product-wide rule, surface variant offer cleanly
  const headlineWinner = directWinner || bestVariantWinner;
  if (!headlineWinner) return null;

  return {
    ...headlineWinner,
    variant_specific_only: !directWinner && Boolean(bestVariantWinner),
    variant_offers: variantOffers,
  };
};

/**
 * Preview pricing & conflict summary for an owner draft/saved campaign across store products.
 */
export const buildCampaignPreview = (
  campaignInput,
  storeProducts = [],
  existingActiveCampaigns = []
) => {
  const normalized = campaignInput.header ? campaignInput : normalizeCampaignInput(campaignInput);
  const validation = validateCampaignPayload(normalized, storeProducts);

  const syntheticCampaign = {
    id: -1,
    ...normalized.header,
    is_active: true,
    is_deleted: false,
    discount_groups: normalized.groups || [],
    targets: normalized.exclusions || [],
  };

  const mergedCampaigns = [
    syntheticCampaign,
    ...buildEvaluableCampaigns(
      existingActiveCampaigns.filter((c) => Number(c.id) !== Number(normalized.header?.id || -1))
    ),
  ];

  const rows = [];
  const conflicts = [];
  let affectedCount = 0;

  for (const prod of storeProducts) {
    if (!isProductEligibleForCatalogOffer(prod, { ignoreApprovalForPreview: true })) {
      continue;
    }

    // Check which groups of THIS campaign match
    const draftCandidates = [];
    for (const group of syntheticCampaign.discount_groups) {
      if (
        doesRuleMatchProductOrVariant(group, syntheticCampaign, prod, null, {
          ignoreApprovalForPreview: true,
        })
      ) {
        const price = Number(prod.selling_price || 0);
        const savings = computeUnitRuleSavings(group, price);
        draftCandidates.push({
          offer_id: -1,
          group_id: group.id || null,
          offer_title: syntheticCampaign.title || 'This Campaign',
          group_name: group.group_name,
          scope_type: group.scope_type,
          discount_type: group.discount_type,
          discount_value: Number(group.discount_value || 0),
          max_discount_amount: group.max_discount_amount,
          min_order_amount: group.min_order_amount,
          discount_amount: savings,
          effective_price: roundMoney(Math.max(0, price - savings)),
          original_price: roundMoney(price),
          badge: formatDiscountBadge(group.discount_type, group.discount_value),
          conflict_policy: syntheticCampaign.conflict_policy || 'HIGHEST_DISCOUNT',
          priority: Math.min(
            Number(syntheticCampaign.priority || 10),
            Number(group.priority || 10)
          ),
          stackable: Boolean(syntheticCampaign.stackable),
        });
      }
    }

    if (draftCandidates.length === 0) continue;
    affectedCount += 1;

    const draftWinner = resolveWinningCandidate(draftCandidates);

    // Check conflicts with existing active AUTO campaigns on this store
    let overallWinner = draftWinner;
    const otherActiveMatches = [];
    for (const other of mergedCampaigns) {
      if (Number(other.id) === -1) continue;
      if (String(other.application_mode || '').toUpperCase() !== 'AUTO') continue;
      for (const og of other.discount_groups || []) {
        if (doesRuleMatchProductOrVariant(og, other, prod, null, { ignoreApprovalForPreview: true })) {
          const price = Number(prod.selling_price || 0);
          const s = computeUnitRuleSavings(og, price);
          otherActiveMatches.push({
            offer_id: Number(other.id),
            group_id: og.id || null,
            offer_title: other.title,
            group_name: og.group_name,
            discount_amount: s,
            badge: formatDiscountBadge(og.discount_type, og.discount_value),
            conflict_policy: other.conflict_policy,
            priority: Math.min(Number(other.priority || 10), Number(og.priority || 10)),
          });
        }
      }
    }

    if (otherActiveMatches.length > 0) {
      overallWinner = resolveWinningCandidate([draftWinner, ...otherActiveMatches]);
      conflicts.push({
        product_id: Number(prod.id),
        product_name: prod.name,
        this_campaign_badge: draftWinner.badge,
        competing_offer_title: otherActiveMatches[0].offer_title,
        competing_offer_badge: otherActiveMatches[0].badge,
        resolution_winner:
          Number(overallWinner.offer_id) === -1
            ? syntheticCampaign.title || 'This Campaign'
            : overallWinner.offer_title,
        policy: overallWinner.conflict_policy,
      });
    }

    if (rows.length < 25) {
      rows.push({
        product_id: Number(prod.id),
        product_name: prod.name,
        category_name: prod.category_name || '',
        group_name: draftWinner.group_name,
        original_price: draftWinner.original_price,
        offer_badge: draftWinner.badge,
        discount_amount: draftWinner.discount_amount,
        final_price: draftWinner.effective_price,
        min_order_amount: Number(draftWinner.min_order_amount || 0),
        has_conflict: otherActiveMatches.length > 0,
        winning_offer_title:
          otherActiveMatches.length > 0
            ? Number(overallWinner.offer_id) === -1
              ? syntheticCampaign.title || 'This Campaign'
              : overallWinner.offer_title
            : null,
      });
    }
  }

  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    affected_products_count: affectedCount,
    total_eligible_store_products: storeProducts.filter((p) =>
      isProductEligibleForCatalogOffer(p, { ignoreApprovalForPreview: true })
    ).length,
    conflict_count: conflicts.length,
    conflicts: conflicts.slice(0, 10),
    sample_rows: rows,
  };
};

/**
 * Authoritative Checkout Offer Resolution Engine.
 * Evaluates evaluated line items (after bulk tier pricing) against:
 *  - Active store AUTO offer campaigns (all 4 scopes + discount groups + conflict resolution)
 *  - Optional customer-entered COUPON (`promo_code`)
 * Ensures non-stackable offers do NOT double-discount unless `stackable === true`,
 * computes exact line-level & order-level savings, and returns permanent snapshots.
 */
export const resolveCheckoutOffers = ({
  evaluatedItems = [],
  evaluableCampaigns = [],
  promoCode = null,
  subtotal = 0,
} = {}) => {
  const autoCampaigns = evaluableCampaigns.filter(
    (c) => String(c.application_mode || '').toUpperCase() === 'AUTO'
  );
  const codeNorm = promoCode ? String(promoCode).trim().toUpperCase() : '';

  // 1. Evaluate all AUTO rules against each cart line item
  // Track per-rule total matched subtotal to check min_order_amount & proportional flat/cap distribution
  const groupEligibleSubtotal = new Map();
  const groupRuleInfo = new Map();

  for (const camp of autoCampaigns) {
    for (const grp of camp.discount_groups || []) {
      const ruleKey = `${camp.id}:${grp.id || 0}`;
      groupRuleInfo.set(ruleKey, { camp, grp });
      let matchedSum = 0;
      for (const item of evaluatedItems) {
        const prod = item._product_raw || item;
        const variant = item._variant_raw || (item.variant_id ? { id: item.variant_id, label: item.variant_name } : null);
        if (doesRuleMatchProductOrVariant(grp, camp, prod, variant)) {
          matchedSum += Number(item.line_total || item.unit_price * item.quantity || 0);
        }
      }
      groupEligibleSubtotal.set(ruleKey, roundMoney(matchedSum));
    }
  }

  // Pick winning AUTO rule per line item
  const itemWinners = evaluatedItems.map((item, idx) => {
    const prod = item._product_raw || item;
    const variant = item._variant_raw || (item.variant_id ? { id: item.variant_id, label: item.variant_name } : null);
    const lineSub = roundMoney(Number(item.line_total || item.unit_price * item.quantity || 0));
    const cands = [];

    for (const [ruleKey, { camp, grp }] of groupRuleInfo.entries()) {
      if (!doesRuleMatchProductOrVariant(grp, camp, prod, variant)) continue;
      const qualSub = Number(groupEligibleSubtotal.get(ruleKey) || 0);
      const minReq = Number(grp.min_order_amount ?? camp.min_order_amount ?? 0);
      const effectiveThresholdBase =
        String(grp.scope_type || '').toUpperCase() === 'ENTIRE_STORE' ? Number(subtotal) : qualSub;
      if (minReq > 0 && effectiveThresholdBase + 0.001 < minReq) continue;

      let approxLineDiscount = 0;
      if (String(grp.discount_type).toLowerCase() === 'flat') {
        const share = qualSub > 0 ? lineSub / qualSub : 1;
        approxLineDiscount = Math.min(lineSub, Number(grp.discount_value || 0) * share);
      } else {
        approxLineDiscount = (lineSub * Number(grp.discount_value || 0)) / 100;
      }

      const maxCap = toNumberOrNull(grp.max_discount_amount ?? camp.max_discount_amount);
      if (maxCap !== null && maxCap > 0) {
        const share = qualSub > 0 ? lineSub / qualSub : 1;
        approxLineDiscount = Math.min(approxLineDiscount, maxCap * share);
      }

      if (approxLineDiscount <= 0) continue;
      cands.push({
        ruleKey,
        offer_id: Number(camp.id),
        group_id: grp.id ? Number(grp.id) : null,
        offer_title: camp.title,
        group_name: grp.group_name,
        scope_type: grp.scope_type,
        discount_type: grp.discount_type,
        discount_value: Number(grp.discount_value || 0),
        max_discount_amount: maxCap,
        min_order_amount: minReq,
        discount_amount: roundMoney(Math.min(lineSub, approxLineDiscount)),
        badge: formatDiscountBadge(grp.discount_type, grp.discount_value),
        conflict_policy: camp.conflict_policy,
        priority: Math.min(Number(camp.priority || 10), Number(grp.priority || 10)),
        stackable: Boolean(camp.stackable),
        lineSub,
        itemIndex: idx,
      });
    }

    return resolveWinningCandidate(cands);
  });

  // Enforce group-level exact flat / max_discount_amount caps across winning lines
  const wonLinesByRule = new Map();
  itemWinners.forEach((win, idx) => {
    if (!win) return;
    const arr = wonLinesByRule.get(win.ruleKey) || [];
    arr.push({ idx, win });
    wonLinesByRule.set(win.ruleKey, arr);
  });

  const finalAutoLineDiscounts = new Array(evaluatedItems.length).fill(0);
  for (const [, entries] of wonLinesByRule.entries()) {
    const first = entries[0].win;
    const totalRaw = entries.reduce((acc, e) => acc + Number(e.win.discount_amount || 0), 0);
    const groupWonSubtotal = entries.reduce((acc, e) => acc + Number(e.win.lineSub || 0), 0);

    let allowedGroupTotal = totalRaw;
    if (first.discount_type === 'flat') {
      allowedGroupTotal = Math.min(groupWonSubtotal, Number(first.discount_value || 0));
    }
    if (first.max_discount_amount != null && first.max_discount_amount > 0) {
      allowedGroupTotal = Math.min(allowedGroupTotal, Number(first.max_discount_amount));
    }

    let remaining = roundMoney(allowedGroupTotal);
    entries.forEach((entry, i) => {
      let amount = 0;
      if (i === entries.length - 1) {
        amount = Math.min(entry.win.lineSub, Math.max(0, remaining));
      } else if (groupWonSubtotal > 0) {
        amount =
          first.discount_type === 'flat'
            ? roundMoney((allowedGroupTotal * entry.win.lineSub) / groupWonSubtotal)
            : totalRaw > 0
              ? roundMoney((allowedGroupTotal * entry.win.discount_amount) / totalRaw)
              : 0;
        amount = Math.min(entry.win.lineSub, amount);
        remaining = roundMoney(remaining - amount);
      }
      finalAutoLineDiscounts[entry.idx] = roundMoney(amount);
    });
  }

  let autoOfferDiscount = roundMoney(
    finalAutoLineDiscounts.reduce((acc, d) => acc + Number(d || 0), 0)
  );

  // 2. Evaluate optional Promo Code (`COUPON` or promo_code campaign)
  let promoResult = {
    valid: !codeNorm,
    offer_id: null,
    promo_code: null,
    discount: 0,
    title: null,
    reason: codeNorm ? 'INVALID_CODE' : null,
    stackable_with_auto: false,
    matched_item_indices: [],
  };

  if (codeNorm) {
    const matchingPromo = evaluableCampaigns.find(
      (o) => String(o.promo_code || '').trim().toUpperCase() === codeNorm
    );
    if (!matchingPromo) {
      promoResult.reason = 'INVALID_CODE';
    } else {
      // Evaluate promo rules against scoped items (or entire store)
      const promoLineIndices = [];
      let promoEligibleSubtotal = 0;
      let promoCalculated = 0;
      const couponGroups = matchingPromo.discount_groups || [];

      evaluatedItems.forEach((item, idx) => {
        const prod = item._product_raw || item;
        const variant =
          item._variant_raw ||
          (item.variant_id ? { id: item.variant_id, label: item.variant_name } : null);
        const lineSub = roundMoney(Number(item.line_total || item.unit_price * item.quantity || 0));
        const matchingGroups = couponGroups.filter((g) =>
          doesRuleMatchProductOrVariant(g, matchingPromo, prod, variant)
        );
        if (matchingGroups.length > 0) {
          promoLineIndices.push({ idx, lineSub, group: matchingGroups[0] });
          promoEligibleSubtotal += lineSub;
        }
      });

      if (promoLineIndices.length === 0) {
        promoResult.reason = 'NO_ELIGIBLE_ITEMS';
      } else {
        const minOrder = Number(matchingPromo.min_order_amount || 0);
        const checkSubtotal =
          String(matchingPromo.campaign_scope || '').toUpperCase() === 'ENTIRE_STORE'
            ? Number(subtotal)
            : roundMoney(promoEligibleSubtotal);

        if (minOrder > 0 && checkSubtotal + 0.001 < minOrder) {
          promoResult.reason = 'MIN_ORDER_NOT_MET';
          promoResult.min_order_amount = minOrder;
        } else {
          // Flat coupon applies once across matching basket; % applies per matching group
          const firstGroup = promoLineIndices[0].group;
          if (String(firstGroup.discount_type).toLowerCase() === 'flat') {
            promoCalculated = Math.min(promoEligibleSubtotal, Number(firstGroup.discount_value || 0));
          } else {
            for (const entry of promoLineIndices) {
              promoCalculated += (entry.lineSub * Number(entry.group.discount_value || 0)) / 100;
            }
          }
          const cap = toNumberOrNull(matchingPromo.max_discount_amount);
          if (cap !== null && cap > 0) {
            promoCalculated = Math.min(promoCalculated, cap);
          }
          promoCalculated = roundMoney(Math.min(promoEligibleSubtotal, promoCalculated));

          promoResult = {
            valid: true,
            offer_id: Number(matchingPromo.id),
            promo_code: codeNorm,
            discount: promoCalculated,
            title: matchingPromo.title,
            reason: null,
            priority: Number(matchingPromo.priority || 10),
            conflict_policy: matchingPromo.conflict_policy || 'HIGHEST_DISCOUNT',
            stackable_with_auto: Boolean(matchingPromo.stackable),
            matched_item_indices: promoLineIndices.map((e) => e.idx),
          };
        }
      }
    }
  }

  // 3. Enforce Non-Stackable Conflict Policy between Auto Offers and Promo Code
  let promoDiscount = Number(promoResult.discount || 0);
  let conflictNote = null;

  if (promoResult.valid && promoDiscount > 0 && autoOfferDiscount > 0) {
    const anyAutoStackable = itemWinners.every((w) => !w || w.stackable);
    const canStack = Boolean(promoResult.stackable_with_auto && anyAutoStackable);

    if (!canStack) {
      const usePriority =
        promoResult.conflict_policy === 'PRIORITY' ||
        itemWinners.some((w) => w && w.conflict_policy === 'PRIORITY');

      let promoWins = false;
      if (usePriority) {
        const minAutoPrio = Math.min(
          ...itemWinners.filter(Boolean).map((w) => Number(w.priority || 10))
        );
        if (promoResult.priority < minAutoPrio) promoWins = true;
        else if (promoResult.priority === minAutoPrio) promoWins = promoDiscount >= autoOfferDiscount;
      } else {
        promoWins = promoDiscount >= autoOfferDiscount;
      }

      if (promoWins) {
        conflictNote = `Coupon ${promoResult.promo_code} (₹${promoDiscount}) applied instead of auto offer (₹${autoOfferDiscount}) due to non-stackable policy.`;
        autoOfferDiscount = 0;
        for (let i = 0; i < itemWinners.length; i++) {
          itemWinners[i] = null;
          finalAutoLineDiscounts[i] = 0;
        }
      } else {
        conflictNote = `Auto campaign offer (₹${autoOfferDiscount}) retained over coupon ${promoResult.promo_code} (₹${promoDiscount}) due to non-stackable policy.`;
        promoDiscount = 0;
        promoResult = {
          ...promoResult,
          discount: 0,
          overridden_by_auto_offer: true,
          reason: 'OVERRIDDEN_BY_BETTER_OFFER',
        };
      }
    }
  }

  // Build item annotations & immutable snapshots
  const itemOfferAnnotations = evaluatedItems.map((item, idx) => {
    const win = itemWinners[idx];
    const autoDisc = roundMoney(finalAutoLineDiscounts[idx] || 0);
    const qty = Math.max(1, Number(item.quantity || 1));
    const origUnit = roundMoney(Number(item.unit_price || 0));
    const netLineTotal = roundMoney(Math.max(0, Number(item.line_total || origUnit * qty) - autoDisc));
    const effectiveUnit = roundMoney(netLineTotal / qty);

    return {
      original_unit_price: origUnit,
      effective_unit_price: effectiveUnit,
      offer_discount_amount: autoDisc,
      net_line_total: netLineTotal,
      applied_offer_id: win ? win.offer_id : null,
      applied_group_id: win ? win.group_id : null,
      applied_offer_title: win ? win.offer_title : null,
      applied_offer_badge: win ? win.badge : null,
      applied_offer_snapshot: win
        ? {
            offer_id: win.offer_id,
            group_id: win.group_id,
            offer_title: win.offer_title,
            group_name: win.group_name,
            scope_type: win.scope_type,
            discount_type: win.discount_type,
            discount_value: win.discount_value,
            badge: win.badge,
            conflict_policy: win.conflict_policy,
            competing_offers: win.competing_offers,
            offer_discount_amount: autoDisc,
          }
        : null,
    };
  });

  const appliedAutoCampaignsMap = new Map();
  itemOfferAnnotations.forEach((ann) => {
    if (!ann.applied_offer_id) return;
    const prev = appliedAutoCampaignsMap.get(ann.applied_offer_id) || {
      offer_id: ann.applied_offer_id,
      title: ann.applied_offer_title,
      badge: ann.applied_offer_badge,
      discount_amount: 0,
    };
    prev.discount_amount = roundMoney(prev.discount_amount + ann.offer_discount_amount);
    appliedAutoCampaignsMap.set(ann.applied_offer_id, prev);
  });

  const totalOfferSavings = roundMoney(autoOfferDiscount + promoDiscount);

  return {
    auto_offer_discount: autoOfferDiscount,
    promo: {
      ...promoResult,
      discount: roundMoney(promoDiscount),
    },
    total_discount: totalOfferSavings,
    conflict_note: conflictNote,
    applied_auto_offers: Array.from(appliedAutoCampaignsMap.values()),
    item_annotations: itemOfferAnnotations,
    order_snapshot:
      totalOfferSavings > 0 || conflictNote
        ? {
            evaluated_at: new Date().toISOString(),
            auto_offer_discount: autoOfferDiscount,
            promo_discount: roundMoney(promoDiscount),
            promo_code: promoResult.valid ? promoResult.promo_code : null,
            promo_offer_id: promoResult.valid ? promoResult.offer_id : null,
            promo_title: promoResult.valid ? promoResult.title : null,
            applied_auto_offers: Array.from(appliedAutoCampaignsMap.values()),
            conflict_note: conflictNote,
          }
        : null,
  };
};
