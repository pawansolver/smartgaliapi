import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyComplaint from './society_complaint.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import AuditLog from '../audit_log/audit_log.model.js';

export const getGlobalSummary = async ({ society_id, start_date, end_date } = {}) => {
  const where = { is_deleted: false };
  if (society_id) where.society_id = society_id;

  if (start_date || end_date) {
    where.created_at = {};
    if (start_date) where.created_at[Op.gte] = new Date(start_date);
    if (end_date) where.created_at[Op.lte] = new Date(end_date);
  }

  const [statusCounts, priorityCounts, unassignedCount] = await Promise.all([
    SocietyComplaint.findAll({
      where,
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    SocietyComplaint.findAll({
      where,
      attributes: ['priority', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['priority'],
      raw: true,
    }),
    SocietyComplaint.count({
      where: { ...where, assigned_to: null, status: { [Op.ne]: 'closed' } },
    }),
  ]);

  const summary = {
    total: 0,
    open: 0,
    assigned: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    urgent: 0,
    high: 0,
    unassigned: unassignedCount,
  };

  statusCounts.forEach((row) => {
    const c = parseInt(row.count, 10) || 0;
    summary.total += c;
    if (summary[row.status] !== undefined) {
      summary[row.status] = c;
    }
  });

  priorityCounts.forEach((row) => {
    const c = parseInt(row.count, 10) || 0;
    if (row.priority === 'urgent') summary.urgent = c;
    if (row.priority === 'high') summary.high = c;
  });

  return summary;
};

export const getGlobalComplaints = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = { is_deleted: false };

  if (query.society_id && query.society_id !== 'all') {
    where.society_id = query.society_id;
  }
  if (query.status && query.status !== 'all') {
    where.status = query.status;
  }
  if (query.priority && query.priority !== 'all') {
    where.priority = query.priority;
  }
  if (query.category && query.category !== 'all') {
    where.category = query.category;
  }
  if (query.sub_category && query.sub_category !== 'all') {
    where.sub_category = query.sub_category;
  }
  if (query.location_type && query.location_type !== 'all') {
    where.location_type = query.location_type;
  }

  if (query.assigned === 'assigned') {
    where.assigned_to = { [Op.ne]: null };
  } else if (query.assigned === 'unassigned') {
    where.assigned_to = null;
  } else if (query.assigned_to) {
    where.assigned_to = query.assigned_to;
  }

  if (query.start_date || query.end_date) {
    where.created_at = {};
    if (query.start_date) where.created_at[Op.gte] = new Date(query.start_date);
    if (query.end_date) where.created_at[Op.lte] = new Date(query.end_date);
  }

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    const searchConditions = [
      { title: { [Op.like]: `%${term}%` } },
      { flat_no: { [Op.like]: `%${term}%` } },
      { category: { [Op.like]: `%${term}%` } },
      { sub_category: { [Op.like]: `%${term}%` } },
      { exact_location: { [Op.like]: `%${term}%` } },
      { '$user.userName$': { [Op.like]: `%${term}%` } },
      { '$society.society_name$': { [Op.like]: `%${term}%` } },
    ];
    const cleanedNum = term.replace(/^[#]?(CMP-)?/i, '');
    if (/^\d+$/.test(cleanedNum)) {
      searchConditions.push({ id: parseInt(cleanedNum, 10) });
    }
    where[Op.or] = searchConditions;
  }

  const { rows, count } = await SocietyComplaint.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    include: [
      {
        model: SocietyProfile,
        as: 'society',
        attributes: ['id', 'society_name', 'registration_no', 'address'],
      },
      {
        model: User,
        as: 'user',
        attributes: ['userId', 'userName', 'email', 'phone'],
      },
      {
        model: User,
        as: 'assignee',
        attributes: ['userId', 'userName', 'email', 'phone'],
      },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getGlobalComplaintById = async (id) => {
  const complaint = await SocietyComplaint.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: SocietyProfile,
        as: 'society',
        attributes: ['id', 'society_name', 'registration_no', 'address'],
      },
      {
        model: User,
        as: 'user',
        attributes: ['userId', 'userName', 'email', 'phone'],
      },
      {
        model: User,
        as: 'assignee',
        attributes: ['userId', 'userName', 'email', 'phone'],
      },
    ],
  });

  if (!complaint) return null;

  // Retrieve status change and action history from SocietyAuditLog
  const history = await SocietyAuditLog.findAll({
    where: {
      society_id: complaint.society_id,
      target_entity_type: 'complaint',
      target_entity_id: id,
    },
    include: [
      { model: User, as: 'actor', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });

  const complaintJson = complaint.toJSON();
  complaintJson.society_name = complaintJson.society?.society_name || null;
  complaintJson.resident_name = complaintJson.user?.userName || null;
  complaintJson.resident_phone = complaintJson.user?.phone || null;
  complaintJson.assigned_to_name = complaintJson.assignee?.userName || null;
  complaintJson.history = history;
  return complaintJson;
};

export const getSocietiesList = async () => {
  return await SocietyProfile.findAll({
    where: { is_deleted: false, is_active: true },
    attributes: ['id', 'society_name', 'registration_no', 'address'],
    order: [['society_name', 'ASC']],
  });
};

export const getComplaintAuditLogs = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    [Op.or]: [
      { target_type: { [Op.like]: 'complaint%' } },
      { action: { [Op.like]: '%CATEGORY%' } },
      { action: { [Op.like]: '%LOCATION%' } },
      { action: { [Op.like]: '%complaint%' } },
    ],
  };

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    include: [
      { model: User, as: 'actor', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
  });

  const formattedLogs = rows.map((r) => {
    const json = r.toJSON ? r.toJSON() : r;
    return {
      id: json.id,
      user_id: json.actor_id,
      user_name: json.actor?.userName || `User #${json.actor_id}`,
      user_email: json.actor?.email,
      user_role: 'super_admin',
      action: json.action,
      entity_type: json.target_type,
      entity_id: json.target_id,
      old_values: json.before_snapshot,
      new_values: json.after_snapshot,
      ip_address: json.ip_address,
      user_agent: json.user_agent,
      created_at: json.created_at,
    };
  });

  return {
    data: formattedLogs,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};
