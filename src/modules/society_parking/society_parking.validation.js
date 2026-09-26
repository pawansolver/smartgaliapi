import Joi from 'joi';

const id = Joi.number().integer().positive();
const stringTrim = (min, max) => Joi.string().trim().min(min).max(max);

// --- Areas ---
export const createParkingAreaSchema = Joi.object({
  name: stringTrim(2, 150).required().messages({
    'string.empty': 'Area name is required',
  }),
  floor: stringTrim(1, 50).required().messages({
    'string.empty': 'Floor level is required',
  }),
  parking_type: Joi.string().trim().valid('Covered Basement', 'Stilt Parking', 'Open Ground', 'Podium', 'Multi-level').default('Covered Basement'),
  total_capacity: Joi.number().integer().min(1).max(5000).default(20),
  status: Joi.string().trim().valid('active', 'maintenance').default('active'),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const updateParkingAreaSchema = Joi.object({
  name: stringTrim(2, 150).optional(),
  floor: stringTrim(1, 50).optional(),
  parking_type: Joi.string().trim().valid('Covered Basement', 'Stilt Parking', 'Open Ground', 'Podium', 'Multi-level').optional(),
  total_capacity: Joi.number().integer().min(1).max(5000).optional(),
  status: Joi.string().trim().valid('active', 'maintenance').optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

// --- Slots ---
export const createParkingSlotSchema = Joi.object({
  area_id: id.allow(null).optional(),
  slot_number: stringTrim(1, 100).required().messages({
    'string.empty': 'Slot number is required',
  }),
  slot_type: Joi.string().trim().valid('two_wheeler', 'four_wheeler', 'ev_charging', 'visitor', 'accessible').default('four_wheeler'),
  status: Joi.string().trim().valid('available', 'allocated', 'blocked', 'maintenance').default('available'),
  is_covered: Joi.boolean().default(true),
  has_ev_charger: Joi.boolean().default(false),
  charger_power_kw: Joi.number().min(0).max(350).default(0.00),
  is_reserved: Joi.boolean().default(false),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const updateParkingSlotSchema = Joi.object({
  area_id: id.allow(null).optional(),
  slot_number: stringTrim(1, 100).optional(),
  slot_type: Joi.string().trim().valid('two_wheeler', 'four_wheeler', 'ev_charging', 'visitor', 'accessible').optional(),
  status: Joi.string().trim().valid('available', 'allocated', 'blocked', 'maintenance').optional(),
  is_covered: Joi.boolean().optional(),
  has_ev_charger: Joi.boolean().optional(),
  charger_power_kw: Joi.number().min(0).max(350).optional(),
  is_reserved: Joi.boolean().optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const blockSlotSchema = Joi.object({
  reason: stringTrim(3, 255).required().messages({
    'string.empty': 'Reason for blocking slot is mandatory',
  }),
});

export const setMaintenanceSchema = Joi.object({
  reason: stringTrim(3, 255).required().messages({
    'string.empty': 'Maintenance reason is mandatory',
  }),
});

// --- Vehicles ---
export const registerVehicleSchema = Joi.object({
  registration_number: stringTrim(5, 50).required().messages({
    'string.empty': 'Vehicle registration number is required',
  }),
  vehicle_type: Joi.string().trim().valid('car', 'bike', 'ev', 'scooter', 'suv', 'commercial').default('car'),
  make: stringTrim(1, 100).required().messages({
    'string.empty': 'Vehicle make is required',
  }),
  model: stringTrim(1, 100).required().messages({
    'string.empty': 'Vehicle model is required',
  }),
  color: stringTrim(1, 50).allow('', null).optional(),
  fuel_type: Joi.string().trim().valid('Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid').default('Petrol'),
  is_ev: Joi.boolean().default(false),
  owner_user_id: id.optional(),
  flat_number: stringTrim(1, 50).optional(),
});

export const updateVehicleSchema = Joi.object({
  registration_number: stringTrim(5, 50).optional(),
  vehicle_type: Joi.string().trim().valid('car', 'bike', 'ev', 'scooter', 'suv', 'commercial').optional(),
  make: stringTrim(1, 100).optional(),
  model: stringTrim(1, 100).optional(),
  color: stringTrim(1, 50).allow('', null).optional(),
  fuel_type: Joi.string().trim().valid('Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid').optional(),
  is_ev: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  flat_number: stringTrim(1, 50).optional(),
});

// --- Allocations ---
export const allocateSlotSchema = Joi.object({
  slot_id: id.required().messages({
    'any.required': 'slot_id is required for allocation',
  }),
  vehicle_id: id.allow(null).optional(),
  resident_user_id: id.optional(),
  resident_name: stringTrim(2, 150).optional(),
  flat_number: stringTrim(1, 50).optional(),
  vehicle_registration: stringTrim(4, 50).optional(),
  vehicle_type: Joi.string().trim().valid('car', 'bike', 'ev', 'scooter', 'suv', 'commercial').optional(),
  vehicle_model: stringTrim(1, 100).allow('', null).optional(),
  allocation_type: Joi.string().trim().valid('permanent', 'temporary').default('permanent'),
  start_at: Joi.date().iso().default(() => new Date()),
  end_at: Joi.date().iso().allow(null).when('allocation_type', {
    is: 'temporary',
    then: Joi.date().iso().required().greater(Joi.ref('start_at')).messages({
      'any.required': 'Temporary allocations must have a valid expiry end date',
      'date.greater': 'Allocation end date must be strictly after start date',
    }),
    otherwise: Joi.optional(),
  }),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const reassignSlotSchema = Joi.object({
  new_resident_user_id: id.optional(),
  new_resident_name: stringTrim(2, 150).optional(),
  new_flat_number: stringTrim(1, 50).optional(),
  new_vehicle_id: id.allow(null).optional(),
  new_vehicle_registration: stringTrim(4, 50).optional(),
  new_vehicle_type: Joi.string().trim().valid('car', 'bike', 'ev', 'scooter', 'suv', 'commercial').default('car'),
  new_vehicle_model: stringTrim(1, 100).allow('', null).optional(),
  reason: stringTrim(3, 255).required().messages({
    'any.required': 'Reassignment reason is mandatory for audit trail',
    'string.empty': 'Reassignment reason cannot be blank',
  }),
  allocation_type: Joi.string().trim().valid('permanent', 'temporary').default('permanent'),
  start_at: Joi.date().iso().default(() => new Date()),
  end_at: Joi.date().iso().allow(null).when('allocation_type', {
    is: 'temporary',
    then: Joi.date().iso().required().greater(Joi.ref('start_at')).messages({
      'any.required': 'Temporary allocations must have a valid expiry end date',
      'date.greater': 'Allocation end date must be strictly after start date',
    }),
    otherwise: Joi.optional(),
  }),
});

export const releaseSlotSchema = Joi.object({
  reason: stringTrim(3, 255).required().messages({
    'any.required': 'Release reason is mandatory',
    'string.empty': 'Release reason cannot be blank',
  }),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

// --- Visitor Reservations ---
export const preBookVisitorSchema = Joi.object({
  visitor_bay_id: id.optional(),
  slot_id: id.optional(),
  slot_number: stringTrim(1, 100).optional(),
  visitor_name: stringTrim(2, 150).required().messages({
    'string.empty': 'Visitor name is required',
  }),
  vehicle_number: stringTrim(4, 50).required().messages({
    'string.empty': 'Vehicle registration plate is required',
  }),
  expected_arrival_at: Joi.date().iso().required().messages({
    'any.required': 'Expected arrival datetime is required',
  }),
  expected_exit_at: Joi.date().iso().required().greater(Joi.ref('expected_arrival_at')).messages({
    'any.required': 'Expected exit datetime is required',
    'date.greater': 'Expected exit datetime must be strictly after arrival datetime',
  }),
  purpose: stringTrim(1, 255).allow('', null).optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const guardCheckInSchema = Joi.object({
  reservation_id: id.optional(),
  slot_id: id.optional(),
  slot_number: stringTrim(1, 100).optional(),
  visitor_name: stringTrim(2, 150).optional(),
  vehicle_number: stringTrim(4, 50).optional(),
  host_flat_number: stringTrim(1, 50).optional(),
  gate_id: id.optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const guardCheckOutSchema = Joi.object({
  gate_id: id.optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional(),
});

// --- Violations ---
export const reportViolationSchema = Joi.object({
  slot_id: id.optional(),
  slot_number: stringTrim(1, 100).required().messages({
    'string.empty': 'Slot number is required',
  }),
  unauthorized_vehicle_number: stringTrim(4, 50).required().messages({
    'string.empty': 'Offending vehicle registration number is required',
  }),
  reason_code: stringTrim(2, 100).required().messages({
    'string.empty': 'Violation reason is required',
  }),
  remarks: Joi.string().trim().max(1000).allow('', null).optional(),
});

export const updateViolationStatusSchema = Joi.object({
  status: Joi.string().trim().valid('OPEN', 'ACKNOWLEDGED', 'ACTION_TAKEN', 'RESOLVED', 'DISMISSED').required(),
  assigned_to: id.allow(null).optional(),
  resolution_notes: Joi.string().trim().max(1000).allow('', null).optional(),
});
