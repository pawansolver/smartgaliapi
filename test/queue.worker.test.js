import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutboxJobId,
  queueConfig,
  defaultJobOptions,
  CHAT_JOB_NAME,
} from '../src/infrastructure/queues/queue.config.js';
import {
  publishOutboxEvent,
  publishPendingEvents,
  publisherDeps,
} from '../src/modules/outbox/outbox.publisher.js';
import { OUTBOX_STATUS, OUTBOX_EVENT_TYPES } from '../src/modules/outbox/outbox.events.js';
import {
  handleChatEventJob,
  stopChatEventsWorker,
  workerDeps,
} from '../src/workers/chatEvents.worker.js';

// ---------------------------------------------------------------------------
// Queue config / job IDs
// ---------------------------------------------------------------------------
test('buildOutboxJobId is deterministic from outbox event id', () => {
  assert.equal(buildOutboxJobId(123), 'outbox-event-123');
  assert.equal(buildOutboxJobId('456'), 'outbox-event-456');
});

test('queue config exposes chat-events defaults and retry policy', () => {
  assert.equal(typeof queueConfig.chatQueueName, 'string');
  assert.ok(queueConfig.chatQueueName.length > 0);
  assert.equal(CHAT_JOB_NAME, 'outbox.process');
  assert.equal(defaultJobOptions.attempts, queueConfig.jobAttempts);
  assert.equal(defaultJobOptions.backoff.type, 'exponential');
  assert.equal(defaultJobOptions.backoff.delay, queueConfig.jobBackoffMs);
  assert.ok(queueConfig.workerConcurrency >= 1);
  assert.ok(queueConfig.jobAttempts >= 1);
});

test('queue prefix differs from app Redis key prefix namespace', () => {
  const appPrefix = process.env.REDIS_KEY_PREFIX || 'smartgali:';
  assert.notEqual(queueConfig.prefix, appPrefix);
  assert.match(queueConfig.prefix, /bull/);
});

// ---------------------------------------------------------------------------
// Publisher → BullMQ enqueue (via publisherDeps)
// ---------------------------------------------------------------------------
test('publishOutboxEvent enqueues job with outboxEventId and eventType only', async (t) => {
  const added = [];
  t.mock.method(publisherDeps, 'enqueueOutboxJob', async (data) => {
    added.push(data);
    return {
      job: { id: buildOutboxJobId(data.outboxEventId) },
      jobId: buildOutboxJobId(data.outboxEventId),
      duplicated: false,
    };
  });

  const event = {
    id: 99,
    event_type: OUTBOX_EVENT_TYPES.MESSAGE_CREATED,
    status: OUTBOX_STATUS.PENDING,
  };

  const result = await publishOutboxEvent(event);

  assert.equal(result.ok, true);
  assert.equal(result.jobId, 'outbox-event-99');
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], {
    outboxEventId: 99,
    eventType: 'message.created',
  });
});

test('publishOutboxEvent treats duplicate job id as success (no lost event)', async (t) => {
  t.mock.method(publisherDeps, 'enqueueOutboxJob', async () => ({
    job: null,
    jobId: 'outbox-event-7',
    duplicated: true,
  }));

  const result = await publishOutboxEvent({
    id: 7,
    event_type: 'message.created',
    status: OUTBOX_STATUS.PENDING,
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicated, true);
});

test('publishOutboxEvent does not mark published when enqueue fails', async (t) => {
  t.mock.method(publisherDeps, 'enqueueOutboxJob', async () => {
    throw new Error('redis down');
  });

  const result = await publishOutboxEvent({
    id: 11,
    event_type: 'message.created',
    status: OUTBOX_STATUS.PENDING,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'enqueue_failed');
});

test('publishPendingEvents enqueues each pending outbox row', async (t) => {
  const pending = [
    { id: 1, event_type: 'message.created', status: 'pending' },
    { id: 2, event_type: 'message.created', status: 'pending' },
  ];
  const jobIds = [];

  t.mock.method(publisherDeps, 'getPendingEvents', async () => pending);
  t.mock.method(publisherDeps, 'enqueueOutboxJob', async ({ outboxEventId }) => {
    jobIds.push(buildOutboxJobId(outboxEventId));
    return { job: {}, jobId: buildOutboxJobId(outboxEventId), duplicated: false };
  });

  const results = await publishPendingEvents({ limit: 10 });
  assert.equal(results.length, 2);
  assert.deepEqual(jobIds, ['outbox-event-1', 'outbox-event-2']);
});

test('duplicate job prevention uses deterministic outbox-event-{id} job ids', async (t) => {
  const seen = new Set();
  let duplicateHits = 0;

  t.mock.method(publisherDeps, 'enqueueOutboxJob', async ({ outboxEventId }) => {
    const jobId = buildOutboxJobId(outboxEventId);
    if (seen.has(jobId)) {
      duplicateHits += 1;
      return { job: null, jobId, duplicated: true };
    }
    seen.add(jobId);
    return { job: {}, jobId, duplicated: false };
  });

  const event = { id: 55, event_type: 'message.created', status: 'pending' };
  const first = await publishOutboxEvent(event);
  const second = await publishOutboxEvent(event);

  assert.equal(first.jobId, 'outbox-event-55');
  assert.equal(second.jobId, 'outbox-event-55');
  assert.equal(first.duplicated, false);
  assert.equal(second.duplicated, true);
  assert.equal(duplicateHits, 1);
});

// ---------------------------------------------------------------------------
// Worker job handler
// ---------------------------------------------------------------------------
test('handleChatEventJob loads outbox event and calls processEvent', async (t) => {
  const event = {
    id: 42,
    event_type: 'message.created',
    status: OUTBOX_STATUS.PENDING,
    payload: { messageId: 1, chatId: 10, senderId: 5 },
  };
  let processedId = null;

  t.mock.method(workerDeps, 'loadOutboxEvent', async (id) => {
    assert.equal(id, 42);
    return event;
  });
  t.mock.method(workerDeps, 'processEvent', async (evt) => {
    processedId = evt.id;
    return { ok: true };
  });

  const result = await handleChatEventJob({
    id: 'outbox-event-42',
    data: { outboxEventId: 42, eventType: 'message.created' },
    attemptsMade: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(processedId, 42);
});

test('handleChatEventJob skips already-published events (idempotent)', async (t) => {
  t.mock.method(workerDeps, 'loadOutboxEvent', async () => ({
    id: 3,
    status: OUTBOX_STATUS.PUBLISHED,
    event_type: 'message.created',
  }));

  let processCalled = false;
  t.mock.method(workerDeps, 'processEvent', async () => {
    processCalled = true;
    return { ok: true };
  });

  const result = await handleChatEventJob({
    id: 'outbox-event-3',
    data: { outboxEventId: 3, eventType: 'message.created' },
    attemptsMade: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'already_published');
  assert.equal(processCalled, false);
});

test('handleChatEventJob throws on processing_failed to trigger BullMQ retry', async (t) => {
  t.mock.method(workerDeps, 'loadOutboxEvent', async () => ({
    id: 8,
    status: OUTBOX_STATUS.PENDING,
    event_type: 'message.created',
  }));
  t.mock.method(workerDeps, 'processEvent', async () => ({
    ok: false,
    reason: 'processing_failed',
    error: 'socket unavailable',
  }));

  await assert.rejects(
    handleChatEventJob({
      id: 'outbox-event-8',
      data: { outboxEventId: 8, eventType: 'message.created' },
      attemptsMade: 0,
    }),
    /socket unavailable/,
  );
});

test('handleChatEventJob does not throw for unknown_event_type (permanent)', async (t) => {
  t.mock.method(workerDeps, 'loadOutboxEvent', async () => ({
    id: 9,
    status: OUTBOX_STATUS.PENDING,
    event_type: 'unknown.event',
  }));
  t.mock.method(workerDeps, 'processEvent', async () => ({
    ok: false,
    reason: 'unknown_event_type',
  }));

  const result = await handleChatEventJob({
    id: 'outbox-event-9',
    data: { outboxEventId: 9, eventType: 'unknown.event' },
    attemptsMade: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown_event_type');
});

test('retry policy uses exponential backoff configuration', () => {
  assert.equal(defaultJobOptions.backoff.type, 'exponential');
  assert.ok(defaultJobOptions.attempts >= 3);
  assert.ok(defaultJobOptions.backoff.delay >= 100);
});

test('stopChatEventsWorker is safe when worker was never started', async () => {
  await stopChatEventsWorker();
});

test('failed permanent job path can mark outbox failed via workerDeps', async (t) => {
  const failures = [];
  t.mock.method(workerDeps, 'markFailed', async (id, err) => {
    failures.push({ id, message: err.message });
    return { id, status: OUTBOX_STATUS.FAILED, last_error: err.message };
  });

  await workerDeps.markFailed(77, new Error('final failure'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].id, 77);
  assert.match(failures[0].message, /final failure/);
});
