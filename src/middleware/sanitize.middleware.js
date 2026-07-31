import xss from 'xss';

/**
 * Content Sanitization Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Strips XSS payloads from user-supplied text fields before they reach
 * service layer. Non-destructive: only strips HTML tags / JS.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Fields that contain user text we want to sanitize
const TEXT_FIELDS = ['message', 'name', 'description', 'nickname', 'remark', 'deletedRemarks'];

const sanitizeValue = (value) =>
  typeof value === 'string' ? xss(value, { whiteList: {}, stripIgnoreTag: true }).trim() : value;

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = { ...obj };
  for (const field of TEXT_FIELDS) {
    if (cleaned[field] !== undefined) {
      cleaned[field] = sanitizeValue(cleaned[field]);
    }
  }
  return cleaned;
};

/**
 * sanitizeBody — sanitizes req.body text fields in-place.
 */
export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Validate message payload — rejects if both message and media_url are empty.
 */
export const validateMessagePayload = (req, res, next) => {
  const { message, media_url, message_type = 'text', location_lat, location_lng } = req.body;

  if (message_type === 'location') {
    if (!location_lat || !location_lng) {
      return res.status(400).json({ success: false, message: 'location_lat and location_lng are required for location messages' });
    }
    return next();
  }

  const hasContent = (message && message.trim().length > 0) || media_url;
  if (!hasContent) {
    return res.status(400).json({ success: false, message: 'Message must have either text content or a media_url' });
  }

  // Guard against oversized messages
  if (message && message.length > 10000) {
    return res.status(400).json({ success: false, message: 'Message text cannot exceed 10,000 characters' });
  }

  next();
};
