/**
 * SmartGali High-Speed Load Test Data Seeder
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Uses bulkCreate batching to complete 120 users, 2500+ follows, 500 posts,
 * and 3000+ engagement rows in seconds over WAN database connections.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import sequelize, { connectDB } from '../../../config/db.js';
import env from '../../../config/env.js';
import User from '../../../modules/user/user.model.js';
import UserProfile from '../../../modules/userProfile/userProfile.model.js';
import Follow from '../../../modules/follow/follow.model.js';
import Post from '../../../modules/post/post.model.js';
import PostLike from '../../../modules/post_like/post_like.model.js';
import PostComment from '../../../modules/post_comment/post_comment.model.js';
import { backfillCounters } from '../../../database/migrations/backfill_post_counters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

const TOTAL_USERS = 120;
const TOTAL_POSTS = 500;
const TEST_PASSWORD = 'LoadTestPassword@2026';
const USER_PREFIX = 'loadtest_user_';
const EMAIL_DOMAIN = '@smartgali.test';

const LOCATIONS = [
  'Indira Nagar, Bengaluru',
  'Koramangala, Bengaluru',
  'HSR Layout, Bengaluru',
  'Whitefield, Bengaluru',
  'Boring Road, Patna',
  'Kankarbagh, Patna',
  'Bailey Road, Patna',
  'Rajendra Nagar, Patna',
  'Sector 62, Noida',
  'DLF Phase 3, Gurugram',
];

const SAMPLE_POST_CONTENTS = [
  'Good morning neighbours! Power cut scheduled today between 2 PM to 4 PM for transformer maintenance.',
  'Anyone know a reliable electrician or plumber in our colony? Please drop contact details.',
  'Community clean-up drive this Sunday at 8 AM near the central park. Everyone is welcome to join! ðŸ§¹ðŸŒ¿',
  'Found a lost set of keys near the society clubhouse entrance. Please DM me to collect.',
  'Delicious home-cooked lunch tiffin service starting from next Monday. DM for weekly menu!',
  'Traffic alert: Water pipeline repair work going on main cross road. Please take the service lane detour.',
  'Evening badminton tournament registrations open for society residents! Contact sports committee.',
  'Fresh organic farm mangoes and vegetables arriving tomorrow morning at community gate #2.',
  'Beware of stray dog pack near back exit gate after 10 PM. Municipality complaint registered.',
  'Lost pet cat (white Persian with red collar) last seen near block C garden. Reward for finder!',
];

export const cleanupLoadTestData = async () => {
  console.log('ðŸ§¹ Cleaning up existing load test data...');

  const testUsers = await User.findAll({
    where: { userName: { [Op.like]: `${USER_PREFIX}%` } },
    attributes: ['userId'],
  });
  const userIds = testUsers.map((u) => Number(u.userId));

  if (userIds.length === 0) {
    console.log('âœ… No existing load test data found to clean.');
    return;
  }

  console.log(`Found ${userIds.length} load test users to clean...`);

  const testPosts = await Post.findAll({
    where: { user_id: userIds },
    attributes: ['id'],
  });
  const postIds = testPosts.map((p) => Number(p.id));

  if (postIds.length > 0) {
    await sequelize.query('DELETE FROM post_likes WHERE post_id IN (?) OR user_id IN (?)', {
      replacements: [postIds, userIds],
    }).catch(() => {});
    await sequelize.query('DELETE FROM post_comments WHERE post_id IN (?) OR user_id IN (?)', {
      replacements: [postIds, userIds],
    }).catch(() => {});
    await sequelize.query('DELETE FROM post_shares WHERE post_id IN (?) OR user_id IN (?)', {
      replacements: [postIds, userIds],
    }).catch(() => {});
    await sequelize.query('DELETE FROM saved_posts WHERE post_id IN (?) OR user_id IN (?)', {
      replacements: [postIds, userIds],
    }).catch(() => {});
    await sequelize.query('DELETE FROM post_views WHERE post_id IN (?) OR user_id IN (?)', {
      replacements: [postIds, userIds],
    }).catch(() => {});
    await sequelize.query('DELETE FROM outbox_events WHERE aggregate_type = "post" AND aggregate_id IN (?)', {
      replacements: [postIds.map(String)],
    }).catch(() => {});
    await sequelize.query('DELETE FROM posts WHERE id IN (?)', {
      replacements: [postIds],
    }).catch(() => {});
  }

  await sequelize.query('DELETE FROM follows WHERE follower_id IN (?) OR following_id IN (?)', {
    replacements: [userIds, userIds],
  }).catch(() => {});
  await sequelize.query('DELETE FROM user_profiles WHERE user_id IN (?)', {
    replacements: [userIds],
  }).catch(() => {});
  await sequelize.query('DELETE FROM user_devices WHERE user_id IN (?)', {
    replacements: [userIds],
  }).catch(() => {});
  await sequelize.query('DELETE FROM notifications WHERE user_id IN (?)', {
    replacements: [userIds],
  }).catch(() => {});
  await sequelize.query('DELETE FROM users WHERE userId IN (?)', {
    replacements: [userIds],
  }).catch(() => {});

  const usersCsv = path.join(DATA_DIR, 'test_users.csv');
  const postsCsv = path.join(DATA_DIR, 'test_posts.csv');
  if (fs.existsSync(usersCsv)) fs.unlinkSync(usersCsv);
  if (fs.existsSync(postsCsv)) fs.unlinkSync(postsCsv);

  console.log('âœ… Cleanup completed cleanly.');
};

export const seedLoadTestData = async () => {
  const startTime = Date.now();
  console.log('\nðŸš€ Starting High-Speed Bulk Load Test Data Seeding...');

  await cleanupLoadTestData();

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 8);
  const now = new Date();

  // 1. Bulk Create 120 Users
  console.log(`\n1. Bulk inserting ${TOTAL_USERS} test users...`);
  const userPayloads = [];
  for (let i = 1; i <= TOTAL_USERS; i++) {
    userPayloads.push({
      userName: `${USER_PREFIX}${i}`,
      email: `loadtest_${i}${EMAIL_DOMAIN}`,
      phone: `999900${String(i).padStart(4, '0')}`,
      password: passwordHash,
      status: 'active',
      is_active: true,
      is_deleted: false,
      is_verified: true,
      created_at: now,
    });
  }

  const createdUserRows = await User.bulkCreate(userPayloads);
  const userIds = createdUserRows.map((u) => Number(u.userId));

  // Bulk Create Profiles & Tokens
  const profilePayloads = userIds.map((uid, idx) => ({
    user_id: uid,
    fullName: `SmartGali Tester ${idx + 1}`,
    is_active: true,
    is_deleted: false,
    created_at: now,
  }));
  await UserProfile.bulkCreate(profilePayloads);

  const tokenRows = userIds.map((uid, idx) => ({
    token: jwt.sign(
      { id: uid, userId: uid, email: `loadtest_${idx + 1}${EMAIL_DOMAIN}`, role: 'user' },
      env.jwt.secret,
      { expiresIn: '7d' }
    ),
    userId: uid,
    userName: `${USER_PREFIX}${idx + 1}`,
  }));
  console.log(`âœ“ ${userIds.length} users and JWT tokens ready.`);

  // 2. Bulk Create Follow Graph
  console.log('\n2. Bulk generating dense neighbourhood follow relationships...');
  const followPayloads = [];
  for (let i = 0; i < userIds.length; i++) {
    const followerId = userIds[i];
    const targetCount = 20 + Math.floor(Math.random() * 15);
    const followed = new Set();
    while (followed.size < targetCount && followed.size < userIds.length - 1) {
      const randIdx = Math.floor(Math.random() * userIds.length);
      if (randIdx !== i) followed.add(userIds[randIdx]);
    }
    for (const followingId of followed) {
      followPayloads.push({
        follower_id: followerId,
        following_id: followingId,
        is_active: true,
        is_deleted: false,
        created_at: now,
      });
    }
  }
  await Follow.bulkCreate(followPayloads, { ignoreDuplicates: true });
  console.log(`âœ“ ${followPayloads.length} follow graph edges seeded.`);

  // 3. Bulk Create 500 Posts
  console.log(`\n3. Bulk seeding ${TOTAL_POSTS} posts...`);
  const postPayloads = [];
  const postTypes = ['text', 'text', 'image', 'poll', 'text'];

  for (let i = 1; i <= TOTAL_POSTS; i++) {
    const randomUid = userIds[Math.floor(Math.random() * userIds.length)];
    const randomContent = SAMPLE_POST_CONTENTS[i % SAMPLE_POST_CONTENTS.length] + ` (#Update_${i})`;
    const randomLoc = LOCATIONS[i % LOCATIONS.length];
    const randomType = postTypes[i % postTypes.length];
    const pastMinutes = Math.floor(Math.random() * (5 * 24 * 60));
    const postDate = new Date(now.getTime() - pastMinutes * 60 * 1000);

    postPayloads.push({
      user_id: randomUid,
      content: randomContent,
      type: randomType,
      visibility: 'public',
      location_name: randomLoc,
      likes_count: 0,
      comments_count: 0,
      shares_count: 0,
      is_pinned: false,
      comments_disabled: false,
      is_edited: false,
      is_active: true,
      is_deleted: false,
      created_at: postDate,
    });
  }

  const createdPostRows = await Post.bulkCreate(postPayloads);
  const createdPosts = createdPostRows.map((p) => ({ postId: Number(p.id), authorId: Number(p.user_id) }));
  console.log(`âœ“ ${createdPosts.length} posts seeded.`);

  // 4. Bulk Create Engagement (Likes, Comments)
  console.log('\n4. Bulk generating engagement records...');
  const likePayloads = [];
  const commentPayloads = [];

  for (const { postId, authorId } of createdPosts) {
    const numLikes = 3 + Math.floor(Math.random() * 8);
    const likers = new Set();
    while (likers.size < numLikes && likers.size < userIds.length) {
      const u = userIds[Math.floor(Math.random() * userIds.length)];
      if (u !== authorId) likers.add(u);
    }
    for (const likerId of likers) {
      likePayloads.push({ post_id: postId, user_id: likerId, is_active: true, created_at: now });
    }

    const numComments = 1 + Math.floor(Math.random() * 4);
    for (let c = 0; c < numComments; c++) {
      const commenterId = userIds[Math.floor(Math.random() * userIds.length)];
      commentPayloads.push({
        post_id: postId,
        user_id: commenterId,
        content: `Helpful community update! #${c + 1}`,
        is_active: true,
        is_deleted: false,
        created_by: commenterId,
        created_at: now,
      });
    }
  }

  // Insert in chunks of 1000 for safe socket transport
  for (let i = 0; i < likePayloads.length; i += 1000) {
    await PostLike.bulkCreate(likePayloads.slice(i, i + 1000), { ignoreDuplicates: true });
  }
  for (let i = 0; i < commentPayloads.length; i += 1000) {
    await PostComment.bulkCreate(commentPayloads.slice(i, i + 1000));
  }
  console.log(`âœ“ ${likePayloads.length} likes and ${commentPayloads.length} comments seeded.`);

  // 5. Backfill Counters
  console.log('\n5. Reconciling post counters...');
  await backfillCounters();

  // 6. Write CSV files for Artillery
  console.log('\n6. Exporting Artillery test dataset to CSV...');
  const usersCsvPath = path.join(DATA_DIR, 'test_users.csv');
  const userCsvLines = ['token,userId,userName', ...tokenRows.map((r) => `${r.token},${r.userId},${r.userName}`)];
  fs.writeFileSync(usersCsvPath, userCsvLines.join('\n'), 'utf8');

  const postsCsvPath = path.join(DATA_DIR, 'test_posts.csv');
  const postCsvLines = ['postId,authorId', ...createdPosts.map((p) => `${p.postId},${p.authorId}`)];
  fs.writeFileSync(postsCsvPath, postCsvLines.join('\n'), 'utf8');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nðŸŽ‰ High-Speed Load Test Data Ready in ${durationSec}s!`);
  console.log(`   - Users:   ${TOTAL_USERS} (Exported to ${usersCsvPath})`);
  console.log(`   - Posts:   ${TOTAL_POSTS} (Exported to ${postsCsvPath})`);
  console.log(`   - Follows: ${followPayloads.length}`);
  console.log(`   - Likes:   ${likePayloads.length}`);
  console.log(`   - Comments:${commentPayloads.length}`);
};

const isMain = process.argv[1] && process.argv[1].endsWith('seed_load_test_data.js');
if (isMain) {
  await connectDB();
  if (process.argv.includes('--cleanup')) {
    await cleanupLoadTestData();
  } else {
    await seedLoadTestData();
  }
  process.exit(0);
}

export default { seedLoadTestData, cleanupLoadTestData };
