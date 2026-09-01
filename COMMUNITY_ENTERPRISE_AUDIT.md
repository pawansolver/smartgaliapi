# Community Module Enterprise Audit (Phase 1)

## Executive Summary
This document provides a comprehensive audit of the Community backend architecture in SmartGali. The audit examines security, RBAC policies, database transactions, concurrency, geo-discovery, caching, messaging/socket sync, observability, and testing.

---

## 1. Existing Components Audit

| Component | Files | Current Status | Findings / Gaps |
| :--- | :--- | :--- | :--- |
| **Community Core CRUD** | src/modules/community/community.*.js | Implemented | Basic CRUD exists. Missing centralized policy layer; lacks geo-coordinates (latitude, longitude, discovery_radius); cache invalidation is ad-hoc. |
| **Membership & Roles** | src/modules/communityMember/communityMember.*.js | Implemented | Join/leave/ban exists. Needs strict protection for last active Admin / Owner; state machine transitions must be formally validated. |
| **Join Requests** | src/modules/community_join_request/community_join_request.*.js | Implemented | pending_key exists for unique pending requests; concurrency lock on approval needs strict idempotency check. |
| **Invitations** | src/modules/community/communityInvitation.*.js | Implemented | Basic invite sending and response exist; needs additional rate limiting and validation against banned users. |
| **Announcements** | src/modules/community_announcement/community_announcement.*.js | Implemented | Pinned notices working; outbox event emitted; delete permission check needs policy centralization. |
| **Documents & Circulars** | src/modules/community_document/community_document.*.js | Implemented | Multer local storage uploads working; file size/type tracking present; delete permission needs policy integration. |
| **Media Gallery** | src/modules/community_media/community_media.*.js | Implemented | Gallery upload and post-feed auto-sync working; needs composite indexing and moderation policy. |
| **Polls & Voting** | src/modules/community_poll/community_poll.*.js | Implemented | Atomic voting with LOCK.UPDATE working; needs non-member/banned-member voting prevention and expired poll checks. |
| **Group Chat Sync** | src/modules/community/communityChat.service.js | Implemented | Auto chat creation & participant sync present; needs room update sync when community name/cover changes. |
| **Outbox Events** | src/modules/outbox/outbox.service.js | Implemented | Community events defined; transactions must ensure outbox creation is strictly inside DB transaction. |
| **Socket.IO Security** | src/socket.js | Partially Implemented | Chat join check has community check; needs dedicated user:join:community room handling with private/banned isolation. |
| **Prometheus Metrics** | src/monitoring/metrics.js | Partially Implemented | Basic counters exist; missing granular metrics for leave, ban, role changes, doc/media uploads, API errors, and request duration. |
| **Audit Logging** | src/modules/audit_log/ | Missing for Community | General audit log exists; dedicated immutable community_audit_logs table is missing. |
| **Geo Discovery** | src/modules/community/community.service.js | Missing | Communities lack latitude/longitude coordinates and Haversine distance-based suggested discovery. |
| **Counter Reconciliation** | src/workers/counterReconciliation.worker.js | Posts Only | Post counter reconciliation exists; community member and poll vote reconciliation missing. |

---

## 2. Security & Architectural Risk Analysis

| Risk ID | Risk Description | Severity | Recommended Fix | Affected Files |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Permission logic distributed across controllers; risk of privilege escalation and self-promotion. | **HIGH** | Implement centralized community.policy.js with comprehensive capability checks. | src/modules/community/community.policy.js, src/middleware/communityAuth.middleware.js, controllers |
| **SEC-02** | Sole admin or owner could leave or be demoted, making a community orphaned. | **HIGH** | Add last-admin / owner guard preventing leave/demotion/removal without transfer. | src/modules/communityMember/communityMember.service.js |
| **SEC-03** | Lack of dedicated immutable audit trail for community moderation actions. | **MEDIUM** | Implement community_audit_logs table & service for tamper-proof action tracking. | src/modules/community/community_audit_log.*.js |
| **DAT-01** | Missing geo-coordinates on community table prevents location-based discovery. | **HIGH** | Add latitude, longitude, location_name, discovery_radius to communities and implement spatial suggested queries. | community.model.js, community.service.js, 011-enterprise-community-hardening.js |
| **DAT-02** | Outbox event creation called outside transaction in certain paths could lose events on crash. | **HIGH** | Enforce createEvent(..., { transaction }) inside all DB transactions before commit. | All community sub-services |
| **PRF-01** | Search query does full COUNT(*) on every page request causing performance bottlenecks. | **MEDIUM** | Implement cursor pagination and optimized count caching. | src/modules/community/community.service.js |
| **REL-01** | Redis failure could block requests if cache helpers throw unhandled errors. | **LOW** | Ensure all cache-aside methods have safe try/catch fallbacks to MySQL. | src/modules/community/community.cache.js |
| **OBS-01** | Missing Prometheus metrics for leave, ban, role updates, and endpoint latency. | **MEDIUM** | Add comprehensive Prometheus counters & histograms to metrics.js. | src/monitoring/metrics.js, controllers |

---

## 3. Files to Create / Modify
- **New Files**:
  - src/modules/community/community.policy.js
  - src/modules/community/community.cache.js
  - src/modules/community/community_audit_log.model.js
  - src/modules/community/community_audit_log.service.js
  - scripts/migrations/011-enterprise-community-hardening.js
  - COMMUNITY_GEO_ARCHITECTURE.md
  - COMMUNITY_ENTERPRISE_FINAL_AUDIT.md
  - test/community.security.test.js
- **Modified Files**:
  - src/modules/community/community.model.js
  - src/modules/community/community.service.js
  - src/modules/community/community.controller.js
  - src/modules/community/community.routes.js
  - src/modules/community/community.validation.js
  - src/modules/community/communityChat.service.js
  - src/modules/community/communityInvitation.service.js
  - src/modules/communityMember/communityMember.service.js
  - src/modules/community_join_request/community_join_request.service.js
  - src/modules/community_poll/community_poll.service.js
  - src/middleware/communityAuth.middleware.js
  - src/middleware/rateLimit.middleware.js
  - src/monitoring/metrics.js
  - src/socket.js
  - src/workers/counterReconciliation.worker.js
  - test/community.test.js
  - test/community.enterprise.test.js