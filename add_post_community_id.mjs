// Add community_id column to posts table if missing
import seq from './src/config/db.js';

async function main() {
  await seq.authenticate();
  console.log('✅ DB Connected');

  const [cols] = await seq.query('DESCRIBE posts');
  const colNames = cols.map(c => c.Field);

  if (!colNames.includes('community_id')) {
    await seq.query('ALTER TABLE `posts` ADD COLUMN `community_id` BIGINT NULL DEFAULT NULL AFTER `user_id`');
    await seq.query('ALTER TABLE `posts` ADD INDEX `idx_posts_community_id` (`community_id`)');
    console.log('✅ Added community_id column and index to posts table');
  } else {
    console.log('ℹ️ community_id column already exists in posts table');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
