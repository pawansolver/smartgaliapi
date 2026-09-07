import { Op } from 'sequelize';
import sequelize from '../src/config/db.js';
import Role from '../src/modules/role/role.model.js';
import Permission from '../src/modules/permission/permission.model.js';
import RolePermission from '../src/modules/permission/role_permission.model.js';
import User from '../src/modules/user/user.model.js';
import UserRole from '../src/modules/permission/user_role.model.js';

export const SYSTEM_ROLES = [
  { role_code: 'SUPER_ADMIN', roleName: 'Super Administrator', roleDescription: 'Complete platform access with exclusive system administration privileges', scope: 'platform', is_system_role: true },
  { role_code: 'ADMIN', roleName: 'Administrator', roleDescription: 'Platform operational management and moderation', scope: 'platform', is_system_role: true },
  { role_code: 'MODERATOR', roleName: 'Content Moderator', roleDescription: 'Community and content moderation', scope: 'platform', is_system_role: true },
  { role_code: 'RESIDENT', roleName: 'Resident', roleDescription: 'Standard application resident and member', scope: 'platform', is_system_role: true },
  { role_code: 'SOCIETY_ADMIN', roleName: 'Society Administrator', roleDescription: 'Apartment and society administrator', scope: 'society', is_system_role: true },
  { role_code: 'BUSINESS_OWNER', roleName: 'Business Owner', roleDescription: 'Local business owner listings and offers', scope: 'platform', is_system_role: true },
  { role_code: 'SERVICE_PROVIDER', roleName: 'Service Provider', roleDescription: 'Local service provider listings and bookings', scope: 'platform', is_system_role: true },
  { role_code: 'EVENT_ORGANIZER', roleName: 'Event Creator', roleDescription: 'Event creator and manager', scope: 'platform', is_system_role: true },
  { role_code: 'GUEST', roleName: 'Guest User', roleDescription: 'Non-registered visitor', scope: 'platform', is_system_role: true },
];

export const CANONICAL_PERMISSIONS = [
  // User Management
  { permission_code: 'user.view', permission_name: 'View Users', module: 'user', description: 'View user directory and profiles' },
  { permission_code: 'user.create', permission_name: 'Create Users', module: 'user', description: 'Create user records' },
  { permission_code: 'user.update', permission_name: 'Update Users', module: 'user', description: 'Update user profiles and statuses' },
  { permission_code: 'user.delete', permission_name: 'Delete Users', module: 'user', description: 'Soft-delete users' },
  { permission_code: 'user.suspend', permission_name: 'Suspend Users', module: 'user', description: 'Suspend or ban abusive users' },
  { permission_code: 'user.block', permission_name: 'Block Users', module: 'user', description: 'Block abusive users' },
  { permission_code: 'user.unblock', permission_name: 'Unblock Users', module: 'user', description: 'Unblock users' },
  { permission_code: 'user.verify', permission_name: 'Verify Users', module: 'user', description: 'Verify user KYC identity' },

  // Community Management
  { permission_code: 'community.create', permission_name: 'Create Community', module: 'community', description: 'Create a new community' },
  { permission_code: 'community.view', permission_name: 'View Community', module: 'community', description: 'View community details and feed' },
  { permission_code: 'community.update', permission_name: 'Update Community', module: 'community', description: 'Update community settings and info' },
  { permission_code: 'community.delete', permission_name: 'Delete Community', module: 'community', description: 'Delete or deactivate a community' },
  { permission_code: 'community.manage_members', permission_name: 'Manage Community Members', module: 'community', description: 'Manage member roles and status' },
  { permission_code: 'community.member.approve', permission_name: 'Approve Join Requests', module: 'community', description: 'Approve private community join requests' },
  { permission_code: 'community.member.remove', permission_name: 'Remove Community Member', module: 'community', description: 'Remove members from community' },
  { permission_code: 'community.member.ban', permission_name: 'Ban Community Member', module: 'community', description: 'Ban disruptive members' },
  { permission_code: 'community.member.unban', permission_name: 'Unban Community Member', module: 'community', description: 'Unban members' },
  { permission_code: 'community.announcement.create', permission_name: 'Create Community Announcement', module: 'community', description: 'Broadcast pinned announcements' },
  { permission_code: 'community.announcement.delete', permission_name: 'Delete Community Announcement', module: 'community', description: 'Delete announcements' },
  { permission_code: 'community.document.upload', permission_name: 'Upload Community Document', module: 'community', description: 'Upload guidelines and circulars' },
  { permission_code: 'community.document.delete', permission_name: 'Delete Community Document', module: 'community', description: 'Delete circular documents' },
  { permission_code: 'community.media.upload', permission_name: 'Upload Community Media', module: 'community', description: 'Upload gallery photos' },
  { permission_code: 'community.media.delete', permission_name: 'Delete Community Media', module: 'community', description: 'Delete gallery media' },

  // Feed & Posts
  { permission_code: 'post.create', permission_name: 'Create Post', module: 'feed', description: 'Publish feed posts' },
  { permission_code: 'post.view', permission_name: 'View Posts', module: 'feed', description: 'Read feed posts' },
  { permission_code: 'post.update_own', permission_name: 'Update Own Post', module: 'feed', description: 'Edit authored posts' },
  { permission_code: 'post.delete_own', permission_name: 'Delete Own Post', module: 'feed', description: 'Delete authored posts' },
  { permission_code: 'post.delete_any', permission_name: 'Delete Any Post', module: 'feed', description: 'Moderation delete any post' },
  { permission_code: 'post.like', permission_name: 'Like Posts', module: 'feed', description: 'Like and unlike posts' },
  { permission_code: 'post.comment', permission_name: 'Comment on Posts', module: 'feed', description: 'Write comments' },
  { permission_code: 'post.share', permission_name: 'Share Posts', module: 'feed', description: 'Share posts' },
  { permission_code: 'post.pin', permission_name: 'Pin Posts', module: 'feed', description: 'Pin posts to top of feed' },
  { permission_code: 'post.view_analytics', permission_name: 'View Post Analytics', module: 'feed', description: 'View post analytics and reach' },

  // Polls
  { permission_code: 'poll.create', permission_name: 'Create Poll', module: 'poll', description: 'Create community and society polls' },
  { permission_code: 'poll.view', permission_name: 'View Polls', module: 'poll', description: 'View polls and results' },
  { permission_code: 'poll.update_own', permission_name: 'Update Own Poll', module: 'poll', description: 'Edit authored polls' },
  { permission_code: 'poll.delete_own', permission_name: 'Delete Own Poll', module: 'poll', description: 'Delete authored polls' },
  { permission_code: 'poll.delete_any', permission_name: 'Delete Any Poll', module: 'poll', description: 'Moderation delete any poll' },
  { permission_code: 'poll.vote', permission_name: 'Vote in Poll', module: 'poll', description: 'Cast vote in polls' },

  // Events
  { permission_code: 'event.create', permission_name: 'Create Event', module: 'event', description: 'Create neighborhood events' },
  { permission_code: 'event.view', permission_name: 'View Events', module: 'event', description: 'Browse and view events' },
  { permission_code: 'event.update_own', permission_name: 'Update Own Event', module: 'event', description: 'Edit authored events' },
  { permission_code: 'event.delete_own', permission_name: 'Delete Own Event', module: 'event', description: 'Delete authored events' },
  { permission_code: 'event.delete_any', permission_name: 'Delete Any Event', module: 'event', description: 'Moderation delete any event' },
  { permission_code: 'event.cancel', permission_name: 'Cancel Event', module: 'event', description: 'Cancel organized events' },
  { permission_code: 'event.view_participants', permission_name: 'View Event Participants', module: 'event', description: 'View registered attendees' },
  { permission_code: 'event.rsvp', permission_name: 'RSVP to Event', module: 'event', description: 'RSVP yes/no to events' },

  // Residential Society
  { permission_code: 'society.create', permission_name: 'Create Society', module: 'society', description: 'Register housing society' },
  { permission_code: 'society.view', permission_name: 'View Society', module: 'society', description: 'View society profile' },
  { permission_code: 'society.update', permission_name: 'Update Society', module: 'society', description: 'Edit society settings' },
  { permission_code: 'society.delete', permission_name: 'Delete Society', module: 'society', description: 'Deactivate society profile' },
  { permission_code: 'society.manage_members', permission_name: 'Manage Society Members', module: 'society', description: 'Approve and remove flats' },
  { permission_code: 'society.parking.manage', permission_name: 'Manage Society Parking', module: 'society', description: 'Allocate and manage parking slots' },
  { permission_code: 'society.complaint.create', permission_name: 'Create Society Complaint', module: 'society', description: 'Raise maintenance complaint' },
  { permission_code: 'society.complaint.resolve', permission_name: 'Resolve Society Complaint', module: 'society', description: 'Resolve complaints' },
  { permission_code: 'society.visitor.manage', permission_name: 'Manage Society Visitors', module: 'society', description: 'Issue visitor gate passes' },
  { permission_code: 'society.notice.publish', permission_name: 'Publish Society Notices', module: 'society', description: 'Publish circular notices' },

  // Business & Directory
  { permission_code: 'business.create', permission_name: 'Create Business', module: 'business', description: 'Register business listing' },
  { permission_code: 'business.view', permission_name: 'View Business', module: 'business', description: 'View business listings' },
  { permission_code: 'business.update_own', permission_name: 'Update Own Business', module: 'business', description: 'Edit business profile' },
  { permission_code: 'business.delete_own', permission_name: 'Delete Own Business', module: 'business', description: 'Delete business profile' },
  { permission_code: 'business.verify', permission_name: 'Verify Business', module: 'business', description: 'Approve verified business badge' },
  { permission_code: 'business.offers.manage', permission_name: 'Manage Business Offers', module: 'business', description: 'Create and edit discount deals' },
  { permission_code: 'business.analytics.view', permission_name: 'View Business Analytics', module: 'business', description: 'View leads and insights' },
  { permission_code: 'business.reviews.respond', permission_name: 'Respond to Business Reviews', module: 'business', description: 'Reply to customer feedback' },

  // Service Providers
  { permission_code: 'service.create', permission_name: 'Create Service Listing', module: 'service', description: 'Create local service profile' },
  { permission_code: 'service.view', permission_name: 'View Services', module: 'service', description: 'Discover service listings' },
  { permission_code: 'service.update_own', permission_name: 'Update Own Service', module: 'service', description: 'Edit service offerings' },
  { permission_code: 'service.delete_own', permission_name: 'Delete Own Service', module: 'service', description: 'Remove service listing' },
  { permission_code: 'service.availability.manage', permission_name: 'Manage Service Availability', module: 'service', description: 'Set work slots and hours' },
  { permission_code: 'service.booking.manage', permission_name: 'Manage Service Bookings', module: 'service', description: 'Accept and reject appointments' },
  { permission_code: 'service.earnings.view', permission_name: 'View Service Earnings', module: 'service', description: 'View transaction earnings' },

  // Chat & Messaging
  { permission_code: 'chat.one_to_one', permission_name: 'Direct Messaging', module: 'chat', description: 'Send 1-on-1 direct messages' },
  { permission_code: 'chat.group', permission_name: 'Group Chat', module: 'chat', description: 'Participate in group chats' },
  { permission_code: 'chat.media.send', permission_name: 'Send Chat Media', module: 'chat', description: 'Send photos, voice, documents' },
  { permission_code: 'chat.message.delete_own', permission_name: 'Delete Own Message', module: 'chat', description: 'Delete own sent message' },
  { permission_code: 'chat.report', permission_name: 'Report Chat', module: 'chat', description: 'Flag abusive chat messages' },

  // Moderation & Reports
  { permission_code: 'report.create', permission_name: 'Submit Flagged Report', module: 'report', description: 'Report objectionable content' },
  { permission_code: 'report.view', permission_name: 'View Reports', module: 'report', description: 'View flagged reports queue' },
  { permission_code: 'report.review', permission_name: 'Review Reports', module: 'report', description: 'Moderate reported posts and comments' },
  { permission_code: 'report.resolve', permission_name: 'Resolve Reports', module: 'report', description: 'Mark reports resolved/dismissed' },
  { permission_code: 'report.delete', permission_name: 'Delete Reports', module: 'report', description: 'Delete moderation records' },
  { permission_code: 'report.appeal.review', permission_name: 'Review Appeals', module: 'report', description: 'Review banned user appeals' },

  // Content Management System (CMS)
  { permission_code: 'cms.page.create', permission_name: 'Create CMS Page', module: 'cms', description: 'Create static CMS pages' },
  { permission_code: 'cms.page.view', permission_name: 'View CMS Pages', module: 'cms', description: 'View CMS content' },
  { permission_code: 'cms.page.update', permission_name: 'Update CMS Page', module: 'cms', description: 'Edit CMS pages' },
  { permission_code: 'cms.page.delete', permission_name: 'Delete CMS Page', module: 'cms', description: 'Delete CMS pages' },
  { permission_code: 'cms.faq.manage', permission_name: 'Manage FAQs', module: 'cms', description: 'Manage FAQ entries' },
  { permission_code: 'cms.banner.manage', permission_name: 'Manage Banners', module: 'cms', description: 'Manage promotional banners' },
  { permission_code: 'cms.blog.manage', permission_name: 'Manage Blogs', module: 'cms', description: 'Publish company blogs' },

  // Super Admin Exclusive System Administration (PRD 19.11)
  { permission_code: 'admin_user.view', permission_name: 'View Admin Users', module: 'admin_user', description: 'View administrative users' },
  { permission_code: 'admin_user.create', permission_name: 'Create Admin User', module: 'admin_user', description: 'Create platform administrator' },
  { permission_code: 'admin_user.update', permission_name: 'Update Admin User', module: 'admin_user', description: 'Update administrator accounts' },
  { permission_code: 'admin_user.deactivate', permission_name: 'Deactivate Admin User', module: 'admin_user', description: 'Deactivate administrator accounts' },

  { permission_code: 'role.view', permission_name: 'View Roles', module: 'role', description: 'View role registry' },
  { permission_code: 'role.create', permission_name: 'Create Roles', module: 'role', description: 'Create custom platform roles' },
  { permission_code: 'role.update', permission_name: 'Update Roles', module: 'role', description: 'Update role metadata' },
  { permission_code: 'role.delete', permission_name: 'Delete Roles', module: 'role', description: 'Delete custom roles' },

  { permission_code: 'permission.view', permission_name: 'View Permissions', module: 'permission', description: 'View permission registry' },
  { permission_code: 'permission.assign', permission_name: 'Assign Permissions', module: 'permission', description: 'Assign permissions to roles and users' },

  { permission_code: 'audit_log.view', permission_name: 'View Audit Logs', module: 'audit_log', description: 'View compliance audit records' },
  { permission_code: 'system_log.view', permission_name: 'View System Logs', module: 'system_log', description: 'Inspect technical server logs' },

  { permission_code: 'api_config.view', permission_name: 'View API Configuration', module: 'api_config', description: 'View external API integration configs' },
  { permission_code: 'api_config.update', permission_name: 'Update API Configuration', module: 'api_config', description: 'Modify external API credentials and endpoints' },

  { permission_code: 'payment_gateway.view', permission_name: 'View Payment Gateway', module: 'payment_gateway', description: 'View payment gateway settings' },
  { permission_code: 'payment_gateway.update', permission_name: 'Update Payment Gateway', module: 'payment_gateway', description: 'Modify payment gateway keys and configs' },

  { permission_code: 'platform_settings.view', permission_name: 'View Platform Settings', module: 'platform_settings', description: 'View system platform settings' },
  { permission_code: 'platform_settings.update', permission_name: 'Update Platform Settings', module: 'platform_settings', description: 'Modify global platform settings' },

  { permission_code: 'backup.view', permission_name: 'View Backups', module: 'backup', description: 'View backup archive records' },
  { permission_code: 'backup.create', permission_name: 'Create Backup', module: 'backup', description: 'Trigger manual database/system backup' },
  { permission_code: 'backup.restore', permission_name: 'Restore Backup', module: 'backup', description: 'Restore system from backup archive' },
];

export const seedPBACRegistry = async () => {
  console.log('[PBAC Seed] Starting canonical PBAC registry initialization...');

  // 1. Seed / Upsert Roles
  const roleMap = {};
  for (const roleDef of SYSTEM_ROLES) {
    let role = await Role.findOne({ where: { role_code: roleDef.role_code } });
    if (!role) {
      role = await Role.findOne({ where: { roleName: roleDef.roleName } });
    }

    if (role) {
      await role.update({
        role_code: roleDef.role_code,
        roleName: roleDef.roleName,
        roleDescription: roleDef.roleDescription,
        scope: roleDef.scope,
        is_system_role: true,
        is_active: true,
        is_deleted: false,
      });
    } else {
      role = await Role.create({
        role_code: roleDef.role_code,
        roleName: roleDef.roleName,
        roleDescription: roleDef.roleDescription,
        scope: roleDef.scope,
        is_system_role: true,
        is_active: true,
        is_deleted: false,
      });
    }
    roleMap[roleDef.role_code] = role.roleId;
  }
  console.log('[PBAC Seed] Seeded ' + Object.keys(roleMap).length + ' canonical system roles.');

  // 2. Seed / Upsert Permissions
  const permMap = {};
  for (const permDef of CANONICAL_PERMISSIONS) {
    let perm = await Permission.findOne({ where: { permission_code: permDef.permission_code } });
    if (!perm) {
      perm = await Permission.create({
        permission_code: permDef.permission_code,
        permission_name: permDef.permission_name,
        module: permDef.module,
        description: permDef.description,
        is_system_permission: true,
        is_active: true,
        is_deleted: false,
      });
    } else {
      await perm.update({
        permission_name: permDef.permission_name,
        module: permDef.module,
        description: permDef.description,
        is_system_permission: true,
        is_active: true,
        is_deleted: false,
      });
    }
    permMap[permDef.permission_code] = perm.id;
  }
  console.log('[PBAC Seed] Seeded ' + Object.keys(permMap).length + ' canonical permissions.');

  // 3. Map Permissions to Roles (PRD Section 19)
  const roleAssignments = {
    // SUPER_ADMIN gets ALL permissions
    SUPER_ADMIN: Object.keys(permMap),

    // ADMIN gets platform operational permissions (strictly excludes PRD 19.11 Super Admin exclusive modules)
    ADMIN: Object.keys(permMap).filter((code) => {
      const isSuperAdminExclusive = [
        'admin_user.view', 'admin_user.create', 'admin_user.update', 'admin_user.deactivate',
        'role.view', 'role.create', 'role.update', 'role.delete',
        'permission.view', 'permission.assign',
        'api_config.view', 'api_config.update',
        'payment_gateway.view', 'payment_gateway.update',
        'platform_settings.view', 'platform_settings.update',
        'backup.view', 'backup.create', 'backup.restore',
        'audit_log.view', 'system_log.view',
      ].includes(code);
      return !isSuperAdminExclusive;
    }),

    // MODERATOR gets content moderation, reports, and community review
    MODERATOR: [
      'user.view',
      'community.view',
      'post.view', 'post.delete_any', 'post.pin', 'post.like', 'post.comment', 'post.share',
      'poll.view', 'poll.delete_any', 'poll.vote',
      'event.view', 'event.rsvp',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create', 'report.view', 'report.review', 'report.resolve', 'report.appeal.review',
      'cms.page.view',
    ],

    // RESIDENT / STANDARD USER
    RESIDENT: [
      'user.view',
      'community.create', 'community.view',
      'post.create', 'post.view', 'post.update_own', 'post.delete_own', 'post.like', 'post.comment', 'post.share',
      'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
      'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.rsvp',
      'society.view', 'society.complaint.create',
      'business.view',
      'service.view',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create',
      'cms.page.view',
    ],

    // SOCIETY ADMIN
    SOCIETY_ADMIN: [
      'user.view',
      'community.create', 'community.view',
      'post.create', 'post.view', 'post.update_own', 'post.delete_own', 'post.like', 'post.comment', 'post.share',
      'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
      'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.rsvp',
      'society.create', 'society.view', 'society.update', 'society.manage_members', 'society.parking.manage', 'society.complaint.create', 'society.complaint.resolve', 'society.visitor.manage', 'society.notice.publish',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create',
      'cms.page.view',
    ],

    // BUSINESS OWNER
    BUSINESS_OWNER: [
      'user.view',
      'community.create', 'community.view',
      'post.create', 'post.view', 'post.update_own', 'post.delete_own', 'post.like', 'post.comment', 'post.share', 'post.view_analytics',
      'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
      'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.rsvp',
      'business.create', 'business.view', 'business.update_own', 'business.delete_own', 'business.offers.manage', 'business.analytics.view', 'business.reviews.respond',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create',
      'cms.page.view',
    ],

    // SERVICE PROVIDER
    SERVICE_PROVIDER: [
      'user.view',
      'community.create', 'community.view',
      'post.create', 'post.view', 'post.update_own', 'post.delete_own', 'post.like', 'post.comment', 'post.share',
      'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
      'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.rsvp',
      'service.create', 'service.view', 'service.update_own', 'service.delete_own', 'service.availability.manage', 'service.booking.manage', 'service.earnings.view',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create',
      'cms.page.view',
    ],

    // EVENT ORGANIZER
    EVENT_ORGANIZER: [
      'user.view',
      'community.create', 'community.view',
      'post.create', 'post.view', 'post.update_own', 'post.delete_own', 'post.like', 'post.comment', 'post.share',
      'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
      'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.cancel', 'event.view_participants', 'event.rsvp',
      'chat.one_to_one', 'chat.group', 'chat.media.send', 'chat.message.delete_own', 'chat.report',
      'report.create',
      'cms.page.view',
    ],

    // GUEST USER
    GUEST: [
      'user.view',
      'community.view',
      'post.view',
      'poll.view',
      'event.view',
      'business.view',
      'service.view',
      'cms.page.view',
    ],
  };

  let assignedCount = 0;
  for (const [roleCode, permCodes] of Object.entries(roleAssignments)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;

    for (const permCode of permCodes) {
      const permId = permMap[permCode];
      if (!permId) continue;

      const [, created] = await RolePermission.findOrCreate({
        where: { role_id: roleId, permission_id: permId },
      });
      if (created) assignedCount++;
    }
  }
  console.log('[PBAC Seed] Assigned ' + assignedCount + ' new role-permission mappings.');

  // 4. Migrate existing users into user_roles idempotently
  const users = await User.findAll({ attributes: ['userId', 'userRole'] });
  let migratedUserRoles = 0;

  const roleCodeMapping = {
    super_admin: 'SUPER_ADMIN',
    superadmin: 'SUPER_ADMIN',
    admin: 'ADMIN',
    moderator: 'MODERATOR',
    resident: 'RESIDENT',
    shopkeeper: 'BUSINESS_OWNER',
    business_owner: 'BUSINESS_OWNER',
    service_provider: 'SERVICE_PROVIDER',
    society_admin: 'SOCIETY_ADMIN',
  };

  for (const user of users) {
    const rawRole = String(user.userRole || 'resident').toLowerCase().trim();
    const canonicalCode = roleCodeMapping[rawRole] || 'RESIDENT';
    const roleId = roleMap[canonicalCode];

    if (roleId) {
      const [, created] = await UserRole.findOrCreate({
        where: { user_id: user.userId, role_id: roleId },
      });
      if (created) migratedUserRoles++;
    }
  }
  console.log('[PBAC Seed] Migrated ' + migratedUserRoles + ' users into user_roles table.');
  console.log('[PBAC Seed] Seed completed successfully!');
};

if (process.argv[1] && process.argv[1].endsWith('seed_pbac_registry.js')) {
  seedPBACRegistry().then(() => process.exit(0)).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

export default seedPBACRegistry;
