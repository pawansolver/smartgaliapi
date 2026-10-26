import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { audit } from '../audit_log/audit_log.service.js';

export const ServiceBookingSetting = sequelize.define('ServiceBookingSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  group: {
    type: DataTypes.ENUM('general', 'payment', 'api'),
    defaultValue: 'general',
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'settings',
  timestamps: true,
});

// In-memory cache for high-frequency pricing computations
let _cachedGovernance = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60000; // 1 minute TTL

export const DEFAULT_BOOKING_GOVERNANCE = {
  platform_fee: 29.00,
  tax_rate_percent: 3.0,
  default_material_charge: 50.00,
  platform_commission_percent: 10.0,
  max_advance_booking_days: 30,
  min_lead_time_hours: 2,
  allow_public_bookings: true,
  require_doorstep_pin: true,
};

/**
 * Fetches dynamic Super Admin booking and pricing governance from MySQL settings table.
 */
export const getLiveBookingGovernance = async (forceFresh = false) => {
  const now = Date.now();
  if (!forceFresh && _cachedGovernance && now < _cacheExpiry) {
    return _cachedGovernance;
  }

  try {
    const rows = await ServiceBookingSetting.findAll({
      where: {
        key: [
          'service.booking.platform_fee',
          'service.booking.tax_rate_percent',
          'service.booking.default_material_charge',
          'service.booking.platform_commission_percent',
          'service.booking.max_advance_booking_days',
          'service.booking.min_lead_time_hours',
          'service.booking.allow_public_bookings',
          'service.booking.require_doorstep_pin',
        ],
      },
    });

    const map = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }

    const resolved = {
      platform_fee: map['service.booking.platform_fee'] != null ? Number(map['service.booking.platform_fee']) : DEFAULT_BOOKING_GOVERNANCE.platform_fee,
      tax_rate_percent: map['service.booking.tax_rate_percent'] != null ? Number(map['service.booking.tax_rate_percent']) : DEFAULT_BOOKING_GOVERNANCE.tax_rate_percent,
      default_material_charge: map['service.booking.default_material_charge'] != null ? Number(map['service.booking.default_material_charge']) : DEFAULT_BOOKING_GOVERNANCE.default_material_charge,
      platform_commission_percent: map['service.booking.platform_commission_percent'] != null ? Number(map['service.booking.platform_commission_percent']) : DEFAULT_BOOKING_GOVERNANCE.platform_commission_percent,
      max_advance_booking_days: map['service.booking.max_advance_booking_days'] != null ? parseInt(map['service.booking.max_advance_booking_days'], 10) : DEFAULT_BOOKING_GOVERNANCE.max_advance_booking_days,
      min_lead_time_hours: map['service.booking.min_lead_time_hours'] != null ? parseInt(map['service.booking.min_lead_time_hours'], 10) : DEFAULT_BOOKING_GOVERNANCE.min_lead_time_hours,
      allow_public_bookings: map['service.booking.allow_public_bookings'] != null ? (map['service.booking.allow_public_bookings'] === 'true' || map['service.booking.allow_public_bookings'] === '1') : DEFAULT_BOOKING_GOVERNANCE.allow_public_bookings,
      require_doorstep_pin: map['service.booking.require_doorstep_pin'] != null ? (map['service.booking.require_doorstep_pin'] === 'true' || map['service.booking.require_doorstep_pin'] === '1') : DEFAULT_BOOKING_GOVERNANCE.require_doorstep_pin,
    };

    _cachedGovernance = resolved;
    _cacheExpiry = now + CACHE_TTL_MS;
    return resolved;
  } catch (error) {
    console.warn('Error reading booking governance from settings table, using defaults:', error.message);
    return DEFAULT_BOOKING_GOVERNANCE;
  }
};

/**
 * Updates dynamic Super Admin booking and pricing governance in MySQL settings table.
 */
export const updateLiveBookingGovernance = async (payload, actorUser, reqMeta = {}) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const current = await getLiveBookingGovernance(true);

  const updates = [
    {
      key: 'service.booking.platform_fee',
      value: payload.platform_fee != null ? String(Number(payload.platform_fee).toFixed(2)) : undefined,
      group: 'payment',
      description: 'Platform convenience fee charged to customer per service booking (INR)',
    },
    {
      key: 'service.booking.tax_rate_percent',
      value: payload.tax_rate_percent != null ? String(Number(payload.tax_rate_percent).toFixed(2)) : undefined,
      group: 'payment',
      description: 'Applicable GST/Tax rate percentage for service bookings',
    },
    {
      key: 'service.booking.default_material_charge',
      value: payload.default_material_charge != null ? String(Number(payload.default_material_charge).toFixed(2)) : undefined,
      group: 'payment',
      description: 'Default estimated material/parts charge (INR)',
    },
    {
      key: 'service.booking.platform_commission_percent',
      value: payload.platform_commission_percent != null ? String(Number(payload.platform_commission_percent).toFixed(2)) : undefined,
      group: 'payment',
      description: 'Platform commission percentage deducted from provider earnings',
    },
    {
      key: 'service.booking.max_advance_booking_days',
      value: payload.max_advance_booking_days != null ? String(parseInt(payload.max_advance_booking_days, 10)) : undefined,
      group: 'general',
      description: 'Maximum days in advance a customer can schedule a service',
    },
    {
      key: 'service.booking.min_lead_time_hours',
      value: payload.min_lead_time_hours != null ? String(parseInt(payload.min_lead_time_hours, 10)) : undefined,
      group: 'general',
      description: 'Minimum lead time in hours required before booking slot start',
    },
    {
      key: 'service.booking.allow_public_bookings',
      value: payload.allow_public_bookings != null ? String(Boolean(payload.allow_public_bookings)) : undefined,
      group: 'general',
      description: 'Allow independent houses / public locality bookings in addition to gated societies',
    },
    {
      key: 'service.booking.require_doorstep_pin',
      value: payload.require_doorstep_pin != null ? String(Boolean(payload.require_doorstep_pin)) : undefined,
      group: 'general',
      description: 'Enforce 4-digit doorstep safety OTP/PIN verification on service completion',
    },
  ];

  for (const item of updates) {
    if (item.value !== undefined) {
      const [record, created] = await ServiceBookingSetting.findOrCreate({
        where: { key: item.key },
        defaults: {
          key: item.key,
          value: item.value,
          group: item.group,
          description: item.description,
          is_public: true,
        },
      });

      if (!created && record.value !== item.value) {
        await record.update({
          value: item.value,
          updatedAt: new Date(),
        });
      }
    }
  }

  // Clear memory cache so fresh values take effect immediately
  _cachedGovernance = null;
  _cacheExpiry = 0;
  const updated = await getLiveBookingGovernance(true);

  // Audit log for Super Admin compliance
  await audit({
    actorId,
    action: 'service_booking_governance.update',
    targetType: 'BookingGovernance',
    targetId: 1,
    before: current,
    after: updated,
    ip: reqMeta.ip,
    ua: reqMeta.ua,
  });

  return updated;
};
