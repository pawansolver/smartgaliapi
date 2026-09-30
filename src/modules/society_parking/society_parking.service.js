import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyParking from './society_parking.model.js';
import ParkingArea from './parking_area.model.js';
import ParkingSlot from './parking_slot.model.js';
import SocietyVehicle, { normalizeRegistrationNumber } from './society_vehicle.model.js';
import ParkingAllocation from './parking_allocation.model.js';
import ParkingAccessPass from './parking_access_pass.model.js';
import ParkingVisitorReservation from './parking_visitor_reservation.model.js';
import ParkingAuditLog from './parking_audit_log.model.js';
import ParkingViolation from './parking_violation.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import SocietyGuardAuthorization from '../society_guard/society_guard_authorization.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { logger } from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Record Immutable Parking Audit Event
// ─────────────────────────────────────────────────────────────────────────────
export const logParkingAudit = async ({
  societyId,
  actorUserId,
  actorName = null,
  actorRole = null,
  action,
  targetType,
  targetId = null,
  slotNumber = null,
  flatNumber = null,
  residentName = null,
  previousState = null,
  newState = null,
  reason = null,
  metadata = null,
}, options = {}) => {
  try {
    let resolvedActorName = actorName;
    if (!resolvedActorName && actorUserId) {
      const u = await User.findByPk(actorUserId, { attributes: [['userName', 'name'], 'phone'] });
      if (u) resolvedActorName = u.name;
    }

    await ParkingAuditLog.create({
      society_id: societyId,
      actor_user_id: actorUserId,
      actor_name: resolvedActorName,
      actor_role: actorRole,
      action,
      target_type: targetType,
      target_id: targetId,
      slot_number: slotNumber,
      flat_number: flatNumber,
      resident_name: residentName,
      previous_state: previousState,
      new_state: newState,
      reason,
      metadata,
      created_at: new Date(),
    }, options);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: `parking.${action.toLowerCase()}`,
      targetEntityType: targetType,
      targetEntityId: targetId,
      oldValue: previousState,
      newValue: newState,
      reason,
    }, options);
  } catch (err) {
    logger.error('PARKING_AUDIT', 'Failed to write parking audit', { error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Role-Based Notification Dispatch Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch active guards for this society
 */
export const getParkingGuardUserIds = async (societyId, excludeUserId = null) => {
  const guardUserIds = new Set();
  try {
    const guards = await SocietyGuardAuthorization.findAll({
      where: { society_id: societyId, status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    for (const g of guards) {
      if (g.user_id && (!excludeUserId || Number(g.user_id) !== Number(excludeUserId))) {
        guardUserIds.add(Number(g.user_id));
      }
    }
  } catch (err) {
    logger.warn('getParkingGuardUserIds', 'guard_auth_error', { societyId, error: err?.message });
  }

  try {
    const staffMembers = await SocietyMember.findAll({
      where: {
        society_id: societyId,
        role: ['staff', 'security', 'guard'],
        status: 'active',
        is_deleted: false,
      },
      attributes: ['user_id'],
    });
    for (const sm of staffMembers) {
      if (sm.user_id && (!excludeUserId || Number(sm.user_id) !== Number(excludeUserId))) {
        guardUserIds.add(Number(sm.user_id));
      }
    }
  } catch (err) {
    logger.warn('getParkingGuardUserIds', 'staff_members_error', { societyId, error: err?.message });
  }

  return Array.from(guardUserIds);
};

/**
 * Fetch active admin & committee members
 */
export const getParkingAdminCommitteeUserIds = async (societyId, excludeUserId = null) => {
  const userIds = new Set();
  try {
    const members = await SocietyMember.findAll({
      where: {
        society_id: societyId,
        role: ['admin', 'committee', 'owner', 'president', 'secretary', 'treasurer'],
        status: 'active',
        is_deleted: false,
      },
      attributes: ['user_id'],
    });
    for (const m of members) {
      if (m.user_id && (!excludeUserId || Number(m.user_id) !== Number(excludeUserId))) {
        userIds.add(Number(m.user_id));
      }
    }
  } catch (err) {
    logger.warn('getParkingAdminCommitteeUserIds', 'fetch_error', { societyId, error: err?.message });
  }
  return Array.from(userIds);
};

/**
 * Fetch resident user IDs for a given flat number
 */
export const getParkingResidentUserIdsByFlat = async (societyId, flatNo, excludeUserId = null) => {
  if (!flatNo) return [];
  const cleanFlat = String(flatNo).trim().toLowerCase();
  const res = new Set();
  try {
    const members = await SocietyMember.findAll({
      where: {
        society_id: societyId,
        status: 'active',
        is_deleted: false,
      },
      attributes: ['user_id', 'flat_no'],
    });
    for (const m of members) {
      if (m.flat_no && String(m.flat_no).trim().toLowerCase() === cleanFlat) {
        if (m.user_id && (!excludeUserId || Number(m.user_id) !== Number(excludeUserId))) {
          res.add(Number(m.user_id));
        }
      }
    }
  } catch (err) {
    logger.warn('getParkingResidentUserIdsByFlat', 'fetch_error', { societyId, flatNo, error: err?.message });
  }
  return Array.from(res);
};

/**
 * Find registered owner of a vehicle by registration number
 */
export const getParkingVehicleOwnerUserId = async (societyId, registrationNumber, excludeUserId = null) => {
  if (!registrationNumber) return null;
  try {
    const norm = normalizeRegistrationNumber(registrationNumber);
    const vehicle = await SocietyVehicle.findOne({
      where: { society_id: societyId, normalized_registration: norm, is_deleted: false },
      attributes: ['owner_user_id'],
    });
    if (vehicle?.owner_user_id && (!excludeUserId || Number(vehicle.owner_user_id) !== Number(excludeUserId))) {
      return Number(vehicle.owner_user_id);
    }
  } catch (err) {
    logger.warn('getParkingVehicleOwnerUserId', 'fetch_error', { societyId, registrationNumber, error: err?.message });
  }
  return null;
};

/**
 * Safe broadcast helper to send push and in-app notifications to one or multiple users
 */
export const sendParkingNotifications = async (userIds, { title, body, type = 'info', societyId, data = {} }, actorUserId = null) => {
  if (!userIds) return;
  const list = Array.isArray(userIds) ? userIds : [userIds];
  const uniqueIds = Array.from(new Set(list)).filter((id) => id != null && (!actorUserId || Number(id) !== Number(actorUserId)));

  for (const uid of uniqueIds) {
    try {
      await emitNotification(uid, {
        title,
        body,
        type,
        societyId: Number(societyId),
        data: {
          ...data,
          societyId: Number(societyId),
          type: 'society_parking',
          module: 'parking',
        },
      });
    } catch (notifErr) {
      logger.warn('sendParkingNotifications', 'emit_failed', { recipientId: uid, title, error: notifErr?.message });
    }
  }
};

// 1. PARKING AREAS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listParkingAreas = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;

  const areas = await ParkingArea.findAll({
    where,
    order: [['created_at', 'ASC']],
  });

  // Calculate real-time occupancy counts per area
  const result = await Promise.all(areas.map(async (area) => {
    const slots = await ParkingSlot.findAll({
      where: { society_id: societyId, area_id: area.id, is_deleted: false },
      attributes: ['id', 'status'],
    });

    const total = area.total_capacity || slots.length;
    const occupied = slots.filter(s => s.status === 'allocated').length;
    const available = Math.max(0, total - occupied);

    return {
      id: area.id,
      societyId: area.society_id,
      name: area.name,
      floor: area.floor,
      parkingType: area.parking_type,
      totalCapacity: total,
      occupiedCount: occupied,
      availableCount: available,
      status: area.status,
      notes: area.notes,
      createdAt: area.created_at,
    };
  }));

  return result;
};

export const createParkingArea = async (societyId, userId, data, meta = {}) => {
  const area = await ParkingArea.create({
    society_id: societyId,
    name: data.name.trim(),
    floor: data.floor.trim(),
    parking_type: data.parking_type || 'Covered Basement',
    total_capacity: data.total_capacity || 20,
    status: data.status || 'active',
    notes: data.notes || null,
    created_by: userId,
  });

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'AREA_CREATED',
    targetType: 'area',
    targetId: area.id,
    newState: { name: area.name, floor: area.floor, capacity: area.total_capacity },
    reason: 'New parking area created',
  });

  return area;
};

export const updateParkingArea = async (societyId, areaId, userId, data, meta = {}) => {
  const area = await ParkingArea.findOne({
    where: { id: areaId, society_id: societyId, is_deleted: false },
  });
  if (!area) {
    const err = new Error('Parking area not found');
    err.statusCode = 404;
    throw err;
  }

  const previousState = { name: area.name, floor: area.floor, capacity: area.total_capacity, status: area.status };

  if (data.name !== undefined) area.name = data.name.trim();
  if (data.floor !== undefined) area.floor = data.floor.trim();
  if (data.parking_type !== undefined) area.parking_type = data.parking_type;
  if (data.total_capacity !== undefined) area.total_capacity = data.total_capacity;
  if (data.status !== undefined) area.status = data.status;
  if (data.notes !== undefined) area.notes = data.notes;
  area.updated_by = userId;
  await area.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'AREA_UPDATED',
    targetType: 'area',
    targetId: area.id,
    previousState,
    newState: { name: area.name, floor: area.floor, capacity: area.total_capacity, status: area.status },
    reason: 'Parking area updated',
  });

  return area;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARKING SLOTS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listParkingSlots = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.area_id) where.area_id = query.area_id;
  if (query.status) where.status = query.status;
  if (query.slot_type) where.slot_type = query.slot_type;

  const slots = await ParkingSlot.findAll({
    where,
    include: [
      { model: ParkingArea, as: 'area', attributes: ['id', 'name', 'floor'] },
      {
        model: ParkingAllocation,
        as: 'activeAllocation',
        where: { status: 'active', is_deleted: false },
        required: false,
        include: [
          { model: User, as: 'resident', attributes: ['userId', ['userName', 'name'], 'phone'] },
          { model: SocietyVehicle, as: 'vehicle', attributes: ['id', 'registration_number', 'make', 'model', 'vehicle_type', 'is_ev'] },
          { model: ParkingAccessPass, as: 'passes', where: { status: 'active', is_deleted: false }, required: false },
        ],
      },
    ],
    order: [['slot_number', 'ASC']],
  });

  // Map to unified UI presentation format
  return slots.map(s => {
    const alloc = s.activeAllocation;
    return {
      id: s.id,
      societyId: s.society_id,
      areaId: s.area_id,
      areaName: s.area ? s.area.name : 'General Area',
      floor: s.area ? s.area.floor : 'Ground Floor',
      slotNumber: s.slot_number,
      slotType: s.slot_type,
      status: s.status,
      isCovered: Boolean(s.is_covered),
      hasEvCharger: Boolean(s.has_ev_charger),
      chargerPowerKw: Number(s.charger_power_kw || 0),
      isReserved: Boolean(s.is_reserved),
      notes: s.notes,
      currentAllocation: alloc ? {
        id: alloc.id,
        slotId: alloc.slot_id,
        slotNumber: s.slot_number,
        residentUserId: alloc.resident_user_id,
        residentName: alloc.resident?.name || 'Resident',
        flatNumber: alloc.flat_number,
        vehicleId: alloc.vehicle_id,
        vehicleRegistration: alloc.vehicle?.registration_number || '',
        vehicleType: alloc.vehicle?.vehicle_type || 'car',
        vehicleModel: alloc.vehicle?.model || '',
        allocationType: alloc.allocation_type,
        status: alloc.status,
        startAt: alloc.start_at,
        endAt: alloc.end_at,
        rfidTag: alloc.passes && alloc.passes.length > 0 ? alloc.passes[0].pass_identifier : null,
      } : null,
    };
  });
};

export const createParkingSlot = async (societyId, userId, data, meta = {}) => {
  const normalizedSlot = data.slot_number.trim().toUpperCase();

  // Unique constraint check per society
  const existing = await ParkingSlot.findOne({
    where: { society_id: societyId, slot_number: normalizedSlot, is_deleted: false },
  });
  if (existing) {
    const err = new Error(`Slot '${normalizedSlot}' already exists in this society`);
    err.statusCode = 409;
    throw err;
  }

  // Validate area belongs to society if provided
  if (data.area_id) {
    const area = await ParkingArea.findOne({
      where: { id: data.area_id, society_id: societyId, is_deleted: false },
    });
    if (!area) {
      const err = new Error('Selected parking area does not belong to this society');
      err.statusCode = 400;
      throw err;
    }
  }

  const slot = await ParkingSlot.create({
    society_id: societyId,
    area_id: data.area_id || null,
    slot_number: normalizedSlot,
    slot_type: data.slot_type || 'four_wheeler',
    status: data.status || 'available',
    is_covered: data.is_covered !== undefined ? data.is_covered : true,
    has_ev_charger: Boolean(data.has_ev_charger),
    charger_power_kw: data.charger_power_kw || 0.00,
    is_reserved: Boolean(data.is_reserved),
    notes: data.notes || null,
    created_by: userId,
  });

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'SLOT_CREATED',
    targetType: 'slot',
    targetId: slot.id,
    slotNumber: slot.slot_number,
    newState: { slot_number: slot.slot_number, type: slot.slot_type, status: slot.status },
    reason: 'New parking slot registered',
  });

  return slot;
};

export const updateParkingSlot = async (societyId, slotId, userId, data, meta = {}) => {
  const slot = await ParkingSlot.findOne({
    where: { id: slotId, society_id: societyId, is_deleted: false },
  });
  if (!slot) {
    const err = new Error('Parking slot not found');
    err.statusCode = 404;
    throw err;
  }

  const previousState = { slot_number: slot.slot_number, status: slot.status, type: slot.slot_type };

  if (data.area_id !== undefined) slot.area_id = data.area_id;
  if (data.slot_type !== undefined) slot.slot_type = data.slot_type;
  if (data.is_covered !== undefined) slot.is_covered = data.is_covered;
  if (data.has_ev_charger !== undefined) slot.has_ev_charger = data.has_ev_charger;
  if (data.charger_power_kw !== undefined) slot.charger_power_kw = data.charger_power_kw;
  if (data.is_reserved !== undefined) slot.is_reserved = data.is_reserved;
  if (data.notes !== undefined) slot.notes = data.notes;
  slot.updated_by = userId;
  await slot.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'SLOT_UPDATED',
    targetType: 'slot',
    targetId: slot.id,
    slotNumber: slot.slot_number,
    previousState,
    newState: { slot_number: slot.slot_number, status: slot.status, type: slot.slot_type },
    reason: 'Parking slot specifications updated',
  });

  return slot;
};

export const blockParkingSlot = async (societyId, slotId, userId, reason, meta = {}) => {
  const slot = await ParkingSlot.findOne({
    where: { id: slotId, society_id: societyId, is_deleted: false },
  });
  if (!slot) {
    const err = new Error('Parking slot not found');
    err.statusCode = 404;
    throw err;
  }

  if (slot.status === 'allocated') {
    const err = new Error('Cannot block an actively allocated slot. Release or reassign it first.');
    err.statusCode = 400;
    throw err;
  }

  const previousStatus = slot.status;
  slot.status = 'blocked';
  slot.notes = reason;
  slot.updated_by = userId;
  await slot.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'SLOT_BLOCKED',
    targetType: 'slot',
    targetId: slot.id,
    slotNumber: slot.slot_number,
    previousState: { status: previousStatus },
    newState: { status: 'blocked' },
    reason,
  });

  // Role-Based Notification: Notify Guards and Admin/Committee
  try {
    const guardIds = await getParkingGuardUserIds(societyId, userId);
    await sendParkingNotifications(guardIds, {
      title: '🚫 Parking Slot Blocked',
      body: `Slot ${slot.slot_number} has been BLOCKED (${reason}). Do not park or permit vehicles.`,
      type: 'alert',
      societyId,
      data: { slotNumber: slot.slot_number, action: 'blocked' },
    }, userId);

    const adminIds = await getParkingAdminCommitteeUserIds(societyId, userId);
    await sendParkingNotifications(adminIds, {
      title: '🚫 Parking Slot Blocked',
      body: `Slot ${slot.slot_number} marked as BLOCKED (${reason}).`,
      type: 'info',
      societyId,
      data: { slotNumber: slot.slot_number, action: 'blocked' },
    }, userId);
  } catch (err) {
    logger.warn('blockParkingSlot', 'notification_failed', { error: err?.message });
  }

  return slot;
};

export const unblockParkingSlot = async (societyId, slotId, userId, meta = {}) => {
  const slot = await ParkingSlot.findOne({
    where: { id: slotId, society_id: societyId, is_deleted: false },
  });
  if (!slot) {
    const err = new Error('Parking slot not found');
    err.statusCode = 404;
    throw err;
  }

  if (slot.status !== 'blocked') {
    const err = new Error('Slot is not currently blocked');
    err.statusCode = 400;
    throw err;
  }

  slot.status = 'available';
  slot.notes = null;
  slot.updated_by = userId;
  await slot.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'SLOT_UNBLOCKED',
    targetType: 'slot',
    targetId: slot.id,
    slotNumber: slot.slot_number,
    previousState: { status: 'blocked' },
    newState: { status: 'available' },
    reason: 'Unblocked by management',
  });

  // Role-Based Notification: Notify Guards
  try {
    const guardIds = await getParkingGuardUserIds(societyId, userId);
    await sendParkingNotifications(guardIds, {
      title: '✅ Parking Slot Unblocked',
      body: `Slot ${slot.slot_number} is unblocked and now Available for parking.`,
      type: 'info',
      societyId,
      data: { slotNumber: slot.slot_number, action: 'unblocked' },
    }, userId);
  } catch (err) {
    logger.warn('unblockParkingSlot', 'notification_failed', { error: err?.message });
  }

  return slot;
};

export const setSlotMaintenance = async (societyId, slotId, userId, reason, meta = {}) => {
  const slot = await ParkingSlot.findOne({
    where: { id: slotId, society_id: societyId, is_deleted: false },
  });
  if (!slot) {
    const err = new Error('Parking slot not found');
    err.statusCode = 404;
    throw err;
  }

  const isEnding = slot.status === 'maintenance';
  const newStatus = isEnding ? 'available' : 'maintenance';
  const action = isEnding ? 'MAINTENANCE_ENDED' : 'MAINTENANCE_STARTED';

  slot.status = newStatus;
  slot.notes = reason;
  slot.updated_by = userId;
  await slot.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action,
    targetType: 'slot',
    targetId: slot.id,
    slotNumber: slot.slot_number,
    newState: { status: newStatus },
    reason,
  });

  // Role-Based Notification: Notify Guards
  try {
    const guardIds = await getParkingGuardUserIds(societyId, userId);
    await sendParkingNotifications(guardIds, {
      title: isEnding ? '✅ Slot Maintenance Finished' : '🛠️ Slot Under Maintenance',
      body: `Slot ${slot.slot_number} ${isEnding ? 'maintenance finished - now Available' : `under maintenance (${reason})`}.`,
      type: 'info',
      societyId,
      data: { slotNumber: slot.slot_number, action: action.toLowerCase() },
    }, userId);
  } catch (err) {
    logger.warn('setSlotMaintenance', 'notification_failed', { error: err?.message });
  }

  return slot;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. VEHICLE REGISTRY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listSocietyVehicles = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.vehicle_type) where.vehicle_type = query.vehicle_type;
  if (query.is_ev !== undefined) where.is_ev = query.is_ev === 'true' || query.is_ev === true;

  const vehicles = await SocietyVehicle.findAll({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['userId', ['userName', 'name'], 'phone'] },
      {
        model: ParkingAllocation,
        as: 'allocations',
        where: { status: 'active', is_deleted: false },
        required: false,
        include: [{ model: ParkingSlot, as: 'slot', attributes: ['slot_number'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  return vehicles.map(v => {
    const activeAlloc = v.allocations && v.allocations.length > 0 ? v.allocations[0] : null;
    return {
      id: v.id,
      societyId: v.society_id,
      ownerUserId: v.owner_user_id,
      ownerName: v.owner?.name || 'Resident',
      flatNumber: v.flat_number,
      registrationNumber: v.registration_number,
      vehicleType: v.vehicle_type,
      make: v.make,
      model: v.model,
      color: v.color,
      fuelType: v.fuel_type,
      isEv: Boolean(v.is_ev),
      isVerified: Boolean(v.is_verified),
      isActive: Boolean(v.is_active),
      slotNumber: activeAlloc?.slot?.slot_number || null,
      createdAt: v.created_at,
    };
  });
};

export const listMyVehicles = async (societyId, userId) => {
  return listSocietyVehicles(societyId, { owner_user_id: userId });
};

export const registerVehicle = async (societyId, userId, data, meta = {}) => {
  const normReg = normalizeRegistrationNumber(data.registration_number);
  const ownerUserId = data.owner_user_id || userId;

  // Derive flat number from SocietyMember
  let flatNumber = data.flat_number;
  let memberId = null;
  const member = await SocietyMember.findOne({
    where: { society_id: societyId, user_id: ownerUserId, is_deleted: false },
  });
  if (member) {
    memberId = member.id;
    if (!flatNumber) flatNumber = member.flat_no;
  }
  if (!flatNumber) flatNumber = 'Flat-General';

  // Prevent duplicate active registration in same society
  const existing = await SocietyVehicle.findOne({
    where: { society_id: societyId, normalized_registration: normReg, is_deleted: false },
  });
  if (existing) {
    const err = new Error(`Vehicle with registration '${data.registration_number}' is already registered in this society`);
    err.statusCode = 409;
    throw err;
  }

  const vehicle = await SocietyVehicle.create({
    society_id: societyId,
    owner_user_id: ownerUserId,
    society_member_id: memberId,
    flat_number: flatNumber,
    registration_number: data.registration_number.trim().toUpperCase(),
    normalized_registration: normReg,
    vehicle_type: data.vehicle_type || 'car',
    make: data.make.trim(),
    model: data.model.trim(),
    color: data.color || null,
    fuel_type: data.fuel_type || 'Petrol',
    is_ev: Boolean(data.is_ev || data.fuel_type === 'Electric'),
    is_verified: false,
    is_active: true,
    created_by: userId,
  });

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'VEHICLE_CREATED',
    targetType: 'vehicle',
    targetId: vehicle.id,
    flatNumber: vehicle.flat_number,
    newState: { registration: vehicle.registration_number, make: vehicle.make, model: vehicle.model },
    reason: 'Vehicle registered in society database',
  });

  // Role-Based Notification: Notify Resident and Guards
  try {
    if (ownerUserId) {
      await sendParkingNotifications([ownerUserId], {
        title: '🚘 Vehicle Registered',
        body: `${vehicle.make} ${vehicle.model} (${vehicle.registration_number}) registered successfully for Flat ${vehicle.flat_number}.`,
        type: 'info',
        societyId,
        data: { vehicleRegistration: vehicle.registration_number, flatNumber: vehicle.flat_number, action: 'vehicle_registered' },
      });
    }

    const guardIds = await getParkingGuardUserIds(societyId, userId);
    await sendParkingNotifications(guardIds, {
      title: '🚘 New Resident Vehicle Registered',
      body: `${vehicle.registration_number} (${vehicle.make} ${vehicle.model}) added for Flat ${vehicle.flat_number}.`,
      type: 'info',
      societyId,
      data: { vehicleRegistration: vehicle.registration_number, flatNumber: vehicle.flat_number, action: 'vehicle_registered' },
    }, userId);
  } catch (err) {
    logger.warn('registerVehicle', 'notification_failed', { error: err?.message });
  }

  return vehicle;
};

export const updateVehicle = async (societyId, vehicleId, userId, data, meta = {}) => {
  const vehicle = await SocietyVehicle.findOne({
    where: { id: vehicleId, society_id: societyId, is_deleted: false },
  });
  if (!vehicle) {
    const err = new Error('Vehicle not found');
    err.statusCode = 404;
    throw err;
  }

  if (data.registration_number) {
    vehicle.registration_number = data.registration_number.trim().toUpperCase();
    vehicle.normalized_registration = normalizeRegistrationNumber(vehicle.registration_number);
  }
  if (data.vehicle_type) vehicle.vehicle_type = data.vehicle_type;
  if (data.make) vehicle.make = data.make.trim();
  if (data.model) vehicle.model = data.model.trim();
  if (data.color !== undefined) vehicle.color = data.color;
  if (data.fuel_type) vehicle.fuel_type = data.fuel_type;
  if (data.is_ev !== undefined) vehicle.is_ev = Boolean(data.is_ev);
  if (data.is_active !== undefined) vehicle.is_active = Boolean(data.is_active);
  vehicle.updated_by = userId;
  await vehicle.save();

  return vehicle;
};

export const deactivateVehicle = async (societyId, vehicleId, userId, meta = {}) => {
  const vehicle = await SocietyVehicle.findOne({
    where: { id: vehicleId, society_id: societyId, is_deleted: false },
  });
  if (!vehicle) {
    const err = new Error('Vehicle not found');
    err.statusCode = 404;
    throw err;
  }

  vehicle.is_active = false;
  vehicle.updated_by = userId;
  await vehicle.save();

  await logParkingAudit({
    societyId,
    actorUserId: userId,
    action: 'VEHICLE_DEACTIVATED',
    targetType: 'vehicle',
    targetId: vehicle.id,
    reason: 'Vehicle deactivated',
  });

  return { success: true, message: 'Vehicle deactivated successfully' };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. PARKING ALLOCATIONS (TRANSACTIONAL SLOT LOCKING)
// ─────────────────────────────────────────────────────────────────────────────

export const listAllocations = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;
  if (query.resident_user_id) where.resident_user_id = query.resident_user_id;
  if (query.slot_id) where.slot_id = query.slot_id;
  if (query.vehicle_id) where.vehicle_id = query.vehicle_id;
  if (query.flat_number) where.flat_number = query.flat_number;

  const allocations = await ParkingAllocation.findAll({
    where,
    include: [
      { model: ParkingSlot, as: 'slot', attributes: ['id', 'slot_number', 'slot_type', 'is_covered', 'has_ev_charger'] },
      { model: User, as: 'resident', attributes: ['userId', ['userName', 'name'], 'phone'] },
      { model: SocietyVehicle, as: 'vehicle', attributes: ['id', 'registration_number', 'make', 'model', 'vehicle_type'] },
      { model: ParkingAccessPass, as: 'passes', where: { is_deleted: false }, required: false },
    ],
    order: [['created_at', 'DESC']],
  });

  return allocations.map(a => ({
    id: a.id,
    societyId: a.society_id,
    slotId: a.slot_id,
    slotNumber: a.slot?.slot_number,
    residentUserId: a.resident_user_id,
    residentName: a.resident?.name || 'Resident',
    flatNumber: a.flat_number,
    vehicleId: a.vehicle_id,
    vehicleRegistration: a.vehicle?.registration_number || '',
    vehicleType: a.vehicle?.vehicle_type || 'car',
    vehicleModel: a.vehicle?.model || '',
    allocationType: a.allocation_type,
    status: a.status,
    startAt: a.start_at,
    endAt: a.end_at,
    rfidTag: a.passes && a.passes.length > 0 ? a.passes[0].pass_identifier : null,
    notes: a.notes,
  }));
};

export const listMyAllocations = async (societyId, userId) => {
  return listAllocations(societyId, { resident_user_id: userId, status: 'active' });
};

export const allocateSlot = async (societyId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    // 1. Transactional Lock on the Slot (Prevents Concurrent Double-Allocation)
    const slot = await ParkingSlot.findOne({
      where: { id: data.slot_id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!slot) {
      const err = new Error('Parking slot not found in this society');
      err.statusCode = 404;
      throw err;
    }

    if (slot.status !== 'available') {
      const err = new Error(`Parking slot '${slot.slot_number}' is no longer available (currently ${slot.status})`);
      err.statusCode = 409;
      throw err;
    }

    // Check if slot already has an active allocation record
    const existingActiveAlloc = await ParkingAllocation.findOne({
      where: { slot_id: slot.id, status: 'active', is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (existingActiveAlloc) {
      const err = new Error(`Parking slot '${slot.slot_number}' is already allocated to ${existingActiveAlloc.flat_number}`);
      err.statusCode = 409;
      throw err;
    }

    // 2. Resolve Resident User & Flat
    let residentUserId = data.resident_user_id;
    let flatNumber = data.flat_number;
    let memberId = null;

    if (residentUserId) {
      const member = await SocietyMember.findOne({
        where: { society_id: societyId, user_id: residentUserId, status: 'active', is_deleted: false },
        transaction,
      });
      if (member) {
        memberId = member.id;
        if (!flatNumber) flatNumber = member.flat_no;
      }
    } else {
      residentUserId = actorUserId;
    }

    if (!flatNumber) flatNumber = 'Unit-Unspecified';

    // 3. Resolve or Auto-register Vehicle
    let vehicleId = data.vehicle_id || null;
    let regNumber = data.vehicle_registration ? data.vehicle_registration.trim().toUpperCase() : null;

    if (!vehicleId && regNumber) {
      const normReg = normalizeRegistrationNumber(regNumber);
      let veh = await SocietyVehicle.findOne({
        where: { society_id: societyId, normalized_registration: normReg, is_deleted: false },
        transaction,
      });
      if (!veh) {
        veh = await SocietyVehicle.create({
          society_id: societyId,
          owner_user_id: residentUserId,
          society_member_id: memberId,
          flat_number: flatNumber,
          registration_number: regNumber,
          normalized_registration: normReg,
          vehicle_type: data.vehicle_type || 'car',
          make: 'Standard',
          model: data.vehicle_model || 'Vehicle',
          is_active: true,
          created_by: actorUserId,
        }, { transaction });
      }
      vehicleId = veh.id;
    }

    // 4. Create Parking Allocation
    const allocation = await ParkingAllocation.create({
      society_id: societyId,
      slot_id: slot.id,
      vehicle_id: vehicleId,
      resident_user_id: residentUserId,
      society_member_id: memberId,
      flat_number: flatNumber,
      allocation_type: data.allocation_type || 'permanent',
      status: 'active',
      start_at: data.start_at || new Date(),
      end_at: data.allocation_type === 'temporary' ? data.end_at : null,
      allocated_by: actorUserId,
      notes: data.notes || null,
    }, { transaction });

    // 5. Update Slot status to 'allocated'
    slot.status = 'allocated';
    await slot.save({ transaction });

    // 6. Generate RFID Access Pass
    const passTag = `RFID #RF-${slot.slot_number}-${allocation.id}`;
    await ParkingAccessPass.create({
      society_id: societyId,
      allocation_id: allocation.id,
      vehicle_id: vehicleId,
      pass_type: 'RFID_FASTAG',
      pass_identifier: passTag,
      status: 'active',
      valid_from: allocation.start_at,
      valid_until: allocation.end_at,
    }, { transaction });

    // 7. Audit Log
    await logParkingAudit({
      societyId,
      actorUserId,
      action: 'ALLOCATED',
      targetType: 'allocation',
      targetId: allocation.id,
      slotNumber: slot.slot_number,
      flatNumber,
      newState: { slot: slot.slot_number, resident: flatNumber, vehicle: regNumber },
      reason: data.notes || `${allocation.allocation_type} allocation created`,
    }, { transaction });

    // 8. Outbox Event
    await createEvent({
      event_type: 'society.parking_allocated',
      aggregate_type: 'parking_allocation',
      aggregate_id: String(allocation.id),
      payload: {
        societyId,
        allocationId: allocation.id,
        slotId: slot.id,
        slotNumber: slot.slot_number,
        residentUserId,
        flatNumber,
        vehicleId,
        passTag,
      },
    }, { transaction });

    await transaction.commit();

    // Role-Based Notification Dispatch (Post-Commit)
    try {
      // 1. Resident
      let residentIds = residentUserId ? [residentUserId] : [];
      if (!residentIds.length && flatNumber) {
        residentIds = await getParkingResidentUserIdsByFlat(societyId, flatNumber, actorUserId);
      }
      await sendParkingNotifications(residentIds, {
        title: '🚗 Parking Slot Allocated',
        body: `Slot ${slot.slot_number} has been allocated to Flat ${flatNumber} (${regNumber}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber, action: 'allocated', allocationId: allocation.id },
      }, actorUserId);

      // 2. Gate Guards
      const guardIds = await getParkingGuardUserIds(societyId, actorUserId);
      await sendParkingNotifications(guardIds, {
        title: '🅿️ New Slot Allocation',
        body: `Slot ${slot.slot_number} assigned to Flat ${flatNumber} (${regNumber}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber, action: 'allocated' },
      }, actorUserId);

      // 3. Admin & Committee
      const adminIds = await getParkingAdminCommitteeUserIds(societyId, actorUserId);
      await sendParkingNotifications(adminIds, {
        title: '🅿️ Slot Allocation Updated',
        body: `Slot ${slot.slot_number} allocated to Flat ${flatNumber} (${regNumber}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber, action: 'allocated' },
      }, actorUserId);
    } catch (notifErr) {
      logger.warn('allocateSlot', 'notification_failed', { error: notifErr?.message });
    }

    return allocation;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const reassignSlot = async (societyId, allocationId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const currentAlloc = await ParkingAllocation.findOne({
      where: { id: allocationId, society_id: societyId, status: 'active', is_deleted: false },
      include: [{ model: ParkingSlot, as: 'slot' }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!currentAlloc) {
      const err = new Error('Active parking allocation not found');
      err.statusCode = 404;
      throw err;
    }

    const slot = currentAlloc.slot;
    const prevFlat = currentAlloc.flat_number;

    // Close previous allocation
    currentAlloc.status = 'released';
    currentAlloc.released_by = actorUserId;
    currentAlloc.released_at = new Date();
    currentAlloc.release_reason = data.reason;
    await currentAlloc.save({ transaction });

    // Deactivate previous pass
    await ParkingAccessPass.update(
      { status: 'revoked', revoked_at: new Date(), revoked_by: actorUserId, revocation_reason: 'Slot reassigned' },
      { where: { allocation_id: currentAlloc.id, status: 'active' }, transaction }
    );

    // Resolve new resident
    const newResidentUserId = data.new_resident_user_id || actorUserId;
    const newFlat = data.new_flat_number || prevFlat;

    let vehicleId = data.new_vehicle_id || null;
    const regNumber = data.new_vehicle_registration ? data.new_vehicle_registration.trim().toUpperCase() : null;

    if (!vehicleId && regNumber) {
      const normReg = normalizeRegistrationNumber(regNumber);
      let veh = await SocietyVehicle.findOne({
        where: { society_id: societyId, normalized_registration: normReg, is_deleted: false },
        transaction,
      });
      if (!veh) {
        veh = await SocietyVehicle.create({
          society_id: societyId,
          owner_user_id: newResidentUserId,
          flat_number: newFlat,
          registration_number: regNumber,
          normalized_registration: normReg,
          vehicle_type: data.new_vehicle_type || 'car',
          make: 'Standard',
          model: data.new_vehicle_model || 'Standard',
          is_active: true,
          created_by: actorUserId,
        }, { transaction });
      }
      vehicleId = veh.id;
    }

    // Create new allocation
    const newAlloc = await ParkingAllocation.create({
      society_id: societyId,
      slot_id: slot.id,
      vehicle_id: vehicleId,
      resident_user_id: newResidentUserId,
      flat_number: newFlat,
      allocation_type: data.allocation_type || 'permanent',
      status: 'active',
      start_at: data.start_at || new Date(),
      end_at: data.allocation_type === 'temporary' ? data.end_at : null,
      allocated_by: actorUserId,
      notes: data.reason,
    }, { transaction });

    // Generate new access pass
    const passTag = `RFID #RF-${slot.slot_number}-${newAlloc.id}`;
    await ParkingAccessPass.create({
      society_id: societyId,
      allocation_id: newAlloc.id,
      vehicle_id: vehicleId,
      pass_type: 'RFID_FASTAG',
      pass_identifier: passTag,
      status: 'active',
      valid_from: newAlloc.start_at,
    }, { transaction });

    await logParkingAudit({
      societyId,
      actorUserId,
      action: 'REASSIGNED',
      targetType: 'allocation',
      targetId: newAlloc.id,
      slotNumber: slot.slot_number,
      previousState: { flat: prevFlat },
      newState: { flat: newFlat, vehicle: regNumber },
      reason: data.reason,
    }, { transaction });

    await createEvent({
      event_type: 'society.parking_reassigned',
      aggregate_type: 'parking_allocation',
      aggregate_id: String(newAlloc.id),
      payload: { societyId, slotNumber: slot.slot_number, oldFlat: prevFlat, newFlat },
    }, { transaction });

    await transaction.commit();

    // Role-Based Notification Dispatch (Post-Commit)
    try {
      // 1. Previous Resident
      let prevResidentIds = currentAlloc.resident_user_id ? [currentAlloc.resident_user_id] : [];
      if (!prevResidentIds.length && prevFlat) {
        prevResidentIds = await getParkingResidentUserIdsByFlat(societyId, prevFlat, actorUserId);
      }
      await sendParkingNotifications(prevResidentIds, {
        title: '🅿️ Parking Slot Reassigned',
        body: `Your allocation for Slot ${slot.slot_number} has been transferred by management (${data.reason || 'Reassigned'}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, action: 'reassigned' },
      }, actorUserId);

      // 2. New Resident
      let newResidentIds = data.new_resident_user_id ? [data.new_resident_user_id] : [];
      if (!newResidentIds.length && newFlat) {
        newResidentIds = await getParkingResidentUserIdsByFlat(societyId, newFlat, actorUserId);
      }
      await sendParkingNotifications(newResidentIds, {
        title: '🚗 Parking Slot Allocated',
        body: `Slot ${slot.slot_number} has been reassigned to Flat ${newFlat} (${regNumber}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber: newFlat, action: 'allocated' },
      }, actorUserId);

      // 3. Gate Guards
      const guardIds = await getParkingGuardUserIds(societyId, actorUserId);
      await sendParkingNotifications(guardIds, {
        title: '🅿️ Slot Reassigned',
        body: `Slot ${slot.slot_number} reassigned to Flat ${newFlat} (${regNumber}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber: newFlat, action: 'reassigned' },
      }, actorUserId);
    } catch (notifErr) {
      logger.warn('reassignSlot', 'notification_failed', { error: notifErr?.message });
    }

    return newAlloc;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const releaseSlot = async (societyId, allocationId, actorUserId, reason, notes, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const allocation = await ParkingAllocation.findOne({
      where: { id: allocationId, society_id: societyId, status: 'active', is_deleted: false },
      include: [{ model: ParkingSlot, as: 'slot' }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!allocation) {
      const err = new Error('Active parking allocation not found');
      err.statusCode = 404;
      throw err;
    }

    const slot = allocation.slot;
    const fullReason = notes ? `${reason}: ${notes}` : reason;

    // 1. Mark allocation released
    allocation.status = 'released';
    allocation.released_by = actorUserId;
    allocation.released_at = new Date();
    allocation.release_reason = fullReason;
    await allocation.save({ transaction });

    // 2. Mark slot available
    slot.status = 'available';
    await slot.save({ transaction });

    // 3. Revoke pass
    await ParkingAccessPass.update(
      { status: 'revoked', revoked_at: new Date(), revoked_by: actorUserId, revocation_reason: fullReason },
      { where: { allocation_id: allocation.id, status: 'active' }, transaction }
    );

    // 4. Audit & Event
    await logParkingAudit({
      societyId,
      actorUserId,
      action: 'RELEASED',
      targetType: 'slot',
      targetId: slot.id,
      slotNumber: slot.slot_number,
      flatNumber: allocation.flat_number,
      previousState: { status: 'allocated', flat: allocation.flat_number },
      newState: { status: 'available' },
      reason: fullReason,
    }, { transaction });

    await createEvent({
      event_type: 'society.parking_released',
      aggregate_type: 'parking_slot',
      aggregate_id: String(slot.id),
      payload: { societyId, slotNumber: slot.slot_number, releasedFlat: allocation.flat_number, reason: fullReason },
    }, { transaction });

    await transaction.commit();

    // Role-Based Notification Dispatch (Post-Commit)
    try {
      // 1. Resident
      let residentIds = allocation.resident_user_id ? [allocation.resident_user_id] : [];
      if (!residentIds.length && allocation.flat_number) {
        residentIds = await getParkingResidentUserIdsByFlat(societyId, allocation.flat_number, actorUserId);
      }
      await sendParkingNotifications(residentIds, {
        title: '🅿️ Parking Slot Released',
        body: `Slot ${slot.slot_number} for Flat ${allocation.flat_number} has been released (${reason}).`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, flatNumber: allocation.flat_number, action: 'released' },
      }, actorUserId);

      // 2. Guards & Admins
      const guardIds = await getParkingGuardUserIds(societyId, actorUserId);
      await sendParkingNotifications(guardIds, {
        title: '🅿️ Slot Released to Available Pool',
        body: `Slot ${slot.slot_number} (formerly Flat ${allocation.flat_number}) is now Available.`,
        type: 'info',
        societyId,
        data: { slotNumber: slot.slot_number, action: 'released' },
      }, actorUserId);
    } catch (notifErr) {
      logger.warn('releaseSlot', 'notification_failed', { error: notifErr?.message });
    }

    return { success: true, message: `Slot '${slot.slot_number}' released and is now Available` };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. VISITOR PARKING RESERVATIONS & GATE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const listVisitorReservations = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;

  const reservations = await ParkingVisitorReservation.findAll({
    where,
    include: [
      { model: ParkingSlot, as: 'slot', attributes: ['id', 'slot_number', 'area_id'] },
      { model: User, as: 'host', attributes: ['userId', ['userName', 'name'], 'phone'] },
      { model: SocietyGate, as: 'checkInGate', attributes: ['id', 'gate_name'] },
    ],
    order: [['expected_arrival_at', 'DESC']],
  });

  return reservations.map(r => {
    const qr = r.qr_pass_code || ('VPK-' + (Math.abs(Number(r.id)) % 90000 + 10000));
    const gName = r.gate_name || r.checkInGate?.gate_name || 'Main Gate 1';
    const hName = r.host_name || r.host?.name || 'Resident';
    const vType = r.vehicle_type || 'Car';
    return {
      id: r.id,
      societyId: r.society_id,
      slotId: r.slot_id,
      slotNumber: r.slot ? r.slot.slot_number : 'V-Bay',
      slot_number: r.slot ? r.slot.slot_number : 'V-Bay',
      visitorName: r.visitor_name,
      visitor_name: r.visitor_name,
      vehicleNumber: r.vehicle_number,
      vehicle_number: r.vehicle_number,
      vehicleType: vType,
      vehicle_type: vType,
      hostUserId: r.host_user_id,
      hostName: hName,
      host_name: hName,
      hostFlatNumber: r.host_flat_number,
      host_flat_number: r.host_flat_number,
      hostFlat: r.host_flat_number,
      expectedArrivalAt: r.expected_arrival_at,
      expected_arrival_at: r.expected_arrival_at,
      expectedExitAt: r.expected_exit_at,
      expected_exit_at: r.expected_exit_at,
      checkInAt: r.check_in_at,
      check_in_at: r.check_in_at,
      checkOutAt: r.check_out_at,
      check_out_at: r.check_out_at,
      checkInGateName: gName,
      gateName: gName,
      gate_name: gName,
      qrPassCode: qr,
      qr_pass_code: qr,
      status: r.status,
      purpose: r.purpose,
      notes: r.notes,
    };
  });
};

export const preBookVisitorParking = async (societyId, hostUserId, data, meta = {}) => {
  // CRITICAL RULE: Derive host flat from authenticated resident membership
  const member = await SocietyMember.findOne({
    where: { society_id: societyId, user_id: hostUserId, status: 'active', is_deleted: false },
  });

  if (!member) {
    const err = new Error('Only active society residents can pre-book guest parking');
    err.statusCode = 403;
    throw err;
  }

  const hostFlatNumber = member.flat_no || data.host_flat_number || 'Flat-General';

  // Resolve visitor bay slot
  let slotId = data.visitor_bay_id || data.slot_id;
  if (!slotId && data.slot_number) {
    const s = await ParkingSlot.findOne({
      where: { society_id: societyId, slot_number: data.slot_number.trim(), is_deleted: false },
    });
    if (s) slotId = s.id;
  }

  if (slotId) {
    const baySlot = await ParkingSlot.findOne({
      where: { id: slotId, society_id: societyId, is_deleted: false },
    });
    if (!baySlot) {
      const err = new Error('Visitor parking bay not found in this society');
      err.statusCode = 404;
      throw err;
    }
    if (baySlot.slot_type !== 'visitor') {
      const err = new Error('Selected slot is not designated for visitor parking');
      err.statusCode = 400;
      throw err;
    }
  } else {
    // Pick first available visitor slot
    const defaultVisitorSlot = await ParkingSlot.findOne({
      where: { society_id: societyId, slot_type: 'visitor', is_deleted: false },
    });
    if (!defaultVisitorSlot) {
      const err = new Error('No visitor parking bays configured in this society');
      err.statusCode = 400;
      throw err;
    }
    slotId = defaultVisitorSlot.id;
  }

  const arrival = new Date(data.expected_arrival_at);
  const exit = new Date(data.expected_exit_at);

  if (exit <= arrival) {
    const err = new Error('Expected exit time must be strictly after expected arrival time');
    err.statusCode = 400;
    throw err;
  }

  // Conflict Check: Prevent Overlapping Reservations on the Same Visitor Bay
  const overlapping = await ParkingVisitorReservation.findOne({
    where: {
      society_id: societyId,
      slot_id: slotId,
      status: { [Op.in]: ['expected', 'occupied'] },
      is_deleted: false,
      [Op.and]: [
        { expected_arrival_at: { [Op.lt]: exit } },
        { expected_exit_at: { [Op.gt]: arrival } },
      ],
    },
  });

  if (overlapping) {
    const err = new Error('Selected visitor parking bay is already booked for this time window');
    err.statusCode = 409;
    throw err;
  }

  const normPlate = normalizeRegistrationNumber(data.vehicle_number);

  const generatedQr = data.qr_pass_code || ('VPK-' + Math.floor(10000 + Math.random() * 90000));
  const reservation = await ParkingVisitorReservation.create({
    society_id: societyId,
    slot_id: slotId,
    host_user_id: hostUserId,
    host_member_id: member.id,
    host_flat_number: hostFlatNumber,
    host_name: data.host_name || member.name || 'Resident',
    visitor_name: data.visitor_name.trim(),
    vehicle_number: data.vehicle_number.trim().toUpperCase(),
    vehicle_type: data.vehicle_type || 'Car',
    gate_name: data.gate_name || 'Main Gate 1',
    qr_pass_code: generatedQr,
    normalized_vehicle_number: normPlate,
    expected_arrival_at: arrival,
    expected_exit_at: exit,
    status: 'expected',
    purpose: data.purpose || 'Guest Visit',
    notes: data.notes || null,
    created_by: hostUserId,
  });

  await logParkingAudit({
    societyId,
    actorUserId: hostUserId,
    action: 'VISITOR_PARKING_PREBOOKED',
    targetType: 'visitor_reservation',
    targetId: reservation.id,
    flatNumber: hostFlatNumber,
    residentName: member.name,
    newState: { visitor: reservation.visitor_name, vehicle: reservation.vehicle_number, bay: slotId },
    reason: `Guest parking pre-booked by resident ${hostFlatNumber}`,
  });

  await createEvent({
    event_type: 'society.visitor_parking_prebooked',
    aggregate_type: 'visitor_reservation',
    aggregate_id: String(reservation.id),
    payload: {
      societyId,
      reservationId: reservation.id,
      visitorName: reservation.visitor_name,
      vehicleNumber: reservation.vehicle_number,
      hostFlatNumber,
    },
  });

  // Role-Based Notification: Host Resident, Guards, Admin/Committee
  try {
    // 1. Host Resident confirmation
    if (hostUserId) {
      await sendParkingNotifications([hostUserId], {
        title: '🎫 Guest Parking Pass Created',
        body: `Pass ${reservation.qr_pass_code || 'VPK'} generated for ${reservation.visitor_name} (${reservation.vehicle_number}). Gate: ${reservation.gate_name || 'Main Gate'}.`,
        type: 'info',
        societyId,
        data: { reservationId: reservation.id, qrPassCode: reservation.qr_pass_code, visitorName: reservation.visitor_name, action: 'pre_booked' },
      });
    }

    // 2. All Gate Guards
    const guardIds = await getParkingGuardUserIds(societyId, hostUserId);
    await sendParkingNotifications(guardIds, {
      title: '🚗 Expected Guest Vehicle',
      body: `Flat ${hostFlatNumber} pre-booked parking for ${reservation.visitor_name} (${reservation.vehicle_number}) at ${reservation.gate_name || 'Main Gate'}.`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, hostFlat: hostFlatNumber, visitorName: reservation.visitor_name, vehicleNumber: reservation.vehicle_number, action: 'expected_visitor' },
    }, hostUserId);

    // 3. Admin & Committee
    const adminIds = await getParkingAdminCommitteeUserIds(societyId, hostUserId);
    await sendParkingNotifications(adminIds, {
      title: '🚗 Guest Parking Pre-Booked',
      body: `Flat ${hostFlatNumber} booked visitor parking for ${reservation.visitor_name} (${reservation.vehicle_number}).`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, hostFlat: hostFlatNumber, action: 'pre_booked' },
    }, hostUserId);
  } catch (err) {
    logger.warn('preBookVisitorParking', 'notification_failed', { error: err?.message });
  }

  return reservation;
};

export const guardCheckInVisitor = async (societyId, guardUserId, data, meta = {}) => {
  let reservation;
  if (data.reservation_id) {
    reservation = await ParkingVisitorReservation.findOne({
      where: { id: data.reservation_id, society_id: societyId, is_deleted: false },
    });
    if (!reservation) {
      const err = new Error('Visitor reservation not found');
      err.statusCode = 404;
      throw err;
    }
  } else {
    // Walk-in visitor check-in
    let slotId = data.slot_id;
    if (!slotId && data.slot_number) {
      const s = await ParkingSlot.findOne({
        where: { society_id: societyId, slot_number: data.slot_number.trim(), is_deleted: false },
      });
      if (s) slotId = s.id;
    }

    if (!slotId) {
      const err = new Error('Visitor bay slot must be specified');
      err.statusCode = 400;
      throw err;
    }

    const walkinQr = data.qr_pass_code || ('VPK-' + Math.floor(10000 + Math.random() * 90000));
    reservation = await ParkingVisitorReservation.create({
      society_id: societyId,
      slot_id: slotId,
      host_user_id: guardUserId,
      host_flat_number: data.host_flat_number || 'General',
      host_name: data.host_name || 'Visitor Guest',
      visitor_name: data.visitor_name || 'Guest Visitor',
      vehicle_number: (data.vehicle_number || 'UNKNOWN').toUpperCase(),
      vehicle_type: data.vehicle_type || 'Car',
      gate_name: data.gate_name || 'Main Gate 1',
      qr_pass_code: walkinQr,
      normalized_vehicle_number: normalizeRegistrationNumber(data.vehicle_number || 'UNKNOWN'),
      expected_arrival_at: new Date(),
      expected_exit_at: new Date(Date.now() + 4 * 3600 * 1000), // 4 hours default
      status: 'expected',
    });
  }

  if (reservation.status === 'occupied') {
    const err = new Error('Visitor vehicle is already checked in');
    err.statusCode = 400;
    throw err;
  }

  const isAwaiting = data.require_resident_approval !== undefined
    ? Boolean(data.require_resident_approval)
    : (data.status === 'awaiting_approval' || !data.reservation_id);
  reservation.status = isAwaiting ? 'awaiting_approval' : 'occupied';
  reservation.check_in_at = isAwaiting ? null : new Date();
  if (data.gate_id) reservation.check_in_gate_id = data.gate_id;
  if (data.gate_name) reservation.gate_name = data.gate_name;
  if (data.vehicle_type) reservation.vehicle_type = data.vehicle_type;
  if (!reservation.qr_pass_code) reservation.qr_pass_code = 'VPK-' + (Math.abs(Number(reservation.id)) % 90000 + 10000);
  reservation.checked_in_by_guard_id = guardUserId;
  await reservation.save();

  await logParkingAudit({
    societyId,
    actorUserId: guardUserId,
    actorRole: 'Security Guard',
    action: 'VISITOR_CHECKED_IN',
    targetType: 'visitor_reservation',
    targetId: reservation.id,
    newState: { status: 'occupied', check_in_at: reservation.check_in_at },
    reason: 'Security guard verified and cleared visitor vehicle at gate',
  });

  await createEvent({
    event_type: 'society.visitor_checked_in',
    aggregate_type: 'visitor_reservation',
    aggregate_id: String(reservation.id),
    payload: {
      societyId,
      reservationId: reservation.id,
      visitorName: reservation.visitor_name,
      vehicleNumber: reservation.vehicle_number,
      hostFlatNumber: reservation.host_flat_number,
    },
  });

  // Role-Based Notification: Host Resident & Admins
  try {
    let hostIds = reservation.host_user_id ? [reservation.host_user_id] : [];
    if (!hostIds.length && reservation.host_flat_number) {
      hostIds = await getParkingResidentUserIdsByFlat(societyId, reservation.host_flat_number, guardUserId);
    }
    await sendParkingNotifications(hostIds, {
      title: '🟢 Guest Vehicle Checked In',
      body: `${reservation.visitor_name} (${reservation.vehicle_number}) has checked in at ${reservation.gate_name || 'Gate'} and parked in Bay ${reservation.slot_number || 'Visitor Bay'}.`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, visitorName: reservation.visitor_name, vehicleNumber: reservation.vehicle_number, action: 'checked_in' },
    }, guardUserId);

    const adminIds = await getParkingAdminCommitteeUserIds(societyId, guardUserId);
    await sendParkingNotifications(adminIds, {
      title: '🟢 Visitor Vehicle Check-In',
      body: `${reservation.visitor_name} (${reservation.vehicle_number}) entered for Flat ${reservation.host_flat_number}.`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, action: 'checked_in' },
    }, guardUserId);
  } catch (err) {
    logger.warn('guardCheckInVisitor', 'notification_failed', { error: err?.message });
  }

  return reservation;
};

export const guardCheckOutVisitor = async (societyId, guardUserId, reservationId, data = {}, meta = {}) => {
  const reservation = await ParkingVisitorReservation.findOne({
    where: { id: reservationId, society_id: societyId, is_deleted: false },
    include: [{ model: ParkingSlot, as: 'slot' }],
  });

  if (!reservation) {
    const err = new Error('Visitor reservation record not found');
    err.statusCode = 404;
    throw err;
  }

  if (reservation.status !== 'occupied') {
    const err = new Error('Only currently occupied visitor parking records can be checked out');
    err.statusCode = 400;
    throw err;
  }

  const checkOutTime = new Date();
  const durationMinutes = reservation.check_in_at
    ? Math.round((checkOutTime.getTime() - new Date(reservation.check_in_at).getTime()) / 60000)
    : 0;

  reservation.status = 'checked_out';
  reservation.check_out_at = checkOutTime;
  if (data.gate_id) reservation.check_out_gate_id = data.gate_id;
  if (data.gate_name) reservation.gate_name = data.gate_name;
  reservation.checked_out_by_guard_id = guardUserId;
  await reservation.save();

  await logParkingAudit({
    societyId,
    actorUserId: guardUserId,
    actorRole: 'Security Guard',
    action: 'VISITOR_CHECKED_OUT',
    targetType: 'visitor_reservation',
    targetId: reservation.id,
    newState: { status: 'checked_out', durationMinutes },
    reason: `Visitor departed through gate desk. Bay is now available.`,
  });

  await createEvent({
    event_type: 'society.visitor_checked_out',
    aggregate_type: 'visitor_reservation',
    aggregate_id: String(reservation.id),
    payload: {
      societyId,
      reservationId: reservation.id,
      visitorName: reservation.visitor_name,
      durationMinutes,
    },
  });

  // Role-Based Notification: Host Resident & Admins
  try {
    let hostIds = reservation.host_user_id ? [reservation.host_user_id] : [];
    if (!hostIds.length && reservation.host_flat_number) {
      hostIds = await getParkingResidentUserIdsByFlat(societyId, reservation.host_flat_number, guardUserId);
    }
    await sendParkingNotifications(hostIds, {
      title: '⚪ Guest Vehicle Departed',
      body: `${reservation.visitor_name} (${reservation.vehicle_number}) has checked out through ${reservation.gate_name || 'Gate'}. Bay is now free.`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, visitorName: reservation.visitor_name, action: 'checked_out' },
    }, guardUserId);

    const adminIds = await getParkingAdminCommitteeUserIds(societyId, guardUserId);
    await sendParkingNotifications(adminIds, {
      title: '⚪ Visitor Vehicle Check-Out',
      body: `${reservation.visitor_name} (${reservation.vehicle_number}) departed for Flat ${reservation.host_flat_number}.`,
      type: 'info',
      societyId,
      data: { reservationId: reservation.id, action: 'checked_out' },
    }, guardUserId);
  } catch (err) {
    logger.warn('guardCheckOutVisitor', 'notification_failed', { error: err?.message });
  }

  return { success: true, message: 'Visitor checked out successfully', durationMinutes };
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. WRONG PARKING VIOLATIONS REPORTING
// ─────────────────────────────────────────────────────────────────────────────

export const reportParkingViolation = async (societyId, reporterUserId, data, meta = {}) => {
  const member = await SocietyMember.findOne({
    where: { society_id: societyId, user_id: reporterUserId, status: 'active', is_deleted: false },
  });

  const reporterFlat = member?.flat_no || data.reporter_flat || 'Flat-General';
  const reporterName = member?.name || data.reporter_name || 'Resident';
  const reporterRole = data.reporter_role || (member ? 'Resident' : 'Guard');
  const offendingPlate = (data.unauthorized_vehicle_number || data.offending_vehicle_number || 'UNKNOWN').trim().toUpperCase();
  const reasonCode = (data.reason_code || data.reason || 'Unauthorized vehicle in private bay').trim();

  let initialStatus = 'OPEN';
  if (data.status) {
    const s = data.status.toLowerCase();
    if (s === 'clamped') initialStatus = 'ACTION_TAKEN';
    else if (s === 'reported') initialStatus = 'OPEN';
    else initialStatus = data.status.toUpperCase();
  }

  const violation = await ParkingViolation.create({
    society_id: societyId,
    slot_id: data.slot_id || null,
    slot_number: data.slot_number.trim(),
    reporter_user_id: reporterUserId,
    reporter_flat_number: reporterFlat,
    reporter_name: reporterName,
    reporter_role: reporterRole,
    unauthorized_vehicle_number: offendingPlate,
    reason_code: reasonCode,
    remarks: data.remarks || null,
    photo_url: data.photo_url || null,
    clamp_number: data.clamp_number || null,
    fine_amount: data.fine_amount != null ? parseFloat(data.fine_amount) : 0.00,
    action_taken: data.action_taken || null,
    status: initialStatus,
  });

  await logParkingAudit({
    societyId,
    actorUserId: reporterUserId,
    action: 'PARKING_VIOLATION_REPORTED',
    targetType: 'violation',
    targetId: violation.id,
    slotNumber: violation.slot_number,
    flatNumber: reporterFlat,
    reason: data.reason_code,
  });

  await createEvent({
    event_type: 'society.parking_violation_reported',
    aggregate_type: 'parking_violation',
    aggregate_id: String(violation.id),
    payload: {
      societyId,
      slotNumber: violation.slot_number,
      unauthorizedVehicle: violation.unauthorized_vehicle_number,
      reporterFlat,
    },
  });

  // Role-Based Notification: Guards, Admin/Committee, Offender
  try {
    const guardIds = await getParkingGuardUserIds(societyId, reporterUserId);
    await sendParkingNotifications(guardIds, {
      title: '🚨 Parking Violation Reported!',
      body: `Unauthorized vehicle ${violation.unauthorized_vehicle_number} reported in Slot ${violation.slot_number} by Flat ${reporterFlat}. Immediate inspection required.`,
      type: 'alert',
      societyId,
      data: { violationId: violation.id, slotNumber: violation.slot_number, unauthorizedVehicle: violation.unauthorized_vehicle_number, action: 'violation_reported' },
    }, reporterUserId);

    const adminIds = await getParkingAdminCommitteeUserIds(societyId, reporterUserId);
    await sendParkingNotifications(adminIds, {
      title: '⚠️ Parking Violation Reported',
      body: `Slot ${violation.slot_number}: ${violation.unauthorized_vehicle_number} (${data.reason_code || 'Unauthorized Parking'}).`,
      type: 'alert',
      societyId,
      data: { violationId: violation.id, slotNumber: violation.slot_number, action: 'violation_reported' },
    }, reporterUserId);

    const offenderUserId = await getParkingVehicleOwnerUserId(societyId, violation.unauthorized_vehicle_number, reporterUserId);
    if (offenderUserId) {
      await sendParkingNotifications([offenderUserId], {
        title: '⚠️ Parking Violation Warning',
        body: `Your vehicle ${violation.unauthorized_vehicle_number} was reported in Slot ${violation.slot_number}. Please relocate immediately to avoid penalty.`,
        type: 'alert',
        societyId,
        data: { violationId: violation.id, slotNumber: violation.slot_number, action: 'violation_warning' },
      });
    }
  } catch (err) {
    logger.warn('reportParkingViolation', 'notification_failed', { error: err?.message });
  }

  return violation;
};

export const listViolations = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) {
    let s = query.status;
    if (s === 'reported') s = 'OPEN';
    if (s === 'investigating') s = 'ACKNOWLEDGED';
    if (s === 'clamped' || s === 'fine_levied') s = 'ACTION_TAKEN';
    if (s === 'resolved') s = 'RESOLVED';
    if (s === 'dismissed') s = 'DISMISSED';
    where.status = s;
  }
  if (query.reporter_user_id) where.reporter_user_id = query.reporter_user_id;

  const list = await ParkingViolation.findAll({
    where,
    include: [{ model: User, as: 'reporter', attributes: ['userId', ['userName', 'name'], 'phone'] }],
    order: [['created_at', 'DESC']],
  });

  return list.map(v => ({
    id: v.id,
    societyId: v.society_id,
    society_id: v.society_id,
    slotId: v.slot_id,
    slot_id: v.slot_id,
    slotNumber: v.slot_number,
    slot_number: v.slot_number,
    unauthorizedVehicleNumber: v.unauthorized_vehicle_number,
    unauthorized_vehicle_number: v.unauthorized_vehicle_number,
    offendingVehicleNumber: v.unauthorized_vehicle_number,
    offending_vehicle_number: v.unauthorized_vehicle_number,
    reporterUserId: v.reporter_user_id,
    reporter_user_id: v.reporter_user_id,
    reporterName: v.reporter_name || v.reporter?.name || 'Resident',
    reporter_name: v.reporter_name || v.reporter?.name || 'Resident',
    reporterFlatNumber: v.reporter_flat_number,
    reporter_flat_number: v.reporter_flat_number,
    reporterFlat: v.reporter_flat_number,
    reporter_flat: v.reporter_flat_number,
    reporterRole: v.reporter_role || 'Resident',
    reporter_role: v.reporter_role || 'Resident',
    reasonCode: v.reason_code,
    reason_code: v.reason_code,
    reason: v.reason_code,
    remarks: v.remarks,
    photoUrl: v.photo_url,
    photo_url: v.photo_url,
    clampNumber: v.clamp_number,
    clamp_number: v.clamp_number,
    fineAmount: parseFloat(v.fine_amount || 0),
    fine_amount: parseFloat(v.fine_amount || 0),
    actionTaken: v.action_taken,
    action_taken: v.action_taken,
    status: v.status,
    assignedTo: v.assigned_to,
    assigned_to: v.assigned_to,
    acknowledgedAt: v.acknowledged_at,
    acknowledged_at: v.acknowledged_at,
    resolvedAt: v.resolved_at,
    resolved_at: v.resolved_at,
    resolvedBy: v.resolved_by,
    resolved_by: v.resolved_by,
    resolutionNotes: v.resolution_notes,
    resolution_notes: v.resolution_notes,
    createdAt: v.created_at,
    created_at: v.created_at,
    reportedAt: v.created_at,
    reported_at: v.created_at,
  }));
};

export const updateViolationStatus = async (societyId, violationId, actorUserId, data, meta = {}) => {
  const violation = await ParkingViolation.findOne({
    where: { id: violationId, society_id: societyId, is_deleted: false },
  });

  if (!violation) {
    const err = new Error('Parking violation record not found');
    err.statusCode = 404;
    throw err;
  }

  let mappedStatus = data.status;
  if (mappedStatus) {
    const s = mappedStatus.toLowerCase();
    if (s === 'reported') mappedStatus = 'OPEN';
    else if (s === 'investigating') mappedStatus = 'ACKNOWLEDGED';
    else if (s === 'clamped' || s === 'fine_levied') mappedStatus = 'ACTION_TAKEN';
    else if (s === 'resolved') mappedStatus = 'RESOLVED';
    else if (s === 'dismissed') mappedStatus = 'DISMISSED';
    else mappedStatus = mappedStatus.toUpperCase();
    violation.status = mappedStatus;
  }

  if (data.assigned_to) violation.assigned_to = data.assigned_to;
  if (data.clamp_number) violation.clamp_number = data.clamp_number;
  if (data.fine_amount != null) violation.fine_amount = parseFloat(data.fine_amount);
  if (data.action_taken) violation.action_taken = data.action_taken;
  if (data.resolved_by) violation.resolved_by = data.resolved_by;

  if (violation.status === 'ACKNOWLEDGED' && !violation.acknowledged_at) violation.acknowledged_at = new Date();
  if (violation.status === 'RESOLVED' || violation.status === 'DISMISSED') {
    violation.resolved_at = new Date();
    if (data.resolution_notes || data.remarks) violation.resolution_notes = data.resolution_notes || data.remarks;
    if (!violation.resolved_by && data.resolved_by) violation.resolved_by = data.resolved_by;
  }

  await violation.save();

  await logParkingAudit({
    societyId,
    actorUserId,
    action: `PARKING_VIOLATION_${violation.status}`,
    targetType: 'violation',
    targetId: violation.id,
    slotNumber: violation.slot_number,
    reason: data.action_taken || data.resolution_notes || data.remarks || `Status changed to ${violation.status}`,
  });

  return violation;
};

export const clampViolation = async (societyId, violationId, guardUserId, data, meta = {}) => {
  const violation = await ParkingViolation.findOne({
    where: { id: violationId, society_id: societyId, is_deleted: false },
  });

  if (!violation) {
    const err = new Error('Parking violation record not found');
    err.statusCode = 404;
    throw err;
  }

  violation.status = 'ACTION_TAKEN';
  violation.clamp_number = data.clamp_number;
  violation.fine_amount = data.fine_amount != null ? parseFloat(data.fine_amount) : 500.00;
  violation.action_taken = data.action_taken || 'Wheel Clamp Applied';
  if (data.remarks || data.notes) {
    violation.remarks = violation.remarks ? `${violation.remarks}\nClamp Applied: ${data.remarks || data.notes}` : (data.remarks || data.notes);
  }
  await violation.save();

  await logParkingAudit({
    societyId,
    actorUserId: guardUserId,
    actorRole: 'Security Guard',
    action: 'PARKING_VIOLATION_CLAMPED',
    targetType: 'violation',
    targetId: violation.id,
    slotNumber: violation.slot_number,
    reason: `Wheel clamp ${data.clamp_number} placed on ${violation.unauthorized_vehicle_number}. Fine: ₹${violation.fine_amount}`,
  });

  await createEvent({
    event_type: 'society.parking_violation_clamped',
    aggregate_type: 'parking_violation',
    aggregate_id: String(violation.id),
    payload: {
      societyId,
      violationId: violation.id,
      clampNumber: violation.clamp_number,
      fineAmount: violation.fine_amount,
    },
  });

  // Role-Based Notification: Reporter, Offender, Admin/Committee
  try {
    let repIds = violation.reporter_user_id ? [violation.reporter_user_id] : [];
    if (!repIds.length && violation.reporter_flat_number) {
      repIds = await getParkingResidentUserIdsByFlat(societyId, violation.reporter_flat_number, guardUserId);
    }
    await sendParkingNotifications(repIds, {
      title: '🗜️ Action Taken: Wheel Clamp Applied',
      body: `Security applied clamp #${violation.clamp_number} on ${violation.unauthorized_vehicle_number} in Slot ${violation.slot_number}. Fine levied: ₹${violation.fine_amount}.`,
      type: 'alert',
      societyId,
      data: { violationId: violation.id, clampNumber: violation.clamp_number, action: 'clamped' },
    }, guardUserId);

    const offenderUserId = await getParkingVehicleOwnerUserId(societyId, violation.unauthorized_vehicle_number, guardUserId);
    if (offenderUserId) {
      await sendParkingNotifications([offenderUserId], {
        title: '🚨 WHEEL CLAMP APPLIED to Your Vehicle',
        body: `Your vehicle ${violation.unauthorized_vehicle_number} has been clamped in Slot ${violation.slot_number} (Clamp #${violation.clamp_number}). Fine: ₹${violation.fine_amount}. Contact Security Gate.`,
        type: 'alert',
        societyId,
        data: { violationId: violation.id, clampNumber: violation.clamp_number, fineAmount: violation.fine_amount, action: 'clamped' },
      });
    }

    const adminIds = await getParkingAdminCommitteeUserIds(societyId, guardUserId);
    await sendParkingNotifications(adminIds, {
      title: '🗜️ Wheel Clamp Applied',
      body: `Vehicle ${violation.unauthorized_vehicle_number} clamped in Slot ${violation.slot_number}. Fine: ₹${violation.fine_amount}.`,
      type: 'alert',
      societyId,
      data: { violationId: violation.id, clampNumber: violation.clamp_number, action: 'clamped' },
    }, guardUserId);
  } catch (err) {
    logger.warn('clampViolation', 'notification_failed', { error: err?.message });
  }

  return violation;
};

export const resolveViolation = async (societyId, violationId, actorUserId, data, meta = {}) => {
  const violation = await ParkingViolation.findOne({
    where: { id: violationId, society_id: societyId, is_deleted: false },
  });

  if (!violation) {
    const err = new Error('Parking violation record not found');
    err.statusCode = 404;
    throw err;
  }

  violation.status = 'RESOLVED';
  violation.resolved_at = new Date();
  violation.resolved_by = data.resolved_by || 'Security / Admin';
  violation.action_taken = data.action_taken || 'Violation Resolved';
  if (data.resolution_notes || data.remarks) {
    violation.resolution_notes = data.resolution_notes || data.remarks;
  }
  await violation.save();

  await logParkingAudit({
    societyId,
    actorUserId,
    action: 'PARKING_VIOLATION_RESOLVED',
    targetType: 'violation',
    targetId: violation.id,
    slotNumber: violation.slot_number,
    reason: `Action: ${violation.action_taken}`,
  });

  // Role-Based Notification: Reporter Resident, Guards, Admin/Committee
  try {
    let repIds = violation.reporter_user_id ? [violation.reporter_user_id] : [];
    if (!repIds.length && violation.reporter_flat_number) {
      repIds = await getParkingResidentUserIdsByFlat(societyId, violation.reporter_flat_number, actorUserId);
    }
    await sendParkingNotifications(repIds, {
      title: '✅ Parking Violation Resolved',
      body: `The parking issue in Slot ${violation.slot_number} has been resolved: ${violation.action_taken}.`,
      type: 'info',
      societyId,
      data: { violationId: violation.id, action: 'resolved' },
    }, actorUserId);

    const guardAndAdminIds = Array.from(new Set([
      ...(await getParkingGuardUserIds(societyId, actorUserId)),
      ...(await getParkingAdminCommitteeUserIds(societyId, actorUserId)),
    ]));
    await sendParkingNotifications(guardAndAdminIds, {
      title: '✅ Violation Resolved',
      body: `Violation for Slot ${violation.slot_number} (${violation.unauthorized_vehicle_number}) resolved by ${violation.resolved_by}.`,
      type: 'info',
      societyId,
      data: { violationId: violation.id, action: 'resolved' },
    }, actorUserId);
  } catch (err) {
    logger.warn('resolveViolation', 'notification_failed', { error: err?.message });
  }

  return violation;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. AUDIT TRAIL & HISTORY
// ─────────────────────────────────────────────────────────────────────────────

const mapParkingAuditLog = (l) => ({
  id: l.id,
  societyId: l.society_id,
  society_id: l.society_id,
  actorUserId: l.actor_user_id,
  actor_user_id: l.actor_user_id,
  action: l.action,
  targetType: l.target_type,
  timestamp: l.created_at,
  actorName: l.actor_name || 'Management',
  actorRole: l.actor_role || 'Admin',
  slotNumber: l.slot_number,
  flatNumber: l.flat_number,
  residentName: l.resident_name,
  oldValue: (l.previous_state != null && l.previous_state !== 'null') ? (typeof l.previous_state === 'object' ? JSON.stringify(l.previous_state) : l.previous_state) : null,
  newValue: (l.new_state != null && l.new_state !== 'null') ? (typeof l.new_state === 'object' ? JSON.stringify(l.new_state) : l.new_state) : null,
  reason: l.reason,
});

export const getParkingHistory = async (societyId, query = {}) => {
  const where = { society_id: societyId };
  if (query.slot_number) where.slot_number = query.slot_number;

  const logs = await ParkingAuditLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(200, parseInt(query.limit) || 50),
  });

  return logs.map(mapParkingAuditLog);
};

export const getMyParkingHistory = async (societyId, userId) => {
  const logs = await ParkingAuditLog.findAll({
    where: { society_id: societyId, actor_user_id: userId },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
  return logs.map(mapParkingAuditLog);
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. EXECUTIVE SUMMARY RIBBON KPI
// ─────────────────────────────────────────────────────────────────────────────

export const getParkingSummary = async (societyId) => {
  const slots = await ParkingSlot.findAll({
    where: { society_id: societyId, is_deleted: false },
    attributes: ['id', 'status', 'slot_type'],
  });

  const total = slots.length;
  const available = slots.filter(s => s.status === 'available').length;
  const allocated = slots.filter(s => s.status === 'allocated').length;
  const blocked = slots.filter(s => s.status === 'blocked').length;
  const maintenance = slots.filter(s => s.status === 'maintenance').length;
  const visitorBays = slots.filter(s => s.slot_type === 'visitor').length;

  const visitorOccupied = await ParkingVisitorReservation.count({
    where: { society_id: societyId, status: 'occupied', is_deleted: false },
  });

  return {
    totalSlots: total,
    availableSlots: available,
    allocatedSlots: allocated,
    blockedSlots: blocked,
    maintenanceSlots: maintenance,
    visitorSlotsCount: visitorBays,
    visitorOccupiedCount: visitorOccupied,
    occupancyPercent: total > 0 ? Math.round((allocated / total) * 100) : 0,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. BACKWARD COMPATIBILITY: LEGACY CRUD FOR /society-parking
// ─────────────────────────────────────────────────────────────────────────────

export const createParking = async (societyId, userId, data, meta = {}) => {
  // Save to legacy society_parkings table
  const parking = await SocietyParking.create({
    society_id: societyId,
    user_id: data.user_id || null,
    parking_slot_no: data.parking_slot_no,
    vehicle_type: data.vehicle_type,
    vehicle_no: data.vehicle_no,
    vehicle_model: data.vehicle_model || null,
    is_visitor_parking: Boolean(data.is_visitor_parking),
    status: data.status || 'active',
    created_by: userId,
    created_at: new Date(),
  });

  // Automatically sync to normalized parking_slots
  try {
    let [slot] = await ParkingSlot.findOrCreate({
      where: { society_id: societyId, slot_number: data.parking_slot_no.trim() },
      defaults: {
        slot_type: data.is_visitor_parking ? 'visitor' : (data.vehicle_type === '2_wheeler' ? 'two_wheeler' : 'four_wheeler'),
        status: data.status === 'active' ? 'allocated' : 'available',
        is_covered: true,
      },
    });
  } catch (_) {}

  return parking;
};

export const getAllParkings = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };
  if (query.vehicle_type) where.vehicle_type = query.vehicle_type;
  if (query.status) where.status = query.status;
  if (query.is_visitor_parking !== undefined) where.is_visitor_parking = query.is_visitor_parking === 'true' || query.is_visitor_parking === true;

  const { rows, count } = await SocietyParking.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
};

export const getParkingById = async (id, societyId) => {
  return SocietyParking.findOne({
    where: { parkingId: id, society_id: societyId, is_deleted: false },
  });
};

export const updateParking = async (id, societyId, data, actorUserId, meta = {}) => {
  const parking = await SocietyParking.findOne({
    where: { parkingId: id, society_id: societyId, is_deleted: false },
  });
  if (!parking) return null;

  if (data.parking_slot_no) parking.parking_slot_no = data.parking_slot_no;
  if (data.vehicle_type) parking.vehicle_type = data.vehicle_type;
  if (data.vehicle_no) parking.vehicle_no = data.vehicle_no;
  if (data.vehicle_model !== undefined) parking.vehicle_model = data.vehicle_model;
  if (data.status) parking.status = data.status;
  parking.updated_by = actorUserId;
  await parking.save();
  return parking;
};

export const softDeleteParking = async (id, societyId, remarks, actorUserId, meta = {}) => {
  const parking = await SocietyParking.findOne({
    where: { parkingId: id, society_id: societyId, is_deleted: false },
  });
  if (!parking) return null;

  parking.is_deleted = true;
  parking.is_active = false;
  parking.deletedRemarks = remarks || 'Deleted by user';
  parking.updated_by = actorUserId;
  await parking.save();
  return parking;
};


export const getParkingShiftSummary = async (societyId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [entriesToday, exitsToday, currentOccupied, allOverstay, pendingViolations, resolvedViolations, preBookedToday] = await Promise.all([
    ParkingVisitorReservation.count({
      where: {
        society_id: societyId,
        check_in_at: { [Op.gte]: startOfDay },
        is_deleted: false,
      },
    }),
    ParkingVisitorReservation.count({
      where: {
        society_id: societyId,
        check_out_at: { [Op.gte]: startOfDay },
        is_deleted: false,
      },
    }),
    ParkingVisitorReservation.count({
      where: {
        society_id: societyId,
        status: 'occupied',
        is_deleted: false,
      },
    }),
    ParkingVisitorReservation.count({
      where: {
        society_id: societyId,
        status: 'occupied',
        expected_exit_at: { [Op.lt]: new Date() },
        is_deleted: false,
      },
    }),
    ParkingViolation.count({
      where: {
        society_id: societyId,
        status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED', 'ACTION_TAKEN'] },
        is_deleted: false,
      },
    }),
    ParkingViolation.count({
      where: {
        society_id: societyId,
        status: { [Op.in]: ['RESOLVED', 'DISMISSED'] },
        is_deleted: false,
      },
    }),
    ParkingVisitorReservation.count({
      where: {
        society_id: societyId,
        check_in_at: { [Op.gte]: startOfDay },
        created_at: { [Op.lt]: startOfDay },
        is_deleted: false,
      },
    }),
  ]);

  return {
    shiftStartTime: startOfDay,
    shiftEndTime: new Date(),
    guardName: 'Security Gate Desk',
    gateName: 'Main Gate 1',
    totalEntries: entriesToday,
    totalExits: exitsToday,
    vehiclesInside: currentOccupied,
    overstayCount: allOverstay,
    violationsPending: pendingViolations,
    violationsResolved: resolvedViolations,
    preBookedCleared: preBookedToday,
  };
};


export const approveVisitorEntry = async (societyId, reservationId, actorUserId, remarks, meta = {}) => {
  const reservation = await ParkingVisitorReservation.findOne({
    where: { id: reservationId, society_id: societyId, is_deleted: false },
    include: [{ model: ParkingSlot, as: 'slot' }],
  });
  if (!reservation) {
    const err = new Error('Visitor reservation record not found');
    err.statusCode = 404;
    throw err;
  }
  reservation.status = 'occupied';
  reservation.check_in_at = new Date();
  await reservation.save();

  if (reservation.slot) {
    reservation.slot.status = 'allocated';
    await reservation.slot.save();
  }

  await logParkingAudit({
    societyId,
    actorUserId,
    action: 'GATE_CLEARANCE_APPROVED',
    targetType: 'visitor_reservation',
    targetId: reservation.id,
    slotNumber: reservation.slot ? reservation.slot.slot_number : 'V-Bay',
    flatNumber: reservation.host_flat_number,
    reason: remarks || 'Host resident approved visitor entry at gate barrier',
  });

  return reservation;
};

export const declineVisitorEntry = async (societyId, reservationId, actorUserId, reason, meta = {}) => {
  const reservation = await ParkingVisitorReservation.findOne({
    where: { id: reservationId, society_id: societyId, is_deleted: false },
    include: [{ model: ParkingSlot, as: 'slot' }],
  });
  if (!reservation) {
    const err = new Error('Visitor reservation record not found');
    err.statusCode = 404;
    throw err;
  }
  reservation.status = 'declined';
  await reservation.save();

  // Release the visitor slot immediately back to available!
  if (reservation.slot) {
    reservation.slot.status = 'available';
    await reservation.slot.save();
  }

  await logParkingAudit({
    societyId,
    actorUserId,
    action: 'GATE_CLEARANCE_DECLINED',
    targetType: 'visitor_reservation',
    targetId: reservation.id,
    slotNumber: reservation.slot ? reservation.slot.slot_number : 'V-Bay',
    flatNumber: reservation.host_flat_number,
    reason: reason || 'Host resident declined visitor entry. Vehicle strictly barred at gate.',
  });

  return reservation;
};
