import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyEmergencyContact from './society_emergency_contact.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createEmergencyContact = async (societyId, userId, contactData, meta = {}) => {
  const contact = await SocietyEmergencyContact.create({
    society_id: societyId,
    name: contactData.name,
    designation: contactData.designation || null,
    phone: contactData.phone,
    alt_phone: contactData.alt_phone || null,
    category: (contactData.category || 'general').toLowerCase(),
    created_by: userId,
    created_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId: userId,
    action: 'society.emergency_contact_created',
    targetEntityType: 'emergency_contact',
    targetEntityId: contact.id,
    newValue: { name: contact.name, phone: contact.phone, category: contact.category },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return contact;
};

export const getAllEmergencyContacts = async (societyId, query = {}) => {
  const where = {
    society_id: societyId,
    is_deleted: false,
  };

  if (query.category && query.category !== 'all') {
    where.category = query.category.toLowerCase();
  }

  return SocietyEmergencyContact.findAll({
    where,
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
};

export const getEmergencyContactById = async (id, societyId) => {
  return SocietyEmergencyContact.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
};

export const updateEmergencyContact = async (id, societyId, updateData, userId, meta = {}) => {
  const contact = await SocietyEmergencyContact.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!contact) return null;

  const oldValue = contact.toJSON();
  const fields = {};
  if (updateData.name !== undefined) fields.name = updateData.name;
  if (updateData.designation !== undefined) fields.designation = updateData.designation;
  if (updateData.phone !== undefined) fields.phone = updateData.phone;
  if (updateData.alt_phone !== undefined) fields.alt_phone = updateData.alt_phone;
  if (updateData.category !== undefined) fields.category = updateData.category.toLowerCase();
  fields.updated_by = userId;
  fields.updatedAt = new Date();

  await contact.update(fields);

  await logSocietyAudit({
    societyId,
    actorUserId: userId,
    action: 'society.emergency_contact_updated',
    targetEntityType: 'emergency_contact',
    targetEntityId: contact.id,
    oldValue,
    newValue: contact.toJSON(),
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return contact;
};

export const deleteEmergencyContact = async (id, societyId, userId, meta = {}) => {
  const contact = await SocietyEmergencyContact.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!contact) return null;

  await contact.update({
    is_deleted: true,
    updated_by: userId,
    deletedRemarks: meta.remarks || 'Emergency contact removed by admin',
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId: userId,
    action: 'society.emergency_contact_deleted',
    targetEntityType: 'emergency_contact',
    targetEntityId: contact.id,
    reason: meta.remarks || 'Deleted by admin',
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return true;
};

export const broadcastEmergencyAlert = async (societyId, alertData, userId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.emergency_alert_broadcast',
      targetEntityType: 'emergency_alert',
      newValue: { title: alertData.title, message: alertData.message, severity: alertData.severity || 'critical' },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.emergency_alert',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        title: alertData.title,
        message: alertData.message,
        severity: alertData.severity || 'critical',
        triggeredBy: Number(userId),
        triggeredAt: new Date().toISOString(),
      },
    }, { transaction });

    await transaction.commit();
    return { success: true, message: 'Emergency alert dispatched to society members' };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
