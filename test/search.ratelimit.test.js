import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMessages } from '../src/utils/search.service.js';
import Message from '../src/modules/message/message.model.js';

// ===========================================================================
// searchMessages — SQL LIKE abstraction
// ===========================================================================
test('searchMessages returns matching messages and total count', async (t) => {
  const hits = [
    { id: 1, message: 'Hello World', chat_id: 10 },
    { id: 2, message: 'Hello there', chat_id: 10 },
  ];
  t.mock.method(Message, 'findAll', async () => hits);
  t.mock.method(Message, 'count',   async () => 2);

  const result = await searchMessages({ chatId: 10, query: 'Hello', limit: 30 });
  assert.equal(result.hits.length, 2);
  assert.equal(result.total, 2);
  assert.equal(result.engine, 'sql');
});

test('searchMessages returns empty results for no match', async (t) => {
  t.mock.method(Message, 'findAll', async () => []);
  t.mock.method(Message, 'count',   async () => 0);

  const result = await searchMessages({ chatId: 10, query: 'zzzmissing', limit: 30 });
  assert.equal(result.hits.length, 0);
  assert.equal(result.total, 0);
});

test('searchMessages caps limit at 100', async (t) => {
  let capturedLimit = null;
  t.mock.method(Message, 'findAll', async (opts) => {
    capturedLimit = opts.limit;
    return [];
  });
  t.mock.method(Message, 'count', async () => 0);

  await searchMessages({ chatId: 10, query: 'test', limit: 9999 });
  assert.equal(capturedLimit, 100);
});

test('searchMessages passes cursor (beforeId) as id < cursor condition', async (t) => {
  let capturedWhere = null;
  t.mock.method(Message, 'findAll', async (opts) => {
    capturedWhere = opts.where;
    return [];
  });
  t.mock.method(Message, 'count', async () => 0);

  await searchMessages({ chatId: 10, query: 'hi', limit: 10, beforeId: '500' });
  assert.ok(capturedWhere.id, 'cursor condition must be set');
});

test('searchMessages filters by messageType when provided', async (t) => {
  let capturedWhere = null;
  t.mock.method(Message, 'findAll', async (opts) => {
    capturedWhere = opts.where;
    return [];
  });
  t.mock.method(Message, 'count', async () => 0);

  await searchMessages({ chatId: 10, query: 'photo', limit: 10, messageType: 'image' });
  assert.equal(capturedWhere.message_type, 'image');
});

test('searchMessages scopes to the given chatId only', async (t) => {
  let capturedWhere = null;
  t.mock.method(Message, 'findAll', async (opts) => {
    capturedWhere = opts.where;
    return [];
  });
  t.mock.method(Message, 'count', async () => 0);

  await searchMessages({ chatId: 42, query: 'test' });
  assert.equal(capturedWhere.chat_id, 42);
  assert.equal(capturedWhere.is_deleted, false);
});

// ===========================================================================
// Rate limiter configuration audit
// ===========================================================================
test('messageSendLimiter is configured for 60 messages per minute', async () => {
  const { messageSendLimiter } = await import('../src/middleware/rateLimit.middleware.js');
  const { rateLimitConfig } = await import('../src/config/rateLimit.config.js');
  assert.ok(typeof messageSendLimiter === 'function', 'limiter must be a middleware function');
  assert.equal(rateLimitConfig.message.max, 60);
  assert.equal(rateLimitConfig.message.windowMs, 60_000);
});

test('uploadLimiter is configured for 20 uploads per 5 minutes', async () => {
  const { uploadLimiter } = await import('../src/middleware/rateLimit.middleware.js');
  const { rateLimitConfig } = await import('../src/config/rateLimit.config.js');
  assert.ok(typeof uploadLimiter === 'function', 'upload limiter must be a middleware function');
  assert.equal(rateLimitConfig.upload.max, 20);
  assert.equal(rateLimitConfig.upload.windowMs, 300_000);
});
