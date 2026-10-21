# SMARTGALI — SOCIETY SERVICE COVERAGE & PROVIDER APPROVAL AUDIT
**Document Version:** 1.0.0  
**Phase:** Phase 1 — Comprehensive Architectural Audit  
**Author:** Antigravity Advanced Agentic Systems  
**Date:** 2026-10-17  

---

## 1. Executive Summary

This audit assesses the existing SmartGali backend (Node.js ES Modules, Express, MySQL, Sequelize) and Flutter mobile application to prepare for hardening **Society Service Coverage and Provider Approval**.

Currently, Step 4 provides a unified Location Master, explicit coverage origins, multi-coverage areas (`service_coverage_areas`), Haversine distance validation, and a high-level `coverage_scope` (`PUBLIC`, `SOCIETY`, `SOCIETY_AND_PUBLIC`).

However, **Society Coverage currently lacks a formal approval and governance lifecycle**. Being geographically inside a provider's radius or entering a `society_id` must **NOT** automatically grant permission to operate inside a gated residential community. Gated communities require explicit **Society Admin authorization** for specific services offered by specific providers.

This audit details what already exists, what can be reused, identified gaps, required schema changes, API endpoints, permissions, notifications, audit events, and the exact files requiring modification.

---

## 2. Audit of Existing Components (12 Key Areas)

### 2.1 Existing Society Model & Table
- **Model File:** `src/modules/society_profile/society_profile.model.js`
- **Database Table:** `society_profiles`
- **Key Fields:**
  - `id` (INT, PK)
  - `user_id` (INT, FK -> users, society creator/owner)
  - `society_name` (VARCHAR)
  - `registration_no` (VARCHAR)
  - `address` (TEXT)
  - `latitude`, `longitude` (DECIMAL)
  - `total_flats` (INT)
  - `is_active` (BOOLEAN)
  - `is_deleted` (BOOLEAN)
- **Status:** Fully functional. Reused as the authoritative residential community record.

---

### 2.2 Society Admin / Community Admin Roles & Context
- **Middleware:** `src/middleware/societyAuth.middleware.js`
- **Policy Utility:** `src/modules/society_profile/society.policy.js`
- **Existing Logic:**
  - `resolveSocietyId(req)` resolves target `society_id` from headers (`x-society-id`), route params, query, body, or active membership.
  - `loadSocietyAccessContext(req)` checks if the user is `isOwner`, `isGlobalAdminUser`, or holds active `SocietyMember` role `'admin'`.
  - `requireSocietyRole(['admin', 'committee'])` ensures cross-society tenant isolation (a Society Admin of Society A **cannot** access Society B).
- **Status:** Robust and tenant-isolated. Ready to secure Society Service Access approval endpoints.

---

### 2.3 Existing Society Membership Model
- **Model File:** `src/modules/society_member/society_member.model.js`
- **Database Table:** `society_members`
- **Key Fields:**
  - `id` (INT, PK)
  - `society_id` (INT, FK -> `society_profiles.id`)
  - `user_id` (INT, FK -> `users.userId`)
  - `role` (ENUM: `'admin'`, `'resident'`, `'committee'`, `'security'`, `'treasurer'`, etc.)
  - `status` (ENUM: `'active'`, `'pending'`, `'rejected'`, `'inactive'`)
  - `flat_number` (VARCHAR)
  - `is_deleted` (BOOLEAN)
- **Status:** **This is the authoritative anchor for Resident Society Identification.** A resident cannot spoof `society_id` by passing an arbitrary parameter; the backend verifies active membership in `society_members`.

---

### 2.4 Existing Coverage Engine (`service_coverage.service.js`)
- **Location:** `src/modules/service_booking/service_coverage.service.js`
- **Current Logic:**
  - Evaluates `coverage_scope` (`PUBLIC`, `SOCIETY`, `SOCIETY_AND_PUBLIC`).
  - Evaluates `coverage_method` (`RADIUS`, `LOCALITY`, `PINCODE`, `CITY`, `SOCIETY`).
  - Calculates Haversine distance $d$ and compares against `resolved_radius_km`.
- **Identified Gap:**
  - When evaluating `coverage_scope === 'SOCIETY'` or `customerSocietyId`, it only checked if `customerSocietyId === area.society_id`.
  - It did **not** verify whether the provider's service listing was formally **APPROVED** by that Society's administration.
- **Modification Required:**
  - Integrate a query to `SocietyServiceAccess` to ensure `status === 'APPROVED'` before returning `eligible: true`.

---

### 2.5 Existing Service Listing Model
- **Model File:** `src/modules/service_listing/service_listing.model.js`
- **Database Table:** `service_listings`
- **Key Fields:** `id`, `provider_id`, `category_id`, `title`, `coverage_scope`, `is_available`, `moderation_status`.
- **Associations:** `hasMany(ServiceCoverageArea, { as: 'coverage_areas' })`.
- **Status:** Needs association: `hasMany(SocietyServiceAccess, { as: 'society_accesses' })`.

---

### 2.6 Existing Service Booking Model & Lifecycle
- **Model File:** `src/modules/service_booking/service_booking.model.js`
- **Database Table:** `service_bookings`
- **Key Fields:** `id`, `listing_id`, `provider_id`, `user_id`, `society_id`, `coverage_snapshot`.
- **Status:** Ready to store enhanced snapshot metadata (`society_access_id`, `access_status_at_booking`) to ensure historical booking immutability.

---

### 2.7 Existing Notification Infrastructure
- **Service:** `src/modules/notification/notification.service.js`
- **Function:** `emitNotification({ userId, title, message, type, data })`
- **Capabilities:**
  - Saves in-app notification in MySQL `notifications` table.
  - Sends push notification via FCM (`sendToUser`).
  - Dispatches real-time WebSocket event via Socket.IO.
- **Status:** Completely reusable for Society Service Access lifecycle events.

---

### 2.8 Existing Audit Log Infrastructure
- **Service:** `src/modules/audit_log/audit_log.service.js`
- **Function:** `audit({ actorId, action, targetType, targetId, beforeSnapshot, afterSnapshot, ... })`
- **Database Table:** `audit_logs`
- **Status:** Completely reusable for state-changing access events (`SOCIETY_SERVICE_ACCESS_REQUESTED`, `SOCIETY_SERVICE_ACCESS_APPROVED`, etc.).

---

### 2.9 Existing RBAC/PBAC Permissions
- **Service:** `src/modules/permission/permission.service.js`
- **Table:** `permissions` (`permission_code`, `module`, `description`)
- **Missing Permissions to Seed:**
  - `society.service_provider.view`
  - `society.service_provider.approve`
  - `society.service_provider.reject`
  - `society.service_provider.suspend`
  - `society.service_provider.revoke`
  - `society.service_coverage.view`
  - `society.service_coverage.manage`

---

### 2.10 Existing Admin Dashboard
- **Scope:** Web Admin (Next.js) & Mobile Admin consoles.
- **Rules:** Preserve strict separation between R001 (Super Admin) and R002 (Operational Admin) without giving system-level superadmin privileges to normal admins.

---

### 2.11 Existing Provider Step 4 UI
- **Location:** `c:\flutter\my_first_app\lib\modules\provider\create_service_screen.dart`
- **Current State:**
  - Scope selector (`PUBLIC`, `SOCIETY`, `SOCIETY_AND_PUBLIC`).
  - Method selector (`RADIUS`, `LOCALITY`, `PINCODE`, `CITY`, `SOCIETY`).
  - Live DB Society selector from `/api/v1/society`.
- **Gaps:**
  - Needs clear display of Society Access approval status (`REQUESTED`, `APPROVED`, `REJECTED`, `SUSPENDED`).
  - Provider can trigger access requests, but is strictly prohibited from self-approving.

---

### 2.12 Existing Resident Discovery & Booking Flow
- **Location:** `src/modules/service_booking/service_booking.service.js` and `create_service_flow_screen.dart`
- **Gaps:**
  - Resident discovery must only show bookable services if `SocietyServiceAccess.status === 'APPROVED'`.
  - Booking creation must perform mandatory backend re-validation.

---

## 3. What Is Missing & Needs Implementation

| Component | Missing Element | Action Required |
|---|---|---|
| **Database** | `society_service_accesses` table | Create Sequelize model and non-destructive migration |
| **API Module** | `src/modules/society_service_access/` | Create model, controller, service, validation, and routes |
| **Engine** | Authoritative Society Approval Check in `service_coverage.service.js` | Update eligibility logic to query `SocietyServiceAccess` |
| **Booking Flow** | Booking-time society access re-validation in `service_booking.service.js` | Enforce server-side check and store snapshot |
| **Permissions** | PBAC permission entries in `permissions` table | Seed required permission codes |
| **Provider UI** | Society request & approval badge display in Step 4 | Update Flutter Step 4 UI |

---

## 4. Proposed Society Service Access Model

```
       PROVIDER (ServiceProviderProfile)
                     │
                     ▼
          SERVICE LISTING (ServiceListing)
                     │
                     ▼
        SOCIETY SERVICE ACCESS (SocietyServiceAccess)
          • provider_id (FK -> service_provider_profiles)
          • service_id (FK -> service_listings)
          • society_id (FK -> society_profiles)
          • requested_by (FK -> users)
          • requested_at (DATETIME)
          • reviewed_by (FK -> users, nullable)
          • reviewed_at (DATETIME, nullable)
          • status (REQUESTED | APPROVED | REJECTED | SUSPENDED | REVOKED)
          • rejection_reason (TEXT, nullable)
          • suspension_reason (TEXT, nullable)
                     │
                     ▼
          SOCIETY (SocietyProfile)
```

**Lifecycle Rules:**
- Unique Constraint: `(provider_id, service_id, society_id)` to prevent uncontrolled duplicate active requests.
- Service-Specific Approval: Approval for "AC Repair" in Society X does **not** grant approval for "Plumbing".
- Society Isolation: Approval by Society Admin of Society A does **not** grant approval in Society B.

---

## 5. Exact Files Requiring Creation / Modification

### Backend:
1. `src/modules/society_service_access/society_service_access.model.js` (NEW)
2. `src/modules/society_service_access/society_service_access.service.js` (NEW)
3. `src/modules/society_service_access/society_service_access.controller.js` (NEW)
4. `src/modules/society_service_access/society_service_access.validation.js` (NEW)
5. `src/modules/society_service_access/society_service_access.routes.js` (NEW)
6. `src/routes/index.js` (Mount `/api/v1/society-service-access`)
7. `src/modules/service_booking/service_coverage.service.js` (Update coverage engine logic)
8. `src/modules/service_booking/service_booking.service.js` (Update booking authorization & snapshot)
9. `src/modules/service_listing/service_listing.model.js` (Associate `SocietyServiceAccess`)
10. `scripts/migrate_society_service_access.mjs` (Database migration & seed)
11. `test/society_service_coverage.enterprise.test.js` (Comprehensive 25-scenario security test suite)

### Flutter Client:
1. `lib/services/service_marketplace_service.dart` (Add Society Service Access API helpers)
2. `lib/modules/provider/create_service_screen.dart` (Update Step 4 with Access Request flow and status cards)

---

## 6. Security & Architectural Risk Assessment

- **Self-Approval Risk**: Provider token could attempt to call `/approve`.
  - *Mitigation*: The approve/reject routes will use `requireSocietyRole(['admin'])` and verify that the caller is an active admin of that specific society (`req.societyContext.societyId === access.society_id`).
- **Spoofed Society ID Risk**: Malicious customer passes `society_id` in request body.
  - *Mitigation*: The backend resolves the customer's actual society from `SocietyMember` where `user_id = req.user.id, status = 'active', is_deleted = false`. Unverified parameters are ignored.
- **Historical Snapshot Preservation**: If a provider is suspended after a booking was made, the old booking must remain valid and explainable.
  - *Mitigation*: `coverage_snapshot` on `service_bookings` preserves immutable `society_access_id` and `access_status_at_booking`.

---

## 7. Audit Conclusion & Next Steps

The existing SmartGali codebase is well-structured with clear modular MVC separation, tenant-aware middleware (`societyAuth.middleware.js`), and centralized notification/audit logging. 

We can proceed to Phase 2 (Database Schema & Model), Phase 3–5 (API & Controller implementation), Phase 7–8 (Authoritative Coverage Engine Integration), and Phase 20 (Test Suite) without disrupting existing Step 2, Step 3, or Step 4 Public coverage.
