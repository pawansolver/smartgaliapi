import sequelize from './src/config/db.js';
import User from './src/modules/user/user.model.js';
import Notification from './src/modules/notification/notification.model.js';
import EmailNotification from './src/modules/notification/email_notification.model.js';

const syncDb = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Sync specific models
    await EmailNotification.sync({ alter: true });
    console.log('EmailNotification model synced successfully.');
    
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};

syncDb();
