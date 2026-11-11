import sequelize from '../src/config/db.js';

async function check() {
  const [rows] = await sequelize.query('SELECT id, business_id, name, sku, status, approval_status, created_at, is_deleted FROM business_products ORDER BY id DESC LIMIT 10');
  console.log('ALL RECENT PRODUCTS IN DB:');
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

check();
