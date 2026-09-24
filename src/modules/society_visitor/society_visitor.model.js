import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import SocietyGuardAuthorization from '../society_guard/society_guard_authorization.model.js';

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
  // Enterprise Extended Fields
  visitor_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'guest',
  },
  driver_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  cab_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  service_category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  worker_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  company_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  vehicle_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'none',
  },
  entry_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'expected',
  },
  gate_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  guard_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  id_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  id_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  id_verification_status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'unverified',
  },
  approval_status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'pending',
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rejected_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
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
SocietyVisitor.belongsTo(User, { foreignKey: 'rejected_by', as: 'rejector' });
SocietyVisitor.belongsTo(SocietyGate, { foreignKey: 'gate_id', as: 'gate' });
SocietyVisitor.belongsTo(SocietyGuardAuthorization, { foreignKey: 'guard_id', as: 'guard' });

export default SocietyVisitor;
