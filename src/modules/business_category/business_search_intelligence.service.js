import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessCategory from './business_category.model.js';
import BusinessSearchSynonym from './business_search_synonym.model.js';
import BusinessSearchLog from './business_search_log.model.js';
import {
  DEFAULT_SYNONYMS_BY_CANONICAL,
  DEFAULT_ALIAS_TO_CANONICAL,
  normalizeText,
  inferCanonicalKeyFromName,
} from './category_matcher.helper.js';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../../config/redis.js';

const SYNONYM_CACHE_KEY = 'search:synonyms:v1';
const SYNONYM_LOCAL_TTL_MS = 60 * 1000;
const SEARCH_CACHE_TTL_SEC = 45;
const DEDUP_WINDOW_MS = 4000;

const HINGLISH_TERMS = new Set([
  'kapde',
  'kapda',
  'kapdaa',
  'kapdo',
  'vastra',
  'poshak',
  'pehnava',
  'kapdewale',
  'joota',
  'joote',
  'juta',
  'jute',
  'chappal',
  'pairo',
  'bijli saman',
  'bijli ka saman',
  'electric saman',
  'electronic saman',
  'kirana',
  'kiryana',
  'rashan',
  'parchun',
  'ghar ka saman',
  'daily ration',
  'lakdi saman',
  'sajawat',
  'shringar',
  'singar',
  'sundarta',
  'auzar',
  'aujar',
  'lohari',
  'tools saman',
  'dawai',
  'dawa',
  'dawaiyan',
  'dava',
  'davai',
  'rozmarra',
]);

let localSynonymCache = null;
let localSynonymCacheExpiresAt = 0;
let seedPromise = null;
let searchCacheVersion = 1;
const recentLogDedupMap = new Map();

const ensureSeededOnce = async () => {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        let existingCount;
        try {
          existingCount = await BusinessSearchSynonym.count();
        } catch {
          await BusinessSearchSynonym.sync();
          await BusinessSearchLog.sync();
          existingCount = await BusinessSearchSynonym.count();
        }
        if (existingCount === 0) {
          const categories = await BusinessCategory.findAll({
            where: { is_deleted: false },
            attributes: ['id', 'name'],
            raw: true,
          });

          const catIdByCanonical = new Map();
          for (const cat of categories) {
            const ck = inferCanonicalKeyFromName(cat.name, categories);
            if (ck && !catIdByCanonical.has(ck)) catIdByCanonical.set(ck, Number(cat.id));
          }

          const seedRows = [];
          const seen = new Set();
          const now = new Date();

          for (const [canonical, terms] of Object.entries(DEFAULT_SYNONYMS_BY_CANONICAL)) {
            for (const rawTerm of terms) {
              const term = normalizeText(rawTerm);
              if (!term) continue;
              const uniqKey = `${canonical}::${term}`;
              if (seen.has(uniqKey)) continue;
              seen.add(uniqKey);
              seedRows.push({
                canonical_key: canonical,
                category_id: catIdByCanonical.get(canonical) || null,
                term,
                language: HINGLISH_TERMS.has(term) ? 'hi_latn' : 'en',
                weight: 1.0,
                is_umbrella: true,
                is_active: true,
                is_deleted: false,
                created_at: now,
                updatedAt: now,
              });
            }
          }

          for (const [rawAlias, canonical] of Object.entries(DEFAULT_ALIAS_TO_CANONICAL)) {
            const term = normalizeText(rawAlias);
            if (!term) continue;
            const uniqKey = `${canonical}::${term}`;
            if (seen.has(uniqKey)) continue;
            seen.add(uniqKey);
            seedRows.push({
              canonical_key: canonical,
              category_id: catIdByCanonical.get(canonical) || null,
              term,
              language: HINGLISH_TERMS.has(term) ? 'hi_latn' : 'en',
              weight: 1.0,
              is_umbrella: false,
              is_active: true,
              is_deleted: false,
              created_at: now,
              updatedAt: now,
            });
          }

          if (seedRows.length > 0) {
            await BusinessSearchSynonym.bulkCreate(seedRows, { ignoreDuplicates: true });
          }
        }
      } catch (err) {
        console.warn('[SearchIntelligence] Seed/sync warning:', err?.message || err);
        seedPromise = null;
      }
    })();
  }
  return seedPromise;
};

export const invalidateSearchQueryCache = async () => {
  searchCacheVersion += 1;
  await cacheDelPattern('search:nearby:*');
};

export const invalidateSynonymCache = async () => {
  localSynonymCache = null;
  localSynonymCacheExpiresAt = 0;
  await cacheDel(SYNONYM_CACHE_KEY);
  await invalidateSearchQueryCache();
};

export const getDynamicSynonymConfig = async () => {
  const now = Date.now();
  if (localSynonymCache && now < localSynonymCacheExpiresAt) {
    return localSynonymCache;
  }

  const redisCached = await cacheGet(SYNONYM_CACHE_KEY);
  if (redisCached && redisCached.umbrellaByCanonical) {
    localSynonymCache = redisCached;
    localSynonymCacheExpiresAt = now + SYNONYM_LOCAL_TTL_MS;
    return redisCached;
  }

  await ensureSeededOnce();

  let rows = [];
  try {
    rows = await BusinessSearchSynonym.findAll({
      where: { is_deleted: false },
      order: [['canonical_key', 'ASC'], ['term', 'ASC']],
      raw: true,
    });
  } catch (err) {
    console.warn('[SearchIntelligence] Failed loading DB synonyms, using static fallback:', err?.message || err);
    rows = [];
  }

  const umbrellaByCanonical = {};
  const aliasToCanonical = {};
  const disabledTerms = [];

  for (const row of rows) {
    const ck = normalizeText(row.canonical_key);
    const term = normalizeText(row.term);
    if (!ck || !term) continue;
    if (row.is_active === false || row.is_active === 0) {
      disabledTerms.push(term);
      continue;
    }
    aliasToCanonical[term] = ck;
    const isUmbrella = row.is_umbrella === true || row.is_umbrella === 1;
    if (isUmbrella) {
      if (!umbrellaByCanonical[ck]) umbrellaByCanonical[ck] = [];
      umbrellaByCanonical[ck].push(term);
    }
  }

  const config = {
    umbrellaByCanonical,
    aliasToCanonical,
    disabledTerms,
    totalCount: rows.length,
  };

  localSynonymCache = config;
  localSynonymCacheExpiresAt = now + SYNONYM_LOCAL_TTL_MS;
  await cacheSet(SYNONYM_CACHE_KEY, config, 120);
  return config;
};

export const listSearchSynonyms = async ({
  includeInactive = false,
  canonicalKey = null,
  search = null,
} = {}) => {
  await ensureSeededOnce();
  const where = { is_deleted: false };
  if (!includeInactive) where.is_active = true;
  if (canonicalKey && canonicalKey.trim() && canonicalKey.toLowerCase() !== 'all') {
    where.canonical_key = normalizeText(canonicalKey);
  }
  if (search && search.trim()) {
    where[Op.or] = [
      { term: { [Op.like]: `%${normalizeText(search)}%` } },
      { canonical_key: { [Op.like]: `%${normalizeText(search)}%` } },
    ];
  }
  return BusinessSearchSynonym.findAll({
    where,
    order: [['is_active', 'DESC'], ['canonical_key', 'ASC'], ['term', 'ASC']],
    raw: true,
  });
};

export const createSearchSynonym = async (payload = {}, actorUserId = null) => {
  await ensureSeededOnce();
  const term = normalizeText(payload.term);
  if (!term || term.length < 2) {
    throw new Error('Synonym term must be at least 2 characters.');
  }

  const categories = await BusinessCategory.findAll({
    where: { is_deleted: false },
    attributes: ['id', 'name'],
    raw: true,
  });

  let categoryId = payload.category_id ? Number(payload.category_id) : null;
  let canonicalKey = payload.canonical_key
    ? inferCanonicalKeyFromName(payload.canonical_key, categories) || normalizeText(payload.canonical_key)
    : null;

  if (!canonicalKey && categoryId) {
    const cat = categories.find((c) => Number(c.id) === categoryId);
    if (cat) canonicalKey = inferCanonicalKeyFromName(cat.name, categories);
  }
  if (!canonicalKey && payload.category_name) {
    canonicalKey = inferCanonicalKeyFromName(payload.category_name, categories);
  }
  if (!canonicalKey) {
    throw new Error('Valid canonical_key or category_id is required.');
  }
  if (!categoryId) {
    const cat = categories.find(
      (c) => inferCanonicalKeyFromName(c.name, categories) === canonicalKey
    );
    if (cat) categoryId = Number(cat.id);
  }

  const language = ['en', 'hi_latn', 'brand', 'slang'].includes(payload.language)
    ? payload.language
    : HINGLISH_TERMS.has(term)
      ? 'hi_latn'
      : 'hi_latn';
  const weight = Number.isFinite(Number(payload.weight)) ? Number(payload.weight) : 1.0;
  const isUmbrella = payload.is_umbrella === undefined ? true : Boolean(payload.is_umbrella);
  const isActive = payload.is_active === undefined ? true : Boolean(payload.is_active);
  const now = new Date();

  const existing = await BusinessSearchSynonym.findOne({
    where: { canonical_key: canonicalKey, term },
  });

  let saved;
  if (existing) {
    saved = await existing.update({
      category_id: categoryId ?? existing.category_id,
      language,
      weight,
      is_umbrella: isUmbrella,
      is_active: isActive,
      is_deleted: false,
      updated_by: actorUserId,
      updatedAt: now,
    });
  } else {
    saved = await BusinessSearchSynonym.create({
      canonical_key: canonicalKey,
      category_id: categoryId,
      term,
      language,
      weight,
      is_umbrella: isUmbrella,
      is_active: isActive,
      is_deleted: false,
      created_by: actorUserId,
      updated_by: actorUserId,
      created_at: now,
      updatedAt: now,
    });
  }

  await invalidateSynonymCache();
  return saved.toJSON ? saved.toJSON() : saved;
};

export const updateSearchSynonym = async (id, payload = {}, actorUserId = null) => {
  await ensureSeededOnce();
  const existing = await BusinessSearchSynonym.findOne({
    where: { id, is_deleted: false },
  });
  if (!existing) return null;

  const updates = {
    updated_by: actorUserId,
    updatedAt: new Date(),
  };
  if (payload.term !== undefined) {
    const clean = normalizeText(payload.term);
    if (!clean || clean.length < 2) throw new Error('Term must be at least 2 characters.');
    updates.term = clean;
  }
  if (payload.canonical_key !== undefined) {
    const categories = await BusinessCategory.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'name'],
      raw: true,
    });
    updates.canonical_key =
      inferCanonicalKeyFromName(payload.canonical_key, categories) ||
      normalizeText(payload.canonical_key);
  }
  if (payload.category_id !== undefined) {
    updates.category_id = payload.category_id ? Number(payload.category_id) : null;
  }
  if (payload.language !== undefined) updates.language = payload.language;
  if (payload.weight !== undefined && Number.isFinite(Number(payload.weight))) {
    updates.weight = Number(payload.weight);
  }
  if (payload.is_umbrella !== undefined) updates.is_umbrella = Boolean(payload.is_umbrella);
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);

  await existing.update(updates);
  await invalidateSynonymCache();
  return existing.toJSON ? existing.toJSON() : existing;
};

export const deleteSearchSynonym = async (id, actorUserId = null) => {
  await ensureSeededOnce();
  const existing = await BusinessSearchSynonym.findOne({
    where: { id, is_deleted: false },
  });
  if (!existing) return false;
  await existing.update({
    is_deleted: true,
    is_active: false,
    updated_by: actorUserId,
    updatedAt: new Date(),
  });
  await invalidateSynonymCache();
  return true;
};

/**
 * Computes a safe SQL geo bounding-box condition around customer coordinates
 * while preserving explicit city/locality/pincode/society fallback shops.
 */
export const buildGeoBoundingBoxWhere = (queryLoc = {}) => {
  if (queryLoc?.latitude == null || queryLoc?.longitude == null) return null;

  const lat = Number(queryLoc.latitude);
  const lng = Number(queryLoc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const requestedRadius = Number(queryLoc.radius_km);
  const effectiveKm = Math.min(
    Math.max(Number.isFinite(requestedRadius) && requestedRadius > 0 ? requestedRadius : 50, 25),
    100
  );
  const latDelta = effectiveKm / 111.0;
  const cosLat = Math.max(0.2, Math.abs(Math.cos((lat * Math.PI) / 180)));
  const lngDelta = effectiveKm / (111.0 * cosLat);

  const orBranches = [
    {
      latitude: { [Op.between]: [lat - latDelta, lat + latDelta] },
      longitude: { [Op.between]: [lng - lngDelta, lng + lngDelta] },
    },
    { latitude: null },
  ];

  if (queryLoc.city_id) orBranches.push({ city_id: Number(queryLoc.city_id) });
  if (queryLoc.locality_id) orBranches.push({ locality_id: Number(queryLoc.locality_id) });
  if (queryLoc.pincode) orBranches.push({ pincode: queryLoc.pincode });
  if (queryLoc.society_id) orBranches.push({ society_id: Number(queryLoc.society_id) });

  return { [Op.or]: orBranches };
};

export const getCachedSearchPayload = async (namespace, queryParams = {}) => {
  const normalizedParams = Object.keys(queryParams)
    .sort()
    .reduce((acc, k) => {
      if (queryParams[k] !== undefined && queryParams[k] !== null && queryParams[k] !== '') {
        acc[k] = queryParams[k];
      }
      return acc;
    }, {});
  const key = `search:nearby:v${searchCacheVersion}:${namespace}:${JSON.stringify(normalizedParams)}`;
  const cached = await cacheGet(key);
  return { key, cached };
};

export const setCachedSearchPayload = async (key, payload) => {
  if (!key || !payload) return;
  await cacheSet(key, payload, SEARCH_CACHE_TTL_SEC);
};

/**
 * Logs customer search queries into `business_search_logs`.
 * Merges paired `/business-profile/nearby` + `/business-product/public/nearby` requests
 * fired within 4s by the same resident so searches aren't double-counted.
 */
export const logSearchEvent = async ({
  query,
  categoryId = null,
  categoryName = null,
  productResultCount = null,
  businessResultCount = null,
  matchedViaTypo = false,
  didYouMean = null,
  latencyMs = null,
  locationContext = null,
  userId = null,
  source = 'resident_search',
} = {}) => {
  const cleanQuery = (query ?? '').toString().trim().slice(0, 250);
  const normQuery = normalizeText(cleanQuery);
  if (!normQuery) return;

  try {
    await ensureSeededOnce();

    const cityName = locationContext?.city_name || null;
    const localityName = locationContext?.locality_name || null;
    const societyId = locationContext?.society_id ? Number(locationContext.society_id) : null;
    const dedupKey = `${userId || 'anon'}|${cityName || 'any'}|${normQuery}`;
    const nowMs = Date.now();
    const prev = recentLogDedupMap.get(dedupKey);

    if (prev && nowMs - prev.ts < DEDUP_WINDOW_MS && prev.logId) {
      const nextProd =
        productResultCount !== null ? Math.max(prev.prod, productResultCount) : prev.prod;
      const nextBiz =
        businessResultCount !== null ? Math.max(prev.biz, businessResultCount) : prev.biz;
      const nextTotal = Math.max(nextProd, nextBiz, nextProd + nextBiz > 0 ? nextProd + nextBiz : 0);
      prev.prod = nextProd;
      prev.biz = nextBiz;
      await BusinessSearchLog.update(
        {
          product_result_count: nextProd,
          business_result_count: nextBiz,
          result_count: nextTotal,
          is_zero_result: nextProd === 0 && nextBiz === 0,
          matched_via_typo: prev.typo || Boolean(matchedViaTypo),
          did_you_mean: didYouMean || prev.didYouMean || null,
          updatedAt: new Date(),
        },
        { where: { id: prev.logId } }
      );
      return;
    }

    const pCnt = productResultCount ?? 0;
    const bCnt = businessResultCount ?? 0;
    const total = pCnt + bCnt;

    const created = await BusinessSearchLog.create({
      query: cleanQuery,
      normalized_query: normQuery,
      category_id: categoryId ? Number(categoryId) : null,
      category_name: categoryName || null,
      result_count: total,
      product_result_count: pCnt,
      business_result_count: bCnt,
      is_zero_result: total === 0,
      matched_via_typo: Boolean(matchedViaTypo),
      did_you_mean: didYouMean || null,
      latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
      city_name: cityName,
      locality_name: localityName,
      society_id: societyId,
      user_id: userId ? Number(userId) : null,
      source,
      created_at: new Date(),
      updatedAt: new Date(),
    });

    if (recentLogDedupMap.size > 300) {
      const firstKey = recentLogDedupMap.keys().next().value;
      recentLogDedupMap.delete(firstKey);
    }
    recentLogDedupMap.set(dedupKey, {
      ts: nowMs,
      logId: created.id,
      prod: pCnt,
      biz: bCnt,
      typo: Boolean(matchedViaTypo),
      didYouMean: didYouMean || null,
    });
  } catch (err) {
    console.warn('[SearchIntelligence] Search log skipped:', err?.message || err);
  }
};

export const getTrendingSearchTerms = async ({ cityName = null, limit = 8 } = {}) => {
  try {
    await ensureSeededOnce();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = {
      is_zero_result: false,
      created_at: { [Op.gte]: since },
    };
    if (cityName) where.city_name = cityName;

    const rows = await BusinessSearchLog.findAll({
      attributes: [
        'normalized_query',
        [fn('MAX', col('query')), 'sample_query'],
        [fn('COUNT', col('id')), 'search_count'],
      ],
      where,
      group: ['normalized_query'],
      order: [[literal('search_count'), 'DESC']],
      limit: Math.min(20, Math.max(1, Number(limit) || 8)),
      raw: true,
    });

    return rows.map((r) => ({
      query: r.sample_query || r.normalized_query,
      normalized_query: r.normalized_query,
      count: Number(r.search_count || 0),
    }));
  } catch {
    return [];
  }
};

export const getSearchAnalyticsSummary = async ({ days = 30, limit = 25 } = {}) => {
  await ensureSeededOnce();
  const safeDays = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const [totalsRow, topRows, failedRows, synConfig] = await Promise.all([
    BusinessSearchLog.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'total_searches'],
        [fn('SUM', literal('CASE WHEN is_zero_result = 1 THEN 1 ELSE 0 END')), 'zero_result_searches'],
        [fn('SUM', literal('CASE WHEN matched_via_typo = 1 THEN 1 ELSE 0 END')), 'typo_assisted_searches'],
        [fn('AVG', col('latency_ms')), 'avg_latency_ms'],
      ],
      where: { created_at: { [Op.gte]: since } },
      raw: true,
    }),
    BusinessSearchLog.findAll({
      attributes: [
        'normalized_query',
        [fn('MAX', col('query')), 'query'],
        [fn('COUNT', col('id')), 'search_count'],
        [fn('AVG', col('result_count')), 'avg_results'],
        [fn('SUM', literal('CASE WHEN is_zero_result = 1 THEN 1 ELSE 0 END')), 'zero_count'],
        [fn('MAX', col('created_at')), 'last_searched_at'],
      ],
      where: { created_at: { [Op.gte]: since } },
      group: ['normalized_query'],
      order: [[literal('search_count'), 'DESC']],
      limit: safeLimit,
      raw: true,
    }),
    BusinessSearchLog.findAll({
      attributes: [
        'normalized_query',
        [fn('MAX', col('query')), 'query'],
        [fn('COUNT', col('id')), 'miss_count'],
        [fn('MAX', col('city_name')), 'sample_city'],
        [fn('MAX', col('created_at')), 'last_searched_at'],
      ],
      where: {
        is_zero_result: true,
        created_at: { [Op.gte]: since },
      },
      group: ['normalized_query'],
      order: [[literal('miss_count'), 'DESC'], [literal('last_searched_at'), 'DESC']],
      limit: safeLimit,
      raw: true,
    }),
    getDynamicSynonymConfig(),
  ]);

  const totalSearches = Number(totalsRow?.total_searches || 0);
  const zeroSearches = Number(totalsRow?.zero_result_searches || 0);
  const typoSearches = Number(totalsRow?.typo_assisted_searches || 0);
  const avgLatencyMs =
    totalsRow?.avg_latency_ms != null ? Number(Number(totalsRow.avg_latency_ms).toFixed(1)) : 0;

  return {
    period_days: safeDays,
    total_searches: totalSearches,
    zero_result_searches: zeroSearches,
    zero_result_rate:
      totalSearches > 0 ? Number(((zeroSearches / totalSearches) * 100).toFixed(1)) : 0,
    typo_assisted_searches: typoSearches,
    avg_latency_ms: avgLatencyMs,
    active_synonym_count: Object.keys(synConfig.aliasToCanonical || {}).length,
    top_searches: topRows.map((r) => ({
      query: r.query || r.normalized_query,
      normalized_query: r.normalized_query,
      search_count: Number(r.search_count || 0),
      avg_results: Number(Number(r.avg_results || 0).toFixed(1)),
      zero_count: Number(r.zero_count || 0),
      last_searched_at: r.last_searched_at,
    })),
    failed_searches: failedRows.map((r) => ({
      query: r.query || r.normalized_query,
      normalized_query: r.normalized_query,
      miss_count: Number(r.miss_count || 0),
      sample_city: r.sample_city || null,
      last_searched_at: r.last_searched_at,
      already_has_synonym: Boolean(synConfig.aliasToCanonical?.[r.normalized_query]),
    })),
  };
};
