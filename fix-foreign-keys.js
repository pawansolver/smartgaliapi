import sequelize from './src/config/db.js';

const fixForeignKeys = async () => {
  try {
    const [tables] = await sequelize.query('SHOW TABLES');
    for (const tableObj of tables) {
      const tableName = Object.values(tableObj)[0];
      const [columns] = await sequelize.query(`SHOW COLUMNS FROM ${tableName}`);
      const colNames = columns.map(c => c.Field);
      if (colNames.includes('created_by')) {
        console.log(`Fixing ${tableName}.created_by`);
        await sequelize.query(`ALTER TABLE ${tableName} MODIFY created_by BIGINT`);
      }
      if (colNames.includes('updated_by')) {
        console.log(`Fixing ${tableName}.updated_by`);
        await sequelize.query(`ALTER TABLE ${tableName} MODIFY updated_by BIGINT`);
      }
    }
    console.log('✅ Done fixing foreign key types!');
    process.exit(0);
  } catch(e) { 
    console.error(e); 
    process.exit(1);
  }
};

fixForeignKeys();
