import fs from 'fs';

// 1. society_visitor.service.js
let visitorFile = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/society_visitor/society_visitor.service.js';
let visitorCode = fs.readFileSync(visitorFile, 'utf8');

if (!visitorCode.includes('isStaffOrAdmin')) {
  const targetStr = "    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];\n    if (!allowed.includes(status)) {\n      const err = new Error(`Invalid visitor state transition from '${currentStatus}' to '${status}'`);\n      err.statusCode = 422;\n      throw err;\n    }";
  
  const addition = `    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      const err = new Error(\`Invalid visitor state transition from '\${currentStatus}' to '\${status}'\`);
      err.statusCode = 422;
      throw err;
    }

    // Role and host authorization check
    const member = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: actorUserId, is_deleted: false, status: 'active' },
      transaction,
    });
    const role = member ? member.role : 'resident';
    const isStaffOrAdmin = ['admin', 'committee', 'security'].includes(role) || meta.isGlobalAdmin;

    // Gate operations (at_gate, checked_in, checked_out) are strictly for security/staff/admin
    if (['at_gate', 'checked_in', 'checked_out'].includes(status) && !isStaffOrAdmin) {
      const err = new Error('Only security staff or society admins can perform gate check-in/out');
      err.statusCode = 403;
      throw err;
    }

    // Flat-level approval/denial (approved, denied) can be done by host resident OR security/staff/admin
    if (['approved', 'denied'].includes(status)) {
      const isHost = Number(visitor.user_id) === Number(actorUserId);
      if (!isStaffOrAdmin && !isHost) {
        const err = new Error('You are not authorized to approve or deny visitors for another resident');
        err.statusCode = 403;
        throw err;
      }
    }`;

  if (visitorCode.includes(targetStr)) {
    visitorCode = visitorCode.replace(targetStr, addition);
    fs.writeFileSync(visitorFile, visitorCode);
    console.log('1. society_visitor.service.js updated');
  } else {
    console.log('targetStr not matched in visitorFile');
  }
} else {
  console.log('1. visitorFile already has isStaffOrAdmin');
}

// 2. event_invitation.service.js
let invFile = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/event_invitation/event_invitation.service.js';
let invCode = fs.readFileSync(invFile, 'utf8');

if (!invCode.includes('private event invitation check')) {
  const targetInv = "  if (event.status === EVENT_STATUS.CANCELLED) {\n    const error = new Error('Cannot invite users to a cancelled event');\n    error.status = 400;\n    throw error;\n  }";
  
  const replacementInv = `  if (event.status === EVENT_STATUS.CANCELLED) {
    const error = new Error('Cannot invite users to a cancelled event');
    error.status = 400;
    throw error;
  }

  // private event invitation check
  const isCreator = Number(event.created_by) === Number(inviterId);
  const isGlobalAdmin = meta.isGlobalAdmin || meta.userRole === 'admin' || meta.userRole === 'super_admin';
  if (event.visibility === 'private' && !isCreator && !isGlobalAdmin) {
    const error = new Error('Only the event creator or an admin can invite guests to a private event');
    error.status = 403;
    throw error;
  }`;

  if (invCode.includes(targetInv)) {
    invCode = invCode.replace(targetInv, replacementInv);
    fs.writeFileSync(invFile, invCode);
    console.log('2. event_invitation.service.js updated');
  } else {
    console.log('targetInv not matched in invFile');
  }
} else {
  console.log('2. invFile already has private check');
}

// 3. event_invitation.controller.js - pass user role in meta
let invCtrlFile = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/event_invitation/event_invitation.controller.js';
let invCtrlCode = fs.readFileSync(invCtrlFile, 'utf8');

if (!invCtrlCode.includes('userRole: req.user?.role')) {
  invCtrlCode = invCtrlCode.replace(
    'ip: req.ip,',
    'ip: req.ip,\n      userRole: req.user?.role,\n      isGlobalAdmin: req.user?.role === "admin" || req.user?.role === "super_admin",'
  );
  fs.writeFileSync(invCtrlFile, invCtrlCode);
  console.log('3. event_invitation.controller.js updated');
}

// 4. society_complaint.routes.js & societies.routes.js - allow creator to close own complaint
let compRouteFile = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/society_complaint/society_complaint.routes.js';
let compRouteCode = fs.readFileSync(compRouteFile, 'utf8');

if (!compRouteCode.includes('isCreatorClosing')) {
  const targetCompRoute = "router.put(\n  '/:id/status',\n  authenticate,\n  societyMutationLimiter,\n  validateParams(idParamSchema),\n  requireSocietyRole(['admin', 'committee']),\n  validateBody(updateComplaintStatusSchema),\n  societyComplaintController.updateComplaintStatus\n);";
  
  const replacementCompRoute = `router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({ where: { id: req.params.id, is_deleted: false } });
      if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
      req.body.society_id = complaint.society_id;
      req.params.societyId = complaint.society_id;
      
      const actorUserId = req.user?.id || req.user?.userId;
      const isCreatorClosing = Number(complaint.user_id) === Number(actorUserId) && req.body?.status === 'closed';
      if (isCreatorClosing) {
        req.isCreatorClosing = true;
        return next();
      }
      return requireSocietyRole(['admin', 'committee'])(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  validateBody(updateComplaintStatusSchema),
  societyComplaintController.updateComplaintStatus
);`;

  if (compRouteCode.includes("requireSocietyRole(['admin', 'committee']),\n  validateBody(updateComplaintStatusSchema)")) {
    compRouteCode = compRouteCode.replace(targetCompRoute, replacementCompRoute);
    fs.writeFileSync(compRouteFile, compRouteCode);
    console.log('4. society_complaint.routes.js updated');
  } else {
    console.log('compRoute target not matched');
  }
}

// 5. societies.routes.js - also allow creator to close own complaint at /societies/complaints/:id
let societiesRouteFile = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main/src/modules/society_profile/societies.routes.js';
let societiesRouteCode = fs.readFileSync(societiesRouteFile, 'utf8');

if (!societiesRouteCode.includes('isCreatorClosing')) {
  const targetSoc = `      if (complaint) {
        req.body.society_id = complaint.society_id;
        req.params.societyId = complaint.society_id;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  },
  requireSocietyRole(['admin', 'committee']),`;

  const repSoc = `      if (complaint) {
        req.body.society_id = complaint.society_id;
        req.params.societyId = complaint.society_id;
        const actorUserId = req.user?.id || req.user?.userId;
        if (Number(complaint.user_id) === Number(actorUserId) && req.body?.status === 'closed') {
          req.isCreatorClosing = true;
          return next();
        }
      }
      return requireSocietyRole(['admin', 'committee'])(req, res, next);
    } catch (err) {
      return next(err);
    }
  },`;

  if (societiesRouteCode.includes(targetSoc)) {
    societiesRouteCode = societiesRouteCode.replace(targetSoc, repSoc);
    fs.writeFileSync(societiesRouteFile, societiesRouteCode);
    console.log('5. societies.routes.js updated');
  } else {
    console.log('societiesRoute target not matched');
  }
}
