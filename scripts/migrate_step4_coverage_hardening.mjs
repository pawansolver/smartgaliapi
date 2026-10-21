import 'dotenv/config';
import sequelize from '../src/config/db.js';
import { Country, State, City, Locality, Pincode } from '../src/modules/location_master/location_master.models.js';
import ServiceCoverageArea from '../src/modules/service_listing/service_coverage_area.model.js';
import ServiceListing from '../src/modules/service_listing/service_listing.model.js';
import { ServiceRadiusOption } from '../src/modules/service_config/service_config.models.js';

async function migrateStep4LocationCoverage() {
  console.log('--- Starting Step 4 Enterprise Location & Service Coverage Migration ---');

  // 1. Sync models to database non-destructively
  await Country.sync({ alter: true });
  await State.sync({ alter: true });
  await City.sync({ alter: true });
  await Locality.sync({ alter: true });
  await Pincode.sync({ alter: true });
  await ServiceCoverageArea.sync({ alter: true });

  // 2. Add coverage_scope column to service_listings if missing
  const [listingCols] = await sequelize.query('SHOW COLUMNS FROM service_listings LIKE "coverage_scope"');
  if (listingCols.length === 0) {
    await sequelize.query('ALTER TABLE service_listings ADD COLUMN coverage_scope VARCHAR(50) NOT NULL DEFAULT "PUBLIC"');
    console.log('Added coverage_scope column to service_listings');
  }

  // 3. Add coverage_snapshot column to service_bookings if missing
  const [bookingCols] = await sequelize.query('SHOW COLUMNS FROM service_bookings LIKE "coverage_snapshot"');
  if (bookingCols.length === 0) {
    await sequelize.query('ALTER TABLE service_bookings ADD COLUMN coverage_snapshot TEXT NULL');
    console.log('Added coverage_snapshot column to service_bookings');
  }

  // 4. Seed India-First Location Master
  // Country: India
  let [country] = await Country.findOrCreate({
    where: { iso_code: 'IN' },
    defaults: {
      name: 'India',
      normalized_name: 'india',
      iso_code: 'IN',
      phone_code: '+91',
      is_active: true,
      display_order: 1,
    },
  });

  // State: Bihar
  let [state] = await State.findOrCreate({
    where: { country_id: country.id, code: 'BR' },
    defaults: {
      country_id: country.id,
      name: 'Bihar',
      normalized_name: 'bihar',
      code: 'BR',
      is_active: true,
      display_order: 1,
    },
  });

  // City: Patna
  let [city] = await City.findOrCreate({
    where: { state_id: state.id, name: 'Patna' },
    defaults: {
      state_id: state.id,
      name: 'Patna',
      normalized_name: 'patna',
      code: 'PAT',
      latitude: 25.5941,
      longitude: 85.1376,
      is_active: true,
      display_order: 1,
    },
  });

  // Localities in Patna with reference coordinates/centroids
  const localitiesData = [
    { name: 'Rajendra Nagar', code: 'PAT-RN', lat: 25.6022, lon: 85.1610 },
    { name: 'Kankarbagh', code: 'PAT-KB', lat: 25.5912, lon: 85.1528 },
    { name: 'Boring Road', code: 'PAT-BR', lat: 25.6186, lon: 85.1189 },
    { name: 'Bailey Road', code: 'PAT-BL', lat: 25.6105, lon: 85.0932 },
    { name: 'Danapur', code: 'PAT-DN', lat: 25.6333, lon: 85.0444 },
    { name: 'Patliputra Colony', code: 'PAT-PC', lat: 25.6267, lon: 85.1094 },
    { name: 'Anisabad', code: 'PAT-AN', lat: 25.5783, lon: 85.0997 },
    { name: 'Ashiana Nagar', code: 'PAT-AS', lat: 25.6163, lon: 85.0831 },
  ];

  const localityMap = {};
  for (let i = 0; i < localitiesData.length; i++) {
    const loc = localitiesData[i];
    let [locRecord] = await Locality.findOrCreate({
      where: { city_id: city.id, name: loc.name },
      defaults: {
        city_id: city.id,
        name: loc.name,
        normalized_name: loc.name.toLowerCase().replace(/\s+/g, '_'),
        code: loc.code,
        latitude: loc.lat,
        longitude: loc.lon,
        is_active: true,
        display_order: i + 1,
      },
    });
    localityMap[loc.name] = locRecord;
  }

  // Pincodes in Patna
  const pincodesData = [
    { pincode: '800016', area: 'Rajendra Nagar', locality: 'Rajendra Nagar' },
    { pincode: '800020', area: 'Kankarbagh', locality: 'Kankarbagh' },
    { pincode: '800001', area: 'Patna GPO / Central', locality: 'Boring Road' },
    { pincode: '800013', area: 'Patliputra', locality: 'Patliputra Colony' },
    { pincode: '801503', area: 'Danapur Cantt', locality: 'Danapur' },
    { pincode: '800002', area: 'Anisabad', locality: 'Anisabad' },
    { pincode: '800025', area: 'Ashiana Nagar', locality: 'Ashiana Nagar' },
  ];

  for (let i = 0; i < pincodesData.length; i++) {
    const pin = pincodesData[i];
    const loc = localityMap[pin.locality];
    await Pincode.findOrCreate({
      where: { city_id: city.id, pincode: pin.pincode },
      defaults: {
        city_id: city.id,
        locality_id: loc ? loc.id : null,
        pincode: pin.pincode,
        area_name: pin.area,
        is_active: true,
        display_order: i + 1,
      },
    });
  }

  // 5. Migrate existing active Service Listings into ServiceCoverageArea (Non-destructive)
  const existingListings = await ServiceListing.findAll({
    where: { is_deleted: false },
  });

  const radiusOptions = await ServiceRadiusOption.findAll({ where: { is_deleted: false } });
  const radiusMap = {};
  radiusOptions.forEach((ro) => { radiusMap[ro.id] = ro; });

  for (const listing of existingListings) {
    const count = await ServiceCoverageArea.count({ where: { service_id: listing.id } });
    if (count === 0 && listing.radius_option_id) {
      const ro = radiusMap[listing.radius_option_id];
      const radKm = ro ? Number(ro.radius_km) : 15.0;
      await ServiceCoverageArea.create({
        service_id: listing.id,
        coverage_scope: 'PUBLIC',
        coverage_method: 'RADIUS',
        city_id: city.id,
        locality_id: localityMap['Rajendra Nagar']?.id || null,
        origin_latitude: 25.6022,
        origin_longitude: 85.1610,
        origin_address: 'Rajendra Nagar, Patna',
        radius_option_id: listing.radius_option_id,
        resolved_radius_km: radKm,
        is_active: true,
        display_order: 1,
      });
      console.log(`Migrated default coverage area for ServiceListing #${listing.id} (${radKm} KM)`);
    }
  }

  console.log('--- Step 4 Enterprise Location & Coverage Migration COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

migrateStep4LocationCoverage().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
