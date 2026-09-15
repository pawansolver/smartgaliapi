import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyEmergencyContactService from './society_emergency_contact.service.js';

export const createEmergencyContact = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    const contact = await societyEmergencyContactService.createEmergencyContact(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Emergency contact created successfully', contact);
  } catch (error) {
    return next(error);
  }
};

export const getAllEmergencyContacts = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const contacts = await societyEmergencyContactService.getAllEmergencyContacts(societyId, req.query);
    return successResponse(res, 200, 'Emergency contacts retrieved successfully', contacts);
  } catch (error) {
    return next(error);
  }
};

export const getEmergencyContactById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const contact = await societyEmergencyContactService.getEmergencyContactById(req.params.id, societyId);
    if (!contact) return errorResponse(res, 404, 'Emergency contact not found');
    return successResponse(res, 200, 'Emergency contact retrieved successfully', contact);
  } catch (error) {
    return next(error);
  }
};

export const updateEmergencyContact = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const contact = await societyEmergencyContactService.updateEmergencyContact(req.params.id, societyId, req.body, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!contact) return errorResponse(res, 404, 'Emergency contact not found');
    return successResponse(res, 200, 'Emergency contact updated successfully', contact);
  } catch (error) {
    return next(error);
  }
};

export const deleteEmergencyContact = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const deleted = await societyEmergencyContactService.deleteEmergencyContact(req.params.id, societyId, userId, {
      remarks: req.body?.remarks,
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!deleted) return errorResponse(res, 404, 'Emergency contact not found');
    return successResponse(res, 200, 'Emergency contact deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const broadcastEmergencyAlert = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.params.id;
    const result = await societyEmergencyContactService.broadcastEmergencyAlert(societyId, req.body, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, result.message, result);
  } catch (error) {
    return next(error);
  }
};
