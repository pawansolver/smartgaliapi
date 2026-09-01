// Check DB tables - run from backend directory
// Usage: node check_tables.mjs (from smartgaliapi-main directory)
import seq from './src/config/db.js';

async function main() {
  await seq.authenticate();
  console.log('✅ DB connected\n');

  const tables = [
    'communities', 
    'community_categories', 
    'community_members', 
    'community_polls', 
    'community_poll_votes', 
    'community_announcements', 
    'community_documents', 
    'community_media', 
    'community_join_requests'
  ];

  for (const t of tables) {
    try {
      const [rows] = await seq.query(`SHOW TABLES LIKE '${t}'`);
      if (rows.length === 0) {
        console.log('❌ MISSING: ' + t);
      } else {
        const [desc] = await seq.query('DESCRIBE `' + t + '`');
        console.log('✅ ' + t + ' (' + desc.length + ' cols): ' + desc.map(c => c.Field).slice(0,10).join(', '));
      }
    } catch(e) {
      console.error('❌ ' + t + ': ' + e.message);
    }
  }
  
  // Also show actual error from getMyCommunities query
  console.log('\n=== QUERY TEST ===');
  try {
    const [rows] = await seq.query(`
      SELECT cm.communityMemberId, cm.role, cm.joined_at, c.communityId, c.communityName
      FROM community_members cm
      JOIN communities c ON cm.community_id = c.communityId
      WHERE cm.user_id = 27 AND cm.status = 'active' AND cm.is_deleted = 0 AND c.is_deleted = 0
    `);
    console.log('getMyCommunities raw SQL OK:', rows.length, 'rows');
  } catch(e) {
    console.error('getMyCommunities SQL FAILED:', e.message);
  }

  try {
    const [rows] = await seq.query(`
      SELECT c.communityId, c.communityName, c.members_count
      FROM communities c
      WHERE c.is_deleted = 0 AND c.status = 'active'
      ORDER BY c.members_count DESC
      LIMIT 10
    `);
    console.log('getSuggested raw SQL OK:', rows.length, 'rows');
  } catch(e) {
    console.error('getSuggested SQL FAILED:', e.message);
  }

  setTimeout(() => process.exit(0), 100).unref();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
