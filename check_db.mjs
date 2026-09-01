import db from './src/config/db.js';
import env from './src/config/env.js';

await db.authenticate();

// Raw query to check media_files
const [mediaRows] = await db.query('SELECT id, url, type, created_at FROM media_files ORDER BY id DESC LIMIT 5');
console.log('\n=== MEDIA FILES (last 5) ===');
mediaRows.forEach(m => console.log(`id=${m.id} url="${m.url}" type=${m.type}`));

// Raw query to check posts
const [postRows] = await db.query('SELECT id, media_url, type, created_at, LEFT(content, 30) as content FROM posts ORDER BY id DESC LIMIT 5');
console.log('\n=== POSTS (last 5) ===');
postRows.forEach(p => console.log(`id=${p.id} type=${p.type} media_url="${p.media_url}" created_at="${p.created_at}" content="${p.content}"`));

console.log('\nuploadsPath:', env.uploadsPath);
await db.close();
