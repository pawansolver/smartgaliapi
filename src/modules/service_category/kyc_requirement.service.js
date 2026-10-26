import { Op } from 'sequelize';
import KycDocumentType from './kyc_document_type.model.js';
import CategoryDocumentRequirement from './category_document_requirement.model.js';
import ServiceCategory from './service_category.model.js';
import ServiceSubcategory from './service_subcategory.model.js';
import ServiceSubcategoryRequest from './service_subcategory_request.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ProviderDocument from '../service_provider_profile/provider_document.model.js';
import User from '../user/user.model.js';
import { audit } from '../audit_log/audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';

// ── DOCUMENT TYPES MASTER ───────────────────────────────────────────────────

export const listDocumentTypes = async (options = {}) => {
  const where = { is_deleted: false };
  if (!options.includeInactive) {
    where.is_active = true;
  }
  return await KycDocumentType.findAll({
    where,
    order: [['name', 'ASC']],
  });
};

export const getDocumentTypeById = async (id) => {
  return await KycDocumentType.findOne({
    where: { id, is_deleted: false },
  });
};

export const createDocumentType = async (data, adminUserId) => {
  const code = (data.code || data.name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/(^_|_$)/g, '');

  if (!code || code.length < 2) {
    const error = new Error('Valid document type code is required');
    error.statusCode = 400;
    throw error;
  }

  const existing = await KycDocumentType.findOne({
    where: { code, is_deleted: false },
  });
  if (existing) {
    const error = new Error(`Document type with code '${code}' already exists`);
    error.statusCode = 400;
    throw error;
  }

  const docType = await KycDocumentType.create({
    code,
    name: data.name.trim(),
    description: data.description ? data.description.trim() : null,
    allowed_mime_types: data.allowed_mime_types || ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    max_file_size_bytes: data.max_file_size_bytes || 10485760,
    requires_expiry: Boolean(data.requires_expiry),
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    remark: data.remark || null,
    created_by: adminUserId,
  });

  await audit({
    actorId: adminUserId,
    action: 'KYC_DOCUMENT_TYPE_CREATED',
    targetType: 'kyc_document_type',
    targetId: docType.id,
    after: docType.toJSON(),
  });

  return docType;
};

export const updateDocumentType = async (id, data, adminUserId) => {
  const docType = await KycDocumentType.findOne({
    where: { id, is_deleted: false },
  });
  if (!docType) {
    const error = new Error('KYC document type not found');
    error.statusCode = 404;
    throw error;
  }

  const previousData = docType.toJSON();
  const updatePayload = {
    updated_by: adminUserId,
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.description !== undefined) updatePayload.description = data.description ? data.description.trim() : null;
  if (data.allowed_mime_types !== undefined) updatePayload.allowed_mime_types = data.allowed_mime_types;
  if (data.max_file_size_bytes !== undefined) updatePayload.max_file_size_bytes = data.max_file_size_bytes;
  if (data.requires_expiry !== undefined) updatePayload.requires_expiry = Boolean(data.requires_expiry);
  if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);
  if (data.remark !== undefined) updatePayload.remark = data.remark;

  await docType.update(updatePayload);

  await audit({
    actorId: adminUserId,
    action: 'KYC_DOCUMENT_TYPE_UPDATED',
    targetType: 'kyc_document_type',
    targetId: docType.id,
    before: previousData,
    after: docType.toJSON(),
  });

  return docType;
};

export const deleteDocumentType = async (id, adminUserId) => {
  const docType = await KycDocumentType.findOne({
    where: { id, is_deleted: false },
  });
  if (!docType) {
    const error = new Error('KYC document type not found');
    error.statusCode = 404;
    throw error;
  }

  // Safety check: if referenced by active category requirements or existing provider documents, deactivate instead of delete
  const refCount = await CategoryDocumentRequirement.count({
    where: { kyc_document_type_id: id, is_deleted: false },
  });
  const docCount = await ProviderDocument.count({
    where: { document_type_id: id, is_deleted: false },
  });

  if (refCount > 0 || docCount > 0) {
    // Deactivate rather than destructively delete
    await docType.update({
      is_active: false,
      updated_by: adminUserId,
      updatedAt: new Date(),
      remark: 'Deactivated due to existing references',
    });
    return { docType, action: 'deactivated', message: 'Document type has existing records. Deactivated instead of deleted.' };
  }

  await docType.update({
    is_deleted: true,
    is_active: false,
    updated_by: adminUserId,
    updatedAt: new Date(),
    deletedRemarks: 'Soft deleted by admin',
  });

  await audit({
    actorId: adminUserId,
    action: 'KYC_DOCUMENT_TYPE_DELETED',
    targetType: 'kyc_document_type',
    targetId: docType.id,
    after: { is_deleted: true },
  });

  return { docType, action: 'deleted', message: 'Document type soft-deleted successfully.' };
};

// ── CATEGORY DOCUMENT REQUIREMENTS ──────────────────────────────────────────

export const getCategoryRequirements = async (categoryId, options = {}) => {
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_deleted: false },
  });
  if (!category) {
    const error = new Error('Service category not found');
    error.statusCode = 404;
    throw error;
  }

  const where = {
    service_category_id: categoryId,
    is_deleted: false,
  };
  if (!options.includeInactive) {
    where.is_active = true;
  }

  const requirements = await CategoryDocumentRequirement.findAll({
    where,
    include: [
      {
        model: KycDocumentType,
        as: 'documentType',
        where: { is_deleted: false },
      },
    ],
    order: [['is_mandatory', 'DESC'], ['id', 'ASC']],
  });

  return {
    kyc_configured: Boolean(category.kyc_configured),
    category: {
      id: category.serviceCategoryId,
      name: category.serviceCategoryName,
      kyc_configured: Boolean(category.kyc_configured),
    },
    requirements: requirements.map((r) => r.toJSON()),
  };
};

export const addCategoryRequirement = async (categoryId, data, adminUserId) => {
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_deleted: false },
  });
  if (!category) {
    const error = new Error('Service category not found');
    error.statusCode = 404;
    throw error;
  }

  const docType = await KycDocumentType.findOne({
    where: { id: data.kyc_document_type_id, is_deleted: false, is_active: true },
  });
  if (!docType) {
    const error = new Error('Valid active KYC document type is required');
    error.statusCode = 400;
    throw error;
  }

  // Prevent duplicate active rule for same category & doc type & provider type
  const providerType = data.applicable_provider_type || null;
  const existing = await CategoryDocumentRequirement.findOne({
    where: {
      service_category_id: categoryId,
      kyc_document_type_id: docType.id,
      applicable_provider_type: providerType,
      is_deleted: false,
    },
  });
  if (existing) {
    if (!existing.is_active) {
      // Reactivate
      await existing.update({
        is_active: true,
        is_mandatory: data.is_mandatory !== undefined ? Boolean(data.is_mandatory) : existing.is_mandatory,
        updated_by: adminUserId,
        updatedAt: new Date(),
      });
      return existing;
    }
    const error = new Error(`Requirement for '${docType.name}' already exists for this category`);
    error.statusCode = 400;
    throw error;
  }

  const req = await CategoryDocumentRequirement.create({
    service_category_id: categoryId,
    kyc_document_type_id: docType.id,
    is_mandatory: data.is_mandatory !== undefined ? Boolean(data.is_mandatory) : true,
    applicable_provider_type: providerType,
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    remark: data.remark || null,
    created_by: adminUserId,
  });

  // Automatically mark category as kyc_configured
  if (!category.kyc_configured) {
    await category.update({ kyc_configured: true, updatedAt: new Date() });
  }

  await audit({
    actorId: adminUserId,
    action: 'CATEGORY_KYC_REQUIREMENT_ADDED',
    targetType: 'category_document_requirement',
    targetId: req.id,
    after: req.toJSON(),
  });

  return await CategoryDocumentRequirement.findByPk(req.id, {
    include: [{ model: KycDocumentType, as: 'documentType' }],
  });
};

export const updateCategoryRequirement = async (requirementId, data, adminUserId) => {
  const req = await CategoryDocumentRequirement.findOne({
    where: { id: requirementId, is_deleted: false },
  });
  if (!req) {
    const error = new Error('Category document requirement not found');
    error.statusCode = 404;
    throw error;
  }

  const previousData = req.toJSON();
  const updatePayload = {
    updated_by: adminUserId,
    updatedAt: new Date(),
  };

  if (data.is_mandatory !== undefined) updatePayload.is_mandatory = Boolean(data.is_mandatory);
  if (data.applicable_provider_type !== undefined) updatePayload.applicable_provider_type = data.applicable_provider_type || null;
  if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);
  if (data.remark !== undefined) updatePayload.remark = data.remark;

  await req.update(updatePayload);

  await audit({
    actorId: adminUserId,
    action: 'CATEGORY_KYC_REQUIREMENT_UPDATED',
    targetType: 'category_document_requirement',
    targetId: req.id,
    before: previousData,
    after: req.toJSON(),
  });

  return await CategoryDocumentRequirement.findByPk(req.id, {
    include: [{ model: KycDocumentType, as: 'documentType' }],
  });
};

export const deleteCategoryRequirement = async (requirementId, adminUserId) => {
  const req = await CategoryDocumentRequirement.findOne({
    where: { id: requirementId, is_deleted: false },
  });
  if (!req) {
    const error = new Error('Category document requirement not found');
    error.statusCode = 404;
    throw error;
  }

  await req.update({
    is_deleted: true,
    is_active: false,
    updated_by: adminUserId,
    updatedAt: new Date(),
    deletedRemarks: 'Soft deleted by admin',
  });

  await audit({
    actorId: adminUserId,
    action: 'CATEGORY_KYC_REQUIREMENT_DELETED',
    targetType: 'category_document_requirement',
    targetId: req.id,
    after: { is_deleted: true },
  });

  return true;
};

export const setCategoryKycConfigured = async (categoryId, isConfigured, adminUserId) => {
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_deleted: false },
  });
  if (!category) {
    const error = new Error('Service category not found');
    error.statusCode = 404;
    throw error;
  }

  const previous = category.kyc_configured;
  await category.update({
    kyc_configured: Boolean(isConfigured),
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'CATEGORY_KYC_CONFIGURED_TOGGLED',
    targetType: 'service_category',
    targetId: category.serviceCategoryId,
    before: { kyc_configured: previous },
    after: { kyc_configured: isConfigured },
  });

  return category;
};

// ── SUBCATEGORY REQUESTS WORKFLOW ───────────────────────────────────────────

export const requestSubcategory = async (userId, data) => {
  const profile = await ServiceProviderProfile.findOne({
    where: { user_id: userId, is_deleted: false },
  });
  if (!profile) {
    const error = new Error('Service provider profile required to submit service requests');
    error.statusCode = 403;
    throw error;
  }

  if (!profile.service_category_id) {
    const error = new Error('Provider must have a designated trade category to suggest subcategories');
    error.statusCode = 400;
    throw error;
  }

  const categoryId = profile.service_category_id;
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_deleted: false, is_active: true },
  });
  if (!category) {
    const error = new Error('Designated category not found or inactive');
    error.statusCode = 400;
    throw error;
  }

  const name = (data.suggested_name || '').trim();
  if (!name || name.length < 2) {
    const error = new Error('Suggested service name must be at least 2 characters');
    error.statusCode = 400;
    throw error;
  }

  // Check if subcategory already exists under this category
  const existingSub = await ServiceSubcategory.findOne({
    where: {
      service_category_id: categoryId,
      service_subcategory_name: name,
      is_deleted: false,
    },
  });
  if (existingSub) {
    const error = new Error(`Subcategory '${name}' already exists in '${category.serviceCategoryName}'`);
    error.statusCode = 400;
    throw error;
  }

  // Check for pending duplicate request by same provider
  const pending = await ServiceSubcategoryRequest.findOne({
    where: {
      provider_id: profile.id,
      service_category_id: categoryId,
      suggested_name: name,
      status: 'pending',
      is_deleted: false,
    },
  });
  if (pending) {
    const error = new Error(`You have already submitted a pending request for '${name}'`);
    error.statusCode = 400;
    throw error;
  }

  const req = await ServiceSubcategoryRequest.create({
    provider_id: profile.id,
    user_id: userId,
    service_category_id: categoryId,
    suggested_name: name,
    description: data.description ? data.description.trim() : null,
    status: 'pending',
    created_by: userId,
  });

  await audit({
    actorId: userId,
    action: 'SERVICE_SUBCATEGORY_REQUESTED',
    targetType: 'service_subcategory_request',
    targetId: req.id,
    after: req.toJSON(),
  });

  return req;
};

export const listSubcategoryRequests = async (options = {}) => {
  const where = { is_deleted: false };
  if (options.status) {
    where.status = options.status;
  }
  if (options.categoryId) {
    where.service_category_id = options.categoryId;
  }
  if (options.providerId) {
    where.provider_id = options.providerId;
  }
  if (options.userId) {
    where.user_id = options.userId;
  }

  return await ServiceSubcategoryRequest.findAll({
    where,
    include: [
      {
        model: ServiceCategory,
        as: 'category',
        attributes: ['serviceCategoryId', 'serviceCategoryName'],
      },
      {
        model: ServiceProviderProfile,
        as: 'provider',
        attributes: ['id', 'business_name', 'provider_type', 'is_verified'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['userId', 'userName', 'email', 'phone'],
          },
        ],
      },
      {
        model: ServiceSubcategory,
        as: 'resolvedSubcategory',
        attributes: ['service_subcategory_id', 'service_subcategory_name'],
      },
      {
        model: User,
        as: 'reviewer',
        attributes: ['userId', 'userName'],
      },
    ],
    order: [['created_at', 'DESC']],
  });
};

export const reviewSubcategoryRequest = async (requestId, { status, review_note, rejection_reason }, adminUserId) => {
  const note = (rejection_reason || review_note || '').trim();
  if (!['approved', 'rejected'].includes(status)) {
    const error = new Error(`Invalid review status. Must be 'approved' or 'rejected'`);
    error.statusCode = 400;
    throw error;
  }

  const req = await ServiceSubcategoryRequest.findOne({
    where: { id: requestId, is_deleted: false },
    include: [{ model: ServiceCategory, as: 'category' }],
  });
  if (!req) {
    const error = new Error('Service subcategory request not found');
    error.statusCode = 404;
    throw error;
  }

  if (req.status !== 'pending') {
    const error = new Error('Request has already been ' + req.status + ' and cannot be reviewed again');
    error.statusCode = 400;
    throw error;
  }

  if (status === 'rejected' && (!note || note.length === 0)) {
    const error = new Error('Rejection reason is mandatory when rejecting a service request');
    error.statusCode = 400;
    throw error;
  }

  let resolvedSubcategoryId = null;

  if (status === 'approved') {
    // Check if subcategory already exists
    let subcategory = await ServiceSubcategory.findOne({
      where: {
        service_category_id: req.service_category_id,
        service_subcategory_name: req.suggested_name,
        is_deleted: false,
      },
    });

    if (!subcategory) {
      const slug = req.suggested_name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      subcategory = await ServiceSubcategory.create({
        service_category_id: req.service_category_id,
        service_subcategory_name: req.suggested_name,
        service_subcategory_slug: slug,
        is_active: true,
        remark: `Created from approved provider request #${req.id}`,
        created_by: adminUserId,
      });

      await audit({
        actorId: adminUserId,
        action: 'SERVICE_SUBCATEGORY_CREATED_FROM_REQUEST',
        targetType: 'service_subcategory',
        targetId: subcategory.service_subcategory_id,
        after: subcategory.toJSON(),
      });
    }

    resolvedSubcategoryId = subcategory.service_subcategory_id;
  }

  const previousStatus = req.status;
  await req.update({
    status,
    review_note: note || null,
    reviewed_by: adminUserId,
    reviewed_at: new Date(),
    resolved_subcategory_id: resolvedSubcategoryId,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_SUBCATEGORY_REQUEST_REVIEWED',
    targetType: 'service_subcategory_request',
    targetId: req.id,
    before: { status: previousStatus },
    after: { status, review_note, resolved_subcategory_id: resolvedSubcategoryId },
  });

  // Notify Provider
  try {
    const title = status === 'approved' ? 'Service Request Approved!' : 'Service Request Update';
    const msg = status === 'approved'
      ? `Your request for '${req.suggested_name}' has been approved! You can now select this subcategory when creating services.`
      : `Your request for '${req.suggested_name}' was not approved: ${review_note}`;

    await emitNotification({
      recipientId: req.user_id,
      actorId: adminUserId,
      type: 'service_request_review',
      title,
      message: msg,
      data: {
        requestId: req.id,
        status,
        subcategoryId: resolvedSubcategoryId,
        categoryName: req.category?.serviceCategoryName,
      },
    });
  } catch (err) {
    console.warn('[WARN] Failed to emit subcategory request notification:', err.message);
  }

  return req;
};
