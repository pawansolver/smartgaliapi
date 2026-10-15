import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import seq from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/config/db.js';
import env from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/config/env.js';
import User from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/user/user.model.js';
import UserPermission from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/permission/user_permission.model.js';
import Permission from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/permission/permission.model.js';
import Role from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/role/role.model.js';
import RolePermission from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/permission/role_permission.model.js';
import { requireCategoryManagement } from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/service_category/service_category.routes.js';
import { invalidateUserPermissionCache } from 'file:///C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/permission/permission.service.js';

test('TEST 12 — Admin Authorization for Category & Subcategory Management', async (t) => {
  const ts = Date.now();
  let superAdminUser;
  let adminWithPermUser;
  let adminWithoutPermUser;
  let perm;

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

  await t.test('Setup: Create Super Admin, Admin with perm, Admin without perm', async () => {
    // 1. Permission record
    perm = await Permission.findOne({ where: { permission_code: 'service_category.manage' } });
    assert.ok(perm, 'service_category.manage permission must exist');

    // 2. Super Admin user (R001)
    superAdminUser = await User.create({
      userName: `SuperAdmin_${ts}`,
      email: `superadmin_${ts}@smartgali.com`,
      userRole: 'super_admin',
      is_active: true,
      status: 'active',
    });

    // 3. Admin user with permission (R002)
    adminWithPermUser = await User.create({
      userName: `AdminWithPerm_${ts}`,
      email: `admin_with_perm_${ts}@smartgali.com`,
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });
    // Ensure direct allow
    await UserPermission.create({
      user_id: adminWithPermUser.userId,
      permission_id: perm.id,
      effect: 'ALLOW',
      is_active: true,
      is_deleted: false,
    });
    await invalidateUserPermissionCache(adminWithPermUser.userId);

    // 4. Admin user WITHOUT permission (R002)
    adminWithoutPermUser = await User.create({
      userName: `AdminWithoutPerm_${ts}`,
      email: `admin_without_perm_${ts}@smartgali.com`,
      userRole: 'admin',
      is_active: true,
      status: 'active',
    });
    // Explicit DENY to test strict failure
    await UserPermission.create({
      user_id: adminWithoutPermUser.userId,
      permission_id: perm.id,
      effect: 'DENY',
      is_active: true,
      is_deleted: false,
    });
    await invalidateUserPermissionCache(adminWithoutPermUser.userId);
  });

  await t.test('R001 Super Admin retains full authority -> PASS', async () => {
    const result = await runMiddleware(requireCategoryManagement, {
      user: { id: superAdminUser.userId, userId: superAdminUser.userId, userRole: 'super_admin' },
    });
    assert.equal(result.passed, true, 'Super Admin must pass requireCategoryManagement');
    assert.equal(result.status, null);
  });

  await t.test('R002 Admin WITH category-management permission -> PASS', async () => {
    const result = await runMiddleware(requireCategoryManagement, {
      user: { id: adminWithPermUser.userId, userId: adminWithPermUser.userId, userRole: 'admin' },
    });
    assert.equal(result.passed, true, 'Admin with permission must pass requireCategoryManagement');
    assert.equal(result.status, null);
  });

  await t.test('R002 Admin WITHOUT category-management permission -> 403 Forbidden', async () => {
    const result = await runMiddleware(requireCategoryManagement, {
      user: { id: adminWithoutPermUser.userId, userId: adminWithoutPermUser.userId, userRole: 'admin' },
    });
    assert.equal(result.passed, false, 'Admin without permission must NOT pass');
    assert.equal(result.status, 403, 'Must return 403 Forbidden');
    assert.match(result.data.message, /Forbidden.*permission required/i);
  });

  await t.test('Cleanup test users', async () => {
    await UserPermission.destroy({ where: { user_id: [adminWithPermUser.userId, adminWithoutPermUser.userId] } });
    await User.destroy({ where: { userId: [superAdminUser.userId, adminWithPermUser.userId, adminWithoutPermUser.userId] } });
  });
});
