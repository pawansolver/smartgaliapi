import { successResponse, errorResponse } from '../../utils/response.js';
import * as parkingService from './society_parking.service.js';

export const createParking = async (req, res, next) => {
  try {
    const parking = await parkingService.createParking(req.body);
    return successResponse(res, 201, 'Parking created successfully', parking);
  } catch (error) {
    next(error);
  }
};

export const getAllParkings = async (req, res, next) => {
  try {
    const parkings = await parkingService.getAllParkings();
    return successResponse(res, 200, 'Parkings fetched successfully', parkings);
  } catch (error) {
    next(error);
  }
};

export const getParkingById = async (req, res, next) => {
  try {
    const parking = await parkingService.getParkingById(req.params.id);
    if (!parking) {
      return errorResponse(res, 404, 'Parking not found');
    }
    return successResponse(res, 200, 'Parking fetched successfully', parking);
  } catch (error) {
    next(error);
  }
};

export const updateParking = async (req, res, next) => {
  try {
    const parking = await parkingService.updateParking(req.params.id, req.body);
    if (!parking) {
      return errorResponse(res, 404, 'Parking not found');
    }
    return successResponse(res, 200, 'Parking updated successfully', parking);
  } catch (error) {
    next(error);
  }
};

export const deleteParking = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const parking = await parkingService.softDeleteParking(req.params.id, deletedRemarks, updated_by);
    if (!parking) {
      return errorResponse(res, 404, 'Parking not found');
    }
    return successResponse(res, 200, 'Parking deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
