/**
 * Phase 8 — Follow / Followers / Following Tests
 * node:test (not Jest)
 *
 * Tests cover:
 *  - followUser: success, self-follow, duplicate, user-not-found
 *  - unfollowUser: success, idempotent non-existing, self-unfollow guard
 *  - getFollowers / getFollowing: pagination, empty, sensitive field check
 *  - FCM: success triggers metric, failure does not undo follow
 *  - Security: follower_id from req.user.id (never body)
 *  - Metrics: counters increment
 *  - Migration: 008-user-follows indexes
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError } from 'sequelize';

import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  isFollowing,
  followServiceDeps,
  FollowError,
} from '../src/modules/follow/follow.service.js';

import Follow from '../src/modules/follow/follow.model.js';
import User from '../src/modules/user/user.model.js';
import UserProfile from '../src/modules/userProfile/userProfile.model.js';

import {
  followsTotal,
  followsFailedTotal,
  unfollowsTotal,
  followFcmSent,
  followFcmFailed,
} from '../src/monitoring/metrics.js';

import {
  up as upFollows,
  down as downFollows,
  version as followsVersion,
} from '../scripts/migrations/008-user-follows.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (overrides = {}) => ({
  userId: 1,
  userName: 'testuser',
  status: 'active',
  is_deleted: false,
  is_active: true,
  profile: { fullName: 'Test User', avatarUrl: null },
  ...overrides,
});

const makeFollow = (overrides = {}) => ({
  id: 100,
  follower_id: 1,
  following_id: 2,
  is_deleted: false,
  destroy: async () => {},
  ...overrides,
});

// ─── 1. followUser ────────────────────────────────────────────────────────────

test('followUser: successfully follows another user', async (t) => {
  t.mock.method(User, 'findOne', async (opts) => {
    const id = opts?.where?.userId;
    return makeUser({ userId: Number(id) });
  });
  t.mock.method(Follow, 'create', async () => makeFollow());
  t.mock.method(followServiceDeps, 'createNotification', async () => null);
  t.mock.method(followServiceDeps, 'sendToUser', async () => ({ sent: 1, failed: 0, skipped: 0 }));

  const result = await followUser(1, 2, 'corr-001');
  assert.equal(result.followId, 100);
  assert.equal(result.followingId, 2);
  assert.ok(typeof result.message === 'string');
});

test('followUser: rejects self-follow', async (t) => {
  await assert.rejects(
    () => followUser(5, 5, 'corr-002'),
    (err) => {
      assert.ok(err instanceof FollowError);
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('yourself'));
      return true;
    }
  );
});

test('followUser: rejects when target user not found', async (t) => {
  t.mock.method(User, 'findOne', async () => null);
  await assert.rejects(
    () => followUser(1, 999, 'corr-003'),
    (err) => {
      assert.ok(err instanceof FollowError);
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test('followUser: rejects duplicate follow with 409', async (t) => {
  t.mock.method(User, 'findOne', async () => makeUser({ userId: 2 }));
  t.mock.method(Follow, 'create', async () => {
    const err = new UniqueConstraintError({ errors: [] });
    throw err;
  });

  await assert.rejects(
    () => followUser(1, 2, 'corr-004'),
    (err) => {
      assert.ok(err instanceof FollowError);
      assert.equal(err.statusCode, 409);
      assert.ok(err.message.includes('already following'));
      return true;
    }
  );
});

test('followUser: FCM failure does not undo successful follow', async (t) => {
  t.mock.method(User, 'findOne', async (opts) => makeUser({ userId: opts?.where?.userId }));
  t.mock.method(Follow, 'create', async () => makeFollow({ id: 200 }));
  t.mock.method(followServiceDeps, 'createNotification', async () => null);
  // FCM throws
  t.mock.method(followServiceDeps, 'sendToUser', async () => {
    throw new Error('FCM unavailable');
  });

  // Should NOT throw — follow succeeded, FCM failure is non-fatal
  const result = await followUser(1, 2, 'corr-005');
  assert.equal(result.followId, 200, 'Follow was created despite FCM failure');
});

test('followUser: increments followsTotal metric', async (t) => {
  t.mock.method(User, 'findOne', async (opts) => makeUser({ userId: opts?.where?.userId }));
  t.mock.method(Follow, 'create', async () => makeFollow({ id: 300 }));
  t.mock.method(followServiceDeps, 'createNotification', async () => null);
  t.mock.method(followServiceDeps, 'sendToUser', async () => ({ sent: 1, failed: 0, skipped: 0 }));

  const before = (await followsTotal.get()).values[0]?.value || 0;
  await followUser(10, 20, 'corr-006');
  const after = (await followsTotal.get()).values[0]?.value || 0;
  assert.ok(after > before, 'followsTotal should increment');
});

test('followUser: self-follow increments followsFailedTotal', async (t) => {
  const before = (await followsFailedTotal.get()).values
    .find((v) => v.labels?.reason === 'self_follow')?.value || 0;

  await assert.rejects(() => followUser(7, 7, 'corr-007'));

  const after = (await followsFailedTotal.get()).values
    .find((v) => v.labels?.reason === 'self_follow')?.value || 0;
  assert.ok(after > before, 'self_follow failure counter should increment');
});

// ─── 2. unfollowUser ──────────────────────────────────────────────────────────

test('unfollowUser: successfully unfollows', async (t) => {
  t.mock.method(Follow, 'destroy', async () => 1);

  const result = await unfollowUser(1, 2, 'corr-010');
  assert.equal(result.unfollowed, true);
});

test('unfollowUser: idempotent when relationship not found', async (t) => {
  t.mock.method(Follow, 'destroy', async () => 0);

  const result = await unfollowUser(1, 99, 'corr-011');
  assert.equal(result.unfollowed, false, 'Should return false, not throw');
});

test('unfollowUser: rejects self-unfollow', async () => {
  await assert.rejects(
    () => unfollowUser(5, 5, 'corr-012'),
    (err) => {
      assert.ok(err instanceof FollowError);
      return true;
    }
  );
});

test('unfollowUser: increments unfollowsTotal metric', async (t) => {
  t.mock.method(Follow, 'destroy', async () => 1);

  const before = (await unfollowsTotal.get()).values[0]?.value || 0;
  await unfollowUser(1, 2, 'corr-013');
  const after = (await unfollowsTotal.get()).values[0]?.value || 0;
  assert.ok(after > before, 'unfollowsTotal should increment');
});

// ─── 3. getFollowers ─────────────────────────────────────────────────────────

test('getFollowers: returns paginated result', async (t) => {
  const mockUser = makeUser({ userId: 3, userName: 'alice' });
  t.mock.method(Follow, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ follower: mockUser }],
  }));

  const result = await getFollowers(2, { page: 1, limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.followers.length, 1);
  assert.equal(result.page, 1);
  assert.equal(result.followers[0].userId, 3);
});

test('getFollowers: returns empty array when no followers', async (t) => {
  t.mock.method(Follow, 'findAndCountAll', async () => ({ count: 0, rows: [] }));

  const result = await getFollowers(99, { page: 1, limit: 10 });
  assert.equal(result.total, 0);
  assert.deepEqual(result.followers, []);
});

test('getFollowers: does not expose sensitive fields', async (t) => {
  const mockUser = {
    ...makeUser({ userId: 5 }),
    password: 'hashed_password',
    email: 'test@example.com',
    phone: '9999999999',
    currentOtp: '123456',
  };
  t.mock.method(Follow, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ follower: mockUser }],
  }));

  const result = await getFollowers(2, {});
  const follower = result.followers[0];
  assert.ok(!follower.password, 'password must not be exposed');
  assert.ok(!follower.email, 'email must not be exposed');
  assert.ok(!follower.phone, 'phone must not be exposed');
  assert.ok(!follower.currentOtp, 'OTP must not be exposed');
  assert.ok('userId' in follower);
  assert.ok('userName' in follower);
});

test('getFollowers: limits max per page to 50', async (t) => {
  let capturedLimit = null;
  t.mock.method(Follow, 'findAndCountAll', async (opts) => {
    capturedLimit = opts.limit;
    return { count: 0, rows: [] };
  });

  await getFollowers(1, { page: 1, limit: 999 });
  assert.equal(capturedLimit, 50, 'limit should be capped at 50');
});

// ─── 4. getFollowing ──────────────────────────────────────────────────────────

test('getFollowing: returns paginated result', async (t) => {
  const mockUser = makeUser({ userId: 7, userName: 'bob' });
  t.mock.method(Follow, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ following: mockUser }],
  }));

  const result = await getFollowing(2, { page: 1, limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.following.length, 1);
  assert.equal(result.following[0].userId, 7);
});

test('getFollowing: returns empty array when following no one', async (t) => {
  t.mock.method(Follow, 'findAndCountAll', async () => ({ count: 0, rows: [] }));

  const result = await getFollowing(99, {});
  assert.equal(result.total, 0);
  assert.deepEqual(result.following, []);
});

test('getFollowing: does not expose sensitive fields', async (t) => {
  const mockUser = {
    ...makeUser({ userId: 8 }),
    password: 'secret',
    email: 'hidden@test.com',
  };
  t.mock.method(Follow, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ following: mockUser }],
  }));

  const result = await getFollowing(1, {});
  const user = result.following[0];
  assert.ok(!user.password, 'password must not be exposed');
  assert.ok(!user.email, 'email must not be exposed');
});

// ─── 5. isFollowing ───────────────────────────────────────────────────────────

test('isFollowing: returns true when relationship exists', async (t) => {
  t.mock.method(Follow, 'findOne', async () => ({ id: 1 }));
  assert.equal(await isFollowing(1, 2), true);
});

test('isFollowing: returns false when relationship not found', async (t) => {
  t.mock.method(Follow, 'findOne', async () => null);
  assert.equal(await isFollowing(1, 99), false);
});

// ─── 6. Security ──────────────────────────────────────────────────────────────

test('FollowError has correct name and statusCode', () => {
  const err = new FollowError('test error', 403);
  assert.equal(err.name, 'FollowError');
  assert.equal(err.statusCode, 403);
  assert.equal(err.message, 'test error');
  assert.ok(err instanceof Error);
});

test('followUser uses string comparison to prevent type coercion self-follow bypass', async () => {
  // '1' and 1 should both be caught as self-follow
  await assert.rejects(() => followUser('1', 1, 'security-test'));
  await assert.rejects(() => followUser(1, '1', 'security-test'));
});

// ─── 7. FCM metrics ───────────────────────────────────────────────────────────

test('followFcmSent increments when FCM succeeds', async (t) => {
  t.mock.method(User, 'findOne', async (opts) => makeUser({ userId: opts?.where?.userId }));
  t.mock.method(Follow, 'create', async () => makeFollow({ id: 400 }));
  t.mock.method(followServiceDeps, 'createNotification', async () => null);
  t.mock.method(followServiceDeps, 'sendToUser', async () => ({ sent: 1, failed: 0, skipped: 0 }));

  const before = (await followFcmSent.get()).values[0]?.value || 0;
  await followUser(1, 2, 'fcm-metric-test');
  const after = (await followFcmSent.get()).values[0]?.value || 0;
  assert.ok(after > before, 'followFcmSent should increment on FCM success');
});

test('followFcmFailed increments when FCM throws, follow still succeeds', async (t) => {
  t.mock.method(User, 'findOne', async (opts) => makeUser({ userId: opts?.where?.userId }));
  t.mock.method(Follow, 'create', async () => makeFollow({ id: 500 }));
  t.mock.method(followServiceDeps, 'createNotification', async () => null);
  t.mock.method(followServiceDeps, 'sendToUser', async () => { throw new Error('FCM error'); });

  const failBefore = (await followFcmFailed.get()).values[0]?.value || 0;
  const result = await followUser(1, 2, 'fcm-fail-test');
  const failAfter = (await followFcmFailed.get()).values[0]?.value || 0;

  assert.ok(failAfter > failBefore, 'followFcmFailed should increment');
  assert.ok(result.followId, 'Follow should still be created');
});

// ─── 8. Migration ─────────────────────────────────────────────────────────────

test('008-user-follows migration has correct version string', () => {
  assert.equal(followsVersion, '008-user-follows');
});

test('008-user-follows migration up/down run without error', async (t) => {
  let syncCalled = false;
  let addedIndexes = [];
  let removedIndexes = [];

  const mockModel = {
    sync: async () => { syncCalled = true; },
    getTableName: () => 'follows',
  };

  const mockQI = {
    showIndex: async () => [], // No existing indexes
    addIndex: async (table, fields, opts) => { addedIndexes.push(opts.name); },
    showAllTables: async () => ['follows'],
    removeIndex: async (table, name) => { removedIndexes.push(name); },
  };

  await upFollows({ model: mockModel, queryInterface: mockQI });
  assert.ok(syncCalled, 'sync should be called');
  assert.ok(addedIndexes.includes('uq_user_follows_pair'), 'Unique pair index should be added');
  assert.ok(addedIndexes.includes('ix_user_follows_follower_id'), 'follower index should be added');
  assert.ok(addedIndexes.includes('ix_user_follows_following_id'), 'following index should be added');

  // Test DOWN
  const mockQIDown = {
    showIndex: async () => [
      { name: 'uq_user_follows_pair', primary: false },
      { name: 'ix_user_follows_follower_id', primary: false },
      { name: 'ix_user_follows_following_id', primary: false },
    ],
    showAllTables: async () => ['follows'],
    removeIndex: async (table, name) => { removedIndexes.push(name); },
  };

  await downFollows({ model: mockModel, queryInterface: mockQIDown });
  assert.ok(removedIndexes.includes('uq_user_follows_pair'), 'Unique index should be removed');
  assert.ok(removedIndexes.includes('ix_user_follows_follower_id'), 'follower index removed');
  assert.ok(removedIndexes.includes('ix_user_follows_following_id'), 'following index removed');
});

test('008-user-follows down handles missing table gracefully', async () => {
  const mockModel = { getTableName: () => 'follows' };
  const mockQI = {
    showAllTables: async () => [], // table does not exist
    showIndex: async () => [],
    removeIndex: async () => {},
  };

  // Should not throw
  await downFollows({ model: mockModel, queryInterface: mockQI });
});

// ─── 9. Prometheus label safety ───────────────────────────────────────────────

test('Follow metrics have no user-specific labels', async () => {
  const { followsTotal: ft, followsFailedTotal: fft, unfollowsTotal: ut } =
    await import('../src/monitoring/metrics.js');

  const allValues = [
    ...(await ft.get()).values,
    ...(await ut.get()).values,
  ];

  const forbiddenLabels = ['user_id', 'userId', 'email', 'phone', 'token'];
  for (const val of allValues) {
    for (const label of forbiddenLabels) {
      assert.ok(
        !Object.keys(val.labels || {}).includes(label),
        `Follow metric must not have '${label}' label`
      );
    }
  }
});

test('followsFailedTotal only uses low-cardinality reason labels', async () => {
  const vals = (await followsFailedTotal.get()).values;
  const allowedReasons = new Set(['self_follow', 'user_not_found', 'duplicate', 'db_error']);
  for (const val of vals) {
    if (val.labels?.reason) {
      assert.ok(allowedReasons.has(val.labels.reason),
        `Unexpected reason label: ${val.labels.reason}`);
    }
  }
});
