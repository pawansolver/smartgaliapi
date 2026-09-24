import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyGuardAuthorization from './society_guard_authorization.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import SocietyShift from '../society_shift/society_shift.model.js';

export const SocietyGuardAssignment = sequelize.define('SocietyGuardAssignment', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyProfile, key: 'id' },
  },
  guard_authorization_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyGuardAuthorization, key: 'id' },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  gate_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyGate, key: 'id' },
  },
  shift_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyShift, key: 'id' },
  },
  assignment_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'permanent',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'active',
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'society_guard_assignments',
  timestamps: false,
});

SocietyGuardAssignment.belongsTo(SocietyGuardAuthorization, { foreignKey: 'guard_authorization_id', as: 'guardAuth' });
SocietyGuardAssignment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SocietyGuardAssignment.belongsTo(SocietyGate, { foreignKey: 'gate_id', as: 'gate' });
SocietyGuardAssignment.belongsTo(SocietyShift, { foreignKey: 'shift_id', as: 'shift' });
SocietyGuardAuthorization.hasMany(SocietyGuardAssignment, { foreignKey: 'guard_authorization_id', as: 'assignments' });

export default SocietyGuardAssignment;
