import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyDocument from './society_document.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createDocument = async (societyId, userId, docData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await SocietyDocument.create({
      society_id: societyId,
      title: docData.title,
      description: docData.description || null,
      file_url: docData.file_url,
      file_type: docData.file_type || null,
      file_size: docData.file_size || null,
      category: (docData.category || 'general').toLowerCase(),
      uploaded_by: userId,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_created',
      targetEntityType: 'document',
      targetEntityId: document.id,
      newValue: { title: document.title, category: document.category, file_url: document.file_url },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.document_uploaded',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(document.id),
        title: document.title,
        category: document.category,
        uploadedBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllDocuments = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    is_deleted: false,
  };

  if (query.category && query.category !== 'all') {
    where.category = query.category.toLowerCase();
  }

  if (query.search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${query.search}%` } },
      { description: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await SocietyDocument.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getDocumentById = async (id, societyId) => {
  return SocietyDocument.findOne({
    where: {
      id,
      society_id: societyId,
      is_deleted: false,
    },
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });
};

export const updateDocument = async (id, societyId, updateData, userId, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const oldValue = document.toJSON();
    const fields = {};
    if (updateData.title !== undefined) fields.title = updateData.title;
    if (updateData.description !== undefined) fields.description = updateData.description;
    if (updateData.category !== undefined) fields.category = updateData.category.toLowerCase();
    fields.updated_by = userId;
    fields.updatedAt = new Date();

    await document.update(fields, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_updated',
      targetEntityType: 'document',
      targetEntityId: document.id,
      oldValue,
      newValue: document.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const deleteDocument = async (id, societyId, userId, meta = {}) => {
  const document = await SocietyDocument.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    await document.update({
      is_deleted: true,
      updated_by: userId,
      deletedRemarks: meta.remarks || 'Document deleted by admin',
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_deleted',
      targetEntityType: 'document',
      targetEntityId: document.id,
      reason: meta.remarks || 'Document deleted by admin',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
