import { CATEGORY_TEMPLATES } from './category_specifications.js';

/**
 * Shared Category Resolution, Inheritance, Hinglish Synonyms, Fuzzy/Typo Matching,
 * & Enterprise Relevance Scoring Helper.
 *
 * Used across business_product, business_profile, and business_category search services
 * so storefront queries, category filters, and autocomplete resolve consistently.
 */

// Broad category-level umbrella aliases (English + Hinglish / Indian retail terms)
// expanded into every product/business of that category.
// Item-specific nouns (e.g. "hammer", "jeans", "laptop") remain on each item's own
// name/tags/subcategory so searching "Hammer" does NOT match screws or paint inside Hardware.
export const DEFAULT_SYNONYMS_BY_CANONICAL = {
  fashion: [
    'fashion',
    'clothes',
    'cloth',
    'clothing',
    'apparel',
    'garment',
    'garments',
    'attire',
    'wear',
    'outfit',
    'outfits',
    'fashionwear',
    'menswear',
    'womenswear',
    'kidswear',
    'kids wear',
    'ethnic wear',
    'kapde',
    'kapda',
    'kapdaa',
    'kapdo',
    'vastra',
    'poshak',
    'pehnava',
    'kapdewale',
  ],
  footwear: [
    'footwear',
    'footwears',
    'shoe',
    'shoes',
    'sportswear',
    'joota',
    'joote',
    'juta',
    'jute',
    'chappal',
    'sandal',
    'sandals',
    'slipper',
    'slippers',
  ],
  electronics: [
    'electronics',
    'electronic',
    'gadget',
    'gadgets',
    'appliances',
    'bijli saman',
    'bijli ka saman',
    'electric saman',
    'electronic saman',
  ],
  grocery: [
    'grocery',
    'groceries',
    'kirana',
    'kiryana',
    'ration',
    'rashan',
    'supermarket',
    'parchun',
    'provisions',
    'ghar ka saman',
    'daily ration',
  ],
  furniture: [
    'furniture',
    'furnishings',
    'lakdi saman',
    'home decor',
    'sajawat',
  ],
  beauty: [
    'beauty',
    'cosmetic',
    'cosmetics',
    'grooming',
    'shringar',
    'singar',
    'makeup',
    'sundarta',
  ],
  hardware: [
    'hardware',
    'building supplies',
    'home improvement',
    'auzar',
    'aujar',
    'lohari',
    'tools saman',
  ],
  pharmacy: [
    'pharmacy',
    'medical',
    'medicine',
    'medicines',
    'healthcare',
    'chemist',
    'dawai',
    'dawa',
    'dawaiyan',
    'dava',
    'davai',
    'medical store',
  ],
  general: [
    'general',
    'merchandise',
    'daily needs',
    'rozmarra',
    'general store',
  ],
};

// Map common category aliases / item-intent nouns -> canonical category key
// Used when inferring category intent or resolving shop categories.
export const DEFAULT_ALIAS_TO_CANONICAL = {
  fashion: 'fashion',
  clothes: 'fashion',
  cloth: 'fashion',
  clothing: 'fashion',
  apparel: 'fashion',
  garment: 'fashion',
  garments: 'fashion',
  menswear: 'fashion',
  womenswear: 'fashion',
  kidswear: 'fashion',
  'kids wear': 'fashion',
  'ethnic wear': 'fashion',
  kapde: 'fashion',
  kapda: 'fashion',
  kapdaa: 'fashion',
  kapdo: 'fashion',
  vastra: 'fashion',
  poshak: 'fashion',
  pehnava: 'fashion',
  kapdewale: 'fashion',
  footwear: 'footwear',
  footwears: 'footwear',
  shoes: 'footwear',
  shoe: 'footwear',
  sneakers: 'footwear',
  sneaker: 'footwear',
  sandals: 'footwear',
  sandal: 'footwear',
  slippers: 'footwear',
  slipper: 'footwear',
  sportswear: 'footwear',
  joota: 'footwear',
  joote: 'footwear',
  juta: 'footwear',
  jute: 'footwear',
  chappal: 'footwear',
  electronics: 'electronics',
  electronic: 'electronics',
  gadget: 'electronics',
  gadgets: 'electronics',
  mobile: 'electronics',
  mobiles: 'electronics',
  laptops: 'electronics',
  laptop: 'electronics',
  appliances: 'electronics',
  'bijli saman': 'electronics',
  'bijli ka saman': 'electronics',
  'electric saman': 'electronics',
  'electronic saman': 'electronics',
  grocery: 'grocery',
  groceries: 'grocery',
  kirana: 'grocery',
  kiryana: 'grocery',
  ration: 'grocery',
  rashan: 'grocery',
  parchun: 'grocery',
  supermarket: 'grocery',
  'ghar ka saman': 'grocery',
  furniture: 'furniture',
  furnishings: 'furniture',
  sajawat: 'furniture',
  'home decor': 'furniture',
  'lakdi saman': 'furniture',
  beauty: 'beauty',
  cosmetics: 'beauty',
  cosmetic: 'beauty',
  skincare: 'beauty',
  grooming: 'beauty',
  shringar: 'beauty',
  singar: 'beauty',
  makeup: 'beauty',
  hardware: 'hardware',
  tools: 'hardware',
  paints: 'hardware',
  plumbing: 'hardware',
  electrical: 'hardware',
  auzar: 'hardware',
  aujar: 'hardware',
  lohari: 'hardware',
  pharmacy: 'pharmacy',
  medical: 'pharmacy',
  medicine: 'pharmacy',
  medicines: 'pharmacy',
  chemist: 'pharmacy',
  dawai: 'pharmacy',
  dawa: 'pharmacy',
  dawaiyan: 'pharmacy',
  dava: 'pharmacy',
  davai: 'pharmacy',
  general: 'general',
  rozmarra: 'general',
  'daily needs': 'general',
};

const STOP_WORDS = new Set([
  'for',
  'and',
  'the',
  'with',
  'near',
  'me',
  'in',
  'of',
  'to',
  'a',
  'an',
  'ka',
  'ki',
  'ke',
  'wala',
  'wale',
  'shop',
  'store',
]);

export const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_&/+,.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeCompactToken = (token) => {
  const t = normalizeText(token).replace(/\s+/g, '');
  if (!t) return '';
  if (t === 'tshirts' || t === 'tshirt') return 'tshirt';
  if (t === 'clothes' || t === 'clothing') return 'cloth';
  if (t === 'kapde' || t === 'kapdaa' || t === 'kapdo') return 'kapda';
  if (t === 'joote' || t === 'joota' || t === 'jute' || t === 'juta') return 'joota';
  if (t === 'dawaiyan' || t === 'dawa' || t === 'davai' || t === 'dava') return 'dawai';
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
};

export const parseStringList = (rawValue) => {
  if (Array.isArray(rawValue)) {
    return rawValue.map((x) => (x ?? '').toString().trim()).filter(Boolean);
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => (x ?? '').toString().trim()).filter(Boolean);
        }
      } catch {
        // Fallback to comma split
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

/**
 * Merges static fallback dictionaries with live DB synonym configuration (`dynamicConfig`).
 * If a term is explicitly deactivated (`disabledTerms`), it is excluded from matching.
 */
export const buildEffectiveSynonymDictionaries = (dynamicConfig = null) => {
  const disabledSet = new Set(
    (dynamicConfig?.disabledTerms || []).map((t) => normalizeText(t)).filter(Boolean)
  );

  const umbrellaByCanonical = {};
  for (const [key, list] of Object.entries(DEFAULT_SYNONYMS_BY_CANONICAL)) {
    umbrellaByCanonical[key] = new Set(
      list.map((t) => normalizeText(t)).filter((t) => t && !disabledSet.has(t))
    );
  }

  const aliasToCanonical = {};
  for (const [alias, target] of Object.entries(DEFAULT_ALIAS_TO_CANONICAL)) {
    const normAlias = normalizeText(alias);
    if (normAlias && !disabledSet.has(normAlias)) {
      aliasToCanonical[normAlias] = target;
    }
  }

  if (dynamicConfig?.umbrellaByCanonical) {
    for (const [key, list] of Object.entries(dynamicConfig.umbrellaByCanonical)) {
      const cleanKey = normalizeText(key);
      if (!cleanKey) continue;
      if (!umbrellaByCanonical[cleanKey]) umbrellaByCanonical[cleanKey] = new Set([cleanKey]);
      for (const t of list || []) {
        const normT = normalizeText(t);
        if (normT && !disabledSet.has(normT)) {
          umbrellaByCanonical[cleanKey].add(normT);
          aliasToCanonical[normT] = cleanKey;
        }
      }
    }
  }

  if (dynamicConfig?.aliasToCanonical) {
    for (const [alias, target] of Object.entries(dynamicConfig.aliasToCanonical)) {
      const normAlias = normalizeText(alias);
      const cleanTarget = normalizeText(target);
      if (normAlias && cleanTarget && !disabledSet.has(normAlias)) {
        aliasToCanonical[normAlias] = cleanTarget;
      }
    }
  }

  return { umbrellaByCanonical, aliasToCanonical };
};

/**
 * Bounded Optimal String Alignment (Damerau-Levenshtein) edit distance.
 * Supports adjacent swaps (e.g. "shose" <-> "shoes" = 1 edit) + insert/delete/replace.
 */
export const damerauLevenshtein = (a, b, maxDist = 2) => {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  if (a === b) return 0;

  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;

  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    let rowMin = maxDist + 1;
    const chA = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = chA === b.charCodeAt(j - 1) ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist && i < la - maxDist) {
      // Early bailout only when suffix can't recover below threshold
      if (rowMin - Math.abs(la - i) > maxDist) {
        return maxDist + 1;
      }
    }
  }
  return dp[la][lb];
};

export const allowedEditDistanceForToken = (token) => {
  const len = token?.length || 0;
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
};

/**
 * Finds the best fuzzy match for a typo token against candidate words/tokens.
 * Guards against noisy 4-char cross-matches by requiring same first or last char when len <= 4.
 */
export const findBestFuzzyMatch = (token, candidateWords = []) => {
  const cleanTok = normalizeText(token).replace(/\s+/g, '');
  const compactTok = normalizeCompactToken(cleanTok);
  const probes = cleanTok === compactTok ? [cleanTok] : [compactTok, cleanTok];
  const maxDist = allowedEditDistanceForToken(cleanTok);
  if (maxDist <= 0) return null;

  let bestWord = null;
  let bestDist = maxDist + 1;

  for (const cand of candidateWords) {
    if (!cand || cand.length < 4) continue;
    for (const p of probes) {
      const dist = damerauLevenshtein(p, cand, maxDist);
      if (dist <= maxDist) {
        if (
          p.length <= 4 &&
          p[0] !== cand[0] &&
          p[p.length - 1] !== cand[cand.length - 1]
        ) {
          continue;
        }
        if (dist < bestDist || (dist === bestDist && Math.abs(cand.length - p.length) < Math.abs((bestWord?.length || 99) - p.length))) {
          bestDist = dist;
          bestWord = cand;
        }
      }
    }
  }

  return bestWord ? { matchedWord: bestWord, distance: bestDist } : null;
};

export const inferCanonicalKeyFromName = (rawName, categoryMaster = [], dynamicConfig = null) => {
  const norm = normalizeText(rawName);
  if (!norm) return null;

  const { aliasToCanonical, umbrellaByCanonical } = buildEffectiveSynonymDictionaries(dynamicConfig);

  for (const cat of categoryMaster) {
    const cNorm = normalizeText(cat?.name);
    if (cNorm && cNorm === norm) {
      if (aliasToCanonical[cNorm]) return aliasToCanonical[cNorm];
      if (umbrellaByCanonical[cNorm]) return cNorm;
    }
  }

  if (aliasToCanonical[norm]) {
    return aliasToCanonical[norm];
  }

  // Ordered keys so "Footwear & Sportswear" resolves to footwear before fashion
  const orderedKeys = [
    'footwear',
    'fashion',
    'electronics',
    'grocery',
    'furniture',
    'beauty',
    'hardware',
    'pharmacy',
    'general',
    ...Object.keys(umbrellaByCanonical).filter(
      (k) => !['footwear', 'fashion', 'electronics', 'grocery', 'furniture', 'beauty', 'hardware', 'pharmacy', 'general'].includes(k)
    ),
  ];
  const words = norm.split(' ').filter(Boolean);

  for (const key of orderedKeys) {
    if (words.includes(key)) return key;
  }
  for (const w of words) {
    if (aliasToCanonical[w]) {
      return aliasToCanonical[w];
    }
  }
  for (const cat of categoryMaster) {
    const cNorm = normalizeText(cat?.name);
    if (cNorm && words.includes(cNorm)) {
      return aliasToCanonical[cNorm] || cNorm;
    }
  }
  return norm;
};

/**
 * Resolves raw category_id / category_name against active BusinessCategory master rows.
 */
export const resolveCategoryFromMaster = (
  rawCategoryId,
  rawCategoryName,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const numId =
    rawCategoryId !== null && rawCategoryId !== undefined && rawCategoryId !== ''
      ? parseInt(rawCategoryId, 10)
      : null;
  const cleanId = Number.isFinite(numId) && numId > 0 ? numId : null;
  const trimmedName =
    rawCategoryName !== null && rawCategoryName !== undefined
      ? rawCategoryName.toString().trim()
      : '';

  if (cleanId) {
    const byId = categoryMaster.find((c) => Number(c.id) === cleanId);
    if (byId) {
      return {
        category_id: Number(byId.id),
        category_name:
          trimmedName && normalizeText(trimmedName) === normalizeText(byId.name)
            ? byId.name
            : trimmedName || byId.name,
        master_category_name: byId.name,
        canonical_key: inferCanonicalKeyFromName(byId.name, categoryMaster, dynamicConfig),
      };
    }
  }

  if (trimmedName) {
    const normInput = normalizeText(trimmedName);
    const exact = categoryMaster.find((c) => normalizeText(c.name) === normInput);
    if (exact) {
      return {
        category_id: Number(exact.id),
        category_name: exact.name,
        master_category_name: exact.name,
        canonical_key: inferCanonicalKeyFromName(exact.name, categoryMaster, dynamicConfig),
      };
    }

    const canonical = inferCanonicalKeyFromName(trimmedName, categoryMaster, dynamicConfig);
    if (canonical) {
      const matchedMaster = categoryMaster.find(
        (c) => inferCanonicalKeyFromName(c.name, categoryMaster, dynamicConfig) === canonical
      );
      if (matchedMaster) {
        return {
          category_id: Number(matchedMaster.id),
          category_name: matchedMaster.name,
          master_category_name: matchedMaster.name,
          canonical_key: canonical,
        };
      }
    }
  }

  return {
    category_id: cleanId,
    category_name: trimmedName || null,
    master_category_name: trimmedName || null,
    canonical_key: trimmedName
      ? inferCanonicalKeyFromName(trimmedName, categoryMaster, dynamicConfig)
      : null,
  };
};

export const getCategoryKeywords = (
  canonicalOrName,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const key = inferCanonicalKeyFromName(canonicalOrName, categoryMaster, dynamicConfig);
  const { umbrellaByCanonical } = buildEffectiveSynonymDictionaries(dynamicConfig);
  const terms = new Set();

  if (key) {
    terms.add(key);
    const extra = umbrellaByCanonical[key];
    if (extra) {
      for (const item of extra) terms.add(normalizeText(item));
    }
  }

  for (const tpl of Object.values(CATEGORY_TEMPLATES)) {
    if (normalizeText(tpl.category) === key) {
      for (const sub of tpl.subcategories || []) {
        const cleanSub = normalizeText(sub);
        if (!cleanSub) continue;
        if (key === 'fashion' && cleanSub.includes('footwear')) continue;
        terms.add(cleanSub);
      }
    }
  }

  const rawNorm = normalizeText(canonicalOrName);
  if (rawNorm) terms.add(rawNorm);
  return Array.from(terms).filter(Boolean);
};

export const resolveFilterTarget = (
  rawCategoryId,
  rawCategoryName,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const hasId =
    rawCategoryId !== null &&
    rawCategoryId !== undefined &&
    `${rawCategoryId}`.trim() !== '' &&
    Number(rawCategoryId) > 0;
  const rawName =
    rawCategoryName !== null && rawCategoryName !== undefined
      ? rawCategoryName.toString().trim()
      : '';
  const isAll = !rawName || rawName.toLowerCase() === 'all';

  if (!hasId && isAll) return null;

  const resolved = resolveCategoryFromMaster(
    hasId ? rawCategoryId : null,
    isAll ? null : rawName,
    categoryMaster,
    dynamicConfig
  );
  return {
    category_id: resolved.category_id,
    category_name: resolved.master_category_name || (isAll ? null : rawName),
    canonical_key:
      resolved.canonical_key ||
      (isAll ? null : inferCanonicalKeyFromName(rawName, categoryMaster, dynamicConfig)),
    raw_name: isAll ? null : rawName,
  };
};

export const productMatchesCategoryFilter = (
  productPlain,
  filterTarget,
  categoryMaster = [],
  dynamicConfig = null
) => {
  if (!filterTarget) return true;

  const prodId = productPlain?.category_id ? Number(productPlain.category_id) : null;
  const prodName = (productPlain?.category_name || '').toString().trim();
  const prodResolved = resolveCategoryFromMaster(prodId, prodName, categoryMaster, dynamicConfig);

  if (filterTarget.category_id && prodId) {
    if (filterTarget.category_id === prodId) return true;
    if (prodResolved.canonical_key && filterTarget.canonical_key) {
      return prodResolved.canonical_key === filterTarget.canonical_key;
    }
    return false;
  }

  if (filterTarget.category_id && !prodId && prodResolved.category_id) {
    if (filterTarget.category_id === prodResolved.category_id) return true;
  }

  if (filterTarget.canonical_key && prodResolved.canonical_key) {
    if (filterTarget.canonical_key === prodResolved.canonical_key) return true;
  }

  if (filterTarget.raw_name && prodName) {
    const fNorm = normalizeText(filterTarget.raw_name);
    const pNorm = normalizeText(prodName);
    if (fNorm === pNorm) return true;
    if (pNorm.split(' ').includes(fNorm)) return true;
  }

  return false;
};

export const businessMatchesOwnCategory = (
  bizPlain,
  filterTarget,
  categoryMaster = [],
  dynamicConfig = null
) => {
  if (!filterTarget) return true;

  const bizCatId = bizPlain?.category_id ? Number(bizPlain.category_id) : null;
  const bizCatName = (
    bizPlain?.category?.name ||
    bizPlain?.category_name ||
    bizPlain?.serviceCategory ||
    ''
  )
    .toString()
    .trim();

  return productMatchesCategoryFilter(
    { category_id: bizCatId, category_name: bizCatName },
    filterTarget,
    categoryMaster,
    dynamicConfig
  );
};

export const buildProductSearchHaystack = (
  productPlain,
  bizSummary = null,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const parts = [
    productPlain?.name,
    productPlain?.brand,
    productPlain?.category_name,
    productPlain?.subcategory_name,
    productPlain?.sku,
    productPlain?.short_description,
    productPlain?.detailed_description,
    ...parseStringList(productPlain?.tags),
    ...parseStringList(productPlain?.search_keywords),
    bizSummary?.business_name || bizSummary?.businessName,
    bizSummary?.locality_name,
  ];

  if (productPlain?.attributes && typeof productPlain.attributes === 'object') {
    for (const val of Object.values(productPlain.attributes)) {
      if (val !== null && val !== undefined) parts.push(val.toString());
    }
  }

  const resolved = resolveCategoryFromMaster(
    productPlain?.category_id,
    productPlain?.category_name,
    categoryMaster,
    dynamicConfig
  );
  const catKeywords = getCategoryKeywords(
    resolved.master_category_name || resolved.canonical_key || productPlain?.category_name,
    categoryMaster,
    dynamicConfig
  );
  parts.push(...catKeywords);

  return normalizeText(parts.filter(Boolean).join(' '));
};

export const buildBusinessSearchHaystack = (
  bizPlain,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const catName =
    bizPlain?.category?.name ||
    bizPlain?.category_name ||
    bizPlain?.serviceCategory ||
    '';
  const parts = [
    bizPlain?.businessName || bizPlain?.business_name,
    bizPlain?.serviceCategory,
    catName,
    bizPlain?.description,
    bizPlain?.address,
    bizPlain?.locality_name,
    bizPlain?.city_name,
    ...getCategoryKeywords(catName, categoryMaster, dynamicConfig),
  ];
  return normalizeText(parts.filter(Boolean).join(' '));
};

const extractQueryTokens = (rawQuery) => {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) return [];
  const rawTokens = qNorm
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return rawTokens.length > 0 ? rawTokens : qNorm.split(' ').filter(Boolean);
};

const buildWordIndexSet = (normText) => {
  const words = normText ? normText.split(' ').filter(Boolean) : [];
  const wordSet = new Set(words);
  const compactSet = new Set(words.map(normalizeCompactToken).filter(Boolean));
  return { words, wordSet, compactSet };
};

const matchTokenInText = (tok, normText, { allowFuzzy = true } = {}) => {
  if (!normText) return { hit: false, kind: 'none', correctedTo: null };
  const compactTok = normalizeCompactToken(tok);
  const { words, wordSet, compactSet } = buildWordIndexSet(normText);

  if (wordSet.has(tok) || (compactTok && compactSet.has(compactTok))) {
    return { hit: true, kind: 'exact_word', correctedTo: null };
  }

  if (normText.includes(tok)) {
    return { hit: true, kind: 'substring', correctedTo: null };
  }

  if (compactTok) {
    for (const hw of compactSet) {
      if (
        hw.includes(compactTok) ||
        (compactTok.length >= 4 && compactTok.includes(hw) && hw.length >= 4)
      ) {
        return { hit: true, kind: 'infix', correctedTo: null };
      }
    }
  }

  if (allowFuzzy && tok.length >= 4) {
    const candidates = new Set([...wordSet, ...compactSet]);
    const fuzzy = findBestFuzzyMatch(tok, Array.from(candidates));
    if (fuzzy) {
      return {
        hit: true,
        kind: 'fuzzy',
        correctedTo: fuzzy.matchedWord,
        distance: fuzzy.distance,
      };
    }
  }

  return { hit: false, kind: 'none', correctedTo: null };
};

/**
 * Rich search evaluator supporting exact, compound (`t-shirt`), Hinglish synonyms, and bounded typos.
 */
export const evaluateExpandedSearch = (
  normalizedHaystack,
  rawQuery,
  { allowFuzzy = true } = {}
) => {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) {
    return { matched: true, matchedViaTypo: false, typoCorrections: {} };
  }
  if (!normalizedHaystack) {
    return { matched: false, matchedViaTypo: false, typoCorrections: {} };
  }

  const collapsedQuery = rawQuery.toString().trim().toLowerCase().replace(/[-_]+/g, '');
  if (
    normalizedHaystack.includes(qNorm) ||
    (collapsedQuery.length >= 3 && normalizedHaystack.includes(collapsedQuery))
  ) {
    return { matched: true, matchedViaTypo: false, typoCorrections: {} };
  }

  const tokens = extractQueryTokens(rawQuery);
  if (tokens.length === 0) {
    return { matched: true, matchedViaTypo: false, typoCorrections: {} };
  }

  // Handle dashed compounds like "t-shirt" -> joined token "tshirt" alongside ["t", "shirt"]
  const joinedCompact = tokens.join('');
  if (joinedCompact.length >= 4 && normalizedHaystack.includes(joinedCompact)) {
    return { matched: true, matchedViaTypo: false, typoCorrections: {} };
  }

  let matchedViaTypo = false;
  const typoCorrections = {};

  for (const tok of tokens) {
    const res = matchTokenInText(tok, normalizedHaystack, { allowFuzzy });
    if (!res.hit) {
      return { matched: false, matchedViaTypo: false, typoCorrections: {} };
    }
    if (res.kind === 'fuzzy') {
      matchedViaTypo = true;
      if (res.correctedTo) typoCorrections[tok] = res.correctedTo;
    }
  }

  return { matched: true, matchedViaTypo, typoCorrections };
};

export const matchesExpandedSearch = (
  normalizedHaystack,
  rawQuery,
  options = { allowFuzzy: true }
) => evaluateExpandedSearch(normalizedHaystack, rawQuery, options).matched;

/**
 * Evaluates & computes a weighted Enterprise Relevance Score for a product.
 */
export const scoreProductSearch = (
  productPlain,
  bizSummary = null,
  rawQuery = '',
  categoryMaster = [],
  dynamicConfig = null,
  { allowFuzzy = true } = {}
) => {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) {
    return { matched: true, score: 0, matchedViaTypo: false, typoCorrections: {} };
  }

  const haystack = buildProductSearchHaystack(
    productPlain,
    bizSummary,
    categoryMaster,
    dynamicConfig
  );
  const matchEval = evaluateExpandedSearch(haystack, rawQuery, { allowFuzzy });
  if (!matchEval.matched) {
    return { matched: false, score: 0, matchedViaTypo: false, typoCorrections: {} };
  }

  const nameNorm = normalizeText(productPlain?.name);
  const brandSubNorm = normalizeText(
    [productPlain?.brand, productPlain?.subcategory_name].filter(Boolean).join(' ')
  );
  const tagAttrNorm = normalizeText(
    [
      productPlain?.sku,
      ...parseStringList(productPlain?.tags),
      ...parseStringList(productPlain?.search_keywords),
      ...(productPlain?.attributes && typeof productPlain.attributes === 'object'
        ? Object.values(productPlain.attributes).map((v) => v?.toString() || '')
        : []),
    ].join(' ')
  );
  const shopNorm = normalizeText(
    [bizSummary?.business_name || bizSummary?.businessName, bizSummary?.locality_name]
      .filter(Boolean)
      .join(' ')
  );
  const resolved = resolveCategoryFromMaster(
    productPlain?.category_id,
    productPlain?.category_name,
    categoryMaster,
    dynamicConfig
  );
  const catKeywordsNorm = normalizeText(
    getCategoryKeywords(
      resolved.master_category_name || resolved.canonical_key || productPlain?.category_name,
      categoryMaster,
      dynamicConfig
    ).join(' ')
  );

  const collapsedQ = rawQuery.toString().trim().toLowerCase().replace(/[-_]+/g, '');
  let score = 0;

  if (nameNorm === qNorm || (collapsedQ && nameNorm === collapsedQ)) {
    score += 120;
  } else if (
    nameNorm.startsWith(qNorm) ||
    (collapsedQ && nameNorm.startsWith(collapsedQ))
  ) {
    score += 95;
  } else if (
    nameNorm.includes(qNorm) ||
    (collapsedQ && collapsedQ.length >= 3 && nameNorm.includes(collapsedQ))
  ) {
    score += 75;
  }

  const tokens = extractQueryTokens(rawQuery);
  for (const tok of tokens) {
    const nameHit = matchTokenInText(tok, nameNorm, { allowFuzzy });
    if (nameHit.hit) {
      score += nameHit.kind === 'exact_word' ? 35 : nameHit.kind === 'fuzzy' ? 10 : 24;
      continue;
    }

    const brandHit = matchTokenInText(tok, brandSubNorm, { allowFuzzy });
    if (brandHit.hit) {
      score += brandHit.kind === 'fuzzy' ? 9 : 25;
      continue;
    }

    const tagHit = matchTokenInText(tok, tagAttrNorm, { allowFuzzy });
    if (tagHit.hit) {
      score += tagHit.kind === 'fuzzy' ? 8 : 20;
      continue;
    }

    const shopHit = matchTokenInText(tok, shopNorm, { allowFuzzy });
    if (shopHit.hit) {
      score += shopHit.kind === 'fuzzy' ? 6 : 15;
      continue;
    }

    const catHit = matchTokenInText(tok, catKeywordsNorm, { allowFuzzy });
    if (catHit.hit) {
      score += catHit.kind === 'fuzzy' ? 6 : 16;
      continue;
    }

    // Matched via description
    score += 8;
  }

  // Quality & proximity micro-signals (tie-breakers without overpowering text relevance)
  if (productPlain?.is_deliverable !== false) score += 4;
  if (productPlain?.stock_status !== 'out_of_stock') score += 3;
  if (productPlain?.is_bestseller) score += 2;
  if (productPlain?.is_featured) score += 1;
  const distKm = Number(productPlain?.distance_km ?? bizSummary?.distance_km);
  if (Number.isFinite(distKm) && distKm >= 0) {
    score += Math.max(0, 5 - Math.min(20, distKm) * 0.25);
  }
  if (matchEval.matchedViaTypo) {
    score = Math.max(1, score - 5);
  }

  return {
    matched: true,
    score: Number(score.toFixed(2)),
    matchedViaTypo: matchEval.matchedViaTypo,
    typoCorrections: matchEval.typoCorrections,
  };
};

/**
 * Evaluates & scores a business profile match cleanly.
 */
export const scoreBusinessSearch = (
  bizPlain,
  rawQuery = '',
  categoryMaster = [],
  dynamicConfig = null,
  { allowFuzzy = true } = {}
) => {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) {
    return { matched: true, score: 0, matchedViaTypo: false, typoCorrections: {} };
  }
  const haystack = buildBusinessSearchHaystack(bizPlain, categoryMaster, dynamicConfig);
  const matchEval = evaluateExpandedSearch(haystack, rawQuery, { allowFuzzy });
  if (!matchEval.matched) {
    return { matched: false, score: 0, matchedViaTypo: false, typoCorrections: {} };
  }

  const bizName = normalizeText(bizPlain?.businessName || bizPlain?.business_name);
  let score = 0;
  if (bizName === qNorm) score += 120;
  else if (bizName.startsWith(qNorm)) score += 90;
  else if (bizName.includes(qNorm)) score += 65;

  const tokens = extractQueryTokens(rawQuery);
  for (const tok of tokens) {
    const h = matchTokenInText(tok, bizName, { allowFuzzy });
    if (h.hit) score += h.kind === 'fuzzy' ? 10 : 30;
    else score += 14;
  }

  if (bizPlain?.is_verified) score += 3;
  if (bizPlain?.is_featured) score += 2;
  if (bizPlain?.is_open !== false) score += 2;
  const distKm = Number(bizPlain?.distance_km);
  if (Number.isFinite(distKm) && distKm >= 0) {
    score += Math.max(0, 5 - Math.min(20, distKm) * 0.25);
  }
  if (matchEval.matchedViaTypo) score = Math.max(1, score - 5);

  return {
    matched: true,
    score: Number(score.toFixed(2)),
    matchedViaTypo: matchEval.matchedViaTypo,
    typoCorrections: matchEval.typoCorrections,
  };
};

/**
 * Builds a clean "Did you mean...?" string from token corrections or known vocabulary.
 */
export const computeDidYouMean = (
  rawQuery,
  vocabularyWords = [],
  directCorrections = {}
) => {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) return null;

  const tokens = qNorm.split(' ').filter(Boolean);
  let changed = false;

  const rebuilt = tokens.map((tok) => {
    if (directCorrections[tok]) {
      changed = true;
      return directCorrections[tok];
    }
    if (tok.length < 4 || STOP_WORDS.has(tok)) return tok;
    const compact = normalizeCompactToken(tok);
    const hasExact = vocabularyWords.some((w) => w === tok || w === compact);
    if (hasExact) return tok;

    const fuzzy = findBestFuzzyMatch(tok, vocabularyWords);
    if (fuzzy && fuzzy.matchedWord !== tok) {
      changed = true;
      return fuzzy.matchedWord;
    }
    return tok;
  });

  if (!changed) return null;
  const candidate = rebuilt.join(' ').trim();
  return candidate && candidate !== qNorm ? candidate : null;
};

/**
 * Generates SQL-level FULLTEXT Boolean tokens, category ID hints, and pigeonhole substrings
 * to pre-filter large tables in MariaDB without losing synonyms or bounded typos.
 */
export const buildSqlSearchSignals = (
  rawQuery,
  filterTarget = null,
  categoryMaster = [],
  dynamicConfig = null
) => {
  const qNorm = normalizeText(rawQuery);
  const tokens = extractQueryTokens(rawQuery);
  const matchedCanonicalKeys = new Set();
  const matchedCategoryIds = new Set();
  const booleanWords = new Set();
  const likeProbes = new Set();

  if (filterTarget?.category_id) matchedCategoryIds.add(Number(filterTarget.category_id));
  if (filterTarget?.canonical_key) matchedCanonicalKeys.add(filterTarget.canonical_key);

  const { aliasToCanonical, umbrellaByCanonical } =
    buildEffectiveSynonymDictionaries(dynamicConfig);

  if (qNorm && aliasToCanonical[qNorm]) {
    matchedCanonicalKeys.add(aliasToCanonical[qNorm]);
  }

  for (const tok of tokens) {
    const compact = normalizeCompactToken(tok);
    if (tok.length >= 3) {
      booleanWords.add(`${tok.replace(/[^\w]/g, '')}*`);
    }
    if (compact.length >= 3 && compact !== tok) {
      booleanWords.add(`${compact.replace(/[^\w]/g, '')}*`);
    }

    if (aliasToCanonical[tok]) matchedCanonicalKeys.add(aliasToCanonical[tok]);
    if (compact && aliasToCanonical[compact]) matchedCanonicalKeys.add(aliasToCanonical[compact]);

    // Fuzzy category / synonym match for typo queries like "fashon", "kappde", "shose"
    if (tok.length >= 4) {
      const aliasFuzzy = findBestFuzzyMatch(tok, Object.keys(aliasToCanonical));
      if (aliasFuzzy && aliasToCanonical[aliasFuzzy.matchedWord]) {
        matchedCanonicalKeys.add(aliasToCanonical[aliasFuzzy.matchedWord]);
      }

      // Pigeonhole 3-char / 2-char safe substrings for typo pre-filtering in SQL
      if (tok.length >= 6) {
        const tri = Math.floor(tok.length / 3);
        likeProbes.add(tok.slice(0, tri));
        likeProbes.add(tok.slice(tri, tri * 2));
        likeProbes.add(tok.slice(tri * 2));
      } else {
        const mid = Math.floor(tok.length / 2);
        likeProbes.add(tok.slice(0, mid));
        likeProbes.add(tok.slice(mid));
        if (tok.length >= 4) likeProbes.add(tok.slice(1, tok.length - 1));
      }
    } else if (tok.length >= 2) {
      likeProbes.add(tok);
    }
  }

  for (const ck of matchedCanonicalKeys) {
    const terms = umbrellaByCanonical[ck];
    if (terms) {
      for (const term of terms) {
        const clean = term.replace(/[^\w]/g, '');
        if (clean.length >= 3) booleanWords.add(`${clean}*`);
      }
    }
    for (const cat of categoryMaster) {
      if (inferCanonicalKeyFromName(cat.name, categoryMaster, dynamicConfig) === ck) {
        matchedCategoryIds.add(Number(cat.id));
      }
    }
  }

  const cleanBooleanTokens = Array.from(booleanWords)
    .map((w) => w.replace(/[^a-z0-9*]/gi, ''))
    .filter((w) => w.length >= 4)
    .slice(0, 18);

  return {
    qNorm,
    tokens,
    matchedCanonicalKeys: Array.from(matchedCanonicalKeys),
    matchedCategoryIds: Array.from(matchedCategoryIds),
    fulltextBooleanQuery: cleanBooleanTokens.join(' '),
    likeProbes: Array.from(likeProbes).filter((p) => p.length >= 2).slice(0, 12),
  };
};
