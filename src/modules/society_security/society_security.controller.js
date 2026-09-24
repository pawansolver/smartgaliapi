import * as securityService from './society_security.service.js';
import { successResponse } from '../../utils/response.js';

export const getDashboard = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const data = await securityService.getSecurityDashboard(societyId);
    return successResponse(res, 200, 'Security dashboard retrieved', data);
  } catch (err) {
    next(err);
  }
};

export const getReports = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const data = await securityService.getSecurityReports(societyId, req.query);
    return successResponse(res, 200, 'Security reports retrieved', data);
  } catch (err) {
    next(err);
  }
};

export const getAuditLogs = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const data = await securityService.getSecurityAuditLogs(societyId, req.query);
    return successResponse(res, 200, 'Security audit logs', data);
  } catch (err) {
    next(err);
  }
};
