import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const VISITOR_STATUS = Object.freeze({
  EXPECTED: 'expected',
  AT_GATE: 'at_gate',
  APPROVED: 'approved',
  DENIED: 'denied',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
});

const SocietyVisitor = sequelize.define('SocietyVisitor', {
  visitorId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  id: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('visitorId');
    },
    set(val) {
      this.setDataValue('visitorId', val);
    },
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  visitor_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  visitor_phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  purpose: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vehicle_no: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  flat_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  expected_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  approved_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  check_in_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  check_out_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('expected', 'at_gate', 'approved', 'denied', 'checked_in', 'checked_out'),
    defaultValue: 'expected',
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_visitors',
});

SocietyVisitor.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyVisitor, { foreignKey: 'society_id', as: 'visitors' });

SocietyVisitor.belongsTo(User, { foreignKey: 'user_id', as: 'resident' });
SocietyVisitor.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

export default SocietyVisitor;
