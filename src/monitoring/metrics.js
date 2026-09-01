/**
 * Prometheus Metrics Registry - Phase 14 Hardened
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for every metric in the SmartGali backend.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Default Node.js process metrics
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
  help: 'Total 4xx/5xx responses returned',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// ── Chat & Socket metrics ─────────────────────────────────────────────────────
export const chatMessagesCreated = new Counter({
  name: 'chat_messages_created_total',
  help: 'Total chat messages persisted',
  labelNames: ['chat_type', 'message_type'],
  registers: [registry],
});

export const chatMessagesFailed = new Counter({
  name: 'chat_messages_failed_total',
  help: 'Total chat messages that failed to persist',
  labelNames: ['reason'],
  registers: [registry],
});

export const chatMessageProcessingDuration = new Histogram({
  name: 'chat_message_processing_duration_seconds',
  help: 'Time to validate, persist, and enqueue message',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

export const chatAttachmentsUploaded = new Counter({
  name: 'chat_attachments_uploaded_total',
  help: 'Total media attachments uploaded to chat',
  labelNames: ['media_type'],
  registers: [registry],
});

export const chatAttachmentUploadFailures = new Counter({
  name: 'chat_attachment_upload_failures_total',
  help: 'Total chat attachment upload failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const socketConnectionsActive = new Gauge({
  name: 'socket_connections_active',
  help: 'Current active Socket.IO connections on this instance',
  registers: [registry],
});

export const socketConnectionsTotal = new Counter({
  name: 'socket_connections_total',
  help: 'Total Socket.IO connection attempts',
  registers: [registry],
});

export const socketDisconnectionsTotal = new Counter({
  name: 'socket_disconnections_total',
  help: 'Total Socket.IO disconnections',
  registers: [registry],
});

export const socketConnectionErrors = new Counter({
  name: 'socket_connection_errors_total',
  help: 'Total Socket.IO handshake / authentication rejections',
  registers: [registry],
});

export const presenceUpdatesTotal = new Counter({
  name: 'presence_updates_total',
  help: 'Total user presence transitions broadcasted',
  labelNames: ['type'],
  registers: [registry],
});

// ── Redis & BullMQ metrics ────────────────────────────────────────────────────
export const redisOperationsTotal = new Counter({
  name: 'redis_operations_total',
  help: 'Total Redis operations attempted',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisOperationErrors = new Counter({
  name: 'redis_operation_errors_total',
  help: 'Total Redis operation failures',
  labelNames: ['operation'],
  registers: [registry],
});

export const redisOperationDuration = new Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Redis operation duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
  registers: [registry],
});

export const bullmqJobsTotal = new Counter({
  name: 'bullmq_jobs_total',
  help: 'Total BullMQ jobs processed',
  labelNames: ['queue', 'job_name', 'status'],
  registers: [registry],
});

export const bullmqJobFailures = new Counter({
  name: 'bullmq_job_failures_total',
  help: 'Total BullMQ job failures after all retries exhausted',
  labelNames: ['queue', 'job_name'],
  registers: [registry],
});

export const bullmqJobDuration = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration in seconds',
  labelNames: ['queue', 'job_name'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
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

// ── Push notification metrics ─────────────────────────────────────────────────
export const fcmNotificationsSent = new Counter({
  name: 'fcm_notifications_sent_total',
  help: 'Total push notifications sent via FCM',
  labelNames: ['status'],
  registers: [registry],
});

export const fcmNotificationsFailed = new Counter({
  name: 'fcm_notifications_failed_total',
  help: 'Total FCM push notification delivery failures',
  labelNames: ['reason'],
  registers: [registry],
});

export const fcmNotificationDuration = new Histogram({
  name: 'fcm_notification_duration_seconds',
  help: 'Time to deliver push notification via FCM',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// ── Database query metrics ────────────────────────────────────────────────────
export const dbQueriesTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total database queries executed',
  labelNames: ['model', 'operation'],
  registers: [registry],
});

export const dbQueryErrors = new Counter({
  name: 'db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['model', 'operation'],
  registers: [registry],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query execution duration in seconds',
  labelNames: ['model', 'operation'],
  buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

// ── Follows metrics ───────────────────────────────────────────────────────────
export const followsTotal = new Counter({
  name: 'follows_total',
  help: 'Total successful user follow actions',
  registers: [registry],
});

export const followsFailedTotal = new Counter({
  name: 'follows_failed_total',
  help: 'Total failed user follow attempts',
  labelNames: ['reason'],
  registers: [registry],
});

export const unfollowsTotal = new Counter({
  name: 'unfollows_total',
  help: 'Total successful user unfollow actions',
  registers: [registry],
});

export const followFcmSent = new Counter({
  name: 'follow_fcm_sent_total',
  help: 'Total FCM push notifications dispatched for follow events',
  registers: [registry],
});

export const followFcmFailed = new Counter({
  name: 'follow_fcm_failed_total',
  help: 'Total FCM push notifications that failed for follow events',
  registers: [registry],
});

// ── Posts & Feed metrics ──────────────────────────────────────────────────────
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

export const feedCacheHitsTotal = new Counter({
  name: 'feed_cache_hits_total',
  help: 'Total home feed responses served from Redis cache',
  registers: [registry],
});

export const feedCacheMissesTotal = new Counter({
  name: 'feed_cache_misses_total',
  help: 'Total home feed requests that missed Redis cache and hit DB',
  registers: [registry],
});

export const feedDbQueryDuration = new Histogram({
  name: 'feed_db_query_duration_seconds',
  help: 'DB query duration for home feed (cache miss path)',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const batchViewsTotal = new Counter({
  name: 'batch_views_total',
  help: 'Total valid viewport dwell-time view events received',
  registers: [registry],
});

export const batchViewsEnqueuedTotal = new Counter({
  name: 'batch_views_enqueued_total',
  help: 'Total batch-view jobs enqueued to BullMQ feed-analytics queue',
  registers: [registry],
});

export const batchViewsProcessingDuration = new Histogram({
  name: 'batch_views_processing_duration_seconds',
  help: 'Duration to process a batch-views job in the background worker',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

export const postSharesTotal = new Counter({
  name: 'post_shares_total',
  help: 'Total post share events',
  registers: [registry],
});

export const postSavesTotal = new Counter({
  name: 'post_saves_total',
  help: 'Total post bookmark/save events',
  registers: [registry],
});

export const postCounterMismatchTotal = new Counter({
  name: 'post_counter_mismatch_total',
  help: 'Total posts with a detected likes/comments/shares counter mismatch',
  labelNames: ['counter_type'],
  registers: [registry],
});

export const postCounterReconciliationTotal = new Counter({
  name: 'post_counter_reconciliation_total',
  help: 'Total reconciliation runs completed',
  registers: [registry],
});

export const postCounterRepairTotal = new Counter({
  name: 'post_counter_repair_total',
  help: 'Total post counters repaired during reconciliation',
  labelNames: ['counter_type'],
  registers: [registry],
});

// ── Community Metrics (Phase 14 Hardened) ─────────────────────────────────────
export const communityCreateTotal = new Counter({
  name: 'community_create_total',
  help: 'Total communities created',
  registers: [registry],
});

export const communityJoinTotal = new Counter({
  name: 'community_join_total',
  help: 'Total community join actions',
  labelNames: ['type'],
  registers: [registry],
});

export const communityLeaveTotal = new Counter({
  name: 'community_leave_total',
  help: 'Total community leave actions',
  registers: [registry],
});

export const communityJoinRequestTotal = new Counter({
  name: 'community_join_request_total',
  help: 'Total private community join requests submitted',
  registers: [registry],
});

export const communityJoinApprovalTotal = new Counter({
  name: 'community_join_approval_total',
  help: 'Total community join requests approved or rejected',
  labelNames: ['status'],
  registers: [registry],
});

export const communityMemberBanTotal = new Counter({
  name: 'community_member_ban_total',
  help: 'Total community member ban actions',
  registers: [registry],
});

export const communityRoleChangeTotal = new Counter({
  name: 'community_role_change_total',
  help: 'Total community member role changes',
  labelNames: ['new_role'],
  registers: [registry],
});

export const communityPostTotal = new Counter({
  name: 'community_post_total',
  help: 'Total posts created inside communities',
  registers: [registry],
});

export const communityPollCreateTotal = new Counter({
  name: 'community_poll_create_total',
  help: 'Total community polls created',
  registers: [registry],
});

export const communityPollVoteTotal = new Counter({
  name: 'community_poll_vote_total',
  help: 'Total community poll votes cast',
  registers: [registry],
});

export const communityMediaUploadTotal = new Counter({
  name: 'community_media_upload_total',
  help: 'Total media files uploaded to community gallery',
  registers: [registry],
});

export const communityDocumentUploadTotal = new Counter({
  name: 'community_document_upload_total',
  help: 'Total documents uploaded to community files',
  registers: [registry],
});

export const communityApiErrorsTotal = new Counter({
  name: 'community_api_errors_total',
  help: 'Total community API errors',
  labelNames: ['route', 'status_code'],
  registers: [registry],
});

export const communityRequestDuration = new Histogram({
  name: 'community_request_duration_seconds',
  help: 'Community API request latency in seconds',
  labelNames: ['route'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export default registry;

// ── Event Module Metrics ───────────────────────────────────────────────────
export const eventCreateTotal = new Counter({
  name: 'event_create_total',
  help: 'Total events created',
  labelNames: ['event_type', 'visibility', 'is_community'],
  registers: [registry],
});

export const eventViewTotal = new Counter({
  name: 'event_view_total',
  help: 'Total event detail views',
  labelNames: ['event_type'],
  registers: [registry],
});

export const eventRsvpTotal = new Counter({
  name: 'event_rsvp_total',
  help: 'Total event RSVP changes',
  labelNames: ['status', 'transition'],
  registers: [registry],
});

export const eventCancelTotal = new Counter({
  name: 'event_cancel_total',
  help: 'Total events cancelled',
  registers: [registry],
});

export const eventNearbySearchTotal = new Counter({
  name: 'event_nearby_search_total',
  help: 'Total nearby event spatial searches',
  registers: [registry],
});

export const eventReminderTotal = new Counter({
  name: 'event_reminder_total',
  help: 'Total event reminder notifications processed',
  labelNames: ['reminder_type', 'status'],
  registers: [registry],
});

// ── Event Module Enterprise Metrics ─────────────────────────────
export const eventApiDuration = new Histogram({
  name: 'event_api_duration_seconds',
  help: 'Duration of Event API endpoints in seconds',
  labelNames: ['route', 'method', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const eventRsvpFailureTotal = new Counter({
  name: 'event_rsvp_failure_total',
  help: 'Total failed event RSVP attempts',
  labelNames: ['reason'],
  registers: [registry],
});

export const eventCapacityRejectionTotal = new Counter({
  name: 'event_capacity_rejection_total',
  help: 'Total RSVPs rejected due to event capacity limits',
  registers: [registry],
});

export const eventCacheHitTotal = new Counter({
  name: 'event_cache_hit_total',
  help: 'Total cache hits for event queries',
  labelNames: ['cache_type'],
  registers: [registry],
});

export const eventCacheMissTotal = new Counter({
  name: 'event_cache_miss_total',
  help: 'Total cache misses for event queries',
  labelNames: ['cache_type'],
  registers: [registry],
});

export const eventReminderFailureTotal = new Counter({
  name: 'event_reminder_failure_total',
  help: 'Total failed event reminder dispatches',
  registers: [registry],
});

// ── Society Enterprise Observability Metrics ────────────────────────────────
export const societyCreateTotal = new Counter({
  name: 'society_create_total',
  help: 'Total societies created',
  registers: [registry],
});

export const societyMembersJoinedTotal = new Counter({
  name: 'society_members_joined_total',
  help: 'Total society member join requests and additions',
  labelNames: ['role'],
  registers: [registry],
});

export const societyComplaintsCreatedTotal = new Counter({
  name: 'society_complaints_created_total',
  help: 'Total complaints filed in society module',
  labelNames: ['priority'],
  registers: [registry],
});

export const societyComplaintsResolvedTotal = new Counter({
  name: 'society_complaints_resolved_total',
  help: 'Total complaints marked resolved in society module',
  registers: [registry],
});

export const societyVisitorsCreatedTotal = new Counter({
  name: 'society_visitors_created_total',
  help: 'Total gate visitors registered',
  registers: [registry],
});

export const societyVisitorsCheckedInTotal = new Counter({
  name: 'society_visitors_checked_in_total',
  help: 'Total gate visitors successfully checked in',
  registers: [registry],
});

export const societyPollVotesTotal = new Counter({
  name: 'society_poll_votes_total',
  help: 'Total votes cast across society polls',
  registers: [registry],
});

export const societyApiErrorsTotal = new Counter({
  name: 'society_api_errors_total',
  help: 'Total society API errors',
  labelNames: ['route', 'status_code'],
  registers: [registry],
});

export const societyRequestDuration = new Histogram({
  name: 'society_request_duration_seconds',
  help: 'Society API endpoint duration in seconds',
  labelNames: ['route', 'method', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});
