import Joi from 'joi';

const orderItemSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  variant_id: Joi.string().trim().max(100).allow('', null).optional(),
  quantity: Joi.number().integer().min(1).max(999).required(),
});

const locationAndPromoFields = {
  delivery_type: Joi.string().valid('home_delivery', 'store_pickup').default('home_delivery'),
  payment_mode: Joi.string().valid('cod', 'prepaid', 'upi', 'card', 'COD', 'Online Prepaid', 'UPI').default('cod'),
  promo_code: Joi.string().trim().max(50).allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  state_id: Joi.number().integer().positive().allow(null).optional(),
  district_id: Joi.number().integer().positive().allow(null).optional(),
  city_id: Joi.number().integer().positive().allow(null).optional(),
  locality_id: Joi.number().integer().positive().allow(null).optional(),
  society_id: Joi.number().integer().positive().allow(null).optional(),
  pincode: Joi.string().trim().max(20).allow('', null).optional(),
  city_name: Joi.string().trim().max(150).allow('', null).optional(),
  locality_name: Joi.string().trim().max(150).allow('', null).optional(),
};

export const quoteOrderSchema = Joi.object({
  business_id: Joi.number().integer().positive().required(),
  ...locationAndPromoFields,
  items: Joi.array().items(orderItemSchema).min(1).max(50).required(),
});

export const createOrderSchema = Joi.object({
  business_id: Joi.number().integer().positive().required(),
  customer_name: Joi.string().trim().min(2).max(255).required(),
  customer_phone: Joi.string().trim().min(6).max(20).required(),
  customer_email: Joi.string().trim().email().allow('', null).optional(),
  customer_address: Joi.string().trim().max(1000).allow('', null).optional(),
  special_instructions: Joi.string().trim().max(1000).allow('', null).optional(),
  ...locationAndPromoFields,
  items: Joi.array().items(orderItemSchema).min(1).max(50).required(),
});

export const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      'accepted',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'completed',
      'cancelled',
      'returned',
      'refunded'
    )
    .required(),
  note: Joi.string().trim().max(500).allow('', null).optional(),
  reason: Joi.string().trim().max(500).allow('', null).optional(),
});

export const cancelOrderSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow('', null).optional(),
});

