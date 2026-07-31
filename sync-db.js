import './src/app.js';
import './src/modules/message_receipt/message_receipt.model.js';
import './src/modules/message_reaction/message_reaction.model.js';
import './src/modules/message_deletion/message_deletion.model.js';
import './src/modules/audit_log/audit_log.model.js';

import sequelize from './src/config/db.js';

const syncDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');
    
    // Disable foreign key checks to force altering tables even if there's orphaned data
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    console.log('🔄 Synchronizing models with alter: true...');
    // Sync all models 
    await sequelize.sync({ alter: true });
    
    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ All tables synchronized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to synchronize database:', error);
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    process.exit(1);
  }
};

syncDatabase();
