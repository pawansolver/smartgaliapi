// Test exact Sequelize query that causes 500 error
import seq from './src/config/db.js';
import Community from './src/modules/community/community.model.js';
import CommunityCategory from './src/modules/communityCategory/communityCategory.model.js';
import CommunityMember from './src/modules/communityMember/communityMember.model.js';
import { Op } from 'sequelize';

async function main() {
  await seq.authenticate();
  console.log('✅ DB connected\n');

  // TEST 1: CommunityCategory alone
  console.log('=== Test 1: CommunityCategory.findAll ===');
  try {
    const cats = await CommunityCategory.findAll({ where: { is_deleted: false }, limit: 5 });
    console.log('✅ OK -', cats.length, 'categories');
    if (cats.length > 0) console.log('  Sample:', JSON.stringify(cats[0].toJSON()));
  } catch(e) {
    console.error('❌ FAILED:', e.message);
  }

  // TEST 2: Community with category include
  console.log('\n=== Test 2: Community.findAll with category include ===');
  try {
    const communities = await Community.findAll({
      where: { is_deleted: false, status: 'active' },
      include: [{ model: CommunityCategory, as: 'category' }],
      limit: 5
    });
    console.log('✅ OK -', communities.length, 'communities');
    if (communities.length > 0) {
      const c = communities[0].toJSON();
      console.log('  Sample communityId:', c.communityId, 'name:', c.communityName);
    }
  } catch(e) {
    console.error('❌ FAILED:', e.message);
    console.error(e.stack?.split('\n').slice(0,6).join('\n'));
  }

  // TEST 3: getMyCommunities via CommunityMember
  console.log('\n=== Test 3: CommunityMember with nested Community+Category ===');
  try {
    const memberships = await CommunityMember.findAll({
      where: { user_id: 27, status: 'active', is_deleted: false },
      include: [{
        model: Community,
        as: 'community',
        where: { is_deleted: false },
        include: [{ model: CommunityCategory, as: 'category' }],
      }],
      order: [['joined_at', 'DESC']],
    });
    console.log('✅ getMyCommunities OK -', memberships.length, 'results');
  } catch(e) {
    console.error('❌ getMyCommunities FAILED:', e.message);
    console.error(e.stack?.split('\n').slice(0,6).join('\n'));
  }

  // TEST 4: getSuggestedCommunities
  console.log('\n=== Test 4: getSuggestedCommunities ===');
  try {
    const userMemberships = await CommunityMember.findAll({
      where: { user_id: 27, status: { [Op.ne]: 'left' } },
      attributes: ['community_id'],
    });
    const joinedIds = userMemberships.map(m => m.community_id);
    console.log('  joined IDs:', joinedIds);
    
    const where = { is_deleted: false, status: 'active' };
    if (joinedIds.length > 0) where.communityId = { [Op.notIn]: joinedIds };
    
    const suggestions = await Community.findAll({
      where,
      include: [{ model: CommunityCategory, as: 'category' }],
      order: [['members_count', 'DESC'], ['created_at', 'DESC']],
      limit: 10,
    });
    console.log('✅ getSuggested OK -', suggestions.length, 'communities');
    if (suggestions.length > 0) {
      const s = suggestions[0].toJSON();
      console.log('  Sample:', s.communityName, '| members:', s.members_count);
    }
  } catch(e) {
    console.error('❌ getSuggested FAILED:', e.message);
    console.error(e.stack?.split('\n').slice(0,6).join('\n'));
  }

  setTimeout(() => process.exit(0), 200).unref();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
