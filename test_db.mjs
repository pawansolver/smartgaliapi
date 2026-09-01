import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('u963801592_SmartGali', 'u963801592_smartgaliU', 'SmartGali232026', {
  host: 'srv1100.hstgr.io',
  port: 3306,
  dialect: 'mysql',
  logging: false,
});

async function run() {
  try {
    await sequelize.authenticate();
    const [results] = await sequelize.query('SELECT userId, userName, email, phone, status, is_active, is_deleted FROM users');
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

run();
