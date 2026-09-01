import sequelize from './src/config/db.js';

async function fixIndexes() {
  try {
    const [results] = await sequelize.query('SHOW INDEX FROM users WHERE Key_name LIKE "email%"');
    console.log(`Found ${results.length} indexes on email.`);
    
    // Drop all duplicate indexes (keeping the original one 'email' if needed, or just dropping the numbered ones)
    for (let i = 0; i < results.length; i++) {
      const indexName = results[i].Key_name;
      // Usually Sequelize creates them as email_2, email_3 etc.
      if (indexName !== 'email' && indexName !== 'PRIMARY') {
        console.log(`Dropping extra index: ${indexName}`);
        await sequelize.query(`ALTER TABLE users DROP INDEX ${indexName}`);
      }
    }
    console.log('✅ Sabhi extra indexes delete ho gaye!');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fixIndexes();
