import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

// 1. Country Master
export const Country = sequelize.define('Country', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  iso_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  phone_code: { type: DataTypes.STRING(10), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'countries', timestamps: false });

// 2. State Master
export const State = sequelize.define('State', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  country_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: Country, key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(20), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'states', timestamps: false });

// 3. City Master
export const City = sequelize.define('City', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  state_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: State, key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(20), allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'cities', timestamps: false });

// 4. Locality Master
export const Locality = sequelize.define('Locality', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  city_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: City, key: 'id' } },
  name: { type: DataTypes.STRING(150), allowNull: false },
  normalized_name: { type: DataTypes.STRING(150), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true }, // reference centroid for map display / discovery
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'localities', timestamps: false });

// 5. Pincode Master
export const Pincode = sequelize.define('Pincode', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  city_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: City, key: 'id' } },
  locality_id: { type: DataTypes.BIGINT, allowNull: true, references: { model: Locality, key: 'id' } },
  pincode: { type: DataTypes.STRING(10), allowNull: false },
  area_name: { type: DataTypes.STRING(150), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'pincodes', timestamps: false });

// Relationships
Country.hasMany(State, { foreignKey: 'country_id', as: 'states' });
State.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });

State.hasMany(City, { foreignKey: 'state_id', as: 'cities' });
City.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

City.hasMany(Locality, { foreignKey: 'city_id', as: 'localities' });
Locality.belongsTo(City, { foreignKey: 'city_id', as: 'city' });

City.hasMany(Pincode, { foreignKey: 'city_id', as: 'pincodes' });
Pincode.belongsTo(City, { foreignKey: 'city_id', as: 'city' });
Pincode.belongsTo(Locality, { foreignKey: 'locality_id', as: 'locality' });

export default { Country, State, City, Locality, Pincode };
