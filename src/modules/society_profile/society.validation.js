import Joi from 'joi';
import { ANNOUNCEMENT_PRIORITY } from '../society_announcement/society_announcement.model.js';
import { COMPLAINT_STATUS, COMPLAINT_PRIORITY } from '../society_complaint/society_complaint.model.js';
import { VISITOR_STATUS } from '../society_visitor/society_visitor.model.js';
import { SOCIETY_MEMBER_ROLE, SOCIETY_MEMBER_STATUS } from '../society_member/society_member.model.js';

const id = Joi.number().integer().positive();
const pageQuery = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(120).allow('').optional(),
};

// ── Params Schemas ────────────────────────────────────────────────────────────
export const idParamSchema = Joi.object({
  id: id.required(),
});

export const societyIdParamSchema = Joi.object({
  societyId: id.optional(),
  id: id.optional(),
});

// ── Society Profile Schemas ───────────────────────────────────────────────────
export const createSocietyProfileSchema = Joi.object({
  society_name: Joi.string().trim().min(3).max(255).required().messages({
    'string.empty': 'Society name is required',
    'string.min': 'Society name must be at least 3 characters',
  }),
  registration_no: Joi.string().trim().max(100).allow('', null).optional(),
  address: Joi.string().trim().max(1000).allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  total_flats: Joi.number().integer().min(1).max(100000).allow(null).optional(),
});

export const updateSocietyProfileSchema = Joi.object({
  society_name: Joi.string().trim().min(3).max(255).optional(),
  registration_no: Joi.string().trim().max(100).allow('', null).optional(),
  address: Joi.string().trim().max(1000).allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  total_flats: Joi.number().integer().min(1).max(100000).allow(null).optional(),
}).min(1);

export const listSocietyProfileQuerySchema = Joi.object({
  ...pageQuery,
});

// ── Society Member Schemas ────────────────────────────────────────────────────
export const createSocietyMemberSchema = Joi.object({
  society_id: id.required(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).default(SOCIETY_MEMBER_ROLE.MEMBER),
});

export const updateSocietyMemberSchema = Joi.object({
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).optional(),
  status: Joi.string().valid(...Object.values(SOCIETY_MEMBER_STATUS)).optional(),
}).min(1);

export const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).required(),
});

export const memberApprovalSchema = Joi.object({
  status: Joi.string().valid(SOCIETY_MEMBER_STATUS.ACTIVE, SOCIETY_MEMBER_STATUS.REJECTED).required(),
  remark: Joi.string().trim().max(255).allow('', null).optional(),
});

export const transferOwnershipSchema = Joi.object({
  target_user_id: id.required(),
});

export const listSocietyMemberQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).optional(),
  status: Joi.string().valid(...Object.values(SOCIETY_MEMBER_STATUS)).optional(),
});

// ── Society Announcement Schemas ──────────────────────────────────────────────
export const createAnnouncementSchema = Joi.object({
  society_id: id.required(),
  title: Joi.string().trim().min(3).max(255).required(),
  message: Joi.string().trim().max(10000),
  content: Joi.string().trim().max(10000),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).default(ANNOUNCEMENT_PRIORITY.MEDIUM),
  category: Joi.string().trim().max(100).default('general'),
  is_pinned: Joi.boolean().default(false),
  expires_at: Joi.date().iso().allow(null).optional(),
});

export const updateAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  message: Joi.string().trim().max(10000).optional(),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  is_pinned: Joi.boolean().optional(),
  expires_at: Joi.date().iso().allow(null).optional(),
}).min(1);

export const listAnnouncementQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  is_pinned: Joi.boolean().optional(),
  include_expired: Joi.boolean().default(false),
});

// ── Society Complaint Schemas ─────────────────────────────────────────────────
export const createComplaintSchema = Joi.object({
  society_id: id.required(),
  title: Joi.string().trim().min(3).max(255).required(),
  description: Joi.string().trim().max(10000).required(),
  category: Joi.string().trim().max(100).default('general'),
  priority: Joi.string().valid(...Object.values(COMPLAINT_PRIORITY)).default(COMPLAINT_PRIORITY.MEDIUM),
});

export const updateComplaintSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  description: Joi.string().trim().max(10000).optional(),
  category: Joi.string().trim().max(100).optional(),
  priority: Joi.string().valid(...Object.values(COMPLAINT_PRIORITY)).optional(),
  status: Joi.string().valid(...Object.values(COMPLAINT_STATUS)).optional(),
  assigned_to: id.allow(null).optional(),
}).min(1);

export const updateComplaintStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(COMPLAINT_STATUS)).required(),
  remark: Joi.string().trim().max(500).allow('', null).optional(),
});

export const assignComplaintSchema = Joi.object({
  assigned_to: id.required(),
});

export const listComplaintQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  status: Joi.string().valid(...Object.values(COMPLAINT_STATUS)).optional(),
  priority: Joi.string().valid(...Object.values(COMPLAINT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  my_only: Joi.boolean().default(false),
});

// ── Society Facility Schemas ──────────────────────────────────────────────────
export const createFacilitySchema = Joi.object({
  society_id: id.required(),
  name: Joi.string().trim().min(2).max(255).required(),
  description: Joi.string().trim().max(2000).allow('', null).optional(),
  operating_hours: Joi.string().trim().max(255).allow('', null).optional(),
  booking_rules: Joi.string().trim().max(5000).allow('', null).optional(),
  max_capacity: Joi.number().integer().min(1).max(10000).allow(null).optional(),
});

export const updateFacilitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(255).optional(),
  description: Joi.string().trim().max(2000).allow('', null).optional(),
  operating_hours: Joi.string().trim().max(255).allow('', null).optional(),
  booking_rules: Joi.string().trim().max(5000).allow('', null).optional(),
  max_capacity: Joi.number().integer().min(1).max(10000).allow(null).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const listFacilityQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  is_active: Joi.boolean().optional(),
});

// ── Society Parking Schemas ───────────────────────────────────────────────────
export const createParkingSchema = Joi.object({
  society_id: id.required(),
  user_id: id.allow(null).optional(),
  parking_slot_no: Joi.string().trim().min(1).max(50).required(),
  vehicle_type: Joi.string().valid('2_wheeler', '4_wheeler', 'other').required(),
  vehicle_no: Joi.string().trim().min(2).max(50).required(),
  vehicle_model: Joi.string().trim().max(100).allow('', null).optional(),
  is_visitor_parking: Joi.boolean().default(false),
  status: Joi.string().valid('active', 'inactive').default('active'),
});

export const updateParkingSchema = Joi.object({
  user_id: id.allow(null).optional(),
  parking_slot_no: Joi.string().trim().min(1).max(50).optional(),
  vehicle_type: Joi.string().valid('2_wheeler', '4_wheeler', 'other').optional(),
  vehicle_no: Joi.string().trim().min(2).max(50).optional(),
  vehicle_model: Joi.string().trim().max(100).allow('', null).optional(),
  is_visitor_parking: Joi.boolean().optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
}).min(1);

export const listParkingQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  vehicle_type: Joi.string().valid('2_wheeler', '4_wheeler', 'other').optional(),
  is_visitor_parking: Joi.boolean().optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
});

// ── Society Poll Schemas ──────────────────────────────────────────────────────
export const createPollSchema = Joi.object({
  society_id: id.required(),
  question: Joi.string().trim().min(3).max(500).required(),
  options: Joi.array().items(Joi.string().trim().min(1).max(200)).min(2).max(10).required(),
  expires_at: Joi.date().iso().greater('now').allow(null).optional(),
});

export const updatePollSchema = Joi.object({
  question: Joi.string().trim().min(3).max(500).optional(),
  expires_at: Joi.date().iso().allow(null).optional(),
  status: Joi.string().valid('active', 'closed').optional(),
}).min(1);

export const votePollSchema = Joi.object({
  option_index: Joi.number().integer().min(0).max(9).required(),
});

export const listPollQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  status: Joi.string().valid('active', 'closed').optional(),
});

// ── Society Visitor Schemas ───────────────────────────────────────────────────
export const createVisitorSchema = Joi.object({
  society_id: id.required(),
  visitor_name: Joi.string().trim().min(2).max(100).required(),
  visitor_phone: Joi.string().trim().max(20).allow('', null).optional(),
  purpose: Joi.string().trim().max(255).allow('', null).optional(),
  vehicle_no: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  expected_time: Joi.date().iso().allow(null).optional(),
  status: Joi.string().valid(...Object.values(VISITOR_STATUS)).default(VISITOR_STATUS.EXPECTED),
});

export const updateVisitorSchema = Joi.object({
  visitor_name: Joi.string().trim().min(2).max(100).optional(),
  visitor_phone: Joi.string().trim().max(20).allow('', null).optional(),
  purpose: Joi.string().trim().max(255).allow('', null).optional(),
  vehicle_no: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  expected_time: Joi.date().iso().allow(null).optional(),
}).min(1);

export const updateVisitorStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(VISITOR_STATUS)).required(),
  remark: Joi.string().trim().max(255).allow('', null).optional(),
});

export const listVisitorQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  status: Joi.string().valid(...Object.values(VISITOR_STATUS)).optional(),
  flat_no: Joi.string().trim().max(50).optional(),
});
