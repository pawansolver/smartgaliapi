import sequelize from '../src/config/db.js';

async function main() {
  await sequelize.query('DELETE FROM society_parkings WHERE parking_slot_no LIKE "%RACE-SLOT%"');
  try {
    await sequelize.query('DROP INDEX uq_soc_parking_slot ON society_parkings');
  } catch {}
  await sequelize.query('CREATE UNIQUE INDEX uq_soc_parking_slot ON society_parkings (society_id, parking_slot_no, is_deleted)');
  console.log('Successfully created UNIQUE index uq_soc_parking_slot');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
