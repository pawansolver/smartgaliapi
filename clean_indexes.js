import 'dotenv/config';
import sequelize from './src/config/db.js';

(async () => {
  try {
    const [indexes] = await sequelize.query('SHOW INDEX FROM roles');
    const indexNames = [...new Set(indexes.filter(i => i.Key_name !== 'PRIMARY').map(i => i.Key_name))];
    console.log('Indexes to drop:', indexNames);
    for (const name of indexNames) {
      try {
        await sequelize.query('ALTER TABLE roles DROP INDEX `' + name + '`');
        console.log('Dropped index', name);
      } catch (e) {
        console.error('Failed to drop', name, e.message);
      }
    }
    
    const [fks] = await sequelize.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_NAME = 'roles' AND CONSTRAINT_NAME != 'PRIMARY' AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    
    for (const fk of fks) {
       try {
         await sequelize.query('ALTER TABLE roles DROP FOREIGN KEY `' + fk.CONSTRAINT_NAME + '`');
         console.log('Dropped FK', fk.CONSTRAINT_NAME);
       } catch (e) {
         console.error('Failed to drop fk', fk.CONSTRAINT_NAME, e.message);
       }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
