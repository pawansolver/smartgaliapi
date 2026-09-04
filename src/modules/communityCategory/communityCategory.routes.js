import express from 'express';
import * as communityCategoryController from './communityCategory.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CommunityCategories
 *   description: Community Category management APIs
 */

/** Create Category - Global Admin Only */
router.post('/', authenticate, requireGlobalAdmin, uploadImage('communityCategory').single('communityCategoryIcon'), communityCategoryController.createCommunityCategory);

/** Read Categories - Public */
router.get('/', communityCategoryController.getAllCommunityCategories);
router.get('/:id', communityCategoryController.getCommunityCategoryById);

/** Update Category - Global Admin Only */
router.put('/:id', authenticate, requireGlobalAdmin, uploadImage('communityCategory').single('communityCategoryIcon'), communityCategoryController.updateCommunityCategory);

/** Delete Category - Global Admin Only */
router.delete('/:id', authenticate, requireGlobalAdmin, communityCategoryController.deleteCommunityCategory);

export default router;
