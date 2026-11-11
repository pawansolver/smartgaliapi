import express from 'express';
import * as businessProfileController from './business_profile.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { requireBusinessOwnership } from '../../middleware/businessAuth.middleware.js';
import { requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import SocietyBusinessAccess from './society_business_access.model.js';
import { errorResponse } from '../../utils/response.js';

const router = express.Router();

const attachBusinessIdParam = (req, res, next) => {
  req.params.businessId = req.params.id;
  return requireBusinessOwnership(req, res, next);
};

const loadSocietyAccessContext = async (req, res, next) => {
  try {
    const access = await SocietyBusinessAccess.findOne({
      where: { id: req.params.accessId, is_deleted: false },
    });
    if (!access) {
      return errorResponse(res, 404, 'Society business access request not found.');
    }
    req.societyBusinessAccess = access;
    req.params.societyId = access.society_id;
    req.body = req.body || {};
    req.body.society_id = access.society_id;
    return requireSocietyRole(['admin'])(req, res, next);
  } catch (err) {
    return next(err);
  }
};

// Create & list profiles
router.post(
  '/',
  optionalAuthenticate,
  uploadImage('business').single('logo'),
  businessProfileController.createProfile
);
router.get('/', optionalAuthenticate, businessProfileController.getAllProfiles);

// Location-aware nearby discovery & coordinate pin resolution (must precede '/:id')
router.get('/resolve-pin', optionalAuthenticate, businessProfileController.resolvePinLocation);
router.get('/nearby', optionalAuthenticate, businessProfileController.getNearbyBusinesses);
router.get('/search-suggestions', optionalAuthenticate, businessProfileController.getSearchSuggestions);

// Current owner profile
router.get('/me', authenticate, businessProfileController.getMyProfile);

// Resident Follow & Shop Updates routes (must precede '/:id')
router.get('/following/me', authenticate, businessProfileController.getFollowedBusinesses);
router.get('/following/updates', authenticate, businessProfileController.getFollowedBusinessUpdates);

// Society Admin business access moderation routes (must precede '/:id')
router.get(
  '/society-access/requests',
  authenticate,
  requireSocietyRole(['admin', 'committee']),
  businessProfileController.listSocietyBusinessRequests
);
router.post(
  '/society-access/:accessId/approve',
  authenticate,
  loadSocietyAccessContext,
  businessProfileController.approveSocietyAccess
);
router.post(
  '/society-access/:accessId/reject',
  authenticate,
  loadSocietyAccessContext,
  businessProfileController.rejectSocietyAccess
);
router.post(
  '/society-access/:accessId/suspend',
  authenticate,
  loadSocietyAccessContext,
  businessProfileController.suspendSocietyAccess
);
router.post(
  '/society-access/:accessId/revoke',
  authenticate,
  loadSocietyAccessContext,
  businessProfileController.revokeSocietyAccess
);

// Single business profile CRUD, follow & coverage
router.get('/:id', optionalAuthenticate, businessProfileController.getProfileById);
router.post('/:id/follow', authenticate, businessProfileController.followBusiness);
router.delete('/:id/follow', authenticate, businessProfileController.unfollowBusiness);
router.put(
  '/:id',
  optionalAuthenticate,
  uploadImage('business').single('logo'),
  businessProfileController.updateProfile
);
router.delete('/:id', authenticate, attachBusinessIdParam, businessProfileController.deleteProfile);

// Business location & coverage configuration routes
router.get('/:id/coverage', optionalAuthenticate, businessProfileController.getBusinessCoverage);
router.put(
  '/:id/coverage',
  authenticate,
  attachBusinessIdParam,
  businessProfileController.updateBusinessCoverage
);
router.get(
  '/:id/society-access',
  optionalAuthenticate,
  businessProfileController.listBusinessSocietyAccess
);
router.post(
  '/:id/society-access',
  authenticate,
  attachBusinessIdParam,
  businessProfileController.requestSocietyAccess
);

// Moderation & featured status actions
router.put('/:id/approve', businessProfileController.approveProfile);
router.put('/:id/reject', businessProfileController.rejectProfile);
router.put('/:id/feature', businessProfileController.featureProfile);
router.put('/:id/unfeature', businessProfileController.unfeatureProfile);

export default router;
