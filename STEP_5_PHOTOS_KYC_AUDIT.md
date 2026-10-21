# SMARTGALI — STEP 5 PHOTOS & KYC BACKEND AUDIT
**Enterprise Audit Report | Source of Truth: PRD**
**Audit Date:** October 17, 2026

---

## 1. Executive Summary

This audit assesses the current state of **Service Portfolio Photos** and **Provider KYC Integration** across the SmartGali platform (Backend Express/Sequelize, MySQL database, and Flutter Mobile App).

### Core Principle
- **DO NOT rebuild existing backend architecture.**
- **DO NOT create duplicate KYC models or separate service-level KYC documents.**
- **DO NOT create duplicate file-upload/storage systems.**
- **DO NOT break Steps 1–4 (Core Attributes, Pricing, Duration, Location & Coverage).**
- **REUSE existing infrastructure; IMPLEMENT ONLY the missing elements.**

---

## 2. Detailed Audit of the 15 Target Areas

### 1. `service_listings` Table & Model
- **Status:** Already exists in MySQL and Sequelize (`src/modules/service_listing/service_listing.model.js`).
- **Media Representation:** Contains an `images` column of type `TEXT` with JSON serialization/deserialization.
- **Moderation & Availability:** Contains `moderation_status` (`'pending' | 'approved' | 'rejected'`) and `is_available` (`BOOLEAN`).
- **Owner Relationship:** Foreign key `provider_id` referencing `service_provider_profiles(id)`.

### 2. Service Media / Photo Architecture
- **Status:** Currently, `service_listings.images` holds a flat JSON array of URLs.
- **Missing:** A normalized table `service_listing_media` for granular metadata tracking (`id`, `service_id`, `provider_id`, `media_url`, `media_type`, `display_order`, `is_primary`, `status`, `created_at`, `updated_at`, `is_deleted`).
- **Decision:** Create `service_listing_media` with foreign keys and compound indexes `(service_listing_id, status)` and `(provider_id, service_listing_id)`. Maintain synchronization with `service_listings.images` for fast public read projection with zero join overhead.

### 3. Existing Multer / Upload Service
- **Status:** Already exists and is production-grade at `src/utils/fileUpload.js`.
- **Capabilities:**
  - `uploadImage(folderName = 'services')`: Validates MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), enforces 5MB file size limit (`5 * 1024 * 1024`), securely generates UUID filenames (`crypto.randomUUID()`), and sanitizes folder paths via `safeFolder()`.
  - `getImageUrl(req, file, folder)`: Generates full public URLs according to `env.publicMediaOrigin`.
  - `removeLocalUpload(fileUrl)`: Safely removes local files with strict path traversal checks against `env.uploadsPath`.
- **Verdict:** Reused 100%. No new Multer middleware needed.

### 4. File Storage Configuration
- **Status:** Configured via `src/config/env.js` pointing to `env.uploadsPath` and `env.publicMediaOrigin`.
- **Verdict:** Reused 100%.

### 5. Existing Provider KYC Models
- **Status:** Provider verification lives in `service_provider_profiles` (`src/modules/service_provider_profile/service_provider_profile.model.js`).
- **Key Columns:**
  - `is_verified` (`TINYINT(1)` / `BOOLEAN`)
  - `verification_status` (`VARCHAR(50)`: `'notSubmitted'`, `'underReview'`, `'verified'`, `'rejected'`, `'actionRequired'`)
  - `service_category_id` (`BIGINT(20)`: Provider's verified trade category)
  - `remark` (`TEXT`: Admin review feedback / reasons)
  - `updated_by` (`BIGINT(20)`: Admin who approved/rejected verification)

### 6. Provider KYC Document Categories
- **Status:** Documents in Provider KYC correspond to trade compliance:
  1. `Business License` (Commercial registration / trade license)
  2. `Qualification Certificate` (Technical diploma, ITI/NSDC trade certification)
  3. `Insurance Document` (Public liability / indemnity insurance)
- **Architecture Requirement:** Step 5 must **READ** the existing Provider KYC system status. It must NOT create service-level duplicate document models.

### 7. KYC Verification Statuses
- **Canonical Statuses:**
  - `VERIFIED`
  - `UNDER_REVIEW` / `PENDING`
  - `REJECTED`
  - `RESUBMISSION_REQUIRED` / `ACTION_REQUIRED`
  - `NOT_UPLOADED`
- **Verdict:** Authoritative backend mapping without hardcoding in the mobile UI.

### 8. Provider Verification Status
- **Status:** Enforced in `service_provider_profile.service.js` and `service_listing.service.js`.
- **Current Check:** Lines 105–131 of `service_listing.service.js` already guard against `underReview`, `rejected`, and unverified providers during service creation.

### 9. Document Access Permissions (PBAC / RBAC)
- **Status:** Handled via `src/middleware/auth.middleware.js` and `src/modules/permission/`.
- **Boundary:**
  - Portfolio photos: Publicly readable once service is active & approved.
  - KYC documents: Strictly confidential. Accessible only to the provider themselves and authorized Admins (`R001 Super Admin`, `R002 Admin`).

### 10. Existing Notification Service
- **Status:** Operational at `src/modules/notification/notification.service.js`.
- **Capabilities:** Non-blocking `emitNotification()` with DB persistence, WebSocket broadcasting, and optional FCM push.
- **Verdict:** Reused 100% for `SERVICE_SUBMITTED`, `SERVICE_MEDIA_UPLOADED`, and KYC alerts.

### 11. Existing Audit Service
- **Status:** Operational at `src/modules/audit_log/audit_log.service.js`.
- **Capabilities:** Non-blocking `audit({ actorId, action, targetType, targetId, before, after })`.
- **Verdict:** Reused 100% for `SERVICE_MEDIA_UPLOADED`, `SERVICE_MEDIA_DELETED`, `SERVICE_SUBMITTED`, `SERVICE_KYC_VALIDATION_FAILED`.

### 12. Existing Service Listing Create / Update Flow
- **Status:** `createListing` and `updateListing` in `service_listing.service.js`.
- **Current Behavior:** Takes `images` array and saves to listing, but lacks dedicated media sub-resource endpoints for atomic upload/delete and server-side count validation (max 5).

### 13. Publish / Review Lifecycle
- **Status:** Status transitions: `draft` -> `pending` (submitted for review) -> `approved` / `rejected`.
- **Gap:** Need a formal `submitListingForReview(serviceId, actorUser)` endpoint validating that required KYC documents are verified and portfolio photo count is <= 5 before submission.

### 14. Existing Flutter Step 5 Implementation
- **Status:** `lib/modules/provider/create_service_screen.dart` (lines 2380–2460).
- **Current Gaps:**
  - `_photos` is initialized with mock Unsplash image URLs.
  - Adding a photo appends a static Unsplash URL instead of picking and uploading real files to the backend.
  - `_uploadedDocs` is hardcoded to `{'Business License': true, 'Qualification Certificate': true, 'Insurance Document': false}`.
  - `_submitService` currently does not pass `images: _photos` to `createListing`.

### 15. Existing Admin Provider Verification UI
- **Status:** In `service_provider_profile.service.js`, `verifyProfile` allows Admins to inspect, approve, or reject provider verification and trigger notifications.

---

## 3. What Already Exists vs. What is Missing

| Component | Exists? | Action |
| :--- | :---: | :--- |
| `service_listings` table | Yes | Reuse existing table & model |
| `service_listings.images` JSON column | Yes | Keep synchronized as read cache |
| `service_listing_media` normalized table | **No** | **Create table via migration with indexes** |
| Multer upload middleware (`uploadImage`) | Yes | Reuse `src/utils/fileUpload.js` (5MB limit, JPEG/PNG/WebP/GIF) |
| File deletion utility (`removeLocalUpload`) | Yes | Reuse `src/utils/fileUpload.js` |
| Provider KYC status (`is_verified`, `verification_status`) | Yes | Reuse `service_provider_profiles` |
| Dedicated Media CRUD APIs (`/media`, `/:mediaId`) | **No** | **Implement in `service_listing.routes.js` & `service_listing.service.js`** |
| Provider KYC Status API for Step 5 | **No** | **Implement `GET /service-listing/:id/kyc-status`** |
| Server-side Max 5 Photos Enforcement | Partial | **Implement strict server-side validation (HTTP 400 when > 5)** |
| Photo Ownership Verification | Partial | **Enforce provider ownership (HTTP 403 on cross-provider tampering)** |
| Final Service Submission Validation | Partial | **Implement `POST /service-listing/:id/submit` validating KYC & media** |
| Flutter Step 5 live integration | Partial | **Connect real upload, delete, count, and live KYC status display** |
| Enterprise Step 5 Test Suite (25 Tests) | **No** | **Create `src/tests/service_step5_photos_kyc.enterprise.test.js`** |

---

## 4. Duplicate Systems That Must NOT Be Created
1. **DO NOT** create a second `service_kyc_documents` table. KYC belongs to the Provider Profile.
2. **DO NOT** create a second Multer/upload utility. Use `src/utils/fileUpload.js`.
3. **DO NOT** create a separate notification or audit system. Use existing `emitNotification` and `audit`.
4. **DO NOT** create a duplicate role/permission system. Use existing JWT + RBAC/PBAC.

---

## 5. Security & Privacy Gaps Identified
1. **Cross-Provider Tampering:** A provider must NEVER be able to upload or delete photos on another provider's listing. Ownership must be verified against `req.user.id` -> `service_provider_profiles.id`.
2. **Public Projection Leakage:** KYC verification documents, private files, and internal remarks must NEVER be included in `toPublicServiceListing` or `toPublicProviderProfile`. Only safe portfolio photo URLs are exposed.
3. **MIME/Extension Spoofing:** Enforced by Multer MIME filter and extension mapping.

---

## 6. Implementation Plan & File Touchpoints

1. **Database Migration:**
   - Script: `scripts/migrate_service_listing_media.mjs`
   - Table: `service_listing_media` with foreign keys to `service_listings` and `service_provider_profiles`.
2. **Sequelize Model:**
   - File: `src/modules/service_listing/service_listing_media.model.js`
3. **Backend Service & Controller:**
   - File: `src/modules/service_listing/service_listing.service.js`
     - `uploadServiceListingMedia(serviceId, providerUserId, file)`
     - `getServiceListingMedia(serviceId)`
     - `deleteServiceListingMedia(serviceId, mediaId, providerUserId)`
     - `getServiceListingKycStatus(serviceId, providerUserId)`
     - `submitServiceListingForReview(serviceId, actorUser)`
   - File: `src/modules/service_listing/service_listing.controller.js`
   - File: `src/modules/service_listing/service_listing.routes.js`
4. **Public Projection Validation:**
   - File: `src/modules/service_listing/service_listing.projection.js`
5. **Flutter Step 5 UI & Service Integration:**
   - File: `my_first_app/lib/modules/provider/create_service_screen.dart`
   - File: `my_first_app/lib/services/service_marketplace_service.dart`
6. **Automated Enterprise Test Suite:**
   - File: `src/tests/service_step5_photos_kyc.enterprise.test.js` (25 automated test scenarios).
