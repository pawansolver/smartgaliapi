// Seed standard PRD community categories into database
import seq from './src/config/db.js';

const PRD_CATEGORIES = [
  { name: 'Sports & Games', icon: '🏏' },
  { name: 'Society & RWA', icon: '🏢' },
  { name: 'Fitness & Gym', icon: '💪' },
  { name: 'Buy, Sell & Rent', icon: '🛍️' },
  { name: 'Food & Cooking', icon: '🍲' },
  { name: 'Moms & Parenting', icon: '👶' },
  { name: 'Tech & Gadgets', icon: '💻' },
  { name: 'Books & Learning', icon: '📚' },
  { name: 'Cultural & Events', icon: '🎭' },
  { name: 'Pets & Animal Lovers', icon: '🐾' },
  { name: 'Travel & Carpooling', icon: '🚗' },
  { name: 'Art & Music', icon: '🎨' },
];

async function seedCategories() {
  try {
    await seq.authenticate();
    console.log('✅ DB Connected');

    // 1. Soft-delete old junk/test categories
    await seq.query(`
      UPDATE community_categories 
      SET is_deleted = 1, is_active = 0 
      WHERE communityCategoryName IN ('string', 'stringtt', 'mmmm', 'ssadsa', 'sdfds', 'Checkonf', 'Checkinf 2', 'Checking', 'Mmm', 'Nnn', 'adarsh', 'Jkl', 'Ghj')
    `);
    console.log('🧹 Cleaned up old test categories');

    // 2. Insert standard PRD categories if not already present
    for (const cat of PRD_CATEGORIES) {
      const [existing] = await seq.query(
        'SELECT communityCategoryId, is_deleted FROM community_categories WHERE communityCategoryName = ?',
        { replacements: [cat.name] }
      );

      if (existing.length > 0) {
        // Reactivate if existing
        await seq.query(
          'UPDATE community_categories SET communityCategoryIcon = ?, is_active = 1, is_deleted = 0, updatedAt = NOW() WHERE communityCategoryId = ?',
          { replacements: [cat.icon, existing[0].communityCategoryId] }
        );
        console.log(`  🔄 Updated: ${cat.icon} ${cat.name}`);
      } else {
        // Insert new
        await seq.query(
          'INSERT INTO community_categories (communityCategoryName, communityCategoryIcon, is_active, is_deleted, created_at, updatedAt) VALUES (?, ?, 1, 0, NOW(), NOW())',
          { replacements: [cat.name, cat.icon] }
        );
        console.log(`  ➕ Added: ${cat.icon} ${cat.name}`);
      }
    }

    // 3. Update existing communities that had old category IDs to valid active ones
    const [sportsCat] = await seq.query(
      'SELECT communityCategoryId FROM community_categories WHERE communityCategoryName = "Sports & Games" LIMIT 1'
    );
    const [techCat] = await seq.query(
      'SELECT communityCategoryId FROM community_categories WHERE communityCategoryName = "Tech & Gadgets" LIMIT 1'
    );
    const [societyCat] = await seq.query(
      'SELECT communityCategoryId FROM community_categories WHERE communityCategoryName = "Society & RWA" LIMIT 1'
    );

    if (techCat.length > 0) {
      await seq.query(
        'UPDATE communities SET category_id = ? WHERE communityName LIKE "%Developer%" OR communityName LIKE "%Tech%"',
        { replacements: [techCat[0].communityCategoryId] }
      );
    }
    if (sportsCat.length > 0) {
      await seq.query(
        'UPDATE communities SET category_id = ? WHERE category_id IS NULL OR category_id NOT IN (SELECT communityCategoryId FROM community_categories WHERE is_deleted = 0 AND is_active = 1)',
        { replacements: [sportsCat[0].communityCategoryId] }
      );
    }

    console.log('\n✅ All PRD categories seeded successfully!');

    // 4. Print all active categories
    const [active] = await seq.query(
      'SELECT communityCategoryId, communityCategoryName, communityCategoryIcon FROM community_categories WHERE is_deleted = 0 AND is_active = 1 ORDER BY communityCategoryId ASC'
    );
    console.log('\n📋 Active Categories in DB:');
    console.table(active);

  } catch (err) {
    console.error('❌ Error seeding categories:', err);
  } finally {
    setTimeout(() => process.exit(0), 200).unref();
  }
}

seedCategories();
