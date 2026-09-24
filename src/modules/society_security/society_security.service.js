import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyVisitor from '../society_visitor/society_visitor.model.js';
import SocietyGuardAuthorization from '../society_guard/society_guard_authorization.model.js';
import SocietyGuardAssignment from '../society_guard/society_guard_assignment.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import SocietyShift from '../society_shift/society_shift.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import User from '../user/user.model.js';

export const getSecurityDashboard = async (societyId) => {
  const [
    activeGuardsCount,
    guardsOnDutyCount,
    visitorsAtGateCount,
    expectedVisitorsCount,
    checkedInCount,
    checkedOutTodayCount,
    pendingApprovalsCount,
  ] = await Promise.all([
    SocietyGuardAuthorization.count({ where: { society_id: societyId, status: 'active', is_deleted: false } }),
    SocietyGuardAssignment.count({ where: { society_id: societyId, status: 'active', is_deleted: false } }),
    SocietyVisitor.count({ where: { society_id: societyId, status: 'at_gate', is_deleted: false } }),
    SocietyVisitor.count({ where: { society_id: societyId, status: 'expected', is_deleted: false } }),
    SocietyVisitor.count({ where: { society_id: societyId, status: 'checked_in', is_deleted: false } }),
    SocietyVisitor.count({
      where: {
        society_id: societyId,
        status: 'checked_out',
        is_deleted: false,
        check_out_time: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    SocietyVisitor.count({
      where: {
        society_id: societyId,
        is_deleted: false,
        [Op.or]: [{ approval_status: 'pending' }, { status: 'at_gate' }],
      },
    }),
  ]);

  const recentVisitors = await SocietyVisitor.findAll({
    where: { society_id: societyId, is_deleted: false },
    limit: 10,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'resident', attributes: ['userId', 'userName', 'phone'] },
      { model: SocietyGate, as: 'gate', attributes: ['id', 'gate_name'] },
    ],
  });

  return {
    metrics: {
      activeGuards: activeGuardsCount,
      guardsOnDuty: guardsOnDutyCount,
      visitorsAtGate: visitorsAtGateCount,
      expectedVisitors: expectedVisitorsCount,
      checkedIn: checkedInCount,
      checkedOutToday: checkedOutTodayCount,
      pendingApprovals: pendingApprovalsCount,
    },
    recentVisitors,
  };
};

export const getSecurityReports = async (societyId, query = {}) => {
  const totalVisits = await SocietyVisitor.count({ where: { society_id: societyId, is_deleted: false } });
  const approvedVisits = await SocietyVisitor.count({ where: { society_id: societyId, status: { [Op.in]: ['approved', 'checked_in', 'checked_out'] }, is_deleted: false } });
  const rejectedVisits = await SocietyVisitor.count({ where: { society_id: societyId, status: 'denied', is_deleted: false } });
  const checkedInNow = await SocietyVisitor.count({ where: { society_id: societyId, status: 'checked_in', is_deleted: false } });

  // Breakdown by visitor type
  const [typeBreakdown] = await sequelize.query(`
    SELECT visitor_type, COUNT(*) as count 
    FROM society_visitors 
    WHERE society_id = :societyId AND is_deleted = 0 
    GROUP BY visitor_type
  `, { replacements: { societyId } });

  return {
    totalVisits,
    approvedVisits,
    rejectedVisits,
    checkedInNow,
    rejectionRate: totalVisits > 0 ? ((rejectedVisits / totalVisits) * 100).toFixed(1) + '%' : '0%',
    typeBreakdown,
  };
};

export const getSecurityAuditLogs = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 30));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    target_entity_type: { [Op.in]: ['visitor', 'guard', 'guard_assignment', 'gate', 'shift', 'committee', 'committee_member'] },
  };

  const { rows, count } = await SocietyAuditLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [{ model: User, as: 'actor', attributes: ['userId', 'userName', 'email'] }],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};
