import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import {
  isSuperAdminUser,
  isGlobalAdminUser,
  requireSuperAdmin,
  requireGlobalAdmin,
  createAuthenticate,
} from '../src/middleware/auth.middleware.js';

// ── Mock User Roles ───────────────────────────────────────────────────────────
const realSuperAdmin = { id: 1, userId: 1, userRole: 'super_admin' };
const alternateSuperAdmin = { id: 2, userId: 2, userRole: 'superadmin' };
const caseInsensitiveSuperAdmin = { id: 3, userId: 3, userRole: 'SUPER_ADMIN' };
const operationalAdmin = { id: 10, userId: 10, userRole: 'admin' };
const communityAdmin = { id: 20, userId: 20, userRole: 'community_admin' };
const communityModerator = { id: 30, userId: 30, userRole: 'moderator' };
const normalResident = { id: 40, userId: 40, userRole: 'resident' };
const standardMember = { id: 50, userId: 50, userRole: 'member' };
const guestUser = { id: 60, userId: 60, userRole: 'guest' };

// ── 1. Unit Tests: isSuperAdminUser vs isGlobalAdminUser ──────────────────────

test('RBAC: isSuperAdminUser grants access ONLY to super_admin / superadmin', () => {
  assert.equal(isSuperAdminUser(realSuperAdmin), true);
  assert.equal(isSuperAdminUser(alternateSuperAdmin), true);
  assert.equal(isSuperAdminUser(caseInsensitiveSuperAdmin), true);
  assert.equal(isSuperAdminUser({ role: 'super_admin' }), true);

  // Strictly rejected roles
  assert.equal(isSuperAdminUser(operationalAdmin), false);
  assert.equal(isSuperAdminUser(communityAdmin), false);
  assert.equal(isSuperAdminUser(communityModerator), false);
  assert.equal(isSuperAdminUser(normalResident), false);
  assert.equal(isSuperAdminUser(standardMember), false);
  assert.equal(isSuperAdminUser(guestUser), false);
  assert.equal(isSuperAdminUser(null), false);
  assert.equal(isSuperAdminUser(undefined), false);
  assert.equal(isSuperAdminUser({}), false);
});

test('RBAC: isGlobalAdminUser continues to permit both super_admin and operational admin', () => {
  assert.equal(isGlobalAdminUser(realSuperAdmin), true);
  assert.equal(isGlobalAdminUser(operationalAdmin), true);
  assert.equal(isGlobalAdminUser({ role: 'admin' }), true);

  // Non-global admins rejected
  assert.equal(isGlobalAdminUser(communityAdmin), false);
  assert.equal(isGlobalAdminUser(communityModerator), false);
  assert.equal(isGlobalAdminUser(normalResident), false);
  assert.equal(isGlobalAdminUser(standardMember), false);
  assert.equal(isGlobalAdminUser(guestUser), false);
});

// ── 2. Middleware Negative & Positive Tests: requireSuperAdmin ─────────────────

const runMiddleware = (middleware, req) => {
  let passed = false;
  let responseStatus = null;
  let responseData = null;

  const res = {
    status: (code) => {
      responseStatus = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
  };

  const next = (err) => {
    if (err) throw err;
    passed = true;
  };

  middleware(req, res, next);
  return { passed, status: responseStatus, data: responseData };
};

test('RBAC Middleware Positive: super_admin is allowed through requireSuperAdmin', () => {
  const result = runMiddleware(requireSuperAdmin, { user: realSuperAdmin });
  assert.equal(result.passed, true);
  assert.equal(result.status, null);
});

test('RBAC Middleware Positive: superadmin normalized role is allowed through requireSuperAdmin', () => {
  const result = runMiddleware(requireSuperAdmin, { user: alternateSuperAdmin });
  assert.equal(result.passed, true);
  assert.equal(result.status, null);
});

test('RBAC Middleware Negative: admin (R002) is blocked with 403 Forbidden', () => {
  const result = runMiddleware(requireSuperAdmin, { user: operationalAdmin });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.data.success, false);
  assert.match(result.data.message, /Super Administrator privileges required/);
});

test('RBAC Middleware Negative: community admin is blocked with 403 Forbidden', () => {
  const result = runMiddleware(requireSuperAdmin, { user: communityAdmin });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.match(result.data.message, /Super Administrator privileges required/);
});

test('RBAC Middleware Negative: moderator is blocked with 403 Forbidden', () => {
  const result = runMiddleware(requireSuperAdmin, { user: communityModerator });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.match(result.data.message, /Super Administrator privileges required/);
});

test('RBAC Middleware Negative: resident / member is blocked with 403 Forbidden', () => {
  const resResident = runMiddleware(requireSuperAdmin, { user: normalResident });
  assert.equal(resResident.passed, false);
  assert.equal(resResident.status, 403);
  assert.match(resResident.data.message, /Super Administrator privileges required/);

  const resMember = runMiddleware(requireSuperAdmin, { user: standardMember });
  assert.equal(resMember.passed, false);
  assert.equal(resMember.status, 403);
});

test('RBAC Middleware Negative: guest is blocked with 403 Forbidden', () => {
  const result = runMiddleware(requireSuperAdmin, { user: guestUser });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
});

test('RBAC Middleware Negative: unauthenticated request is blocked with 403 Forbidden', () => {
  const result = runMiddleware(requireSuperAdmin, { user: null });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
});

// ── 3. Full Request Lifecycle: authenticate -> requireSuperAdmin ──────────────

test('Auth + RBAC Pipeline: Anonymous request (no token) returns 401 Unauthorized', async () => {
  const authenticate = createAuthenticate({
    verifyToken: () => ({ id: 1 }),
    findUser: async () => ({ userId: 1, userRole: 'super_admin' }),
  });

  const req = { headers: {} };
  let responseStatus = null;
  let responseData = null;
  const res = {
    status: (code) => { responseStatus = code; return res; },
    json: (data) => { responseData = data; return res; },
  };
  let authPassed = false;

  await authenticate(req, res, () => { authPassed = true; });
  assert.equal(authPassed, false);
  assert.equal(responseStatus, 401);
  assert.match(responseData.message, /No token provided/);
});

test('Auth + RBAC Pipeline: Admin user authenticates (200) but fails requireSuperAdmin (403)', async () => {
  const token = jwt.sign({ id: 10, userRole: 'admin' }, env.jwt.secret);
  const authenticate = createAuthenticate({
    verifyToken: () => ({ id: 10, userRole: 'admin' }),
    findUser: async () => ({ userId: 10, userRole: 'admin' }),
  });

  const req = { headers: { authorization: 'Bearer ' + token} };
  let authPassed = false;
  await authenticate(req, {}, () => { authPassed = true; });
  assert.equal(authPassed, true);
  assert.equal(req.user.userRole, 'admin');

  // Next step in pipeline: requireSuperAdmin
  const rbacResult = runMiddleware(requireSuperAdmin, req);
  assert.equal(rbacResult.passed, false);
  assert.equal(rbacResult.status, 403);
});

test('Auth + RBAC Pipeline: Super Admin user passes entire authentication and authorization chain', async () => {
  const token = jwt.sign({ id: 1, userRole: 'super_admin' }, env.jwt.secret);
  const authenticate = createAuthenticate({
    verifyToken: () => ({ id: 1, userRole: 'super_admin' }),
    findUser: async () => ({ userId: 1, userRole: 'super_admin' }),
  });

  const req = { headers: { authorization: 'Bearer ' + token} };
  let authPassed = false;
  await authenticate(req, {}, () => { authPassed = true; });
  assert.equal(authPassed, true);
  assert.equal(req.user.userRole, 'super_admin');

  // Next step in pipeline: requireSuperAdmin
  const rbacResult = runMiddleware(requireSuperAdmin, req);
  assert.equal(rbacResult.passed, true);
  assert.equal(rbacResult.status, null);
});

// ── 4. Preservation of Operational Admin Access (requireGlobalAdmin) ──────────

test('Preservation: requireGlobalAdmin still allows operational admin (R002) for platform ops', () => {
  const adminResult = runMiddleware(requireGlobalAdmin, { user: operationalAdmin });
  assert.equal(adminResult.passed, true);

  const superAdminResult = runMiddleware(requireGlobalAdmin, { user: realSuperAdmin });
  assert.equal(superAdminResult.passed, true);

  const residentResult = runMiddleware(requireGlobalAdmin, { user: normalResident });
  assert.equal(residentResult.passed, false);
  assert.equal(residentResult.status, 403);
});
