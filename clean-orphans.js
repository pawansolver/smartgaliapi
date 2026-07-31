import sequelize from './src/config/db.js';

const cleanOrphans = async () => {
  try {
    const [tables] = await sequelize.query('SHOW TABLES');
    for (const tableObj of tables) {
      const tableName = Object.values(tableObj)[0];
      
      const [columns] = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const colNames = columns.map(c => c.Field);
      
      if (colNames.includes('created_by')) {
        console.log(`Cleaning ${tableName}.created_by...`);
        await sequelize.query(`UPDATE \`${tableName}\` SET created_by = NULL WHERE created_by NOT IN (SELECT userId FROM users) AND created_by IS NOT NULL;`);
      }
      
      if (colNames.includes('updated_by')) {
        console.log(`Cleaning ${tableName}.updated_by...`);
        await sequelize.query(`UPDATE \`${tableName}\` SET updated_by = NULL WHERE updated_by NOT IN (SELECT userId FROM users) AND updated_by IS NOT NULL;`);
      }
      
      // Also clean up category_id for communities as that was in the logs earlier
      if (tableName === 'communities' && colNames.includes('category_id')) {
         console.log(`Cleaning ${tableName}.category_id...`);
         await sequelize.query(`UPDATE \`${tableName}\` SET category_id = NULL WHERE category_id NOT IN (SELECT communityCategoryId FROM community_categories) AND category_id IS NOT NULL;`);
      }
    }
    console.log('✅ Cleaned up all orphaned foreign keys successfully!');
    process.exit(0);
  } catch(e) { 
    console.error(e); 
    process.exit(1);
  }
};

cleanOrphans();
