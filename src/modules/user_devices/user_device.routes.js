import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import * as controller from './user_device.controller.js';
import {
  validate,
  registerDeviceSchema,
  updateDeviceSchema,
  deactivateDeviceSchema,
} from './user_device.validation.js';

const router = express.Router();

/**
 * Flutter device / FCM token APIs.
 * Ownership is always derived from JWT (req.user.id) — never body.userId.
 */
router.use(authenticate);

router.post('/register', validate(registerDeviceSchema), controller.register);
router.get('/', controller.list);
router.put('/:deviceId', validate(updateDeviceSchema), controller.update);
router.post('/deactivate', validate(deactivateDeviceSchema), controller.deactivate);
router.delete('/:deviceId', controller.remove);

export default router;
