import express from 'express';
import * as businessCategoryController from './business_category.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';
import {
  authenticate,
  optionalAuthenticate,
  requireGlobalAdmin,
} from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * Public/Merchant Read Endpoints:
 * Dynamic Category Specification Templates, Live Search Synonyms & Category Catalog
 */
router.get('/templates', businessCategoryController.getCategoryTemplates);
router.get('/synonyms', optionalAuthenticate, businessCategoryController.listSearchSynonyms);
router.post('/synonyms', authenticate, requireGlobalAdmin, businessCategoryController.createSearchSynonym);
router.put('/synonyms/:synonymId', authenticate, requireGlobalAdmin, businessCategoryController.updateSearchSynonym);
router.delete('/synonyms/:synonymId', authenticate, requireGlobalAdmin, businessCategoryController.deleteSearchSynonym);
router.get('/search-analytics', authenticate, requireGlobalAdmin, businessCategoryController.getSearchAnalytics);
router.get('/:id/specifications', businessCategoryController.getCategorySpecifications);
router.get('/', businessCategoryController.getAllCategories);
router.get('/:id', businessCategoryController.getCategoryById);

/**
 * Web Super Admin Management Endpoints:
 * Only Platform Super Admins can create, update, or soft-delete categories
 */
router.post(
  '/',
  authenticate,
  requireGlobalAdmin,
  uploadImage('category').single('icon'),
  businessCategoryController.createCategory
);

router.put(
  '/:id',
  authenticate,
  requireGlobalAdmin,
  uploadImage('category').single('icon'),
  businessCategoryController.updateCategory
);

router.delete(
  '/:id',
  authenticate,
  requireGlobalAdmin,
  businessCategoryController.deleteCategory
);

export default router;
