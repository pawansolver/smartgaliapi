// Quick fix: Activate all pending society members that belong to the society owner/creator
// Run: node fix_pending_members.js

import sequelize from './src/config/db.js';

async function fixPendingMembers() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');

    // Activate members who are society owners but stuck in pending
    const [results1] = await sequelize.query(
      UPDATE society_members sm
      INNER JOIN society_profiles sp ON sm.society_id = sp.id
      SET sm.status = 'active', sm.joined_at = NOW(), sm.updatedAt = NOW()
      WHERE (sm.user_id = sp.user_id OR sm.user_id = sp.created_by)
        AND sm.status = 'pending'
        AND sm.is_deleted = false
    );
    console.log('Owner members activated:', results1?.affectedRows || 0);

    // Also activate ALL pending members (since app auto-activates now)
    const [results2] = await sequelize.query(
      UPDATE society_members
      SET status = 'active', joined_at = COALESCE(joined_at, NOW()), updatedAt = NOW()
      WHERE status = 'pending' AND is_deleted = false
    );
    console.log('All pending members activated:', results2?.affectedRows || 0);

    console.log('Done! All members are now active.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixPendingMembers();
