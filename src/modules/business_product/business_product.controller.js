import * as productService from './business_product.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl, removeLocalUpload } from '../../utils/fileUpload.js';

/**
 * Create a new product
 */
export const createProduct = async (req, res) => {
  try {
    const business_id = req.body.business_id || req.body.businessId;
    const name = req.body.name;
    const sku = req.body.sku || `SKU-${Date.now().toString().slice(-7)}`;

    if (!business_id || !name) {
      return errorResponse(res, 400, 'business_id and name are required fields.');
    }

    req.body.business_id = business_id;
    req.body.sku = sku;

    let mrp = req.body.mrp !== undefined ? parseFloat(req.body.mrp) : 0;
    let selling_price = req.body.selling_price !== undefined ? parseFloat(req.body.selling_price) : 0;
    if (isNaN(mrp) || mrp <= 0) mrp = selling_price;
    if (selling_price > mrp) {
      mrp = selling_price;
    }
    req.body.mrp = mrp;
    req.body.selling_price = selling_price;

    const userId = req.user?.id;
    const isGlobalAdmin = isGlobalAdminUser(req.user);

    const product = await productService.createProduct(req.body, userId, isGlobalAdmin);
    return successResponse(res, 201, 'Product created successfully.', product);
  } catch (err) {
    console.error('Error creating product:', err);
    return errorResponse(res, 400, err.message || 'Error creating product.');
  }
};

/**
 * Get products for a business with filters & pagination
 */
export const getProductsByBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return errorResponse(res, 400, 'businessId is required.');
    }

    const result = await productService.getProductsByBusiness(businessId, req.query);
    return successResponse(res, 200, 'Products fetched successfully.', result.items, {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err) {
    console.error('Error fetching business products:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching products.');
  }
};

/**
 * Get product statistics cards for business dashboard
 */
export const getProductStats = async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return errorResponse(res, 400, 'businessId is required.');
    }

    const stats = await productService.getProductStats(businessId);
    return successResponse(res, 200, 'Product statistics retrieved successfully.', stats);
  } catch (err) {
    console.error('Error fetching product stats:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching stats.');
  }
};

/**
 * Get single product by ID
 */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = req.product || await productService.getProductById(id);
    if (!product) {
      return errorResponse(res, 404, 'Product not found.');
    }
    return successResponse(res, 200, 'Product details fetched successfully.', product);
  } catch (err) {
    console.error('Error fetching product:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching product.');
  }
};

/**
 * Update product
 */
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isGlobalAdmin = isGlobalAdminUser(req.user);

    if (req.body.mrp !== undefined && req.body.selling_price !== undefined) {
      if (parseFloat(req.body.selling_price) > parseFloat(req.body.mrp)) {
        return errorResponse(res, 400, 'Selling price cannot exceed MRP.');
      }
    }

    const updated = await productService.updateProduct(id, req.body, userId, isGlobalAdmin);
    if (!updated) {
      return errorResponse(res, 404, 'Product not found.');
    }
    return successResponse(res, 200, 'Product updated successfully.', updated);
  } catch (err) {
    console.error('Error updating product:', err);
    return errorResponse(res, 400, err.message || 'Error updating product.');
  }
};

/**
 * Adjust stock transactionally
 */
export const adjustStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment, newQuantity, reason, notes } = req.body;
    const performedBy = req.user
      ? `${req.user.userName || req.user.email || 'User #' + req.user.id}`
      : 'Business Owner';

    const result = await productService.adjustStock(id, {
      adjustment,
      newQuantity,
      reason,
      performedBy,
      notes,
    });

    if (!result) {
      return errorResponse(res, 404, 'Product not found.');
    }

    return successResponse(res, 200, 'Product inventory updated successfully.', result);
  } catch (err) {
    console.error('Error adjusting stock:', err);
    return errorResponse(res, 500, err.message || 'Internal server error adjusting stock.');
  }
};

/**
 * Bulk action with cross-tenant ownership enforcement
 */
export const bulkUpdateStatus = async (req, res) => {
  try {
    const { productIds, action, extraData } = req.body;
    if (!productIds || !Array.isArray(productIds) || !action) {
      return errorResponse(res, 400, 'productIds array and action are required.');
    }

    const userId = req.user?.id;
    const isGlobalAdmin = isGlobalAdminUser(req.user);

    const result = await productService.bulkUpdateStatus(
      productIds,
      action,
      extraData || {},
      userId,
      isGlobalAdmin
    );

    return successResponse(res, 200, `Successfully applied ${action} to ${result.updated} products.`, result);
  } catch (err) {
    console.error('Error in bulk action:', err);
    if (err.message && err.message.startsWith('UNAUTHORIZED_PRODUCTS')) {
      return errorResponse(res, 403, err.message);
    }
    return errorResponse(res, 500, err.message || 'Internal server error during bulk action.');
  }
};

/**
 * Soft delete product
 */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const reason = req.body?.reason || req.query?.reason;

    const deleted = await productService.softDeleteProduct(id, reason, userId);
    if (!deleted) {
      return errorResponse(res, 404, 'Product not found.');
    }

    return successResponse(res, 200, 'Product deleted successfully.');
  } catch (err) {
    console.error('Error deleting product:', err);
    return errorResponse(res, 500, err.message || 'Internal server error deleting product.');
  }
};

/**
 * Admin endpoint: Approve product
 */
export const approveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminUserId = req.user?.id;

    const product = await productService.approveProduct(id, adminUserId, notes);
    if (!product) {
      return errorResponse(res, 404, 'Product not found.');
    }

    return successResponse(res, 200, 'Product approved successfully.', product);
  } catch (err) {
    console.error('Error approving product:', err);
    return errorResponse(res, 500, err.message || 'Error approving product.');
  }
};

/**
 * Admin endpoint: Reject product with reason
 */
export const rejectProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, 'Rejection reason is required.');
    }
    const adminUserId = req.user?.id;

    const product = await productService.rejectProduct(id, adminUserId, reason.trim());
    if (!product) {
      return errorResponse(res, 404, 'Product not found.');
    }

    return successResponse(res, 200, 'Product rejected successfully.', product);
  } catch (err) {
    console.error('Error rejecting product:', err);
    return errorResponse(res, 500, err.message || 'Error rejecting product.');
  }
};

/**
 * Public storefront listing across all nearby businesses synced by geo/location coverage.
 */
export const getPublicProductsNearby = async (req, res) => {
  try {
    const result = await productService.getPublicProductsNearby({
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
    return successResponse(res, 200, 'Nearby public products retrieved successfully.', result);
  } catch (err) {
    console.error('Error in nearby public product listing:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching nearby products.');
  }
};

/**
 * Public: Typeahead search autocomplete & spell suggestions
 */
export const getPublicSearchSuggestions = async (req, res) => {
  try {
    const result = await productService.getPublicSearchSuggestions({
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
    return successResponse(res, 200, 'Search suggestions retrieved successfully.', result);
  } catch (err) {
    console.error('Error fetching search suggestions:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching search suggestions.');
  }
};

/**
 * Public storefront listing for residents
 * Strictly returns only customer-facing attributes!
 */
export const getPublicProductsByBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const products = await productService.getPublicProductsByBusiness(businessId, req.query);
    return successResponse(res, 200, 'Public products retrieved successfully.', products);
  } catch (err) {
    console.error('Error in public product listing:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching public products.');
  }
};

/**
 * Public: Get single product details for customers/residents
 */
export const getPublicProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productService.getPublicProductById(id, req.query);
    if (!product) {
      return errorResponse(res, 404, 'Product not found or unavailable.');
    }
    return successResponse(res, 200, 'Product retrieved successfully.', product);
  } catch (err) {
    console.error('Error fetching public product details:', err);
    return errorResponse(res, 500, err.message || 'Internal server error fetching product.');
  }
};

/**
 * Upload single product image (primary image)
 */
export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file uploaded.');
    }
    const imageUrl = getImageUrl(req, req.file, 'business_products');
    return successResponse(res, 201, 'Product image uploaded successfully.', {
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    console.error('Error uploading product image:', err);
    return errorResponse(res, 500, err.message || 'Error uploading product image.');
  }
};

/**
 * Batch upload product gallery images (sub-images, up to 10 files)
 */
export const uploadProductImages = async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return errorResponse(res, 400, 'No image files uploaded.');
    }
    const uploaded = req.files.map((file) => ({
      url: getImageUrl(req, file, 'business_products'),
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    }));
    return successResponse(res, 201, 'Product gallery images uploaded successfully.', uploaded);
  } catch (err) {
    console.error('Error uploading product gallery images:', err);
    return errorResponse(res, 500, err.message || 'Error uploading product images.');
  }
};

/**
 * Upload product promotional / demo video
 */
export const uploadProductVideo = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No video file uploaded.');
    }
    const videoUrl = getImageUrl(req, req.file, 'business_products');
    return successResponse(res, 201, 'Product video uploaded successfully.', {
      url: videoUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    console.error('Error uploading product video:', err);
    return errorResponse(res, 500, err.message || 'Error uploading product video.');
  }
};

/**
 * Delete product image / orphan file cleanup
 */
export const deleteProductImage = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return errorResponse(res, 400, 'imageUrl is required.');
    }
    const removed = await removeLocalUpload(imageUrl);
    return successResponse(res, 200, 'Image deleted successfully.', { removed });
  } catch (err) {
    console.error('Error deleting product image:', err);
    return errorResponse(res, 500, err.message || 'Error deleting product image.');
  }
};
