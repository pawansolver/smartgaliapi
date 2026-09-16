import sequelize from '../src/config/db.js';
import ComplaintCategory from '../src/modules/complaint_master/complaint_category.model.js';
import ComplaintSubCategory from '../src/modules/complaint_master/complaint_sub_category.model.js';
import ComplaintLocationType from '../src/modules/complaint_master/complaint_location_type.model.js';

const initialCategories = [
  {
    name: 'General',
    slug: 'general',
    description: 'General society issues and miscellaneous complaints',
    icon: 'assignment_outlined',
    display_order: 1,
    is_active: true,
    subCategories: [
      { name: 'General Grievance', slug: 'general_grievance', description: 'General issues', display_order: 1 },
      { name: 'Billing / Maintenance Query', slug: 'billing_query', description: 'Society maintenance dues and billing', display_order: 2 },
      { name: 'Noise Disturbance', slug: 'noise_disturbance', description: 'Excessive noise in premises', display_order: 3 },
      { name: 'Other', slug: 'other', description: 'Uncategorized items', display_order: 4 },
    ],
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    description: 'Water pipelines, leaks, taps, and drainage problems',
    icon: 'plumbing_outlined',
    display_order: 2,
    subCategories: [
      { name: 'Water Leakage', slug: 'water_leakage', description: 'Pipe or ceiling leak', display_order: 1 },
      { name: 'Pipe Blockage', slug: 'pipe_blockage', description: 'Clogged pipeline', display_order: 2 },
      { name: 'Tap / Faucet', slug: 'tap_faucet', description: 'Broken or malfunctioning tap', display_order: 3 },
      { name: 'Drainage / Overflow', slug: 'drainage_overflow', description: 'Sewer or drain overflow', display_order: 4 },
      { name: 'Low Water Pressure', slug: 'low_water_pressure', description: 'Insufficient water flow', display_order: 5 },
    ],
  },
  {
    name: 'Electrical',
    slug: 'electrical',
    description: 'Wiring, power supply, meters, and corridor lighting',
    icon: 'bolt_outlined',
    display_order: 3,
    subCategories: [
      { name: 'Power Cut / Fluctuation', slug: 'power_cut', description: 'Electricity outage', display_order: 1 },
      { name: 'Switch / Socket Fault', slug: 'switch_socket', description: 'Damaged electrical switch or plug', display_order: 2 },
      { name: 'Common Area Lighting', slug: 'common_lighting', description: 'Dark hallways or parking lights', display_order: 3 },
      { name: 'Meter Issue', slug: 'meter_issue', description: 'Electric sub-meter malfunction', display_order: 4 },
    ],
  },
  {
    name: 'Lift',
    slug: 'lift',
    description: 'Elevator operation, breakdown, and emergency safety',
    icon: 'elevator_outlined',
    display_order: 4,
    subCategories: [
      { name: 'Lift Breakdown / Stuck', slug: 'lift_breakdown', description: 'Elevator completely stopped', display_order: 1 },
      { name: 'Door Malfunction', slug: 'door_malfunction', description: 'Lift doors not closing or opening properly', display_order: 2 },
      { name: 'Button / Display Issue', slug: 'lift_button', description: 'Unresponsive panel buttons or indicator', display_order: 3 },
      { name: 'Strange Noise / Jerk', slug: 'lift_noise', description: 'Abnormal sound while operating', display_order: 4 },
    ],
  },
  {
    name: 'Security',
    slug: 'security',
    description: 'Gate security, CCTV, visitor entry, and guard behavior',
    icon: 'shield_outlined',
    display_order: 5,
    subCategories: [
      { name: 'Visitor Entry Issue', slug: 'visitor_entry', description: 'Problems with guest check-in at gate', display_order: 1 },
      { name: 'Guard Unavailability', slug: 'guard_unavailable', description: 'No guard at duty post', display_order: 2 },
      { name: 'CCTV Camera Down', slug: 'cctv_down', description: 'Security surveillance camera offline', display_order: 3 },
      { name: 'Unauthorized Parking / Vehicle', slug: 'unauthorized_vehicle', description: 'Unknown vehicle blocking access', display_order: 4 },
    ],
  },
  {
    name: 'Maintenance',
    slug: 'maintenance',
    description: 'Civil works, painting, cleaning, and gardening',
    icon: 'build_outlined',
    display_order: 6,
    subCategories: [
      { name: 'Garbage Collection', slug: 'garbage_collection', description: 'Waste not picked up', display_order: 1 },
      { name: 'Corridor Cleaning', slug: 'corridor_cleaning', description: 'Dirty common hallways or stairs', display_order: 2 },
      { name: 'Garden / Lawn Upkeep', slug: 'garden_upkeep', description: 'Overgrown grass or untrimmed trees', display_order: 3 },
      { name: 'Clubhouse Equipment', slug: 'clubhouse_equipment', description: 'Gym or recreational asset issue', display_order: 4 },
      { name: 'Wall Cracks / Seepage', slug: 'wall_cracks', description: 'Structural or paint peeling problem', display_order: 5 },
    ],
  },
];

const initialLocationTypes = [
  { name: 'My Flat', code: 'my_flat', description: 'Inside private apartment or flat', icon: 'home_outlined', display_order: 1 },
  { name: 'Common Area', code: 'common_area', description: 'Corridor, lobby, staircase, or terrace', icon: 'apartment_outlined', display_order: 2 },
  { name: 'Parking', code: 'parking', description: 'Basement or open vehicle parking bay', icon: 'local_parking_outlined', display_order: 3 },
  { name: 'Lift', code: 'lift', description: 'Inside or lobby of elevator shaft', icon: 'elevator_outlined', display_order: 4 },
  { name: 'Garden', code: 'garden', description: 'Parks, lawns, or children play zone', icon: 'park_outlined', display_order: 5 },
  { name: 'Clubhouse', code: 'clubhouse', description: 'Gym, swimming pool, or community hall', icon: 'sports_tennis_outlined', display_order: 6 },
  { name: 'Water Tank Area', code: 'water_tank', description: 'Overhead or underground reservoir area', icon: 'water_outlined', display_order: 7 },
  { name: 'Other', code: 'other', description: 'Other society location', icon: 'place_outlined', display_order: 8 },
];

export const runMigration = async () => {
  console.log('🚀 Starting Complaint Masters migration and seed...');
  await sequelize.authenticate();
  console.log('✅ Connected to database.');

  // 1. Sync models
  await ComplaintCategory.sync();
  console.log('✅ Table complaint_categories ready.');

  await ComplaintSubCategory.sync();
  console.log('✅ Table complaint_sub_categories ready.');

  await ComplaintLocationType.sync();
  console.log('✅ Table complaint_location_types ready.');

  // 2. Seed Categories & Sub-Categories
  for (const catData of initialCategories) {
    const [category] = await ComplaintCategory.findOrCreate({
      where: { slug: catData.slug },
      defaults: {
        name: catData.name,
        slug: catData.slug,
        description: catData.description,
        icon: catData.icon,
        display_order: catData.display_order,
        is_active: true,
      },
    });

    for (const subData of catData.subCategories) {
      await ComplaintSubCategory.findOrCreate({
        where: { category_id: category.id, slug: subData.slug },
        defaults: {
          category_id: category.id,
          name: subData.name,
          slug: subData.slug,
          description: subData.description,
          display_order: subData.display_order,
          is_active: true,
        },
      });
    }
  }
  console.log('✅ Seeded default categories & sub-categories.');

  // 3. Seed Location Types
  for (const locData of initialLocationTypes) {
    await ComplaintLocationType.findOrCreate({
      where: { code: locData.code },
      defaults: {
        name: locData.name,
        code: locData.code,
        description: locData.description,
        icon: locData.icon,
        display_order: locData.display_order,
        is_active: true,
      },
    });
  }
  console.log('✅ Seeded default location types.');
  console.log('🎉 Migration finished successfully!');
};

if (process.argv[1]?.endsWith('migrate_complaint_masters.mjs')) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
