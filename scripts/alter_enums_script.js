import sequelize from '../src/config/db.js';

async function main() {
  await sequelize.query("ALTER TABLE society_visitors MODIFY COLUMN status ENUM('expected','at_gate','approved','denied','checked_in','checked_out') NOT NULL DEFAULT 'expected'");
  await sequelize.query("ALTER TABLE society_complaints MODIFY COLUMN status ENUM('open','assigned','in_progress','resolved','closed','reopened') NOT NULL DEFAULT 'open'");
  console.log('Enum columns altered successfully in MySQL');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
