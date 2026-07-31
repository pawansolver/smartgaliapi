import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyAnnouncement = sequelize.define('SocietyAnnouncement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyProfile,
      key: 'id',
    }
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'society_announcements',
});

// Setup relationships
SocietyAnnouncement.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyAnnouncement.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default SocietyAnnouncement;
