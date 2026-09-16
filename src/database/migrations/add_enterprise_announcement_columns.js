import sequelize from '../../config/db.js';

export const runAnnouncementMigration = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'society_announcements';

  console.log('🔄 Starting Society Announcement Enterprise migration...');

  const [columns] = await sequelize.query(`DESCRIBE ${tableName}`);
  const existingCols = new Set(columns.map(c => c.Field));

  // 1. announcement_number VARCHAR(50) UNIQUE
  if (!existingCols.has('announcement_number')) {
    console.log('➕ Adding column announcement_number...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN announcement_number VARCHAR(50) NULL AFTER id
    `);
  }

  // 2. summary VARCHAR(500)
  if (!existingCols.has('summary')) {
    console.log('➕ Adding column summary...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN summary VARCHAR(500) NULL AFTER title
    `);
  }

  // 3. action_text VARCHAR(500)
  if (!existingCols.has('action_text')) {
    console.log('➕ Adding column action_text...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN action_text VARCHAR(500) NULL AFTER message
    `);
  }

  // 4. audience ENUM('entire_society', 'block', 'committee')
  if (!existingCols.has('audience')) {
    console.log('➕ Adding column audience...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN audience ENUM('entire_society', 'block', 'committee') DEFAULT 'entire_society' AFTER action_text
    `);
  }

  // 5. publish_at DATETIME NULL
  if (!existingCols.has('publish_at')) {
    console.log('➕ Adding column publish_at...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN publish_at DATETIME NULL AFTER category
    `);
  }

  // 6. published_at DATETIME NULL
  if (!existingCols.has('published_at')) {
    console.log('➕ Adding column published_at...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN published_at DATETIME NULL AFTER publish_at
    `);
  }

  // 7. status ENUM('draft', 'published', 'archived')
  if (!existingCols.has('status')) {
    console.log('➕ Adding column status...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN status ENUM('draft', 'published', 'archived') DEFAULT 'published' AFTER published_at
    `);
  }

  // 8. attachments JSON NULL
  if (!existingCols.has('attachments')) {
    console.log('➕ Adding column attachments...');
    await sequelize.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN attachments JSON NULL AFTER status
    `);
  }

  // Backfill existing rows
  console.log('🔄 Backfilling existing rows...');
  await sequelize.query(`
    UPDATE ${tableName}
    SET announcement_number = CONCAT('ANN-', YEAR(COALESCE(created_at, NOW())), '-', LPAD(id, 5, '0'))
    WHERE announcement_number IS NULL OR announcement_number = ''
  `);

  await sequelize.query(`
    UPDATE ${tableName}
    SET published_at = COALESCE(created_at, NOW())
    WHERE published_at IS NULL
  `);

  await sequelize.query(`
    UPDATE ${tableName}
    SET status = 'published'
    WHERE status IS NULL
  `);

  await sequelize.query(`
    UPDATE ${tableName}
    SET audience = 'entire_society'
    WHERE audience IS NULL
  `);

  await sequelize.query(`
    UPDATE ${tableName}
    SET summary = LEFT(message, 150)
    WHERE (summary IS NULL OR summary = '') AND message IS NOT NULL
  `);

  // Add unique index on announcement_number if not already present
  try {
    const [indexes] = await sequelize.query(`SHOW INDEX FROM ${tableName} WHERE Key_name = 'announcement_number_unique'`);
    if (indexes.length === 0) {
      await sequelize.query(`ALTER TABLE ${tableName} ADD UNIQUE INDEX announcement_number_unique (announcement_number)`);
    }
  } catch (err) {
    console.warn('Index notice:', err.message);
  }

  console.log('✅ Society Announcement Enterprise migration completed successfully!');
};

if (process.argv[1]?.endsWith('add_enterprise_announcement_columns.js')) {
  runAnnouncementMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
