import { Op } from 'sequelize';
import { DOCUMENT_STATUSES, DOCUMENT_VISIBILITY } from './society_document.model.js';
import { RESIDENT_DOCUMENT_STATUSES } from './resident_document.model.js';
import { hasPermission } from '../permission/permission.service.js';

/**
 * Enterprise Document Visibility & Audience Evaluation Service
 * Centralizes all document access control, lifecycle restrictions,
 * and tenant-boundary enforcement across Admin, Committee, Resident, and Guard roles.
 */

export const ADMIN_ROLES = Object.freeze(['admin', 'superadmin', 'society_admin']);
export const COMMITTEE_ROLES = Object.freeze(['president', 'secretary', 'treasurer', 'committee', 'board_member']);
export const GUARD_ROLES = Object.freeze(['security', 'guard', 'gatekeeper', 'security_guard']);
export const RESIDENT_ROLES = Object.freeze(['resident', 'member', 'tenant', 'owner']);

/**
 * Check if a role is an admin role
 */
export const isAdminRole = (role) => {
  if (!role) return false;
  return ADMIN_ROLES.includes(role.toLowerCase().trim());
};

/**
 * Check if a role is a security guard role
 */
export const isGuardRole = (role) => {
  if (!role) return false;
  return GUARD_ROLES.includes(role.toLowerCase().trim());
};

/**
 * Evaluate read access for an Official Society Document
 */
export const canAccessOfficialDocument = async (document, callerUser, callerRole = null, callerSocietyId = null) => {
  if (!callerUser) {
    return { allowed: false, statusCode: 401, reason: 'Authentication required' };
  }

  const userRole = (callerRole || callerUser.role || 'resident').toLowerCase().trim();
  const effectiveSocietyId = Number(callerSocietyId || callerUser.society_id || document.society_id);

  // 1. Cross-Society Boundary Check
  if (Number(document.society_id) !== effectiveSocietyId) {
    return { allowed: false, statusCode: 403, reason: 'Cross-society access forbidden' };
  }

  // 2. Admin Access
  if (isAdminRole(userRole)) {
    return { allowed: true };
  }

  // 3. Security Guard Access
  if (isGuardRole(userRole)) {
    // Guards may ONLY access PUBLISHED documents
    if (document.status !== DOCUMENT_STATUSES.PUBLISHED) {
      return { allowed: false, statusCode: 403, reason: 'Guard operational workspace cannot view unpublished documents' };
    }
    // Guards may ONLY access visibility 'all' or 'security'
    const vis = (document.visibility || '').toLowerCase().trim();
    if (vis !== DOCUMENT_VISIBILITY.ALL && vis !== DOCUMENT_VISIBILITY.SECURITY) {
      return { allowed: false, statusCode: 403, reason: 'Access restricted: guard role cannot view confidential or resident-only documents' };
    }
    // Guards must not access finance or confidential category unless explicit
    const cat = (document.category || '').toLowerCase().trim();
    if (cat === 'finance' || cat === 'vendor_contract') {
      return { allowed: false, statusCode: 403, reason: 'Guard access restricted for financial/contract documents' };
    }
    return { allowed: true };
  }

  // 4. Committee Member Access
  const isCommittee = COMMITTEE_ROLES.includes(userRole);
  if (isCommittee) {
    // If document is published: check visibility
    if (document.status === DOCUMENT_STATUSES.PUBLISHED) {
      const vis = (document.visibility || '').toLowerCase().trim();
      if (vis === DOCUMENT_VISIBILITY.ALL || vis === DOCUMENT_VISIBILITY.COMMITTEE || vis === DOCUMENT_VISIBILITY.RESIDENT) {
        return { allowed: true };
      }
      if (vis === DOCUMENT_VISIBILITY.SPECIFIC_ROLES && Array.isArray(document.allowed_roles)) {
        if (document.allowed_roles.map(r => String(r).toLowerCase()).includes(userRole)) {
          return { allowed: true };
        }
      }
    }

    // For unpublished documents (draft, under_review, approved, archived),
    // committee member MUST have explicit PBAC permission
    const hasReviewPerm = await hasPermission(callerUser, 'society_document.review', { societyId: effectiveSocietyId });
    const hasApprovePerm = await hasPermission(callerUser, 'society_document.approve', { societyId: effectiveSocietyId });
    const hasPublishPerm = await hasPermission(callerUser, 'society_document.publish', { societyId: effectiveSocietyId });
    const hasArchivePerm = await hasPermission(callerUser, 'society_document.archive', { societyId: effectiveSocietyId });

    if (hasReviewPerm || hasApprovePerm || hasPublishPerm || hasArchivePerm) {
      return { allowed: true };
    }

    return { allowed: false, statusCode: 403, reason: 'Committee member lacks required governance permission to view unpublished document' };
  }

  // 5. Resident Access
  // Residents can ONLY view PUBLISHED documents
  if (document.status !== DOCUMENT_STATUSES.PUBLISHED) {
    return { allowed: false, statusCode: 403, reason: 'Residents cannot view unpublished documents' };
  }

  const vis = (document.visibility || '').toLowerCase().trim();
  if (vis === DOCUMENT_VISIBILITY.ALL || vis === DOCUMENT_VISIBILITY.RESIDENT) {
    return { allowed: true };
  }

  if (vis === DOCUMENT_VISIBILITY.SPECIFIC_ROLES && Array.isArray(document.allowed_roles)) {
    if (document.allowed_roles.map(r => String(r).toLowerCase()).includes(userRole)) {
      return { allowed: true };
    }
  }

  return { allowed: false, statusCode: 403, reason: 'Document restricted to authorized roles' };
};

/**
 * Build Sequelize WHERE clause for listing Official Society Documents
 */
export const buildOfficialDocumentWhere = async (societyId, callerUser, callerRole = null, query = {}) => {
  const userRole = (callerRole || callerUser?.role || 'resident').toLowerCase().trim();
  const effectiveSocietyId = Number(societyId || callerUser?.society_id);

  const where = {
    society_id: effectiveSocietyId,
    is_deleted: false,
    is_official: true,
  };

  // 1. Admin Query Builder
  if (isAdminRole(userRole)) {
    if (query.status && query.status !== 'all') {
      where.status = query.status.toLowerCase().trim();
    }
    if (query.visibility && query.visibility !== 'all') {
      where.visibility = query.visibility.toLowerCase().trim();
    }
  }
  // 2. Guard Query Builder
  else if (isGuardRole(userRole)) {
    where.status = DOCUMENT_STATUSES.PUBLISHED;
    where.visibility = { [Op.in]: [DOCUMENT_VISIBILITY.ALL, DOCUMENT_VISIBILITY.SECURITY] };
    where.category = { [Op.notIn]: ['finance', 'vendor_contract'] };
  }
  // 3. Committee Query Builder
  else if (COMMITTEE_ROLES.includes(userRole)) {
    const hasReview = callerUser ? await hasPermission(callerUser, 'society_document.review', { societyId: effectiveSocietyId }) : false;
    const hasPublish = callerUser ? await hasPermission(callerUser, 'society_document.publish', { societyId: effectiveSocietyId }) : false;

    if (hasReview || hasPublish) {
      // Governance committee member can filter by status
      if (query.status && query.status !== 'all') {
        where.status = query.status.toLowerCase().trim();
      }
    } else {
      // Normal committee member without governance permissions only sees published
      where.status = DOCUMENT_STATUSES.PUBLISHED;
      where[Op.or] = [
        { visibility: DOCUMENT_VISIBILITY.ALL },
        { visibility: DOCUMENT_VISIBILITY.RESIDENT },
        { visibility: DOCUMENT_VISIBILITY.COMMITTEE },
      ];
    }
  }
  // 4. Resident Query Builder
  else {
    where.status = DOCUMENT_STATUSES.PUBLISHED;
    where[Op.or] = [
      { visibility: DOCUMENT_VISIBILITY.ALL },
      { visibility: DOCUMENT_VISIBILITY.RESIDENT },
    ];
  }

  // Common filters
  if (query.category && query.category !== 'all') {
    where.category = query.category.toLowerCase().trim();
  }

  if (query.priority && query.priority !== 'all') {
    where.priority = query.priority.toLowerCase().trim();
  }

  if (query.search) {
    const term = query.search.trim();
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { title: { [Op.like]: `%${term}%` } },
        { document_number: { [Op.like]: `%${term}%` } },
        { description: { [Op.like]: `%${term}%` } },
        { version: { [Op.like]: `%${term}%` } },
      ],
    });
  }

  return where;
};

/**
 * Evaluate access to a Resident Personal Document (Object-Level Authorization)
 */
export const canAccessResidentDocument = async (residentDoc, callerUser, callerRole = null, callerSocietyId = null) => {
  if (!callerUser) {
    return { allowed: false, statusCode: 401, reason: 'Authentication required' };
  }

  const effectiveSocietyId = Number(callerSocietyId || callerUser.society_id);
  const callerUserId = Number(callerUser.userId);
  const userRole = (callerRole || callerUser.role || 'resident').toLowerCase().trim();

  // 1. Cross-Society Boundary Check
  if (Number(residentDoc.society_id) !== effectiveSocietyId) {
    return { allowed: false, statusCode: 403, reason: 'Cross-society access forbidden' };
  }

  // 2. Object Ownership: The resident who owns the document ALWAYS has access
  if (Number(residentDoc.owner_id) === callerUserId) {
    return { allowed: true };
  }

  // 3. Society Admin or Committee Verifier check
  if (isAdminRole(userRole)) {
    // Admin cannot view purely PRIVATE documents unless resident shared it for verification
    if (residentDoc.status === RESIDENT_DOCUMENT_STATUSES.PRIVATE) {
      return { allowed: false, statusCode: 403, reason: 'Private resident document cannot be viewed until shared for verification' };
    }
    return { allowed: true };
  }

  // Committee verifiers
  if (COMMITTEE_ROLES.includes(userRole)) {
    const hasReview = await hasPermission(callerUser, 'society_document.review', { societyId: effectiveSocietyId });
    if (hasReview && residentDoc.status !== RESIDENT_DOCUMENT_STATUSES.PRIVATE) {
      return { allowed: true };
    }
  }

  // 4. Another resident or security guard: STRICT 403 FORBIDDEN
  return { allowed: false, statusCode: 403, reason: 'Access denied: You do not own this personal document' };
};

export default {
  isAdminRole,
  isGuardRole,
  canAccessOfficialDocument,
  buildOfficialDocumentWhere,
  canAccessResidentDocument,
};
