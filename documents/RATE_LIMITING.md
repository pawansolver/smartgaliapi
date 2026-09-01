# SmartGali Distributed Rate Limiting (Phase 5)

## Overview

API rate limits are enforced with `express-rate-limit` and a **Redis-backed store** (`rate-limit-redis`) so multiple API instances share the same counters.

```text
API-1 ─┐
API-2 ─┼──→ Redis (rate-limit keys)
API-3 ─┘
```

## Redis namespaces

| Use case        | Prefix (concept)                          |
|-----------------|-------------------------------------------|
| App cache/idem  | `smartgali:` (`REDIS_KEY_PREFIX`)         |
| BullMQ          | `smartgali:bull` (`QUEUE_PREFIX`)         |
| Rate limits     | `smartgali:ratelimit:<policy>:`           |

`RATE_LIMIT_KEY_PREFIX` defaults to `ratelimit:` and is applied by each `RedisStore` (ioredis then adds `REDIS_KEY_PREFIX`).

## Key strategy

| Context              | Key                                         |
|----------------------|---------------------------------------------|
| Authenticated API    | `user:${req.user.id}`                       |
| Auth/OTP forms       | `ip:<normalizedIp>:<email\|mobile\|id>`     |
| Anonymous            | IPv6-safe IP via `ipKeyGenerator`           |

**Never** trust `req.body.userId`, `req.body.sender_id`, or `req.query.userId` for rate-limit identity.

## Proxy / IP

Express `trust proxy` is set from `TRUST_PROXY` (see `src/config/env.js` / `src/app.js`). Configure the hop count for your load balancer; do not blindly trust arbitrary clients.

## Policies (defaults)

| Limiter              | Category | Window | Max | Emergency max (Redis down) | Identity |
|----------------------|----------|-------:|----:|---------------------------:|----------|
| general / read       | general  | 60s    | 300 | same as max (local)        | user / IP |
| message send         | general  | 60s    |  60 | same as max (local)        | user |
| upload               | general  | 5m     |  20 | same as max (local)        | user |
| search               | general  | 60s    |  30 | same as max (local)        | user |
| reaction             | general  | 60s    | 120 | same as max (local)        | user |
| message actions      | general  | 60s    | 120 | same as max (local)        | user |
| auth signup          | security | 1h     |  10 | **3**                      | IP + email/mobile |
| auth OTP send        | security | 15m    |   5 | **2**                      | IP + identifier |
| auth OTP verify      | security | 15m    |  10 | **3**                      | IP + identifier |
| auth signin          | security | 15m    |  10 | **3**                      | IP + identifier |
| auth reset           | security | 15m    |  10 | **3**                      | IP |
| auth refresh         | security | 60s    |  30 | **10**                     | IP |

All values are overridable via `RATE_LIMIT_*` env vars (see `.env.example`).

## Redis failure policy (by category)

| Category | Redis UP | Redis DOWN (default `local_fallback`) |
|----------|----------|----------------------------------------|
| **security** (signin / OTP / signup / reset / refresh) | Distributed Redis limit | Stricter **per-process emergencyMax** — never unlimited |
| **general** (API / messages / search / uploads) | Distributed Redis limit | Same configured max via local memory — API stays available |

Env:

```text
RATE_LIMIT_REDIS_FAILURE_MODE_SECURITY=local_fallback
RATE_LIMIT_REDIS_FAILURE_MODE_GENERAL=local_fallback
```

`fail_open` is an explicit opt-in only (not recommended for security).

Transient Redis errors: hybrid store falls back to memory for that request; when Redis returns, distributed limiting resumes.

Set `RATE_LIMIT_ENABLED=false` to disable all limiters (not recommended in production).

## Response

HTTP `429` with:

```json
{ "success": false, "message": "..." }
```

Standard `RateLimit-*` headers are enabled (`standardHeaders: true`).

## Local development

1. Start Redis (`REDIS_URL` or host/port), for example:

```bash
docker run --name smartgali-test-redis -p 6379:6379 -d redis:7
# or: redis-server
```

2. `npm run dev`
3. Limits are shared across instances automatically when Redis is up.

## Real Redis multi-instance validation

Unit tests under `test/rateLimit.distributed.test.js` use an in-process shared store for fast regression. That is **not** production Redis validation.

Run the real Redis integration suite:

```bash
npm run test:ratelimit:redis
```

This starts/connects a live Redis (external instance, or `redis-memory-server` as fallback), simulates 3 limiter instances, and asserts shared counters, user isolation, key prefix (`smartgali:test:ratelimit:`), and window reset. Test keys are cleaned up afterward.
