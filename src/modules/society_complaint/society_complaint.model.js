import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyComplaint = sequelize.define('SocietyComplaint', {
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
  user_id: {
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
    defaultValue: 'open',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'society_complaints',
});

// Setup relationships
SocietyComplaint.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyComplaint.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default SocietyComplaint;
