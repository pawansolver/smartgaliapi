import Joi from 'joi';
import {
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_AUDIENCE,
} from '../society_announcement/society_announcement.model.js';
import { COMPLAINT_STATUS, COMPLAINT_PRIORITY } from '../society_complaint/society_complaint.model.js';
import { VISITOR_STATUS } from '../society_visitor/society_visitor.model.js';
import { SOCIETY_MEMBER_ROLE, SOCIETY_MEMBER_STATUS } from '../society_member/society_member.model.js';

const id = Joi.number().integer().positive();
const pageQuery = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(20),
  cursor: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(120).allow('').optional(),
};

// â”€â”€ Params Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const idParamSchema = Joi.object({
  id: id.required(),
});

export const societyIdParamSchema = Joi.object({
  societyId: id.optional(),
  id: id.optional(),
});

// â”€â”€ Society Profile Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Society Member Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const createSocietyMemberSchema = Joi.object({
  society_id: id.required(),
  user_id: id.optional(),
  phone: Joi.string().trim().max(20).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).default(SOCIETY_MEMBER_ROLE.MEMBER),
  trade: Joi.string().trim().max(100).allow('', null).optional(),
  status: Joi.string().valid(...Object.values(SOCIETY_MEMBER_STATUS || {})).optional(),
});

export const updateSocietyMemberSchema = Joi.object({
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).optional(),
  status: Joi.string().valid(...Object.values(SOCIETY_MEMBER_STATUS)).optional(),
}).min(1);

export const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid(...Object.values(SOCIETY_MEMBER_ROLE)).required(),
  remark: Joi.string().trim().max(255).allow('', null).optional(),
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

// â”€â”€ Society Announcement Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const announcementAttachmentSchema = Joi.object({
  file_url: Joi.string().trim().required(),
  file_name: Joi.string().trim().max(255).allow('', null).optional(),
  file_type: Joi.string().trim().max(100).allow('', null).optional(),
  file_size: Joi.number().integer().min(0).allow(null).optional(),
});

export const createAnnouncementSchema = Joi.object({
  society_id: id.required(),
  title: Joi.string().trim().min(3).max(255).required(),
  summary: Joi.string().trim().max(500).allow('', null).optional(),
  message: Joi.string().trim().max(10000),
  content: Joi.string().trim().max(10000),
  action_text: Joi.string().trim().max(500).allow('', null).optional(),
  audience: Joi.string().valid(...Object.values(ANNOUNCEMENT_AUDIENCE)).default(ANNOUNCEMENT_AUDIENCE.ENTIRE_SOCIETY),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).default(ANNOUNCEMENT_PRIORITY.MEDIUM),
  category: Joi.string().trim().max(100).default('general'),
  sub_category: Joi.string().trim().max(100).allow('', null).optional(),
  location_type: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  exact_location: Joi.string().trim().max(255).allow('', null).optional(),
  is_pinned: Joi.boolean().default(false),
  status: Joi.string().valid(...Object.values(ANNOUNCEMENT_STATUS)).default(ANNOUNCEMENT_STATUS.PUBLISHED),
  publish_at: Joi.date().iso().allow(null).optional(),
  expires_at: Joi.date().iso().allow(null).optional(),
  attachments: Joi.array().items(announcementAttachmentSchema).allow(null).optional(),
});

export const updateAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  summary: Joi.string().trim().max(500).allow('', null).optional(),
  message: Joi.string().trim().max(10000).optional(),
  content: Joi.string().trim().max(10000).optional(),
  action_text: Joi.string().trim().max(500).allow('', null).optional(),
  audience: Joi.string().valid(...Object.values(ANNOUNCEMENT_AUDIENCE)).optional(),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  sub_category: Joi.string().trim().max(100).allow('', null).optional(),
  location_type: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  exact_location: Joi.string().trim().max(255).allow('', null).optional(),
  is_pinned: Joi.boolean().optional(),
  status: Joi.string().valid(...Object.values(ANNOUNCEMENT_STATUS)).optional(),
  publish_at: Joi.date().iso().allow(null).optional(),
  expires_at: Joi.date().iso().allow(null).optional(),
  attachments: Joi.array().items(announcementAttachmentSchema).allow(null).optional(),
  deletedRemarks: Joi.string().trim().max(500).allow('', null).optional(),
}).min(1);

export const listAnnouncementQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  priority: Joi.string().valid(...Object.values(ANNOUNCEMENT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  status: Joi.string().valid(...Object.values(ANNOUNCEMENT_STATUS), 'all').optional(),
  audience: Joi.string().valid(...Object.values(ANNOUNCEMENT_AUDIENCE)).optional(),
  is_pinned: Joi.boolean().optional(),
  include_expired: Joi.boolean().default(false),
});

export const bulkDeleteAnnouncementSchema = Joi.object({
  ids: Joi.array().items(id).min(1).required(),
  society_id: id.optional(),
  deletedRemarks: Joi.string().trim().max(500).allow('', null).optional(),
});

// â”€â”€ Society Complaint Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const createComplaintSchema = Joi.object({
  society_id: id.required(),
  title: Joi.string().trim().min(3).max(255).required(),
  description: Joi.string().trim().max(10000).required(),
  category: Joi.string().trim().max(100).default('general'),
  sub_category: Joi.string().trim().max(100).allow('', null).optional(),
  location_type: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  exact_location: Joi.string().trim().max(255).allow('', null).optional(),
  priority: Joi.string().valid(...Object.values(COMPLAINT_PRIORITY)).default(COMPLAINT_PRIORITY.MEDIUM),
});

export const updateComplaintSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  description: Joi.string().trim().max(10000).optional(),
  category: Joi.string().trim().max(100).optional(),
  sub_category: Joi.string().trim().max(100).allow('', null).optional(),
  location_type: Joi.string().trim().max(50).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  exact_location: Joi.string().trim().max(255).allow('', null).optional(),
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
  reason: Joi.string().trim().max(500).allow('', null).optional(),
});

export const listComplaintQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  status: Joi.string().valid(...Object.values(COMPLAINT_STATUS)).optional(),
  priority: Joi.string().valid(...Object.values(COMPLAINT_PRIORITY)).optional(),
  category: Joi.string().trim().max(100).optional(),
  location_type: Joi.string().trim().max(50).allow('', null).optional(),
  assigned: Joi.string().valid('all', 'assigned', 'unassigned').optional(),
  search: Joi.string().trim().max(100).allow('', null).optional(),
  my_only: Joi.boolean().default(false),
});

// â”€â”€ Society Facility Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Society Parking Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Society Poll Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Society Visitor Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const createVisitorSchema = Joi.object({
  society_id: id.required(),
  visitor_name: Joi.string().trim().min(2).max(100).required(),
  visitor_phone: Joi.string().trim().max(20).allow('', null).optional(),
  phone_number: Joi.string().trim().max(20).allow('', null).optional(),
  purpose: Joi.string().trim().max(255).allow('', null).optional(),
  vehicle_no: Joi.string().trim().max(50).allow('', null).optional(),
  vehicle_number: Joi.string().trim().max(50).allow('', null).optional(),
  driver_name: Joi.string().trim().max(100).allow('', null).optional(),
  cab_number: Joi.string().trim().max(50).allow('', null).optional(),
  service_category: Joi.string().trim().max(100).allow('', null).optional(),
  worker_type: Joi.string().trim().max(100).allow('', null).optional(),
  flat_no: Joi.string().trim().max(50).allow('', null).optional(),
  expected_time: Joi.date().iso().allow(null).optional(),
  status: Joi.string().valid(...Object.values(VISITOR_STATUS)).default(VISITOR_STATUS.EXPECTED),
  visitor_type: Joi.string().valid('guest', 'delivery', 'cab', 'service', 'vendor', 'worker', 'domestic_worker', 'other').optional(),
  company_name: Joi.string().trim().max(100).allow('', null).optional(),
  vehicle_type: Joi.string().valid('two_wheeler', '2_wheeler', 'four_wheeler', '4_wheeler', 'commercial', 'none', 'other').optional(),
  entry_type: Joi.string().valid('expected', 'walk_in', 'guard_entry').optional(),
  gate_id: id.allow(null).optional(),
  guard_id: id.allow(null).optional(),
  user_id: id.allow(null).optional(),
  host_resident_id: id.allow(null).optional(),
  host_resident: Joi.string().trim().allow('', null).optional(),
  id_type: Joi.string().valid('aadhaar', 'driving_license', 'voter_id', 'passport', 'other').allow(null).optional(),
  id_number: Joi.string().trim().max(100).allow('', null).optional(),
  check_in_time: Joi.date().iso().allow(null).optional(),
  check_out_time: Joi.date().iso().allow(null).optional(),
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
// â”€â”€ Society Document Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const createDocumentSchema = Joi.object({
  society_id: id.optional(),
  title: Joi.string().trim().min(2).max(255).required(),
  description: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().max(50).default('general').optional(),
  file_url: Joi.string().trim().max(500).optional(),
  file_type: Joi.string().trim().max(50).optional(),
  file_size: Joi.number().integer().min(0).optional(),
});

export const updateDocumentSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).optional(),
  description: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().max(50).optional(),
}).min(1);

export const listDocumentQuerySchema = Joi.object({
  ...pageQuery,
  society_id: id.optional(),
  category: Joi.string().trim().optional(),
  search: Joi.string().trim().allow('', null).optional(),
});

// â”€â”€ Society Emergency Contact Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const createEmergencyContactSchema = Joi.object({
  society_id: id.optional(),
  name: Joi.string().trim().min(2).max(150).required(),
  designation: Joi.string().trim().max(150).allow('', null).optional(),
  phone: Joi.string().trim().min(3).max(30).required(),
  alt_phone: Joi.string().trim().max(30).allow('', null).optional(),
  category: Joi.string().trim().max(50).default('general').optional(),
});

export const updateEmergencyContactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).optional(),
  designation: Joi.string().trim().max(150).allow('', null).optional(),
  phone: Joi.string().trim().min(3).max(30).optional(),
  alt_phone: Joi.string().trim().max(30).allow('', null).optional(),
  category: Joi.string().trim().max(50).optional(),
}).min(1);

export const emergencyAlertSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  message: Joi.string().trim().min(5).max(1000).required(),
  severity: Joi.string().valid('critical', 'high', 'medium', 'low').default('critical'),
});

