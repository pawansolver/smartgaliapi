/**
 * Frontend / Admin Portal Permission Guard Utilities
 * 
 * Provides client-side helpers to conditionally render navigation,
 * actions, and UI components based on canonical PBAC permissions and roles.
 * 
 * NOTE: UI guards are for user experience only. Backend authorization
 * is always enforced fail-closed on every API route.
 */

/**
 * Check if the user is a Super Administrator (R001)
 * @param {object} user - Current user object with userRole / roles
 * @returns {boolean}
 */
export const isSuperAdmin = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  if (role === 'super_admin' || role === 'superadmin') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some(r => {
      const code = String(r.role_code || r.roleName || r || '').toLowerCase().trim();
      return code === 'super_admin' || code === 'superadmin';
    });
  }
  return false;
};

/**
 * Check if the user has platform administrator authority (R001 or R002)
 * for shared operational duties.
 * @param {object} user
 * @returns {boolean}
 */
export const isGlobalAdmin = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  if (role === 'super_admin' || role === 'superadmin' || role === 'admin') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some(r => {
      const code = String(r.role_code || r.roleName || r || '').toLowerCase().trim();
      return code === 'super_admin' || code === 'superadmin' || code === 'admin';
    });
  }
  return false;
};

/**
 * Check if the user has a specific permission code.
 * Evaluates direct denies, direct allows, and inherited permissions.
 * @param {object} user - User object with permissions array / Set
 * @param {string} permissionCode - e.g. 'post.pin', 'platform_settings.update'
 * @returns {boolean}
 */
export const hasPermission = (user, permissionCode) => {
  if (!user || !permissionCode) return false;

  // Direct DENY check
  if (user.directDenies) {
    const denies = Array.isArray(user.directDenies) ? new Set(user.directDenies) : user.directDenies;
    if (denies.has(permissionCode)) return false;
  }

  // Super Admin check: gets all permissions unless directly denied
  if (isSuperAdmin(user)) return true;

  // Direct ALLOW check
  if (user.directAllows) {
    const allows = Array.isArray(user.directAllows) ? new Set(user.directAllows) : user.directAllows;
    if (allows.has(permissionCode)) return true;
  }

  // Permissions list check
  if (user.permissions) {
    if (Array.isArray(user.permissions)) {
      return user.permissions.includes(permissionCode);
    }
    if (user.permissions instanceof Set) {
      return user.permissions.has(permissionCode);
    }
  }

  return false;
};

/**
 * Check if user has any of the specified permissions
 */
export const hasAnyPermission = (user, permissionCodes = []) => {
  if (!user) return false;
  return permissionCodes.some(code => hasPermission(user, code));
};

/**
 * Check if user has all of the specified permissions
 */
export const hasAllPermissions = (user, permissionCodes = []) => {
  if (!user || permissionCodes.length === 0) return false;
  return permissionCodes.every(code => hasPermission(user, code));
};

/**
 * UI Navigation Visibility Map by Role and Permission
 */
export const getVisibleAdminNavItems = (user) => {
  const isSuper = isSuperAdmin(user);
  const isAdm = isGlobalAdmin(user);

  return {
    // Shared / Operational Admin Sections
    dashboard: isAdm || hasPermission(user, 'analytics.view'),
    users: isAdm || hasPermission(user, 'user.view'),
    communities: isAdm || hasPermission(user, 'community.view'),
    reports: isAdm || hasPermission(user, 'report.review'),
    moderation: isAdm || hasPermission(user, 'post.moderate'),
    feed: true,

    // Super Admin Exclusive Sections (PRD Section 19)
    adminManagement: isSuper || hasPermission(user, 'admin_user.view'),
    roles: isSuper || hasPermission(user, 'role.view'),
    permissions: isSuper || hasPermission(user, 'permission.view'),
    apiConfig: isSuper || hasPermission(user, 'api_config.view'),
    paymentGateway: isSuper || hasPermission(user, 'payment_gateway.view'),
    platformSettings: isSuper || hasPermission(user, 'platform_settings.view'),
    backupRestore: isSuper || hasPermission(user, 'backup.view'),
    auditLogs: isSuper || hasPermission(user, 'audit_log.view'),
    systemMonitoring: isSuper || hasPermission(user, 'system_log.view'),
  };
};