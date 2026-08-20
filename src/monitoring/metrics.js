/**
 * Phase 7 — Prometheus Metrics Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for every metric in the SmartGali backend.
 * Import named counters/histograms/gauges from here — never create metrics
 * in business-logic modules directly.
 *
 * Label cardinality rules (enforced by design):
 *   OK: method, route (normalized pattern), status_code, queue, operation, type
 *   NO: user_id, email, phone, token, message_id, IP, or any user-specific value
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Default Node.js process metrics (CPU, memory, GC, event-loop lag)
collectDefaultMetrics({ register: registry, prefix: 'nodejs_' });

// ── HTTP metrics ──────────────────────────────────────────────────────────────
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [registry],
});

export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total HTTP error responses (4xx + 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// ── Chat / Message metrics ────────────────────────────────────────────────────
export const chatMessagesCreated = new Counter({
  name: 'chat_messages_created_total',
  help: 'Total chat messages successfully created',
  registers: [registry],
});

export const chatMessagesFailed = new Counter({
  name: 'chat_messages_failed_total',
  help: 'Total chat message creation failures',
  registers: [registry],
});

export const chatMessageProcessingDuration = new Histogram({
  name: 'chat_message_processing_duration_seconds',
  help: 'Time to process a chat message',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [registry],
});

export const chatAttachmentsUploaded = new Counter({
  name: 'chat_attachments_uploaded_total',
  help: 'Total chat attachment uploads that succeeded',
  registers: [registry],
});

export const chatAttachmentUploadFailures = new Counter({
  name: 'chat_attachment_upload_failures_total',
  help: 'Total chat attachment upload failures',
  registers: [registry],
});

// ── Socket.IO / Presence metrics ─────────────────────────────────────────────
export const socketConnectionsActive = new Gauge({
  name: 'socket_connections_active',
  help: 'Number of currently active Socket.IO connections',
  registers: [registry],
});

export const socketConnectionsTotal = new Counter({
  name: 'socket_connections_total',
  help: 'Total Socket.IO connections established since startup',
  registers: [registry],
});

export const socketDisconnectionsTotal = new Counter({
  name: 'socket_disconnections_total',
  help: 'Total Socket.IO disconnections since startup',
  registers: [registry],
});

export const socketConnectionErrors = new Counter({
  name: 'socket_connection_errors_total',
  help: 'Total Socket.IO connection errors',
  registers: [registry],
});

export const presenceUpdatesTotal = new Counter({
  name: 'presence_updates_total',
  help: 'Total presence status updates emitted',
  labelNames: ['type'],
  registers: [registry],
});

// ── Redis metrics ─────────────────────────────────────────────────────────────
export const redisOperationsTotal = new Counter({
  name: 'redis_operations_total',
  help: 'Total Redis operations executed',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisOperationErrors = new Counter({
  name: 'redis_operation_errors_total',
  help: 'Total Redis operation errors',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisOperationDuration = new Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Redis operation latency in seconds',
  labelNames: ['operation'],
  buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [registry],
});

// ── BullMQ metrics ────────────────────────────────────────────────────────────
export const bullmqJobsTotal = new Counter({
  name: 'bullmq_jobs_total',
  help: 'Total BullMQ jobs processed',
  labelNames: ['queue', 'status'],
  registers: [registry],
});

export const bullmqJobFailures = new Counter({
  name: 'bullmq_job_failures_total',
  help: 'Total BullMQ job failures',
  labelNames: ['queue'],
  registers: [registry],
});

export const bullmqJobDuration = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration in seconds',
  labelNames: ['queue'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const bullmqJobsActive = new Gauge({
  name: 'bullmq_jobs_active',
  help: 'Number of BullMQ jobs currently being processed',
  labelNames: ['queue'],
  registers: [registry],
});

export const bullmqJobsWaiting = new Gauge({
  name: 'bullmq_jobs_waiting',
  help: 'Number of BullMQ jobs waiting in queue',
  labelNames: ['queue'],
  registers: [registry],
});

// ── FCM Push Notification metrics ─────────────────────────────────────────────
export const fcmNotificationsSent = new Counter({
  name: 'fcm_notifications_sent_total',
  help: 'Total FCM push notifications sent successfully',
  registers: [registry],
});

export const fcmNotificationsFailed = new Counter({
  name: 'fcm_notifications_failed_total',
  help: 'Total FCM push notification failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const fcmNotificationDuration = new Histogram({
  name: 'fcm_notification_duration_seconds',
  help: 'FCM sendToDevice call latency in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// ── Database metrics ──────────────────────────────────────────────────────────
export const dbQueriesTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total database queries executed',
  labelNames: ['operation'],
  registers: [registry],
});

export const dbQueryErrors = new Counter({
  name: 'db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['operation'],
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});


// ── Follow metrics (Phase 8) ────────────────────────────────────────────────
export const followsTotal = new Counter({
  name: 'follows_total',
  help: 'Total successful follow operations',
  registers: [registry],
});

export const followsFailedTotal = new Counter({
  name: 'follows_failed_total',
  help: 'Total failed follow attempts',
  labelNames: ['reason'],
  registers: [registry],
});

export const unfollowsTotal = new Counter({
  name: 'unfollows_total',
  help: 'Total unfollow operations',
  registers: [registry],
});

export const followFcmSent = new Counter({
  name: 'follow_fcm_notifications_sent_total',
  help: 'Total FCM notifications sent for follow events',
  registers: [registry],
});

export const followFcmFailed = new Counter({
  name: 'follow_fcm_notifications_failed_total',
  help: 'Total FCM notification failures for follow events',
  registers: [registry],
});

// ── Posts / Feed metrics (Phase 9) ─────────────────────────────────────────
export const postsCreatedTotal = new Counter({
  name: 'posts_created_total',
  help: 'Total posts successfully created',
  labelNames: ['post_type'],
  registers: [registry],
});

export const postsCreationFailedTotal = new Counter({
  name: 'posts_creation_failed_total',
  help: 'Total post creation failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const feedRequestsTotal = new Counter({
  name: 'feed_requests_total',
  help: 'Total home feed requests',
  registers: [registry],
});

export const feedRequestDuration = new Histogram({
  name: 'feed_request_duration_seconds',
  help: 'Home feed query duration in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const postLikesTotal = new Counter({
  name: 'post_likes_total',
  help: 'Total post likes',
  registers: [registry],
});

export const postLikesFailedTotal = new Counter({
  name: 'post_likes_failed_total',
  help: 'Total post like failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const postCommentsTotal = new Counter({
  name: 'post_comments_total',
  help: 'Total post comments created',
  registers: [registry],
});

export const postCommentsFailedTotal = new Counter({
  name: 'post_comments_failed_total',
  help: 'Total post comment creation failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const mediaUploadsTotal = new Counter({
  name: 'media_uploads_total',
  help: 'Total media uploads',
  labelNames: ['media_type'],
  registers: [registry],
});

export const mediaUploadFailuresTotal = new Counter({
  name: 'media_upload_failures_total',
  help: 'Total media upload failures',
  labelNames: ['reason'],
  registers: [registry],
});
export default registry;



