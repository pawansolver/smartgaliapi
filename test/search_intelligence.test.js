import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/db.js';
import BusinessCategory from '../src/modules/business_category/business_category.model.js';
import BusinessSearchSynonym from '../src/modules/business_category/business_search_synonym.model.js';
import BusinessSearchLog from '../src/modules/business_category/business_search_log.model.js';
import {
  damerauLevenshtein,
  allowedEditDistanceForToken,
  findBestFuzzyMatch,
  scoreProductSearch,
  scoreBusinessSearch,
  computeDidYouMean,
  buildSqlSearchSignals,
} from '../src/modules/business_category/category_matcher.helper.js';
import {
  listSearchSynonyms,
  createSearchSynonym,
  updateSearchSynonym,
  deleteSearchSynonym,
  getDynamicSynonymConfig,
  getSearchAnalyticsSummary,
  invalidateSearchQueryCache,
} from '../src/modules/business_category/business_search_intelligence.service.js';
import {
  getPublicProductsNearby,
  getPublicSearchSuggestions,
} from '../src/modules/business_product/business_product.service.js';
import { getNearbyBusinesses } from '../src/modules/business_profile/business_profile.service.js';

const CATEGORY_MASTER = [
  { id: 1, name: 'Grocery' },
  { id: 2, name: 'Electronics' },
  { id: 5, name: 'Fashion' },
  { id: 6, name: 'Home & Furniture' },
  { id: 10, name: 'Footwear & Sportswear' },
  { id: 15, name: 'Medical & Pharmacy' },
];

const SAMPLE_SHIRT = {
  id: 115,
  name: 'silk tshirt',
  brand: 'Nike',
  category_id: 5,
  category_name: 'Fashion',
  subcategory_name: 'Menswear',
  tags: ['silk', 'tshirt', 'apparel'],
  search_keywords: ['t-shirt', 'clothes'],
  short_description: 'Soft silk summer tshirt',
  is_deliverable: true,
  stock_status: 'in_stock',
  distance_km: 1.1,
};

const SAMPLE_SHOE = {
  id: 101,
  name: 'Nike Air Zoom Pegasus 40 Running Shoes',
  brand: 'Nike',
  category_id: 10,
  category_name: 'Footwear & Sportswear',
  subcategory_name: 'Running Shoes',
  tags: ['running', 'shoes', 'sneakers'],
  search_keywords: ['footwear', 'sports'],
  short_description: 'Lightweight cushioned running shoes',
  is_deliverable: true,
  stock_status: 'in_stock',
  distance_km: 1.1,
};

const SAMPLE_SHOP = {
  id: 101,
  businessName: 'Nike Store',
  business_name: 'Nike Store',
  category_id: 10,
  serviceCategory: 'Footwear & Sportswear',
  locality_name: 'Khagaul',
  city_name: 'Patna',
  is_verified: true,
  is_open: true,
  distance_km: 1.1,
};

const createdSynonymIds = [];
const testQueriesLogged = [];

describe('Enterprise Search Intelligence Engine', () => {
  before(async () => {
    await sequelize.authenticate();
    // Ensure dependent models loaded cleanly for integration queries
    await BusinessCategory.count();
  });

  after(async () => {
    for (const sid of createdSynonymIds) {
      await BusinessSearchSynonym.destroy({ where: { id: sid } }).catch(() => {});
    }
    if (testQueriesLogged.length > 0) {
      await BusinessSearchLog.destroy({
        where: { normalized_query: testQueriesLogged },
      }).catch(() => {});
    }
    await invalidateSearchQueryCache().catch(() => {});
    await sequelize.close();
  });

  describe('1. Bounded Damerau-Levenshtein & Fuzzy Typo Tolerance', () => {
    it('supports adjacent transpositions and edit thresholds cleanly', () => {
      assert.equal(damerauLevenshtein('shose', 'shoes', 2), 1);
      assert.equal(damerauLevenshtein('tsirt', 'tshirt', 2), 1);
      assert.equal(damerauLevenshtein('fashon', 'fashion', 2), 1);
      assert.equal(allowedEditDistanceForToken('tv'), 0);
      assert.equal(allowedEditDistanceForToken('shose'), 1);
      assert.equal(allowedEditDistanceForToken('sneekers'), 2);
    });

    it('matches typos "tsirt" and "shose" against real products with did-you-mean hints', () => {
      const shirtEval = scoreProductSearch(SAMPLE_SHIRT, SAMPLE_SHOP, 'tsirt', CATEGORY_MASTER);
      assert.equal(shirtEval.matched, true);
      assert.equal(shirtEval.matchedViaTypo, true);
      assert.ok(shirtEval.score > 0);

      const shoeEval = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'shose', CATEGORY_MASTER);
      assert.equal(shoeEval.matched, true);
      assert.equal(shoeEval.matchedViaTypo, true);

      const suggestion = computeDidYouMean(
        'tsirt',
        ['tshirt', 'shoes', 'fashion', 'footwear'],
        shirtEval.typoCorrections
      );
      assert.equal(suggestion, 'tshirt');
    });

    it('prevents noisy fuzzy false-positives on short tokens <= 3 chars', () => {
      const noShort = findBestFuzzyMatch('xyz', ['tshirt', 'shoes', 'fashion']);
      assert.equal(noShort, null);
      const unrelated = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'zzqqxx', CATEGORY_MASTER);
      assert.equal(unrelated.matched, false);
    });
  });

  describe('2. Desi / Hinglish Synonyms & Strict Category Isolation', () => {
    it('matches "kapde" to Fashion tshirt and isolates out Footwear shoes', () => {
      const shirtMatch = scoreProductSearch(SAMPLE_SHIRT, SAMPLE_SHOP, 'kapde', CATEGORY_MASTER);
      const shoeMatch = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'kapde', CATEGORY_MASTER);
      assert.equal(shirtMatch.matched, true);
      assert.equal(shoeMatch.matched, false);
    });

    it('matches "joota" and "chappal" to Footwear shoes and isolates out Fashion tshirt', () => {
      const jootaShoe = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'joota', CATEGORY_MASTER);
      const jootaShirt = scoreProductSearch(SAMPLE_SHIRT, SAMPLE_SHOP, 'joota', CATEGORY_MASTER);
      assert.equal(jootaShoe.matched, true);
      assert.equal(jootaShirt.matched, false);

      const chappalShoe = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'chappal', CATEGORY_MASTER);
      assert.equal(chappalShoe.matched, true);
    });

    it('generates FULLTEXT + category ID + pigeonhole LIKE SQL signals', () => {
      const fashSignals = buildSqlSearchSignals('fashon', null, CATEGORY_MASTER);
      assert.ok(fashSignals.matchedCanonicalKeys.includes('fashion'));
      assert.ok(fashSignals.matchedCategoryIds.includes(5));
      assert.ok(fashSignals.likeProbes.length >= 2);
    });
  });

  describe('3. Weighted Enterprise Relevance Ranking', () => {
    it('ranks exact product name match strictly above secondary/category/typo hits', () => {
      const exactRes = scoreProductSearch(SAMPLE_SHIRT, SAMPLE_SHOP, 'silk tshirt', CATEGORY_MASTER);
      const shopOnlyRes = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'nike', CATEGORY_MASTER);
      const brandAndShoe = scoreProductSearch(SAMPLE_SHOE, SAMPLE_SHOP, 'nike running shoes', CATEGORY_MASTER);
      const brandAndShirt = scoreProductSearch(SAMPLE_SHIRT, SAMPLE_SHOP, 'nike running shoes', CATEGORY_MASTER);

      assert.ok(exactRes.score > shopOnlyRes.score);
      assert.equal(brandAndShoe.matched, true);
      assert.equal(brandAndShirt.matched, false);

      const shopEval = scoreBusinessSearch(SAMPLE_SHOP, 'nike', CATEGORY_MASTER);
      assert.equal(shopEval.matched, true);
      assert.ok(shopEval.score >= 100);
    });
  });

  describe('4. Live DB-Managed Synonym CRUD + Nearby Search + Suggestions + Analytics', () => {
    it('has seeded Hinglish & English synonyms in MariaDB', async () => {
      const list = await listSearchSynonyms();
      assert.ok(Array.isArray(list));
      assert.ok(list.length >= 80, `Expected >=80 seeded synonyms, found ${list.length}`);
      const hasKapde = list.some((s) => s.term === 'kapde' && s.canonical_key === 'fashion' && s.is_active);
      assert.equal(hasKapde, true);
    });

    it('creates a live custom Hinglish term in DB, reflects immediately in nearby search, then cleans up', async () => {
      const uniqueTerm = 'kurtapajamatestx';
      const created = await createSearchSynonym({
        canonical_key: 'fashion',
        category_id: 5,
        term: uniqueTerm,
        language: 'hi_latn',
        weight: 1.1,
      });
      createdSynonymIds.push(created.id);
      assert.equal(created.term, uniqueTerm);

      const config = await getDynamicSynonymConfig(true);
      assert.equal(config.aliasToCanonical[uniqueTerm], 'fashion');

      testQueriesLogged.push(uniqueTerm);
      const nearby = await getPublicProductsNearby({
        q: uniqueTerm,
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
        _skipLog: true,
      });
      assert.ok(nearby.products.some((p) => Number(p.id) === 115), 'Expected Fashion product #115 via custom DB synonym');

      const disabled = await updateSearchSynonym(created.id, { is_active: false });
      assert.equal(disabled.is_active, false);

      const deleted = await deleteSearchSynonym(created.id);
      assert.equal(deleted, true);
    });

    it('returns live DB nearby products for typos "tsirt" and Hinglish "kapde" with search_meta', async () => {
      const typoRes = await getPublicProductsNearby({
        q: 'tsirt',
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
        _skipLog: true,
      });
      assert.ok(typoRes.products.length >= 1);
      assert.ok(typoRes.products.some((p) => Number(p.id) === 115));
      assert.equal(typoRes.search_meta.matched_via_typo, true);
      assert.ok(typoRes.search_meta.did_you_mean);

      const kapdeRes = await getPublicProductsNearby({
        q: 'kapde',
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
        _skipLog: true,
      });
      assert.ok(kapdeRes.products.some((p) => Number(p.id) === 115));
      assert.equal(
        kapdeRes.products.some((p) => Number(p.id) === 101),
        false,
        'Hinglish "kapde" must NOT leak Footwear Running Shoes #101'
      );

      const bizTypoRes = await getNearbyBusinesses({
        search: 'fashon',
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
        _skipLog: true,
      });
      assert.ok(Array.isArray(bizTypoRes.businesses));
      assert.ok(bizTypoRes.search_meta);
    });

    it('returns autocomplete suggestions and logs + summarizes search analytics', async () => {
      const sug = await getPublicSearchSuggestions({
        q: 'shose',
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
      });
      assert.equal(sug.query, 'shose');
      assert.ok(Array.isArray(sug.products));
      assert.ok(sug.products.length >= 1);
      assert.ok(sug.did_you_mean);

      // Verify search log + dedup on live query
      testQueriesLogged.push('tsirtunittestprobe');
      await getPublicProductsNearby({
        q: 'tsirtUnitTestProbe',
        lat: 25.578,
        lng: 85.044,
        radius_km: 25,
        source: 'unit_test',
      });
      // Give fire-and-forget async log writer a brief tick
      await new Promise((r) => setTimeout(r, 250));

      const analytics = await getSearchAnalyticsSummary({ days: 7 });
      assert.ok(typeof analytics.total_searches === 'number');
      assert.ok(Array.isArray(analytics.failed_searches));
      assert.ok(Array.isArray(analytics.top_searches));
      assert.ok(analytics.active_synonym_count >= 80);
    });
  });
});
