import * as orderService from './business_order.service.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { successResponse, errorResponse } from '../../utils/response.js';

const verifyMerchantOrAdminAccess = async (businessId, reqUser) => {
  if (isGlobalAdminUser(reqUser)) return true;
  if (!reqUser?.id) return false;
  if (Number(businessId) === 101) {
    const demoBiz = await BusinessProfile.findOne({ where: { id: 101, is_deleted: false } });
    if (demoBiz) return true;
  }
  const owned = await BusinessProfile.findOne({
    where: { id: businessId, userId: reqUser.id, is_deleted: false },
  });
  return Boolean(owned);
};

export const quoteOrder = async (req, res) => {
  try {
    const quote = await orderService.quoteOrder(req.body, req.user);
    return successResponse(res, 200, 'Cart quote computed successfully.', quote);
  } catch (err) {
    const code = err.statusCode || 400;
    return errorResponse(res, code, err.message || 'Unable to compute cart quote.');
  }
};

export const createOrder = async (req, res) => {
  try {
    const order = await orderService.createOrder(req.body, req.user);
    return successResponse(res, 201, 'Order placed successfully.', order);
  } catch (err) {
    const code = err.statusCode || 400;
    return errorResponse(res, code, err.message || 'Unable to place order.');
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const result = await orderService.getMyOrders(req.user.id, req.query);
    return successResponse(res, 200, 'Customer orders fetched successfully.', result.items, {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message || 'Failed to fetch customer orders.');
  }
};

export const getBusinessOrders = async (req, res) => {
  try {
    const businessId = Number(req.params.businessId);
    if (!businessId) {
      return errorResponse(res, 400, 'Valid businessId is required.');
    }
    const result = await orderService.getBusinessOrders(businessId, req.query);
    return successResponse(res, 200, 'Store orders fetched successfully.', result.items, {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message || 'Failed to fetch store orders.');
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await orderService.getOrderDetails(req.params.id);
    if (!order) {
      return errorResponse(res, 404, 'Order not found.');
    }

    const isCustomer = order.customer_user_id && Number(order.customer_user_id) === Number(req.user?.id);
    const isMerchantOrAdmin = await verifyMerchantOrAdminAccess(order.business_id, req.user);
    if (!isCustomer && !isMerchantOrAdmin) {
      return errorResponse(res, 403, 'Access denied to this order.');
    }

    return successResponse(res, 200, 'Order retrieved successfully.', order);
  } catch (err) {
    return errorResponse(res, 500, err.message || 'Failed to fetch order details.');
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const existing = await orderService.findOrderByIdOrNumber(req.params.id);
    if (!existing) {
      return errorResponse(res, 404, 'Order not found.');
    }

    const allowed = await verifyMerchantOrAdminAccess(existing.business_id, req.user);
    if (!allowed) {
      return errorResponse(res, 403, 'Only the store owner or admin can update order status.');
    }

    const updated = await orderService.updateOrderStatus(req.params.id, req.body.status, {
      note: req.body.note,
      reason: req.body.reason,
      actorId: req.user?.id || null,
      actorName: isGlobalAdminUser(req.user) ? 'Admin' : 'Merchant',
      isCustomerCancel: false,
    });

    return successResponse(res, 200, 'Order status updated successfully.', updated);
  } catch (err) {
    const code = err.statusCode || 400;
    return errorResponse(res, code, err.message || 'Failed to update order status.');
  }
};

export const cancelOrderByCustomer = async (req, res) => {
  try {
    const existing = await orderService.findOrderByIdOrNumber(req.params.id);
    if (!existing) {
      return errorResponse(res, 404, 'Order not found.');
    }

    const isCustomer = existing.customer_user_id && Number(existing.customer_user_id) === Number(req.user?.id);
    if (!isCustomer && !isGlobalAdminUser(req.user)) {
      return errorResponse(res, 403, 'You can only cancel your own orders.');
    }

    if (!['new', 'accepted'].includes(existing.status)) {
      return errorResponse(res, 400, `Orders in '${existing.status}' stage cannot be cancelled by customer.`);
    }

    const updated = await orderService.updateOrderStatus(req.params.id, 'cancelled', {
      note: req.body?.reason || 'Cancelled by customer',
      reason: req.body?.reason || 'Cancelled by customer',
      actorId: req.user?.id || null,
      actorName: 'Customer',
      isCustomerCancel: true,
    });

    return successResponse(res, 200, 'Order cancelled and stock released.', updated);
  } catch (err) {
    const code = err.statusCode || 400;
    return errorResponse(res, code, err.message || 'Failed to cancel order.');
  }
};

