import { Op } from 'sequelize';
import SocietyServiceAccess, { SOCIETY_SERVICE_ACCESS_STATUS } from './society_service_access.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { audit } from '../audit_log/audit_log.service.js';

export class SocietyServiceAccessService {
  /**
   * Provider requests access to offer a specific service listing inside a residential society.
   */
  async requestAccess({ userId, serviceId, societyId, notes, ipAddress, userAgent }) {
    // 1. Resolve Provider Profile
    const provider = await ServiceProviderProfile.findOne({
      where: { user_id: userId, is_deleted: false },
    });
    if (!provider) {
      const err = new Error('Only registered service providers can request society service access.');
      err.statusCode = 403;
      err.code = 'PROVIDER_PROFILE_REQUIRED';
      throw err;
    }

    // 2. Resolve Service Listing & Verify Ownership
    const listing = await ServiceListing.findOne({
      where: { id: serviceId, is_deleted: false },
    });
    if (!listing) {
      const err = new Error('Service listing not found.');
      err.statusCode = 404;
      err.code = 'SERVICE_NOT_FOUND';
      throw err;
    }
    if (Number(listing.provider_id) !== Number(provider.id)) {
      const err = new Error('You can only request society access for service listings you own.');
      err.statusCode = 403;
      err.code = 'UNAUTHORIZED_SERVICE_OWNER';
      throw err;
    }
    if (!listing.is_active || listing.moderation_status?.toLowerCase() !== 'approved') {
      const err = new Error('Service listing must be active and approved by platform moderation before requesting society access.');
      err.statusCode = 400;
      err.code = 'SERVICE_NOT_ELIGIBLE';
      throw err;
    }

    // 3. Resolve Society
    const society = await SocietyProfile.findOne({
      where: { id: societyId, is_deleted: false },
    });
    if (!society || !society.is_active) {
      const err = new Error('Target residential society not found or inactive.');
      err.statusCode = 404;
      err.code = 'SOCIETY_NOT_FOUND';
      throw err;
    }

    // 4. Check for Existing Access Relationship
    let access = await SocietyServiceAccess.findOne({
      where: {
        provider_id: provider.id,
        service_id: listing.id,
        society_id: society.id,
      },
    });

    if (access) {
      if (access.status === SOCIETY_SERVICE_ACCESS_STATUS.APPROVED) {
        const err = new Error('This service listing is already approved for this residential society.');
        err.statusCode = 409;
        err.code = 'ACCESS_ALREADY_APPROVED';
        throw err;
      }
      if (access.status === SOCIETY_SERVICE_ACCESS_STATUS.REQUESTED) {
        const err = new Error('An access request for this service is already pending review with society administration.');
        err.statusCode = 409;
        err.code = 'REQUEST_ALREADY_PENDING';
        throw err;
      }

      // Re-request if previously REJECTED, SUSPENDED, or REVOKED
      const beforeSnapshot = access.toJSON();
      access.status = SOCIETY_SERVICE_ACCESS_STATUS.REQUESTED;
      access.requested_by = userId;
      access.requested_at = new Date();
      access.reviewed_by = null;
      access.reviewed_at = null;
      access.rejection_reason = null;
      access.suspension_reason = null;
      access.notes = notes || access.notes;
      access.is_active = true;
      access.is_deleted = false;
      await access.save();

      await audit({
        actorId: userId,
        action: 'SOCIETY_SERVICE_ACCESS_REQUESTED',
        targetType: 'society_service_access',
        targetId: access.id,
        beforeSnapshot,
        afterSnapshot: access.toJSON(),
        ipAddress,
        userAgent,
      });

      await this._notifySocietyAdmins(society, provider, listing, access);
      return access;
    }

    // Create New Access Request
    access = await SocietyServiceAccess.create({
      provider_id: provider.id,
      service_id: listing.id,
      society_id: society.id,
      requested_by: userId,
      requested_at: new Date(),
      status: SOCIETY_SERVICE_ACCESS_STATUS.REQUESTED,
      notes,
    });

    await audit({
      actorId: userId,
      action: 'SOCIETY_SERVICE_ACCESS_REQUESTED',
      targetType: 'society_service_access',
      targetId: access.id,
      beforeSnapshot: null,
      afterSnapshot: access.toJSON(),
      ipAddress,
      userAgent,
    });

    await this._notifySocietyAdmins(society, provider, listing, access);
    return access;
  }

  /**
   * Society Admin approves provider service listing for community residents.
   */
  async approveAccess({ accessId, reviewerUserId, societyId, ipAddress, userAgent }) {
    const access = await this._resolveAndAuthorizeAccess(accessId, reviewerUserId, societyId);

    // Security: Provider cannot approve himself
    if (Number(access.requested_by) === Number(reviewerUserId)) {
      const err = new Error('Security Violation: Providers are strictly prohibited from approving their own society access requests.');
      err.statusCode = 403;
      err.code = 'SELF_APPROVAL_FORBIDDEN';
      throw err;
    }

    const beforeSnapshot = access.toJSON();
    access.status = SOCIETY_SERVICE_ACCESS_STATUS.APPROVED;
    access.reviewed_by = reviewerUserId;
    access.reviewed_at = new Date();
    access.rejection_reason = null;
    access.suspension_reason = null;
    await access.save();

    await audit({
      actorId: reviewerUserId,
      action: 'SOCIETY_SERVICE_ACCESS_APPROVED',
      targetType: 'society_service_access',
      targetId: access.id,
      beforeSnapshot,
      afterSnapshot: access.toJSON(),
      ipAddress,
      userAgent,
    });

    // Notify Provider
    await this._notifyProviderOfDecision(access, 'APPROVED');
    return access;
  }

  /**
   * Society Admin rejects provider service listing request with mandatory reason.
   */
  async rejectAccess({ accessId, reviewerUserId, societyId, rejectionReason, ipAddress, userAgent }) {
    if (!rejectionReason || !rejectionReason.trim()) {
      const err = new Error('Rejection reason is mandatory when rejecting a society service access request.');
      err.statusCode = 400;
      err.code = 'REJECTION_REASON_REQUIRED';
      throw err;
    }

    const access = await this._resolveAndAuthorizeAccess(accessId, reviewerUserId, societyId);

    const beforeSnapshot = access.toJSON();
    access.status = SOCIETY_SERVICE_ACCESS_STATUS.REJECTED;
    access.rejection_reason = rejectionReason.trim();
    access.reviewed_by = reviewerUserId;
    access.reviewed_at = new Date();
    await access.save();

    await audit({
      actorId: reviewerUserId,
      action: 'SOCIETY_SERVICE_ACCESS_REJECTED',
      targetType: 'society_service_access',
      targetId: access.id,
      beforeSnapshot,
      afterSnapshot: access.toJSON(),
      ipAddress,
      userAgent,
    });

    await this._notifyProviderOfDecision(access, 'REJECTED', rejectionReason);
    return access;
  }

  /**
   * Society Admin suspends an active provider service access.
   */
  async suspendAccess({ accessId, reviewerUserId, societyId, suspensionReason, ipAddress, userAgent }) {
    const access = await this._resolveAndAuthorizeAccess(accessId, reviewerUserId, societyId);

    const beforeSnapshot = access.toJSON();
    access.status = SOCIETY_SERVICE_ACCESS_STATUS.SUSPENDED;
    access.suspension_reason = suspensionReason ? suspensionReason.trim() : 'Suspended by society management';
    access.reviewed_by = reviewerUserId;
    access.reviewed_at = new Date();
    await access.save();

    await audit({
      actorId: reviewerUserId,
      action: 'SOCIETY_SERVICE_ACCESS_SUSPENDED',
      targetType: 'society_service_access',
      targetId: access.id,
      beforeSnapshot,
      afterSnapshot: access.toJSON(),
      ipAddress,
      userAgent,
    });

    await this._notifyProviderOfDecision(access, 'SUSPENDED', suspensionReason);
    return access;
  }

  /**
   * Society Admin permanently revokes a provider service access.
   */
  async revokeAccess({ accessId, reviewerUserId, societyId, reason, ipAddress, userAgent }) {
    const access = await this._resolveAndAuthorizeAccess(accessId, reviewerUserId, societyId);

    const beforeSnapshot = access.toJSON();
    access.status = SOCIETY_SERVICE_ACCESS_STATUS.REVOKED;
    access.notes = reason ? reason.trim() : 'Access permanently revoked by society management';
    access.reviewed_by = reviewerUserId;
    access.reviewed_at = new Date();
    await access.save();

    await audit({
      actorId: reviewerUserId,
      action: 'SOCIETY_SERVICE_ACCESS_REVOKED',
      targetType: 'society_service_access',
      targetId: access.id,
      beforeSnapshot,
      afterSnapshot: access.toJSON(),
      ipAddress,
      userAgent,
    });

    await this._notifyProviderOfDecision(access, 'REVOKED', reason);
    return access;
  }

  /**
   * Lists access requests for a provider (their own listings).
   */
  async getProviderAccessRequests({ userId, status, page = 1, limit = 20 }) {
    const provider = await ServiceProviderProfile.findOne({
      where: { user_id: userId, is_deleted: false },
    });
    if (!provider) {
      return { total: 0, page, limit, data: [] };
    }

    const where = { provider_id: provider.id, is_deleted: false };
    if (status) where.status = status;

    const offset = (page - 1) * limit;
    const { count, rows } = await SocietyServiceAccess.findAndCountAll({
      where,
      limit,
      offset,
      order: [['requested_at', 'DESC']],
    });

    // Enrich with Society & Listing info
    const enriched = await this._enrichAccessRows(rows);
    return { total: count, page, limit, data: enriched };
  }

  /**
   * Lists access requests for a society (managed by Society Admin).
   */
  async getSocietyAccessRequests({ societyId, status, page = 1, limit = 20 }) {
    const where = { society_id: societyId, is_deleted: false };
    if (status) where.status = status;

    const offset = (page - 1) * limit;
    const { count, rows } = await SocietyServiceAccess.findAndCountAll({
      where,
      limit,
      offset,
      order: [['requested_at', 'DESC']],
    });

    const enriched = await this._enrichAccessRows(rows);
    return { total: count, page, limit, data: enriched };
  }

  /**
   * Gets specific access request by ID.
   */
  async getAccessById(accessId) {
    const access = await SocietyServiceAccess.findOne({
      where: { id: accessId, is_deleted: false },
    });
    if (!access) {
      const err = new Error('Society service access record not found.');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    const [enriched] = await this._enrichAccessRows([access]);
    return enriched;
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  async _resolveAndAuthorizeAccess(accessId, reviewerUserId, societyId) {
    const access = await SocietyServiceAccess.findOne({
      where: { id: accessId, is_deleted: false },
    });
    if (!access) {
      const err = new Error('Society service access record not found.');
      err.statusCode = 404;
      err.code = 'ACCESS_RECORD_NOT_FOUND';
      throw err;
    }

    // Enforce Tenant Boundary: Reviewer's authorized society must match access.society_id
    if (societyId && Number(access.society_id) !== Number(societyId)) {
      const err = new Error('Security Violation: You cannot review service access requests for another residential society.');
      err.statusCode = 403;
      err.code = 'CROSS_SOCIETY_FORBIDDEN';
      throw err;
    }

    return access;
  }

  async _notifySocietyAdmins(society, provider, listing, access) {
    try {
      // Find active society admins
      const admins = await SocietyMember.findAll({
        where: { society_id: society.id, role: 'admin', status: 'active', is_deleted: false },
        attributes: ['user_id'],
      });

      const recipientUserIds = admins.map(a => a.user_id).filter(Boolean);
      if (society.user_id && !recipientUserIds.includes(society.user_id)) {
        recipientUserIds.push(society.user_id);
      }

      for (const adminId of recipientUserIds) {
        await emitNotification({
          userId: adminId,
          title: 'New Service Provider Request',
          message: `${provider.business_name || 'A service provider'} has requested permission to offer "${listing.title}" inside ${society.society_name}.`,
          type: 'society_service_request',
          data: {
            access_id: access.id,
            society_id: society.id,
            service_id: listing.id,
            provider_id: provider.id,
            status: access.status,
          },
        }).catch(() => {});
      }
    } catch (_) {}
  }

  async _notifyProviderOfDecision(access, decision, reason = null) {
    try {
      const society = await SocietyProfile.findByPk(access.society_id);
      const listing = await ServiceListing.findByPk(access.service_id);

      const title = decision === 'APPROVED'
        ? 'Society Service Access Approved!'
        : `Society Service Access ${decision}`;

      const message = decision === 'APPROVED'
        ? `Congratulations! Your service "${listing?.title || 'Service'}" has been approved for residents of ${society?.society_name || 'the society'}.`
        : `Your service access request for ${society?.society_name || 'the society'} was marked as ${decision}${reason ? ': ' + reason : '.'}`;

      await emitNotification({
        userId: access.requested_by,
        title,
        message,
        type: `society_service_${decision.toLowerCase()}`,
        data: {
          access_id: access.id,
          society_id: access.society_id,
          service_id: access.service_id,
          status: decision,
          reason,
        },
      }).catch(() => {});
    } catch (_) {}
  }

  async _enrichAccessRows(rows) {
    if (!rows || rows.length === 0) return [];

    const providerIds = [...new Set(rows.map(r => r.provider_id).filter(Boolean))];
    const serviceIds = [...new Set(rows.map(r => r.service_id).filter(Boolean))];
    const societyIds = [...new Set(rows.map(r => r.society_id).filter(Boolean))];
    const userIds = [...new Set(rows.flatMap(r => [r.requested_by, r.reviewed_by]).filter(Boolean))];

    const [providers, listings, societies, users] = await Promise.all([
      ServiceProviderProfile.findAll({ where: { id: providerIds }, attributes: ['id', 'business_name', 'rating', 'completed_jobs_count'], raw: true }),
      ServiceListing.findAll({ where: { id: serviceIds }, attributes: ['id', 'title', 'price', 'duration', 'coverage_scope'], raw: true }),
      SocietyProfile.findAll({ where: { id: societyIds }, attributes: ['id', 'society_name', 'address', 'total_flats'], raw: true }),
      User.findAll({ where: { userId: userIds }, attributes: ['userId', 'userName', 'email'], raw: true }),
    ]);

    const providerMap = new Map(providers.map(p => [Number(p.id), p]));
    const listingMap = new Map(listings.map(l => [Number(l.id), l]));
    const societyMap = new Map(societies.map(s => [Number(s.id), s]));
    const userMap = new Map(users.map(u => [Number(u.userId), u]));

    return rows.map(r => {
      const data = r.toJSON ? r.toJSON() : { ...r };
      data.provider = providerMap.get(Number(r.provider_id)) || null;
      data.service = listingMap.get(Number(r.service_id)) || null;
      data.society = societyMap.get(Number(r.society_id)) || null;
      data.requester = userMap.get(Number(r.requested_by)) || null;
      data.reviewer = userMap.get(Number(r.reviewed_by)) || null;
      return data;
    });
  }
}

export default new SocietyServiceAccessService();
