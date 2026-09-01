import db from './src/config/db.js';
await db.authenticate();

// Fix 1: media_files.url — add /uploads/ prefix if missing
const [mediaRows] = await db.query("SELECT id, url FROM media_files WHERE url NOT LIKE '/uploads/%' AND url NOT LIKE 'http%'");
console.log(`\nFixing ${mediaRows.length} media_file URLs...`);
for (const m of mediaRows) {
  const newUrl = `/uploads/${m.url.replace(/^.*[\\/]/, '')}`;  // strip any path, keep filename
  await db.query(`UPDATE media_files SET url = ? WHERE id = ?`, { replacements: [newUrl, m.id] });
  console.log(`  id=${m.id}: "${m.url}" -> "${newUrl}"`);
}

// Fix 2: posts.created_at — set to NOW() for posts where it is NULL
const [nullPosts] = await db.query("SELECT id FROM posts WHERE created_at IS NULL");
console.log(`\nFixing ${nullPosts.length} posts with NULL created_at...`);
if (nullPosts.length > 0) {
  const ids = nullPosts.map(p => p.id).join(',');
  // Set to different times so they sort correctly
  for (let i = 0; i < nullPosts.length; i++) {
    const dt = new Date(Date.now() - (nullPosts.length - i) * 60000 * 5); // 5 min apart
    await db.query(`UPDATE posts SET created_at = ? WHERE id = ?`, { 
      replacements: [dt.toISOString().slice(0,19).replace('T',' '), nullPosts[i].id] 
    });
    console.log(`  post id=${nullPosts[i].id} -> ${dt.toISOString()}`);
  }
}

// Verify
const [verMedia] = await db.query("SELECT id, url FROM media_files ORDER BY id DESC LIMIT 5");
console.log('\n=== MEDIA FILES AFTER FIX ===');
verMedia.forEach(m => console.log(`  id=${m.id} url="${m.url}"`));

const [verPosts] = await db.query("SELECT id, media_url, type, created_at FROM posts ORDER BY id DESC LIMIT 5");
console.log('\n=== POSTS AFTER FIX ===');
verPosts.forEach(p => console.log(`  id=${p.id} type=${p.type} media_url="${p.media_url}" created_at="${p.created_at}"`));

await db.close();
