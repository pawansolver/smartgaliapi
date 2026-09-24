import { SocietyGate } from './society_gate.model.js';
import SocietyGuardAssignment from '../society_guard/society_guard_assignment.model.js';
import SocietyGuardAuthorization from '../society_guard/society_guard_authorization.model.js';
import User from '../user/user.model.js';
import SocietyShift from '../society_shift/society_shift.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createGate = async (societyId, actorUserId, data, meta = {}) => {
  const gate = await SocietyGate.create({
    society_id: societyId,
    gate_name: data.gate_name.trim(),
    gate_code: data.gate_code ? data.gate_code.trim() : null,
    gate_type: data.gate_type || 'main',
    location: data.location || null,
    description: data.description || null,
    operating_hours: data.operating_hours || '24/7',
    status: data.status || 'active',
    created_by: actorUserId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.gate_created',
    targetEntityType: 'gate',
    targetEntityId: gate.id,
    newValue: { gate_name: gate.gate_name, gate_code: gate.gate_code },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return gate;
};

export const getGates = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;

  const gates = await SocietyGate.findAll({
    where,
    order: [['created_at', 'ASC']],
  });

  // Attach active guards
  const enriched = await Promise.all(gates.map(async (g) => {
    const activeAssignments = await SocietyGuardAssignment.findAll({
      where: { gate_id: g.id, status: 'active', is_deleted: false },
      include: [
        { model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] },
        { model: SocietyShift, as: 'shift', attributes: ['id', 'shift_name', 'start_time', 'end_time'] },
      ],
    });
    return {
      ...g.toJSON(),
      activeGuards: activeAssignments,
    };
  }));

  return enriched;
};

export const getGateById = async (id, societyId) => {
  const gate = await SocietyGate.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!gate) return null;

  const assignments = await SocietyGuardAssignment.findAll({
    where: { gate_id: id, is_deleted: false },
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] },
      { model: SocietyShift, as: 'shift', attributes: ['id', 'shift_name', 'start_time', 'end_time'] },
    ],
  });

  return {
    ...gate.toJSON(),
    assignments,
  };
};

export const updateGate = async (id, societyId, data, actorUserId, meta = {}) => {
  const gate = await SocietyGate.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!gate) return null;

  const oldValue = gate.toJSON();
  await gate.update({
    gate_name: data.gate_name !== undefined ? data.gate_name.trim() : gate.gate_name,
    gate_code: data.gate_code !== undefined ? data.gate_code : gate.gate_code,
    gate_type: data.gate_type || gate.gate_type,
    location: data.location !== undefined ? data.location : gate.location,
    description: data.description !== undefined ? data.description : gate.description,
    operating_hours: data.operating_hours || gate.operating_hours,
    status: data.status || gate.status,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.gate_updated',
    targetEntityType: 'gate',
    targetEntityId: id,
    oldValue,
    newValue: gate.toJSON(),
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return gate;
};

export const deleteGate = async (id, societyId, actorUserId, meta = {}) => {
  const gate = await SocietyGate.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!gate) return null;

  await gate.update({
    is_deleted: true,
    status: 'inactive',
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.gate_deleted',
    targetEntityType: 'gate',
    targetEntityId: id,
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return true;
};
