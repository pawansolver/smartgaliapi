// Sync missing columns to communities table
import seq from './src/config/db.js';

async function main() {
  await seq.authenticate();
  console.log('✅ DB connected\n');

  // First: see ALL columns in communities
  const [allCols] = await seq.query('DESCRIBE `communities`');
  const existing = allCols.map(c => c.Field);
  console.log('Existing communities columns:', existing.join(', '));

  // Columns that need to be added
  const toAdd = [
    { name: 'icon', sql: 'VARCHAR(500) NULL DEFAULT NULL' },
    { name: 'rules', sql: 'JSON NULL DEFAULT NULL' },
    { name: 'members_count', sql: 'INT NOT NULL DEFAULT 0' },
    { name: 'posts_count', sql: 'INT NOT NULL DEFAULT 0' },
    { name: 'updated_by', sql: 'BIGINT NULL DEFAULT NULL' },
    { name: 'updatedAt', sql: 'DATETIME NULL DEFAULT NULL' },
    { name: 'deletedRemarks', sql: 'TEXT NULL DEFAULT NULL' },
  ];

  console.log('\n=== ADDING MISSING COLUMNS ===');
  for (const col of toAdd) {
    if (existing.includes(col.name)) {
      console.log(`  ✅ ${col.name} already exists`);
    } else {
      try {
        await seq.query(`ALTER TABLE \`communities\` ADD COLUMN \`${col.name}\` ${col.sql}`);
        console.log(`  ✅ ADDED: ${col.name}`);
      } catch(e) {
        console.error(`  ❌ FAILED ${col.name}: ${e.message}`);
      }
    }
  }

  // Verify final state
  const [finalCols] = await seq.query('DESCRIBE `communities`');
  console.log('\nFinal communities columns:', finalCols.map(c => c.Field).join(', '));

  // Test the failing query
  console.log('\n=== QUERY TEST AFTER FIX ===');
  try {
    const [rows] = await seq.query(`
      SELECT c.communityId, c.communityName, c.members_count
      FROM communities c
      WHERE c.is_deleted = 0 AND c.status = 'active'
      ORDER BY c.members_count DESC
      LIMIT 10
    `);
    console.log('✅ getSuggested query OK:', rows.length, 'rows');
    if (rows.length > 0) console.log('  Sample:', JSON.stringify(rows[0]));
  } catch(e) {
    console.error('❌ getSuggested STILL FAILED:', e.message);
  }

  setTimeout(() => process.exit(0), 100).unref();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
