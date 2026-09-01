# SmartGali Society Module — Enterprise Architecture & Security Audit Report

**Date:** September 1, 2026  
**Target Codebase:** `SmartGali Backend (Express.js, Sequelize, MySQL/PostgreSQL, Redis, BullMQ, Socket.IO)`  
**Audit Scope:** `src/modules/society_*`, `src/routes/index.js`, `src/socket.js`, `src/middleware/`, Database Schemas & Observability  
**Overall Status:** ⚠️ **CRITICAL VULNERABILITIES & ARCHITECTURAL GAPS IDENTIFIED**

---

## Executive Summary

A comprehensive architectural, security, database, concurrency, and performance audit of the **Society Management Subsystem** in SmartGali was conducted across all 8 constituent modules:
1. `society_profile` (Society Master Entity)
2. `society_member` (Residents, Tenants, Committee, Admins)
3. `society_announcement` (Circulars & Notices)
4. `society_complaint` (Helpdesk & Grievance Tickets)
5. `society_facility` (Amenities & Common Areas)
6. `society_parking` (Parking Slots & Vehicle Allotments)
7. `society_poll` (Resident Polls & Voting)
8. `society_visitor` (Gate Pass & Security Log)

### Key Audit Verdict:
While core CRUD skeletons exist for each entity, the subsystem is currently **in a prototype state** with **critical security bypasses**, missing authentication middleware, zero role-based access control (RBAC), unbounded queries (potential memory exhaustion / DoS), lack of transactional integrity, no real-time gate visitor sync via Socket.IO/Outbox, no Joi validation, and **zero automated test coverage**.

---

## 1. Component-by-Component Inventory & Status

| Module / Component | Target Files | Current Status | Findings & Deficiencies |
| :--- | :--- | :--- | :--- |
| **Society Profile** | `src/modules/society_profile/*` | Prototype CRUD | • **No Auth Middleware** on routes.<br>• Unbounded `getAllProfiles` table scan.<br>• Missing spatial coordinates indexing & discovery.<br>• No creator-to-admin auto-binding transaction. |
| **Society Member** | `src/modules/society_member/*` | Prototype CRUD | • **No Auth Middleware**.<br>• Missing state machine validation (`pending` ➔ `active` ➔ `rejected` / `inactive`).<br>• **No Last-Admin Guard** (sole admin can leave or be demoted).<br>• No check for flat occupancy duplicate. |
| **Society Announcement** | `src/modules/society_announcement/*` | Prototype CRUD | • **No Auth Middleware** (anyone can publish/delete notices).<br>• Missing `is_pinned`, `priority`, `expiry_date`, and media attachments.<br>• No Outbox dispatch or real-time broadcast. |
| **Society Complaint** | `src/modules/society_complaint/*` | Prototype CRUD | • **No Auth Middleware** & severe IDOR vulnerability.<br>• Any user can view/resolve/delete other residents' complaints.<br>• Missing SLA tracking, assigned-to staff, and comments/history trail. |
| **Society Facility** | `src/modules/society_facility/*` | Prototype CRUD | • **No Auth Middleware**.<br>• Missing booking rules (max slots, operating hours, active status).<br>• No Redis caching for amenity lookups. |
| **Society Parking** | `src/modules/society_parking/*` | Prototype CRUD | • Primary Key mismatch (`parkingId` vs standard `id`).<br>• No duplicate slot guard per society (concurrency race condition).<br>• Missing vehicle verification state. |
| **Society Poll** | `src/modules/society_poll/*` | Prototype CRUD | • Primary Key mismatch (`pollId`).<br>• **Missing Voting Table (`society_poll_votes`)**; only JSON text options exist.<br>• No vote casting endpoint, no atomic increment, no user duplicate vote prevention. |
| **Society Visitor** | `src/modules/society_visitor/*` | Prototype CRUD | • Primary Key mismatch (`visitorId`).<br>• **No Auth Middleware**; visitor logs exposed publicly.<br>• Missing resident approval flow (`pre_approved`, `approved`, `denied`).<br>• No real-time Socket.IO notification to resident when visitor arrives at gate. |

---

## 2. Deep-Dive Vulnerability & Risk Matrix

| Risk ID | Category | Severity | Description | Recommended Mitigation | Affected Files |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Authentication | **CRITICAL** | **100% Unauthenticated Endpoints**: None of the 8 society route files mount `authenticateToken`. Anyone on the internet can read, modify, or delete all records. | Mount `authenticateToken` globally or per-route across all society endpoints. | `src/modules/society_*/society_*.routes.js` |
| **SEC-02** | Authorization | **CRITICAL** | **IDOR & Missing RBAC**: Lack of `societyAuth.middleware.js` and `society.policy.js`. Residents can modify or delete complaints, visitors, and announcements of other societies and users. | Implement centralized `society.policy.js` and `requireSocietyMember`, `requireSocietyRole(['admin', 'committee'])` middleware. | `src/middleware/societyAuth.middleware.js`, `society.policy.js` |
| **SEC-03** | Authorization | **HIGH** | **Orphaned Society (No Last-Admin Guard)**: A society's sole admin or creator can leave or be soft-deleted, leaving the society with zero administrators. | Add state machine validation & last active admin guard in `society_member.service.js`. | `src/modules/society_member/society_member.service.js` |
| **SEC-04** | Input Validation | **HIGH** | **Missing Joi Schemas**: Requests are processed without schema validation or type casting, leading to unhandled SQL errors on invalid payloads. | Create `society.validation.js` with comprehensive Joi schemas and apply `validateRequest`. | `src/modules/society_*/society_*.validation.js` |
| **DAT-01** | Data Integrity | **HIGH** | **Poll Subsystem Missing Vote Engine**: `society_polls` has no votes table. Users cannot cast votes, and vote integrity cannot be enforced. | Create `society_poll_votes` table with atomic row-locking (`FOR UPDATE`) and unique constraint `(poll_id, user_id)`. | `society_poll.model.js`, `society_poll_vote.model.js`, migration |
| **DAT-02** | Data Integrity | **MEDIUM** | **Inconsistent Primary Keys**: Models mix `id` with camelCase `parkingId`, `pollId`, `visitorId`, breaking ORM convention and API uniformity. | Standardize primary keys to `id` or add clean aliasing in models and controllers. | `society_parking.model.js`, `society_poll.model.js`, `society_visitor.model.js` |
| **PRF-01** | Performance | **HIGH** | **Unbounded Queries & Missing Pagination**: All `getAll*` methods execute `findAll({ where: { is_deleted: false } })` over the entire table without `limit`, `offset`, or `society_id` scoping. | Implement keyset cursor/offset pagination and mandatory `society_id` scoping on all list endpoints. | All `society_*.service.js` |
| **REL-01** | Performance & Cache | **MEDIUM** | **Zero Cache-Aside Layer**: Static society profiles, facilities, and pinned announcements are fetched from DB on every hit without Redis caching. | Implement `society.cache.js` with deterministic TTLs and event-based cache invalidation. | `society.cache.js` |
| **INT-01** | Real-time & Sockets | **HIGH** | **Missing Socket.IO Gate & Society Rooms**: Gate security cannot ping residents in real-time when visitors arrive (`visitor:arrived`). | Add `user:join:society` and `visitor:created` / `visitor:status_changed` socket events in `src/socket.js`. | `src/socket.js` |
| **INT-02** | Messaging & Outbox | **MEDIUM** | **Missing Transactional Outbox Events**: Announcements, visitor arrivals, and urgent complaints are not emitted to BullMQ outbox worker. | Inject `createEvent(..., { transaction })` for society domain events. | `src/modules/outbox/outbox.service.js`, services |
| **OBS-01** | Observability | **LOW** | **Missing Prometheus Metrics**: Zero telemetry counters for visitor checks, complaint resolutions, active society joins. | Add Prometheus counters and histograms to `src/monitoring/metrics.js`. | `src/monitoring/metrics.js` |
| **TST-01** | Quality Assurance | **HIGH** | **0% Test Coverage**: No tests exist in `test/` for any of the society modules. | Add unit, security, concurrency, and integration test suites (`test/society.test.js`, `test/society.security.test.js`). | `test/society.*.test.js` |

---

## 3. Detailed Architecture Comparison: Community Subsystem vs Society Subsystem

| Dimension | Community Module (Hardened & Mature) | Society Module (Current State) |
| :--- | :--- | :--- |
| **Authentication** | Enforced via `authenticateToken` | ❌ Missing on all 8 routes |
| **RBAC / Policy Layer** | Centralized `community.policy.js` (Capabilities, Owner bypass, Last-Admin check) | ❌ None (direct DB updates) |
| **Tenancy Isolation** | Scoped strictly by `community_id` & membership | ❌ Global table scans without scoping |
| **Validation Layer** | Comprehensive Joi schemas (`community.validation.js`) | ❌ None |
| **Concurrency & Locks** | Row locking (`LOCK.UPDATE`) for votes & join approvals | ❌ None (Race condition prone) |
| **Caching Layer** | Redis cache-aside with tag invalidation (`community.cache.js`) | ❌ Direct DB hits only |
| **Real-Time Integration** | Socket.IO `user:join:community`, live room revoke | ❌ No society socket channels |
| **Transactional Outbox** | Atomic event dispatch inside DB transactions | ❌ None |
| **Audit Logging** | Dedicated immutable `community_audit_logs` table & service | ❌ None |
| **Test Coverage** | 28+ dedicated security & enterprise tests passing | ❌ 0 tests |

---

## 4. Recommended Enterprise Hardening Roadmap (Phased Plan)

To bring the Society subsystem to the enterprise-grade standard established by the Community and Event modules:

### Phase 1: Authentication, Route Scoping & Standardized Response
- Secure all 8 routes with `authenticateToken`.
- Enforce mandatory `society_id` scoping across all sub-entities (announcements, complaints, visitors, parkings, facilities, polls).
- Standardize response structures with `successResponse` and `errorResponse`.

### Phase 2: Centralized RBAC Policy Engine & Middleware
- Create `src/modules/society_profile/society.policy.js` defining granular capabilities:
  - `SOCIETY_MANAGE`: Society Admin / Creator
  - `MEMBER_APPROVE` / `MEMBER_REMOVE`: Admin / Committee
  - `ANNOUNCEMENT_CREATE`: Admin / Committee
  - `COMPLAINT_MANAGE`: Admin / Committee / Assignee
  - `COMPLAINT_CREATE`: Active Member / Resident / Tenant
  - `VISITOR_LOG`: Security Guard / Admin / Resident (for own flat)
  - `PARKING_ALLOCATE`: Admin / Committee
  - `POLL_CREATE`: Admin / Committee
  - `POLL_VOTE`: Active Residents only
- Implement `src/middleware/societyAuth.middleware.js` (`requireSocietyMember`, `requireSocietyRole`).
- Implement Last-Admin safeguard in `society_member.service.js`.

### Phase 3: Input Validation & Sanitization Layer
- Create `society.validation.js` with strict Joi schemas for all CRUD payloads and URL parameter ID validation.
- Mount `validateRequest` across all endpoints.

### Phase 4: Database Hardening, Migrations & Indexing
- Create migration script `scripts/migrations/013-enterprise-society-hardening.js`:
  - Standardize PKs or composite indexes on `(society_id, status, is_deleted)`.
  - Add composite index on `(society_id, created_at DESC)` for announcements, complaints, and visitor logs.
  - Create `society_poll_votes` table with `(poll_id, user_id)` unique constraint and `option_index`.
  - Create immutable `society_audit_logs` table for administrative actions.

### Phase 5: Concurrency, Atomic Poll Voting & Gate Security Flow
- Implement atomic voting logic with row locks (`LOCK.UPDATE`) in `society_poll.service.js`.
- Implement visitor gate check-in / check-out state machine (`expected` ➔ `checked_in` ➔ `checked_out` / `denied`).
- Ensure all multi-table mutations are wrapped in `sequelize.transaction`.

### Phase 6: Redis Cache-Aside & Rate Limiting
- Implement `society.cache.js` (caching society profile, facilities list, active announcements).
- Add rate limiting buckets for visitor logging, complaint filing, and poll voting.

### Phase 7: Real-Time Socket.IO & Push Notifications
- Add `user:join:society` room handler in `src/socket.js`.
- Emit real-time events (`visitor:arrived`, `announcement:new`, `complaint:status_updated`) to resident rooms.
- Integrate Outbox events with push notification workers.

### Phase 8: Comprehensive Automated Test Suite
- Write unit, RBAC security, concurrency, and functional tests:
  - `test/society.test.js` (CRUD, pagination, filtering, visitor logs)
  - `test/society.security.test.js` (RBAC matrix, IDOR prevention, last-admin guard, unauthenticated rejection, vote race conditions).

---

## 5. Summary & Action Items

The Society backend currently exposes severe security and architectural risks due to missing authentication, authorization, validation, and concurrency controls. Following the 8-phase enterprise hardening blueprint will elevate the Society subsystem to full enterprise security, high performance, and 100% test verification without breaking any existing modules.
