import sequelize from './src/config/db.js';

async function fixTable() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    
    const queries = [
      "ALTER TABLE users ADD COLUMN user_role VARCHAR(255) DEFAULT 'resident'",
      "ALTER TABLE users ADD COLUMN profile_image VARCHAR(255)",
      "ALTER TABLE users ADD COLUMN address TEXT",
      "ALTER TABLE users ADD COLUMN latitude DECIMAL(10,8)",
      "ALTER TABLE users ADD COLUMN longitude DECIMAL(11,8)",
      "ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false",
      "ALTER TABLE users ADD COLUMN status ENUM('active', 'inactive', 'pending') DEFAULT 'active'"
    ];

    for (const query of queries) {
      try {
        await sequelize.query(query);
        console.log(`Executed: ${query}`);
      } catch (err) {
        if (err.message.includes('Duplicate column name')) {
           console.log(`Column already exists, skipping: ${query}`);
        } else {
           console.error(`Error executing ${query}:`, err.message);
        }
      }
    }
    
    console.log('Successfully updated users table schema.');
  } catch (err) {
    console.error('Error modifying table:', err);
  } finally {
    await sequelize.close();
  }
}

fixTable();
