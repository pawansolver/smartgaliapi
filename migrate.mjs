import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'srv1100.hstgr.io',
  port: 3306,
  user: 'u963801592_smartgaliU',
  password: 'SmartGali232026',
  database: 'u963801592_SmartGali'
});

const [cols] = await conn.query('SHOW COLUMNS FROM posts');
const colNames = cols.map(c => c.Field);
console.log('Existing posts columns:', colNames.join(', '));

if (!colNames.includes('type')) {
  await conn.query(`ALTER TABLE posts ADD COLUMN type ENUM('text','image','video','poll','event','mixed') NOT NULL DEFAULT 'text' AFTER content`);
  console.log('Added: type column');
} else {
  console.log('Skip: type already exists');
}

if (!colNames.includes('visibility')) {
  await conn.query(`ALTER TABLE posts ADD COLUMN visibility ENUM('public','private','friends','community','followers') NOT NULL DEFAULT 'public' AFTER type`);
  console.log('Added: visibility column');
} else {
  console.log('Skip: visibility already exists');
}

if (!colNames.includes('shares_count')) {
  await conn.query('ALTER TABLE posts ADD COLUMN shares_count INT NOT NULL DEFAULT 0 AFTER comments_count');
  console.log('Added: shares_count column');
} else {
  console.log('Skip: shares_count already exists');
}

// Check post_likes table too
const [likeCols] = await conn.query('SHOW COLUMNS FROM post_likes');
const likeColNames = likeCols.map(c => c.Field);
console.log('post_likes columns:', likeColNames.join(', '));

// Check saved_posts
const [savedCols] = await conn.query('SHOW COLUMNS FROM saved_posts');
console.log('saved_posts columns:', savedCols.map(c => c.Field).join(', '));

// Check post_shares
const [shareCols] = await conn.query('SHOW COLUMNS FROM post_shares');
console.log('post_shares columns:', shareCols.map(c => c.Field).join(', '));

const [finalCols] = await conn.query('SHOW COLUMNS FROM posts');
console.log('\nFinal posts columns:', finalCols.map(c => c.Field).join(', '));

await conn.end();
console.log('\nMigration complete!');
