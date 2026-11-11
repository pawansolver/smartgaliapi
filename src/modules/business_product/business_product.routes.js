import express from 'express';
import fs from 'fs';
import * as productController from './business_product.controller.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import {
  requireBusinessOwnership,
  requireProductOwnership,
} from '../../middleware/businessAuth.middleware.js';
import { uploadImage, uploadProductVideo } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * 1. Public storefront endpoint for residents & guests.
 * Unauthenticated: Strictly filters active/approved products and strips private cost/margins.
 */
router.get('/public/nearby', productController.getPublicProductsNearby);
router.get('/public/suggestions', productController.getPublicSearchSuggestions);
router.get('/public/item/:id', productController.getPublicProductById);
router.get('/public/:businessId', productController.getPublicProductsByBusiness);

/**
 * 2. All subsequent merchant & catalog endpoints require valid authentication!
 */
router.use(authenticate);

/**
 * 3. Product media upload & cleanup
 */
// Single primary image upload
router.post(
  '/upload-image',
  (req, res, next) => {
    const upload = uploadImage('business_products').single('image');
    if (req.query?.businessId || req.query?.business_id) {
      return requireBusinessOwnership(req, res, () => {
        upload(req, res, next);
      });
    }
    upload(req, res, (err) => {
      if (err) return next(err);
      return requireBusinessOwnership(req, res, (authErr) => {
        if (authErr) {
          if (req.file?.path) {
            fs.unlink(req.file.path, () => {});
          }
          return next(authErr);
        }
        next();
      });
    });
  },
  productController.uploadProductImage
);

// Batch gallery sub-images upload (up to 10 images)
router.post(
  '/upload-images',
  (req, res, next) => {
    const upload = uploadImage('business_products').array('images', 10);
    if (req.query?.businessId || req.query?.business_id) {
      return requireBusinessOwnership(req, res, () => {
        upload(req, res, next);
      });
    }
    upload(req, res, (err) => {
      if (err) return next(err);
      return requireBusinessOwnership(req, res, (authErr) => {
        if (authErr) {
          if (Array.isArray(req.files)) {
            req.files.forEach((f) => {
              if (f.path) fs.unlink(f.path, () => {});
            });
          }
          return next(authErr);
        }
        next();
      });
    });
  },
  productController.uploadProductImages
);

// Promotional / demo video upload (up to 50MB, mp4/webm/mov)
router.post(
  '/upload-video',
  (req, res, next) => {
    const upload = uploadProductVideo('business_products').single('video');
    if (req.query?.businessId || req.query?.business_id) {
      return requireBusinessOwnership(req, res, () => {
        upload(req, res, next);
      });
    }
    upload(req, res, (err) => {
      if (err) return next(err);
      return requireBusinessOwnership(req, res, (authErr) => {
        if (authErr) {
          if (req.file?.path) {
            fs.unlink(req.file.path, () => {});
          }
          return next(authErr);
        }
        next();
      });
    });
  },
  productController.uploadProductVideo
);

router.post('/delete-image', requireBusinessOwnership, productController.deleteProductImage);

/**
 * 4. Business-level catalog endpoints (Requires merchant ownership or platform admin)
 */
router.get('/business/:businessId/stats', requireBusinessOwnership, productController.getProductStats);
router.get('/business/:businessId', requireBusinessOwnership, productController.getProductsByBusiness);
router.post('/', requireBusinessOwnership, productController.createProduct);

/**
 * 5. Bulk catalog operations (Strictly enforces tenant ownership across all target products)
 */
router.post('/bulk-status', productController.bulkUpdateStatus);

/**
 * 6. Single product CRUD & Inventory management (Requires ownership of product's business or admin)
 */
router.get('/:id', requireProductOwnership, productController.getProductById);
router.put('/:id', requireProductOwnership, productController.updateProduct);
router.delete('/:id', requireProductOwnership, productController.deleteProduct);
router.patch('/:id/stock', requireProductOwnership, productController.adjustStock);

/**
 * 7. Administrative Approval Workflow (Strictly platform admin / super admin only)
 */
router.patch('/:id/approve', requireGlobalAdmin, productController.approveProduct);
router.patch('/:id/reject', requireGlobalAdmin, productController.rejectProduct);

export default router;
