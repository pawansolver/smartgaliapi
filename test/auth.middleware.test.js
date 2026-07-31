import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticate } from '../src/middleware/auth.middleware.js';

const response = () => {
  const result = { statusCode: null, body: null };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return body;
  };
  return result;
};

test('authentication rejects a missing bearer token', async () => {
  const res = response();
  await createAuthenticate()({ headers: {} }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /No token/);
});

test('authentication maps malformed and expired tokens to stable responses', async (t) => {
  for (const [name, expected] of [
    ['JsonWebTokenError', 'Invalid token.'],
    ['NotBeforeError', 'Invalid token.'],
    ['TokenExpiredError', 'Token expired.'],
  ]) {
    await t.test(name, async () => {
      const error = new Error(name);
      error.name = name;
      const res = response();
      const middleware = createAuthenticate({
        verifyToken: () => {
          throw error;
        },
      });
      await middleware(
        { headers: { authorization: 'Bearer token' } },
        res,
        () => assert.fail('next must not run'),
      );
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.message, expected);
    });
  }
});

test('authentication rejects deleted or inactive accounts through the active-user lookup', async () => {
  let lookup;
  const res = response();
  const middleware = createAuthenticate({
    verifyToken: () => ({ userId: 42 }),
    findUser: async (options) => {
      lookup = options;
      return null;
    },
  });

  await middleware(
    { headers: { authorization: 'Bearer token' } },
    res,
    () => assert.fail('next must not run'),
  );
  assert.deepEqual(lookup.where, {
    userId: 42,
    is_deleted: false,
    is_active: true,
    status: 'active',
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Account is unavailable.');
});

test('authentication normalizes sub to req.user.id for controllers', async () => {
  const req = { headers: { authorization: 'Bearer token' } };
  let called = false;
  const middleware = createAuthenticate({
    verifyToken: () => ({ sub: 7, role: 'resident' }),
    findUser: async () => ({ userId: 7 }),
  });

  await middleware(req, response(), () => {
    called = true;
  });
  assert.equal(called, true);
  assert.deepEqual(req.user, { sub: 7, role: 'resident', id: 7 });
});
