import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import {
  getUserEffectivePermissions,
  hasPermission,
  authorize,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  invalidateUserPermissionCache,
} from '../src/modules/permission/permission.service.js';
import {
  isSuperAdmin,
  isGlobalAdmin,
  hasPermission as clientHasPermission,
  hasAnyPermission as clientHasAnyPermission,
  hasAllPermissions as clientHasAllPermissions,
  getVisibleAdminNavItems,
} from '../src/utils/permissionGuards.js';
import {
  isSuperAdminUser,
  isGlobalAdminUser,
  requireSuperAdmin,
  requireGlobalAdmin,
  createAuthenticate,
} from '../src/middleware/auth.middleware.js';

// Helper to simulate express middleware execution
const runMiddleware = async (middleware, req) => {
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

  await middleware(req, res, next);
  return { passed, status: responseStatus, data: responseData };
};

// -------------------------------------------------------------
// 1. AUTHENTICATION & JWT SECURITY (401 vs 403)
// -------------------------------------------------------------

test('PBAC Auth: Missing JWT token returns 401 Unauthorized', async () => {
  const authenticate = createAuthenticate({
    verifyToken: () => ({ id: 1 }),
    findUser: async () => ({ userId: 1, userRole: 'resident' }),
  });

  const req = { headers: {} };
  let statusCode = null;
  let responseData = null;
  const mockRes = {
    status: (c) => { statusCode = c; return mockRes; },
    json: (d) => { responseData = d; return mockRes; },
  };

  await authenticate(req, mockRes, () => {});
  assert.equal(statusCode, 401);
  assert.match(responseData.message, /No token provided/);
});

test('PBAC Auth: Invalid JWT token returns 401 Unauthorized', async () => {
  const authenticate = createAuthenticate({
    verifyToken: () => {
      const err = new Error('Invalid token');
      err.name = 'JsonWebTokenError';
      throw err;
    },
    findUser: async () => null,
  });

  const req = { headers: { authorization: 'Bearer invalid_signature_token' } };
  let statusCode = null;
  const mockRes = {
    status: (c) => { statusCode = c; return mockRes; },
    json: () => mockRes,
  };

  await authenticate(req, mockRes, () => {});
  assert.equal(statusCode, 401);
});

test('PBAC Auth: Expired JWT token returns 401 Unauthorized', async () => {
  const authenticate = createAuthenticate({
    verifyToken: () => {
      const err = new Error('Token expired');
      err.name = 'TokenExpiredError';
      throw err;
    },
    findUser: async () => null,
  });

  const req = { headers: { authorization: 'Bearer expired_token' } };
  let statusCode = null;
  const mockRes = {
    status: (c) => { statusCode = c; return mockRes; },
    json: () => mockRes,
  };

  await authenticate(req, mockRes, () => {});
  assert.equal(statusCode, 401);
});

// -------------------------------------------------------------
// 2. SUPER ADMIN (R001) VS ADMIN (R002) SEPARATION
// -------------------------------------------------------------

test('PBAC Role Separation: requireSuperAdmin allows ONLY Super Admin', async () => {
  const superAdminUser = { id: 1, userId: 1, userRole: 'super_admin' };
  const adminUser = { id: 2, userId: 2, userRole: 'admin' };
  const residentUser = { id: 3, userId: 3, userRole: 'resident' };

  const superAdminRes = await runMiddleware(requireSuperAdmin, { user: superAdminUser });
  assert.equal(superAdminRes.passed, true);

  const adminRes = await runMiddleware(requireSuperAdmin, { user: adminUser });
  assert.equal(adminRes.passed, false);
  assert.equal(adminRes.status, 403);
  assert.match(adminRes.data.message, /Super Administrator privileges required/);

  const residentRes = await runMiddleware(requireSuperAdmin, { user: residentUser });
  assert.equal(residentRes.passed, false);
  assert.equal(residentRes.status, 403);
});

test('PBAC Operational Admin (R002): requireGlobalAdmin permits both Super Admin and Admin', async () => {
  const superAdminUser = { id: 1, userId: 1, userRole: 'super_admin' };
  const adminUser = { id: 2, userId: 2, userRole: 'admin' };
  const residentUser = { id: 3, userId: 3, userRole: 'resident' };

  const superRes = await runMiddleware(requireGlobalAdmin, { user: superAdminUser });
  assert.equal(superRes.passed, true);

  const adminRes = await runMiddleware(requireGlobalAdmin, { user: adminUser });
  assert.equal(adminRes.passed, true);

  const residentRes = await runMiddleware(requireGlobalAdmin, { user: residentUser });
  assert.equal(residentRes.passed, false);
  assert.equal(residentRes.status, 403);
});

// -------------------------------------------------------------
// 3. FAIL-CLOSED DEFAULT BEHAVIOR
// -------------------------------------------------------------

test('PBAC Fail-Closed: Unauthenticated or missing user fails closed (false / 401/403)', async () => {
  assert.equal(await hasPermission(null, 'post.create'), false);
  assert.equal(await hasPermission({}, 'post.create'), false);
  assert.equal(await hasPermission({ id: 999 }, ''), false);

  const reqNoUser = { user: null };
  const mw = requirePermission('post.create');
  const res = await runMiddleware(mw, reqNoUser);
  assert.equal(res.passed, false);
  assert.equal(res.status, 401);
});

// -------------------------------------------------------------
// 4. RESOURCE OWNERSHIP VALIDATION
// -------------------------------------------------------------

test('PBAC Ownership: User is allowed to update/delete OWN resource', async () => {
  const residentUser = { id: 50, userId: 50, userRole: 'RESIDENT' };

  // When user is resource owner (userId === resourceOwnerId: 50)
  const allowedOwner = await hasPermission(residentUser, 'post.update_own', {
    resourceOwnerId: 50,
  });
  assert.equal(allowedOwner, true);

  // When user is NOT resource owner (resourceOwnerId: 99)
  const allowedNonOwner = await hasPermission(residentUser, 'post.update_own', {
    resourceOwnerId: 99,
  });
  assert.equal(allowedNonOwner, false);
});

test('PBAC Ownership: Super Admin can manage ANY resource regardless of owner', async () => {
  const superAdminUser = { id: 1, userId: 1, userRole: 'SUPER_ADMIN' };

  const allowed = await hasPermission(superAdminUser, 'post.delete_own', {
    resourceOwnerId: 999,
  });
  assert.equal(allowed, true);
});

// -------------------------------------------------------------
// 5. COMMUNITY SCOPE & IDOR VALIDATION
// -------------------------------------------------------------

test('PBAC Middleware: requirePermission properly protects routes with 403', async () => {
  const residentUser = { id: 50, userId: 50, userRole: 'RESIDENT' };
  const req = { user: residentUser };

  // Resident trying to access platform settings update
  const mwSettings = requirePermission('platform_settings.update');
  const res = await runMiddleware(mwSettings, req);
  assert.equal(res.passed, false);
  assert.equal(res.status, 403);
  assert.match(res.data.message, /Forbidden/);
});

test('PBAC Middleware: requireAnyPermission allows if at least one matches', async () => {
  const residentUser = { id: 50, userId: 50, userRole: 'RESIDENT' };
  const req = { user: residentUser };

  const mwAny = requireAnyPermission(['platform_settings.update', 'post.create']);
  const res = await runMiddleware(mwAny, req);
  assert.equal(res.passed, true);
});

test('PBAC Middleware: requireAllPermissions rejects if any permission is missing', async () => {
  const residentUser = { id: 50, userId: 50, userRole: 'RESIDENT' };
  const req = { user: residentUser };

  const mwAll = requireAllPermissions(['post.create', 'platform_settings.update']);
  const res = await runMiddleware(mwAll, req);
  assert.equal(res.passed, false);
  assert.equal(res.status, 403);
});

// -------------------------------------------------------------
// 6. FRONTEND PERMISSION GUARDS & UI UTILITIES
// -------------------------------------------------------------

test('Frontend Guards: isSuperAdmin and isGlobalAdmin correctly separate roles', () => {
  const superAdminObj = { userRole: 'super_admin' };
  const adminObj = { userRole: 'admin' };
  const residentObj = { userRole: 'resident' };

  assert.equal(isSuperAdmin(superAdminObj), true);
  assert.equal(isSuperAdmin(adminObj), false);
  assert.equal(isSuperAdmin(residentObj), false);

  assert.equal(isGlobalAdmin(superAdminObj), true);
  assert.equal(isGlobalAdmin(adminObj), true);
  assert.equal(isGlobalAdmin(residentObj), false);
});

test('Frontend Guards: hasPermission respects direct DENY precedence', () => {
  const userWithDeny = {
    userRole: 'resident',
    permissions: ['post.create', 'post.update_own'],
    directDenies: ['post.create'],
  };

  assert.equal(clientHasPermission(userWithDeny, 'post.create'), false); // DENIED
  assert.equal(clientHasPermission(userWithDeny, 'post.update_own'), true); // ALLOWED
});

test('Frontend Guards: getVisibleAdminNavItems correctly isolates Super Admin sections', () => {
  const superAdminUser = { userRole: 'super_admin' };
  const adminUser = { userRole: 'admin' };
  const residentUser = { userRole: 'resident' };

  const superNav = getVisibleAdminNavItems(superAdminUser);
  assert.equal(superNav.dashboard, true);
  assert.equal(superNav.users, true);
  assert.equal(superNav.adminManagement, true);
  assert.equal(superNav.roles, true);
  assert.equal(superNav.permissions, true);
  assert.equal(superNav.apiConfig, true);
  assert.equal(superNav.platformSettings, true);
  assert.equal(superNav.backupRestore, true);
  assert.equal(superNav.auditLogs, true);

  const adminNav = getVisibleAdminNavItems(adminUser);
  assert.equal(adminNav.dashboard, true);
  assert.equal(adminNav.users, true);
  assert.equal(adminNav.reports, true);
  assert.equal(adminNav.moderation, true);
  // Strict Super Admin sections hidden from Admin
  assert.equal(adminNav.adminManagement, false);
  assert.equal(adminNav.roles, false);
  assert.equal(adminNav.permissions, false);
  assert.equal(adminNav.apiConfig, false);
  assert.equal(adminNav.platformSettings, false);
  assert.equal(adminNav.backupRestore, false);

  const residentNav = getVisibleAdminNavItems(residentUser);
  assert.equal(residentNav.adminManagement, false);
  assert.equal(residentNav.roles, false);
  assert.equal(residentNav.permissions, false);
  assert.equal(residentNav.apiConfig, false);
});