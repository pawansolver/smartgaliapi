import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOtp,
  hashRefreshToken,
  hashValue,
  ttlToMs,
} from '../src/modules/auth/auth.tokens.js';

test('OTP generation is always six numeric digits', () => {
  const values = new Set(Array.from({ length: 100 }, () => generateOtp()));
  for (const value of values) assert.match(value, /^\d{6}$/);
  assert.ok(values.size > 1);
});

test('token hashes are deterministic, fixed length, and do not expose plaintext', () => {
  const token = 'test-refresh-token-that-must-not-be-stored';
  const digest = hashRefreshToken(token);
  assert.equal(digest.length, 64);
  assert.notEqual(digest, token);
  assert.equal(hashRefreshToken(token), digest);
  assert.equal(hashValue('jti').length, 64);
});

test('auth TTL parser supports configured units and rejects ambiguous values', () => {
  assert.equal(ttlToMs('15m'), 900_000);
  assert.equal(ttlToMs('30d'), 2_592_000_000);
  assert.equal(ttlToMs(60), 60_000);
  assert.throws(() => ttlToMs('forever'), /Invalid token TTL/);
});
