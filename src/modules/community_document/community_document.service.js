import CommunityDocument from './community_document.model.js';
import User from '../user/user.model.js';
import sequelize from '../../config/db.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';

export const uploadDocument = async (communityId, userId, { title, fileUrl, fileType = 'pdf', fileSize = '1.2 MB' }) => {
  if (!title || !title.trim()) throw new Error('Document title is required');
  if (!fileUrl) throw new Error('File URL is required');

  const transaction = await sequelize.transaction();
  try {
    const doc = await CommunityDocument.create({
      community_id: communityId,
      title: title.trim(),
      file_url: fileUrl,
      file_type: fileType,
      file_size: fileSize,
      uploaded_by: userId,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'document.uploaded',
      targetEntityType: 'document',
      targetEntityId: doc.id,
      newValue: { title: doc.title, fileType, fileSize },
    }, { transaction });

    await transaction.commit();
    return doc;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityDocuments = async (communityId) => {
  return await CommunityDocument.findAll({
    where: { community_id: communityId, is_active: true, is_deleted: false },
    include: [{ model: User, as: 'uploader', attributes: ['userId', 'userName'] }],
    order: [['created_at', 'DESC']],
  });
};

export const deleteDocument = async (communityId, documentId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const doc = await CommunityDocument.findOne({
      where: { id: documentId, community_id: communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!doc) {
      await transaction.commit();
      return null;
    }

    await doc.update({
      is_deleted: true,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'document.deleted',
      targetEntityType: 'document',
      targetEntityId: documentId,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
