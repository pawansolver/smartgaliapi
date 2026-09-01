import { successResponse } from '../../utils/response.js';
import * as exampleService from './example.service.js';

export const checkStatus = async (req, res, next) => {
  try {
    const statusData = await exampleService.getApiStatus();
    return successResponse(res, 200, 'API is running properly!', statusData);
  } catch (error) {
    next(error);
  }
};
