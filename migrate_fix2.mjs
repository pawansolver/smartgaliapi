import db from './src/config/db.js';
await db.authenticate();

// Link media_file id=2 (image) to post id=4 (gym opening) and id=3 (video) to post id=5 (hello)
// Based on upload order: image was uploaded for "gym opening", video for "hello"
const links = [
  { postId: 5, mediaId: 3, url: '/uploads/post_237abc70-661b-47c2-b1d2-55fd6adea6f9.mp4', type: 'video' },
  { postId: 4, mediaId: 2, url: '/uploads/post_ae66021e-c872-436c-9e10-4cb996906120.png', type: 'image' },
];

for (const link of links) {
  await db.query(`UPDATE posts SET media_url = ?, type = ? WHERE id = ?`, {
    replacements: [link.url, link.type, link.postId]
  });
  console.log(`Linked post ${link.postId} -> ${link.url}`);
}

// Final verify
const [verPosts] = await db.query("SELECT id, media_url, type, created_at FROM posts ORDER BY id DESC LIMIT 5");
console.log('\n=== POSTS FINAL ===');
verPosts.forEach(p => console.log(`  id=${p.id} type=${p.type} media_url="${p.media_url}" created_at="${p.created_at}"`));

await db.close();
