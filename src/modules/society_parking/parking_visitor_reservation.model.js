import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import ParkingSlot from './parking_slot.model.js';
import User from '../user/user.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import { normalizeRegistrationNumber } from './society_vehicle.model.js';

export const VISITOR_PARKING_STATUS = Object.freeze({
  EXPECTED: 'expected',
  OCCUPIED: 'occupied',
  CHECKED_OUT: 'checked_out',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

const ParkingVisitorReservation = sequelize.define('ParkingVisitorReservation', {
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
  slot_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ParkingSlot,
      key: 'id',
    },
  },
  host_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  host_member_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyMember,
      key: 'id',
    },
  },
  host_flat_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  visitor_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  vehicle_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  normalized_vehicle_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  expected_arrival_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  expected_exit_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  check_in_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  check_out_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  check_in_gate_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyGate,
      key: 'id',
    },
  },
  check_out_gate_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyGate,
      key: 'id',
    },
  },
  checked_in_by_guard_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  checked_out_by_guard_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'expected',
  },
  purpose: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'parking_visitor_reservations',
  hooks: {
    beforeValidate: (res) => {
      if (res.vehicle_number) {
        res.vehicle_number = res.vehicle_number.trim().toUpperCase();
        res.normalized_vehicle_number = normalizeRegistrationNumber(res.vehicle_number);
      }
    },
  },
});

ParkingVisitorReservation.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ParkingVisitorReservation.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });
ParkingSlot.hasMany(ParkingVisitorReservation, { foreignKey: 'slot_id', as: 'visitorReservations' });

ParkingVisitorReservation.belongsTo(User, { foreignKey: 'host_user_id', as: 'host' });
ParkingVisitorReservation.belongsTo(SocietyMember, { foreignKey: 'host_member_id', as: 'member' });
ParkingVisitorReservation.belongsTo(SocietyGate, { foreignKey: 'check_in_gate_id', as: 'checkInGate' });
ParkingVisitorReservation.belongsTo(SocietyGate, { foreignKey: 'check_out_gate_id', as: 'checkOutGate' });

export default ParkingVisitorReservation;
