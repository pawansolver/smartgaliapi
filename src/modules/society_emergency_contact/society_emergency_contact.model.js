import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const EMERGENCY_CONTACT_CATEGORIES = Object.freeze({
  SECURITY: 'security',
  POLICE: 'police',
  FIRE: 'fire',
  AMBULANCE: 'ambulance',
  MEDICAL: 'medical',
  MAINTENANCE: 'maintenance',
  ELECTRICIAN: 'electrician',
  PLUMBER: 'plumber',
  MANAGEMENT: 'management',
  GENERAL: 'general',
});

const SocietyEmergencyContact = sequelize.define('SocietyEmergencyContact', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  designation: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  alt_phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'general',
    allowNull: false,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_emergency_contacts',
});

SocietyEmergencyContact.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyEmergencyContact.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default SocietyEmergencyContact;
