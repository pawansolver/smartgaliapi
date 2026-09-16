import { successResponse, errorResponse } from '../../utils/response.js';
import * as complaintMasterService from './complaint_master.service.js';

const getMeta = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  requestId: req.correlationId,
});

// ── Category Controllers ───────────────────────────────────────────────────────

export const listCategories = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const categories = await complaintMasterService.listCategories({
      include_inactive: includeInactive,
      search: req.query.search,
    });
    return successResponse(res, 200, 'Complaint categories retrieved successfully', categories);
  } catch (err) {
    return next(err);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const category = await complaintMasterService.getCategoryById(req.params.id);
    if (!category) return errorResponse(res, 404, 'Complaint category not found.');
    return successResponse(res, 200, 'Complaint category retrieved successfully', category);
  } catch (err) {
    return next(err);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const category = await complaintMasterService.createCategory(req.body, actorId, getMeta(req));
    return successResponse(res, 201, 'Complaint category created successfully', category);
  } catch (err) {
    return next(err);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const category = await complaintMasterService.updateCategory(req.params.id, req.body, actorId, getMeta(req));
    if (!category) return errorResponse(res, 404, 'Complaint category not found.');
    return successResponse(res, 200, 'Complaint category updated successfully', category);
  } catch (err) {
    return next(err);
  }
};

export const toggleCategoryStatus = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const category = await complaintMasterService.toggleCategoryStatus(req.params.id, req.body.is_active, actorId, getMeta(req));
    if (!category) return errorResponse(res, 404, 'Complaint category not found.');
    return successResponse(res, 200, `Complaint category ${category.is_active ? 'activated' : 'deactivated'} successfully`, category);
  } catch (err) {
    return next(err);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const success = await complaintMasterService.deleteCategory(req.params.id, actorId, getMeta(req));
    if (!success) return errorResponse(res, 404, 'Complaint category not found.');
    return successResponse(res, 200, 'Complaint category deactivated successfully');
  } catch (err) {
    return next(err);
  }
};

// ── Sub-Category Controllers ───────────────────────────────────────────────────

export const listSubCategories = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const subCategories = await complaintMasterService.listSubCategories({
      category_id: req.query.category_id ? parseInt(req.query.category_id, 10) : undefined,
      include_inactive: includeInactive,
      search: req.query.search,
    });
    return successResponse(res, 200, 'Complaint sub-categories retrieved successfully', subCategories);
  } catch (err) {
    return next(err);
  }
};

export const getSubCategoryById = async (req, res, next) => {
  try {
    const subCategory = await complaintMasterService.getSubCategoryById(req.params.id);
    if (!subCategory) return errorResponse(res, 404, 'Complaint sub-category not found.');
    return successResponse(res, 200, 'Complaint sub-category retrieved successfully', subCategory);
  } catch (err) {
    return next(err);
  }
};

export const createSubCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const subCategory = await complaintMasterService.createSubCategory(req.body, actorId, getMeta(req));
    return successResponse(res, 201, 'Complaint sub-category created successfully', subCategory);
  } catch (err) {
    return next(err);
  }
};

export const updateSubCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const subCategory = await complaintMasterService.updateSubCategory(req.params.id, req.body, actorId, getMeta(req));
    if (!subCategory) return errorResponse(res, 404, 'Complaint sub-category not found.');
    return successResponse(res, 200, 'Complaint sub-category updated successfully', subCategory);
  } catch (err) {
    return next(err);
  }
};

export const toggleSubCategoryStatus = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const subCategory = await complaintMasterService.toggleSubCategoryStatus(req.params.id, req.body.is_active, actorId, getMeta(req));
    if (!subCategory) return errorResponse(res, 404, 'Complaint sub-category not found.');
    return successResponse(res, 200, `Complaint sub-category ${subCategory.is_active ? 'activated' : 'deactivated'} successfully`, subCategory);
  } catch (err) {
    return next(err);
  }
};

export const deleteSubCategory = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const success = await complaintMasterService.deleteSubCategory(req.params.id, actorId, getMeta(req));
    if (!success) return errorResponse(res, 404, 'Complaint sub-category not found.');
    return successResponse(res, 200, 'Complaint sub-category deactivated successfully');
  } catch (err) {
    return next(err);
  }
};

// ── Location Type Controllers ─────────────────────────────────────────────────

export const listLocationTypes = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const locationTypes = await complaintMasterService.listLocationTypes({
      include_inactive: includeInactive,
      search: req.query.search,
    });
    return successResponse(res, 200, 'Complaint location types retrieved successfully', locationTypes);
  } catch (err) {
    return next(err);
  }
};

export const getLocationTypeById = async (req, res, next) => {
  try {
    const locationType = await complaintMasterService.getLocationTypeById(req.params.id);
    if (!locationType) return errorResponse(res, 404, 'Complaint location type not found.');
    return successResponse(res, 200, 'Complaint location type retrieved successfully', locationType);
  } catch (err) {
    return next(err);
  }
};

export const createLocationType = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const locationType = await complaintMasterService.createLocationType(req.body, actorId, getMeta(req));
    return successResponse(res, 201, 'Complaint location type created successfully', locationType);
  } catch (err) {
    return next(err);
  }
};

export const updateLocationType = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const locationType = await complaintMasterService.updateLocationType(req.params.id, req.body, actorId, getMeta(req));
    if (!locationType) return errorResponse(res, 404, 'Complaint location type not found.');
    return successResponse(res, 200, 'Complaint location type updated successfully', locationType);
  } catch (err) {
    return next(err);
  }
};

export const toggleLocationTypeStatus = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const locationType = await complaintMasterService.toggleLocationTypeStatus(req.params.id, req.body.is_active, actorId, getMeta(req));
    if (!locationType) return errorResponse(res, 404, 'Complaint location type not found.');
    return successResponse(res, 200, `Complaint location type ${locationType.is_active ? 'activated' : 'deactivated'} successfully`, locationType);
  } catch (err) {
    return next(err);
  }
};

export const deleteLocationType = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const success = await complaintMasterService.deleteLocationType(req.params.id, actorId, getMeta(req));
    if (!success) return errorResponse(res, 404, 'Complaint location type not found.');
    return successResponse(res, 200, 'Complaint location type deactivated successfully');
  } catch (err) {
    return next(err);
  }
};

// ── Reorder Controllers ───────────────────────────────────────────────────────

export const reorderItems = async (req, res, next) => {
  try {
    const { type } = req.params; // 'category' | 'subCategory' | 'locationType'
    const actorId = req.user?.id || req.user?.userId;
    await complaintMasterService.reorderItems(type, req.body.items, actorId, getMeta(req));
    return successResponse(res, 200, `Complaint ${type} order updated successfully`);
  } catch (err) {
    return next(err);
  }
};
