import { successResponse, errorResponse } from '../../utils/response.js';
import * as visitorService from './society_visitor.service.js';

export const createVisitor = async (req, res, next) => {
  try {
    const visitor = await visitorService.createVisitor(req.body);
    return successResponse(res, 201, 'Visitor created successfully', visitor);
  } catch (error) {
    next(error);
  }
};

export const getAllVisitors = async (req, res, next) => {
  try {
    const visitors = await visitorService.getAllVisitors();
    return successResponse(res, 200, 'Visitors fetched successfully', visitors);
  } catch (error) {
    next(error);
  }
};

export const getVisitorById = async (req, res, next) => {
  try {
    const visitor = await visitorService.getVisitorById(req.params.id);
    if (!visitor) {
      return errorResponse(res, 404, 'Visitor not found');
    }
    return successResponse(res, 200, 'Visitor fetched successfully', visitor);
  } catch (error) {
    next(error);
  }
};

export const updateVisitor = async (req, res, next) => {
  try {
    const visitor = await visitorService.updateVisitor(req.params.id, req.body);
    if (!visitor) {
      return errorResponse(res, 404, 'Visitor not found');
    }
    return successResponse(res, 200, 'Visitor updated successfully', visitor);
  } catch (error) {
    next(error);
  }
};

export const updateVisitorStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return errorResponse(res, 400, 'Status is required');
    const visitor = await visitorService.updateVisitorStatus(req.params.id, status);
    if (!visitor) {
      return errorResponse(res, 404, 'Visitor not found');
    }
    return successResponse(res, 200, 'Visitor status updated successfully', visitor);
  } catch (error) {
    next(error);
  }
};

export const deleteVisitor = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const visitor = await visitorService.softDeleteVisitor(req.params.id, deletedRemarks, updated_by);
    if (!visitor) {
      return errorResponse(res, 404, 'Visitor not found');
    }
    return successResponse(res, 200, 'Visitor deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
