import * as serviceConfigService from './service_config.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export const getMasterCollection = async (req, res) => {
  try {
    const { masterType } = req.params;
    const includeInactive = req.query.include_inactive === 'true';
    const search = req.query.search || null;
    const items = await serviceConfigService.getMasterItems(masterType, { includeInactive, search });
    return sendSuccess(res, items, `${masterType} retrieved successfully`, 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const getAllMasters = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const allMasters = await serviceConfigService.getAllServiceMasters({ includeInactive });
    return sendSuccess(res, allMasters, 'All service configuration masters retrieved successfully', 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const createMasterItem = async (req, res) => {
  try {
    const { masterType } = req.params;
    const reqMeta = { ip: req.ip, ua: req.headers['user-agent'] };
    const item = await serviceConfigService.createMasterItem(masterType, req.body, req.user, reqMeta);
    return sendSuccess(res, item, 'Master record created successfully', 201);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const updateMasterItem = async (req, res) => {
  try {
    const { masterType, id } = req.params;
    const reqMeta = { ip: req.ip, ua: req.headers['user-agent'] };
    const item = await serviceConfigService.updateMasterItem(masterType, id, req.body, req.user, reqMeta);
    return sendSuccess(res, item, 'Master record updated successfully', 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const toggleMasterStatus = async (req, res) => {
  try {
    const { masterType, id } = req.params;
    const { is_active, remark } = req.body;
    const reqMeta = { ip: req.ip, ua: req.headers['user-agent'] };
    const item = await serviceConfigService.toggleMasterStatus(masterType, id, is_active, remark, req.user, reqMeta);
    return sendSuccess(res, item, `Master record ${is_active ? 'activated' : 'deactivated'} successfully`, 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const deleteMasterItem = async (req, res) => {
  try {
    const { masterType, id } = req.params;
    const remark = req.body?.remark || req.query?.remark;
    const reqMeta = { ip: req.ip, ua: req.headers['user-agent'] };
    const result = await serviceConfigService.softDeleteMasterItem(masterType, id, remark, req.user, reqMeta);
    return sendSuccess(res, result, 'Master record soft-deleted successfully', 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};


import * as serviceBookingGovernanceService from './service_booking_governance.service.js';

export const getBookingGovernance = async (req, res) => {
  try {
    const data = await serviceBookingGovernanceService.getLiveBookingGovernance();
    return sendSuccess(res, data, 'Booking and pricing governance retrieved successfully', 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};

export const updateBookingGovernance = async (req, res) => {
  try {
    const reqMeta = { ip: req.ip, ua: req.headers['user-agent'] };
    const data = await serviceBookingGovernanceService.updateLiveBookingGovernance(req.body, req.user, reqMeta);
    return sendSuccess(res, data, 'Booking and pricing governance updated successfully by administrator', 200);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
};
