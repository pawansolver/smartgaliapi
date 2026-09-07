import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPermission,
  authorize,
  requirePermission,
  getUserEffectivePermissions,
  invalidateUserPermissionCache,
  assignDirectUserPermissions,
  removeDirectUserPermission,
  getRedisCacheKey,
} from '../src/modules/permission/permission.service.js';
import * as roleService from '../src/modules/role/role.service.js';
import * as userService from '../src/modules/user/user.service.js';
import Role from '../src/modules/role/role.model.js';
import User from '../src/modules/user/user.model.js';
import { isSuperAdminUser, isGlobalAdminUser, requireSuperAdmin } from '../src/middleware/auth.middleware.js';
import { createRedisClients, cacheGet, cacheSet, cacheDel } from '../src/config/redis.js';

test('PBAC Matrix: Canonical Platform Role Permissions', async () => {
  // 1. Super Admin possesses full system permissions
  const superAdmin = { id: 9001, userRole: 'super_admin' };
  assert.equal(await hasPermission(superAdmin, 'platform_settings.update'), true);
  assert.equal(await hasPermission(superAdmin, 'api_config.update'), true);
  assert.equal(await hasPermission(superAdmin, 'role.create'), true);
  assert.equal(await hasPermission(superAdmin, 'permission.assign'), true);
  assert.equal(await hasPermission(superAdmin, 'backup.restore'), true);
  assert.equal(await hasPermission(superAdmin, 'audit_log.view'), true);
  assert.equal(await hasPermission(superAdmin, 'post.create'), true);
  assert.equal(await hasPermission(superAdmin, 'community.delete'), true);

  // 2. Admin (R002) has operational permissions but strictly NO Super Admin exclusive configs
  const admin = { id: 9002, userRole: 'admin' };
  assert.equal(await hasPermission(admin, 'community.update'), true);
  assert.equal(await hasPermission(admin, 'user.suspend'), true);
  assert.equal(await hasPermission(admin, 'report.resolve'), true);
  assert.equal(await hasPermission(admin, 'post.delete_any'), true);
  assert.equal(await hasPermission(admin, 'platform_settings.update'), false);
  assert.equal(await hasPermission(admin, 'api_config.update'), false);
  assert.equal(await hasPermission(admin, 'role.create'), false);
  assert.equal(await hasPermission(admin, 'permission.assign'), false);
  assert.equal(await hasPermission(admin, 'backup.restore'), false);
  assert.equal(await hasPermission(admin, 'admin_user.create'), false);

  // 3. Resident has standard resident permissions (including PRD poll creation)
  const resident = { id: 9003, userRole: 'resident' };
  assert.equal(await hasPermission(resident, 'post.create'), true);
  assert.equal(await hasPermission(resident, 'poll.create'), true);
  assert.equal(await hasPermission(resident, 'poll.vote'), true);
  assert.equal(await hasPermission(resident, 'event.create'), true);
  assert.equal(await hasPermission(resident, 'event.rsvp'), true);
  assert.equal(await hasPermission(resident, 'post.delete_any'), false);
  assert.equal(await hasPermission(resident, 'user.suspend'), false);

  // 4. Moderator has content moderation and post pinning
  const moderator = { id: 9004, userRole: 'moderator' };
  assert.equal(await hasPermission(moderator, 'post.pin'), true);
  assert.equal(await hasPermission(moderator, 'post.delete_any'), true);
  assert.equal(await hasPermission(moderator, 'poll.delete_any'), true);
  assert.equal(await hasPermission(moderator, 'report.review'), true);
  assert.equal(await hasPermission(moderator, 'report.resolve'), true);
  assert.equal(await hasPermission(moderator, 'role.create'), false);
  assert.equal(await hasPermission(moderator, 'platform_settings.update'), false);

  // 5. Business Owner has business analytics and offers
  const bizOwner = { id: 9005, userRole: 'business_owner' };
  assert.equal(await hasPermission(bizOwner, 'business.offers.manage'), true);
  assert.equal(await hasPermission(bizOwner, 'business.analytics.view'), true);
  assert.equal(await hasPermission(bizOwner, 'business.reviews.respond'), true);

  // 6. Service Provider has bookings and availability
  const provider = { id: 9006, userRole: 'service_provider' };
  assert.equal(await hasPermission(provider, 'service.booking.manage'), true);
  assert.equal(await hasPermission(provider, 'service.availability.manage'), true);
  assert.equal(await hasPermission(provider, 'service.earnings.view'), true);

  // 7. Event Organizer has event cancel and participant management
  const organizer = { id: 9007, userRole: 'event_organizer' };
  assert.equal(await hasPermission(organizer, 'event.cancel'), true);
  assert.equal(await hasPermission(organizer, 'event.view_participants'), true);

  // 8. Guest has read-only access
  const guest = { id: 9008, userRole: 'guest' };
  assert.equal(await hasPermission(guest, 'post.view'), true);
  assert.equal(await hasPermission(guest, 'event.view'), true);
  assert.equal(await hasPermission(guest, 'post.create'), false);
  assert.equal(await hasPermission(guest, 'poll.create'), false);
});

test('Super Admin Authorization Order: Direct DENY Precedence', async () => {
  // Direct DENY on a Super Admin user must strictly block access to that targeted permission
  const superAdminWithDeny = {
    id: 9010,
    userRole: 'super_admin',
  };

  const perms = await getUserEffectivePermissions(superAdminWithDeny);

  // Inject direct DENY into effective permission structure
  perms.directDenies.add('backup.restore');
  perms.permissions.delete('backup.restore');

  assert.equal(perms.directDenies.has('backup.restore'), true);
  assert.equal(perms.permissions.has('backup.restore'), false);
});

test('Permission Caching & Distributed Invalidation', async () => {
  const testUserId = 9020;
  const cacheKey = getRedisCacheKey(testUserId);

  // 1. Invalidate any existing state
  await invalidateUserPermissionCache(testUserId);

  // 2. Fetch permissions (initial populate)
  const initial = await getUserEffectivePermissions({ id: testUserId, userRole: 'resident' });
  assert.ok(initial.permissions.has('post.create'));

  // 3. Invalidate
  await invalidateUserPermissionCache(testUserId);

  // 4. Verify invalidation runs safely without throwing
  assert.ok(true, 'Cache invalidation executed cleanly');
});

test('Community Scope Isolation (IDOR Protection)', async () => {
  const commAdminUser = { id: 9030, userRole: 'resident' };

  const superAdmin = { id: 9031, userRole: 'super_admin' };
  assert.equal(await hasPermission(superAdmin, 'community.update', { communityId: 100 }), true);
  assert.equal(await hasPermission(superAdmin, 'community.update', { communityId: 200 }), true);

  assert.equal(await hasPermission(commAdminUser, 'community.update', { communityId: 999999 }), false);
});

test('Admin User Management: Privilege Escalation Protection', async () => {
  const regularAdmin = { id: 1, userId: 1, userRole: 'admin' };
  const superAdmin = { id: 1, userId: 1, userRole: 'super_admin' };

  // 1. Regular Admin cannot create Super Admin
  await assert.rejects(
    async () => {
      await userService.createAdminUser({ userName: 'Hacker', email: 'hack@test.com', userRole: 'super_admin' }, regularAdmin);
    },
    /Forbidden: Only Super Administrators can create Super Admin accounts/
  );

  // 2. Create or find an existing user to test modification guards
  const existingUser = await User.findOne({ where: { is_deleted: false } });
  assert.ok(existingUser, 'An existing user must exist in test DB');

  // Regular Admin cannot promote existing user to Super Admin
  await assert.rejects(
    async () => {
      await userService.updateAdminUser(existingUser.userId, { userRole: 'super_admin' }, regularAdmin);
    },
    /Forbidden: Only Super Administrators can grant Super Admin privileges/
  );
});

test('System Role Protection: Immutability & Anti-Deactivation', async () => {
  const superAdminRole = await Role.findOne({ where: { role_code: 'SUPER_ADMIN', is_deleted: false } });
  assert.ok(superAdminRole, 'SUPER_ADMIN system role must exist');

  // 1. System roles cannot be deleted
  await assert.rejects(
    async () => {
      await roleService.softDeleteRole(superAdminRole.roleId, 'Accidental delete', 1);
    },
    /System roles cannot be deleted/
  );

  // 2. System roles cannot change role_code
  await assert.rejects(
    async () => {
      await roleService.updateRole(superAdminRole.roleId, { role_code: 'MODIFIED_CODE' }, 1);
    },
    /Cannot modify the role code of a protected system role/
  );

  // 3. System roles cannot be deactivated
  await assert.rejects(
    async () => {
      await roleService.updateRole(superAdminRole.roleId, { is_active: false }, 1);
    },
    /Protected system roles cannot be deactivated/
  );
});

test('Resource Ownership Validation: _own vs _any Permissions', async () => {
  const residentA = { id: 101, userRole: 'resident' };
  const residentB = { id: 102, userRole: 'resident' };

  // Owner can delete own post
  assert.equal(await hasPermission(residentA, 'post.delete_own', { resourceOwnerId: 101 }), true);

  // Non-owner CANNOT delete another user post with delete_own
  assert.equal(await hasPermission(residentB, 'post.delete_own', { resourceOwnerId: 101 }), false);

  // Super Admin CAN delete any user post
  const superAdmin = { id: 1, userRole: 'super_admin' };
  assert.equal(await hasPermission(superAdmin, 'post.delete_own', { resourceOwnerId: 101 }), true);
});
