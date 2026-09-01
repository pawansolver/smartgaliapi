/**
 * Outbox event type / status constants.
 * Covers Chat, Feed/Post, Community, and Event domain events.
 * Reuse this file - do NOT create a second event system.
 */

export const OUTBOX_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
};

export const OUTBOX_EVENT_TYPES = {
  // ── Community Events ──
  COMMUNITY_CREATED:         'community.created',
  COMMUNITY_UPDATED:         'community.updated',
  COMMUNITY_DELETED:         'community.deleted',
  COMMUNITY_MEMBER_JOINED:   'community.member_joined',
  COMMUNITY_MEMBER_LEFT:     'community.member_left',
  COMMUNITY_JOIN_REQUEST:    'community.join_request',
  COMMUNITY_JOIN_APPROVED:   'community.join_approved',
  COMMUNITY_JOIN_REJECTED:   'community.join_rejected',
  COMMUNITY_MEMBER_REMOVED:  'community.member_removed',
  COMMUNITY_MEMBER_BANNED:   'community.member_banned',
  COMMUNITY_ROLE_CHANGED:    'community.role_changed',
  COMMUNITY_ANNOUNCEMENT:    'community.announcement_created',
  COMMUNITY_POLL_CREATED:    'community.poll_created',
  COMMUNITY_INVITED:         'community.invited',

  // ── Event Module Events ──
  EVENT_CREATED:             'event.created',
  EVENT_UPDATED:             'event.updated',
  EVENT_CANCELLED:           'event.cancelled',
  EVENT_DELETED:             'event.deleted',
  EVENT_RSVP_CHANGED:        'event.rsvp_changed',
  EVENT_REMINDER_REQUIRED:   'event.reminder_required',

  // ── Society Module Events ──
  SOCIETY_CREATED:                   'society.created',
  SOCIETY_UPDATED:                   'society.updated',
  SOCIETY_DELETED:                   'society.deleted',
  SOCIETY_MEMBER_JOINED:             'society.member_joined',
  SOCIETY_MEMBER_APPROVED:           'society.member_approved',
  SOCIETY_MEMBER_REJECTED:           'society.member_rejected',
  SOCIETY_MEMBER_REMOVED:            'society.member_removed',
  SOCIETY_ROLE_CHANGED:              'society.role_changed',
  SOCIETY_OWNERSHIP_TRANSFERRED:     'society.ownership_transferred',
  SOCIETY_ANNOUNCEMENT_CREATED:      'society.announcement_created',
  SOCIETY_COMPLAINT_CREATED:         'society.complaint_created',
  SOCIETY_COMPLAINT_STATUS_CHANGED:  'society.complaint_status_changed',
  SOCIETY_VISITOR_CREATED:           'society.visitor_created',
  SOCIETY_VISITOR_ARRIVED:           'society.visitor_arrived',
  SOCIETY_VISITOR_APPROVED:          'society.visitor_approved',
  SOCIETY_VISITOR_DENIED:            'society.visitor_denied',
  SOCIETY_VISITOR_CHECKED_IN:        'society.visitor_checked_in',
  SOCIETY_VISITOR_CHECKED_OUT:       'society.visitor_checked_out',
  SOCIETY_PARKING_ALLOCATED:         'society.parking_allocated',
  SOCIETY_POLL_CREATED:              'society.poll_created',
  SOCIETY_POLL_VOTED:                'society.poll_voted',
  SOCIETY_POLL_CLOSED:               'society.poll_closed',

  // ── Chat ──────────────────────────────────────────────────────────────────
  MESSAGE_CREATED: 'message.created',

  // ── Feed / Post ───────────────────────────────────────────────────────────
  POST_CREATED:   'post.created',
  POST_UPDATED:   'post.updated',
  POST_DELETED:   'post.deleted',
  POST_LIKED:     'post.liked',
  POST_UNLIKED:   'post.unliked',
  POST_COMMENTED: 'post.commented',
  POST_SHARED:    'post.shared',
  POST_SAVED:     'post.saved',
  POST_REPORTED:  'post.reported',
};

export const OUTBOX_AGGREGATE_TYPES = {
  MESSAGE: 'message',
  CHAT:    'chat',
  POST:    'post',
  USER:    'user',
  COMMUNITY: 'community',
  EVENT:   'event',
  SOCIETY: 'society',
};

export const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUS);
