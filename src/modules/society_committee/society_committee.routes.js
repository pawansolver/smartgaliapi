import express from 'express';
import * as committeeCtrl from './society_committee.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';

const router = express.Router();
router.use(authenticate);

// ── Member / Resident Invitation Actions ───────────────────────────────────
router.get('/my-invitations', requireSocietyMember, committeeCtrl.getMyInvitations);
router.get('/my-memberships', requireSocietyMember, committeeCtrl.getMyMemberships);
router.get('/invitations/:invitationId', requireSocietyMember, committeeCtrl.getInvitationById);
router.post('/invitations/:invitationId/accept', requireSocietyMember, committeeCtrl.acceptInvitation);
router.post('/invitations/:invitationId/reject', requireSocietyMember, committeeCtrl.rejectInvitation);

// ── Admin-only Invitation Management ───────────────────────────────────────
router.post('/invitations/:invitationId/resend', requireSocietyRole(['admin']), committeeCtrl.resendInvitation);
router.post('/invitations/:invitationId/cancel', requireSocietyRole(['admin']), committeeCtrl.cancelInvitation);

// ── List and detail committees ─────────────────────────────────────────────
router.get('/', requireSocietyMember, committeeCtrl.getCommittees);
router.get('/search-users', requireSocietyRole(['admin', 'committee']), committeeCtrl.searchUsers);
router.get('/catalog', requireSocietyMember, committeeCtrl.getPermissionCatalog);
router.get('/:id', requireSocietyMember, committeeCtrl.getCommitteeById);

// ── Admin-only committee lifecycle ─────────────────────────────────────────
router.post('/', requireSocietyRole(['admin']), committeeCtrl.createCommittee);
router.put('/:id', requireSocietyRole(['admin']), committeeCtrl.updateCommittee);
router.delete('/:id', requireSocietyRole(['admin']), committeeCtrl.deleteCommittee);

// ── Members & Permissions ──────────────────────────────────────────────────
router.post('/:id/members', requireSocietyRole(['admin']), committeeCtrl.addMember);
router.delete('/:id/members/:userId', requireSocietyRole(['admin']), committeeCtrl.removeMember);
router.put('/:id/members/:userId/suspend', requireSocietyRole(['admin']), committeeCtrl.suspendMember);
router.put('/:id/members/:userId/revoke', requireSocietyRole(['admin']), committeeCtrl.revokeMember);
router.put('/:id/members/:userId/activate', requireSocietyRole(['admin']), committeeCtrl.activateMember);
router.post('/:id/permissions', requireSocietyRole(['admin']), committeeCtrl.assignPermissions);
router.put('/:id/permissions', requireSocietyRole(['admin']), committeeCtrl.assignPermissions);

export default router;
