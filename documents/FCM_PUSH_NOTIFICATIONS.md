# SmartGali FCM Push Notifications (Phase 6)

## Architecture

```text
User sends message
       ↓
Message Service (DB TX: message + outbox)
       ↓
COMMIT
       ↓
Outbox → BullMQ (chat-events)
       ↓
Worker: Socket.IO broadcast (online)
       ↓
Worker: FCM dispatch (offline / background)
```

In-app notification feed rows remain on the HTTP send path (`emitNotification`).
FCM is **only** sent from the worker after commit — never inside the message transaction.

## Device registration (Flutter)

Base path: `/api/v1/device`  
Auth: `Authorization: Bearer <access_token>`  
Ownership: always `req.user.id` from JWT — **never** send `userId` in the body.

### Register / upsert

`POST /api/v1/device/register`

```json
{
  "deviceId": "device-123",
  "platform": "android",
  "pushToken": "FCM_TOKEN",
  "appVersion": "1.0.0",
  "deviceModel": "Pixel"
}
```

- Idempotent on `(userId, deviceId)`
- Token rotation updates the same row

### List devices

`GET /api/v1/device` — metadata only (no full push tokens)

### Update token

`PUT /api/v1/device/:deviceId`

```json
{ "pushToken": "NEW_FCM_TOKEN" }
```

### Deactivate (logout)

`POST /api/v1/device/deactivate`

```json
{ "deviceId": "device-123" }
```

Deactivates **this device only**.

### Remove

`DELETE /api/v1/device/:deviceId`

## Online vs offline

| Recipient state | Delivery |
|-----------------|----------|
| Live Redis presence heartbeat (preferred) / online sockets | Socket.IO only — FCM skipped when `FCM_SKIP_ONLINE_USERS=true` |
| Offline / background (no heartbeat) | FCM to all active devices |

Presence is multi-instance safe: disconnect on API-1 does **not** mark offline while API-2 still has sockets (`fetchSockets` via Redis adapter). A Redis TTL heartbeat (`PRESENCE_TTL_SECONDS`, default 90s) clears stale `is_online` after crashes.

Muted chats (`chat_participants.is_muted`) and `community_chat=false` preference skip FCM.

## Configuration

```env
FCM_ENABLED=true
FCM_NOTIFICATION_ENABLED=true
FCM_SKIP_ONLINE_USERS=true
FCM_PROJECT_ID=...
FCM_CLIENT_EMAIL=...
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Never commit service-account JSON or private keys.

## Migration

```bash
npm run migrate:chat:up
```

Applies `007-user-devices`.

## Worker

```bash
npm run worker
```

Initializes FCM when `FCM_ENABLED=true` and processes `message.created` jobs.

## Invalid tokens

Permanent FCM errors deactivate `user_devices.is_active`. Transient errors are retried by BullMQ.

## Optional real FCM integration test

```bash
# 1) Send smoke notification to a real device token (local env only — never commit)
set FCM_INTEGRATION_TEST=true
set FCM_ENABLED=true
set FCM_PROJECT_ID=...
set FCM_CLIENT_EMAIL=...
set FCM_PRIVATE_KEY=...
set FCM_TEST_DEVICE_TOKEN=...
npm run test:fcm:integration

# 2) After the phone shows "SmartGali Test / Phase 6 FCM smoke test":
set FCM_DEVICE_DELIVERY_CONFIRMED=true
npm run test:fcm:integration
```

Skipped when credentials are absent. Acceptance by Firebase alone is **not** treated as device delivery.

## Multi-instance presence test

```bash
npm run test:presence:redis
```
