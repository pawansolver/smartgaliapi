import sequelize from '../src/config/db.js';
import SocietyServiceAccess from '../src/modules/society_service_access/society_service_access.model.js';
import Permission from '../src/modules/permission/permission.model.js';

async function migrate() {
  console.log('[MIGRATION] Starting Society Service Access Migration...');
  
  // 1. Sync SocietyServiceAccess table
  await SocietyServiceAccess.sync({ alter: true });
  console.log('[MIGRATION] Table society_service_accesses verified & synchronized.');

  // 2. Seed Permissions
  const permissionsToSeed = [
    {
      permission_code: 'society.service_provider.view',
      permission_name: 'View Society Service Provider Requests',
      module: 'society_service',
      description: 'Allows Society Admin to view incoming provider service access requests',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_provider.approve',
      permission_name: 'Approve Society Service Provider Request',
      module: 'society_service',
      description: 'Allows Society Admin to approve a provider service listing for community residents',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_provider.reject',
      permission_name: 'Reject Society Service Provider Request',
      module: 'society_service',
      description: 'Allows Society Admin to reject a provider service listing with mandatory reason',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_provider.suspend',
      permission_name: 'Suspend Society Service Provider Access',
      module: 'society_service',
      description: 'Allows Society Admin to suspend an active provider service access',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_provider.revoke',
      permission_name: 'Revoke Society Service Provider Access',
      module: 'society_service',
      description: 'Allows Society Admin to permanently revoke a provider service access',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_coverage.view',
      permission_name: 'View Society Service Coverage Matrix',
      module: 'society_service',
      description: 'Allows viewing approved services and operational coverage for the society',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
    {
      permission_code: 'society.service_coverage.manage',
      permission_name: 'Manage Society Service Coverage Rules',
      module: 'society_service',
      description: 'Allows managing society-level service coverage policies and rules',
      is_system_permission: true,
      is_active: true,
      is_deleted: false,
    },
  ];

  for (const perm of permissionsToSeed) {
    const existing = await Permission.findOne({ where: { permission_code: perm.permission_code } });
    if (!existing) {
      await Permission.create(perm);
      console.log(`[MIGRATION] Seeded permission: ${perm.permission_code}`);
    } else {
      console.log(`[MIGRATION] Permission already exists: ${perm.permission_code}`);
    }
  }

  console.log('[MIGRATION] Society Service Access Migration Complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[MIGRATION ERROR]', err);
  process.exit(1);
});
