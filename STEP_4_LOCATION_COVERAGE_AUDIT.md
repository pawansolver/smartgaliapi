# SMARTGALI — STEP 4 ENTERPRISE LOCATION & SERVICE COVERAGE AUDIT
## Comprehensive Architectural Audit, Gap Analysis & Hardening Blueprint

**Project:** SmartGali Services Marketplace  
**Subsystem:** Step 4 Enterprise Location & Service Coverage Hardening  
**Date:** October 17, 2026  
**Auditor:** Senior Enterprise Backend Architect & Geospatial Systems Engineer  
**Status:** Audit Completed — Implementation Gaps Identified  

---

## 1. EXECUTIVE SUMMARY & CURRENT ARCHITECTURE

SmartGali's existing backend is built with **Node.js (ES Modules)**, **Express.js 4.18.2**, **MySQL**, **Sequelize 6.35.1**, **Redis/ioredis**, and **Socket.IO**.
Step 2 (Pricing Engine) and Step 3 (Duration, Buffer, Execution & Capacity Engine) are fully operational and backed by database master tables.
Step 4 (Service Coverage) currently exists in a basic single-radius/fallback configuration. 

While the existing `service_coverage.service.js` implements the Haversine great-circle distance algorithm and evaluates incoming booking locations, the current implementation treats location as flat JSON strings, lacks normalized location masters, couples the provider's general profile address to service radius origins, lacks multi-coverage area support, and does not record a comprehensive historical coverage snapshot at booking time.

---

## 2. AUDIT FINDINGS: QUESTIONS A THROUGH J

| # | Audit Dimension | Current Implementation Reality | Architectural Assessment |
|---|---|---|---|
| **A** | **How location is currently stored** | • `service_provider_profiles.service_area` stores a loose JSON text column (`city`, `localities: []`, `pincodes: []`, `radiusKm`, `centerLatitude`, `centerLongitude`).<br>• `service_listings` has only single foreign keys: `service_area_type_id` and `radius_option_id`.<br>• `society_profiles` has `address`, `latitude`, `longitude`.<br>• `user_addresses` has `house_no`, `street`, `landmark`, `city`, `latitude`, `longitude`.<br>• **No normalized Location Master tables (Country, State, City, Locality, Pincode) exist.** | **DEFICIENT:** Relies on unstructured JSON and free-text strings. No normalized IDs for localities, pincodes, or cities. |
| **B** | **How provider coverage origin is currently resolved** | In `service_coverage.service.js`, `resolveProviderCoverageConfig` inspects `providerProfile.service_area.centerLatitude` / `centerLongitude`. If not found, it falls back to hardcoded Patna center coords (`25.5941, 85.1376`). | **NON-COMPLIANT:** Origin is bound to the provider's account profile or hardcoded fallback, rather than the specific service listing or coverage area. |
| **C** | **Whether radius currently has a proper origin** | **NO.** Radius is defined only as a number (e.g. 10 KM) paired with the provider profile's center coordinates. There is no explicit coverage origin configured per service listing or per coverage area. | **HIGH RISK:** A radius without an explicit coverage origin is operationally meaningless. |
| **D** | **Whether provider can configure multiple coverage areas** | **NO.** `service_listings` only accommodates a single `service_area_type_id` and single `radius_option_id`. No child table exists for multiple coverage areas (e.g. Kankarbagh 10 KM + Rajendra Nagar 5 KM). | **DEFICIENT:** A provider offering service in multiple hubs cannot specify independent origins and radii. |
| **E** | **Whether locality/pincode/city are normalized** | **NO.** Localities and pincodes are stored as arrays of strings in JSON (`['Kankarbagh', 'Rajendra Nagar']`). No foreign keys or master records exist. | **VULNERABLE:** String comparison suffers from case/whitespace/spelling discrepancies and cannot support relational integrity. |
| **F** | **Whether society coverage is separated from public coverage** | **NO.** There is no dedicated `coverage_scope` enum (`PUBLIC`, `SOCIETY`, `SOCIETY_AND_PUBLIC`). The engine merely checks if `society_id` is passed to look up coordinates from `society_profiles`. | **DEFICIENT:** Society-only services cannot be prevented from being discovered or booked by general public users. |
| **G** | **Whether customer booking coordinates are stored** | **YES.** `service_bookings` table has `latitude` (DECIMAL 10,8), `longitude` (DECIMAL 11,8), `service_address`, and `society_id`. | **ADEQUATE:** Coordinate capture exists, but requires authoritative backend distance calculation and coverage matching. |
| **H** | **Whether coverage is checked at booking creation** | **YES.** `service_booking.service.js` invokes `validateCustomerCoverageEligibility` during `createBooking`. If not eligible, it throws HTTP 409 Conflict. | **ADEQUATE FOUNDATION:** Runtime check is in place, but must be hardened to evaluate multiple coverage areas and store immutable coverage snapshots. |
| **I** | **Whether frontend is incorrectly treating city/locality as radius origin** | **YES.** In Flutter `create_service_screen.dart`, Step 4 has a radius dropdown and locality checkboxes with no map coordinate picker or explicit origin association. | **MISALIGNED:** Frontend treats radius as a standalone dropdown with disconnected locality checkboxes. |
| **J** | **Whether provider private/home coordinates are being exposed** | **YES (POTENTIAL LEAK):** If provider home GPS was entered in `service_area`, it was used as coverage origin and could be returned in listing responses if not sanitized. | **PRIVACY RISK:** Must strictly separate provider personal address from service coverage origin and mask origin coordinates in public APIs. |

---

## 3. EXISTING TABLES, MODELS & FIELDS

### 3.1 `service_listings`
- `service_area_type_id` (BIGINT nullable) -> references `service_area_types(id)`
- `radius_option_id` (BIGINT nullable) -> references `service_radius_options(id)`
- Missing: Relation to multiple coverage areas, coverage scope, coverage origin coordinates.

### 3.2 `service_area_types` (Master)
- Existing seed data:
  1. `CITY_WIDE` (Entire City)
  2. `SPECIFIC_LOCALITIES` (Specific Localities / Sectors)
  3. `RADIUS` (Within Radial Distance)
  4. `PINCODE` (Specific Postal Pincodes)
- Missing: `SOCIETY` coverage method.

### 3.3 `service_radius_options` (Master)
- Existing seed data: 5 KM, 10 KM, 15 KM, 20 KM, 30 KM, 50 KM.
- Managed by Admin, has `radius_km`, `is_active`, `display_order`.

### 3.4 `service_provider_profiles`
- `service_area` (JSON text): `{ city: 'Patna', localities: [], pincodes: [], radiusKm: 15, centerLatitude: 25.5941, centerLongitude: 85.1376 }`
- Flaw: Single unstructured field mixes operational base, city, and radius.

### 3.5 `service_bookings`
- `service_address` (TEXT)
- `society_id` (BIGINT nullable)
- `latitude` (DECIMAL 10,8 nullable)
- `longitude` (DECIMAL 11,8 nullable)
- `price_snapshot` (JSON text) -> currently stores minimal `distance_km` and `coverage_area_type`.
- Missing: Dedicated `coverage_snapshot` containing `coverage_area_id`, `coverage_method`, `coverage_scope`, `allowed_radius_km`, `distance_km`, `evaluated_at`.

---

## 4. GAPS IDENTIFIED AGAINST ENTERPRISE PRD & REQUIREMENTS

1. **Absence of Normalized Location Master Hierarchy:**
   - No `countries`, `states`, `cities`, `localities`, `pincodes` tables.
   - String comparisons (`custCity.toLowerCase() === provCity.toLowerCase()`) are brittle and non-standard.

2. **Single Coverage Area Limitation:**
   - Service listings can currently only have one radius and one area type.
   - Requirements mandate support for multiple coverage areas per service (e.g., Kankarbagh 10 KM + Rajendra Nagar 5 KM).

3. **Missing Explicit Coverage Origin Separation:**
   - A radius has no explicit lat/long origin on the service coverage area level.
   - Localities lack reference coordinates/centroids that can be chosen as service origins.

4. **Lack of Coverage Scope Distinction:**
   - `PUBLIC`, `SOCIETY`, and `SOCIETY_AND_PUBLIC` are not explicitly modeled or enforced.
   - Unauthorized guests or outside residents can attempt to book private society services.

5. **Incomplete Historical Booking Coverage Snapshot:**
   - When a booking succeeds, the exact matched coverage area and rule are not immutably preserved in a dedicated coverage snapshot.

6. **Provider UI Step 4 Disconnect:**
   - The Flutter provider UI does not provide search + map pin selection for coverage origins, nor does it support adding/editing/removing multiple coverage areas.

---

## 5. HARDENING ACTION PLAN & ARCHITECTURE BLUEPRINT

### Part 1: Location Master Hierarchy
Create normalized Location Master models and tables:
- `countries` (id, name, iso_code, phone_code, is_active)
- `states` (id, country_id, name, code, is_active)
- `cities` (id, state_id, name, code, latitude, longitude, is_active)
- `localities` (id, city_id, name, normalized_name, latitude, longitude, is_active)
- `pincodes` (id, city_id, pincode, is_active)
- Seed India / Bihar / Patna with initial localities (Kankarbagh, Rajendra Nagar, Boring Road, Bailey Road, Danapur, Patliputra) and pincodes (800001, 800016, 800020).

### Part 2 & 4: Service Coverage Areas (`service_coverage_areas`)
Create a normalized child table for `ServiceListing`:
- `id` (BIGINT PK)
- `service_id` (BIGINT FK -> service_listings.id)
- `coverage_scope` (ENUM: 'PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC')
- `coverage_method` (ENUM: 'RADIUS', 'LOCALITY', 'PINCODE', 'CITY', 'SOCIETY')
- `city_id` (BIGINT FK nullable -> cities.id)
- `locality_id` (BIGINT FK nullable -> localities.id)
- `pincode_id` (BIGINT FK nullable -> pincodes.id)
- `society_id` (BIGINT FK nullable -> society_profiles.id)
- `origin_latitude` (DECIMAL 10,8 nullable)
- `origin_longitude` (DECIMAL 11,8 nullable)
- `origin_address` (VARCHAR 255 nullable)
- `radius_option_id` (BIGINT FK nullable -> service_radius_options.id)
- `resolved_radius_km` (DECIMAL 6,2 nullable)
- `is_active` (BOOLEAN default true)
- `display_order` (INTEGER default 0)
- Timestamps and common fields.

### Part 6: Radius Rule Enforcement
- Radius MUST be resolved from `service_radius_options.id`.
- Client-supplied raw radius numbers are rejected.

### Part 9: Multi-Area Authoritative Coverage Engine
Hardened `validateCustomerCoverageEligibility` in `service_coverage.service.js`:
- Fetch all active coverage areas for the listing.
- If listing has no specific coverage areas configured, fall back gracefully to legacy single-area config.
- Evaluate each active coverage area:
  - Scope check (PUBLIC vs SOCIETY vs GUEST).
  - Method check (RADIUS via Haversine, LOCALITY match, PINCODE match, CITY match, SOCIETY match).
- If ANY active area matches -> **PASS** (`eligible: true`, `matchedCoverageAreaId`, `distanceKm`, `allowedRadiusKm`).
- If none match -> **FAIL** with consistent error code `OUT_OF_SERVICE_AREA`.

### Part 16: Coverage Snapshot on Booking
Add `coverage_snapshot` JSON column to `service_bookings` to store:
- `coverage_area_id`, `coverage_method`, `coverage_scope`, `distance_km`, `allowed_radius_km`, `city_id`, `locality_id`, `pincode_id`, `society_id`, `evaluated_at`.

### Part 18: Provider UI Step 4 Hardening
Update `create_service_screen.dart`:
- Scope selection: Public / Society / Society + Public.
- Add Coverage Area card flow: Method (Radius, Locality, Pincode, City, Society).
- For Radius: Search location / Choose origin pin + Select radius from Admin master.
- Support multiple coverage areas list with add, edit, and remove.

---

## 6. EXACT FILES REQUIRING MODIFICATION

1. **Backend Database & Models:**
   - Create `src/modules/location_master/location_master.models.js` (Country, State, City, Locality, Pincode).
   - Create `src/modules/service_listing/service_coverage_area.model.js` (ServiceCoverageArea).
   - Update `src/modules/service_listing/service_listing.model.js` (associate `hasMany(ServiceCoverageArea, { as: 'coverage_areas' })`).
   - Update `src/modules/service_booking/service_booking.model.js` (add `coverage_snapshot` column).
   - Create non-destructive migration script `scripts/migrate_step4_coverage_hardening.mjs`.

2. **Backend Services & Validation:**
   - Update `src/modules/service_booking/service_coverage.service.js` (authoritative multi-area evaluation, Haversine, scope gate, normalized IDs).
   - Update `src/modules/service_booking/service_booking.service.js` (record `coverage_snapshot` in `createBooking`).
   - Update `src/modules/service_listing/service_listing.service.js` (support child coverage areas creation, updating, retrieval, and validation).
   - Update `src/modules/service_listing/service_listing.validation.js` (validate `coverage_areas` payload).
   - Update `src/modules/service_listing/service_listing.projection.js` (mask sensitive origin coords for public view).
   - Add routes and controller in `src/modules/location_master/` for location master search and discovery.

3. **Frontend Flutter App:**
   - Update `lib/modules/provider/create_service_screen.dart` (Step 4 UI for multi-area configuration, scope, map origin selection, radius master dropdown).
   - Update `lib/services/service_marketplace_service.dart` (pass `coverage_areas` payload and consume location master APIs).

4. **Testing Suite:**
   - Create `test/step4_location_coverage_hardening.test.js` covering all 25 security and operational rules.

---

## 7. BACKWARD COMPATIBILITY RISKS & MITIGATIONS

- **Existing Listings:** Legacy listings without `service_coverage_areas` records will automatically fall back to their `service_area_type_id` and `radius_option_id`, preventing any breakage of existing active listings.
- **Historical Bookings:** Historical bookings retain their existing timestamps, prices, and status. The newly added `coverage_snapshot` will be populated for all new bookings while existing bookings remain untouched.
- **Database Non-Destructive Migrations:** Only new tables and non-nullable columns with sensible defaults are added. No existing tables, foreign keys, or indexes are dropped.
- **Step 2 & Step 3 Regressions:** Step 2 pricing calculations and Step 3 duration/buffer/occupancy checks remain untouched in their authoritative service files.
