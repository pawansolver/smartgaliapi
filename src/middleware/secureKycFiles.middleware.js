import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ProviderDocument from '../modules/service_provider_profile/provider_document.model.js';
import User from '../modules/user/user.model.js';
import { isGlobalAdminUser } from './auth.middleware.js';
import { Op } from 'sequelize';

/**
 * Middleware to secure private KYC provider documents.
 * Rejects unauthenticated requests and verifies document ownership or admin authority.
 */
export const secureProviderDocuments = async (req, res, next) => {
  try {
    const rawPath = req.path || '';
    const safeFilename = path.basename(rawPath);

    if (!safeFilename || safeFilename === '.' || safeFilename === 'provider-documents') {
      return res.status(404).json({ success: false, message: 'Document filename not specified.' });
    }

    // Prevent path traversal and arbitrary filesystem access
    if (!/^[a-zA-Z0-9._-]+$/.test(safeFilename) || safeFilename.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid or unsafe document filename.' });
    }

    // 1. Authenticate requester strictly via Authorization: Bearer <token> Header.
    // Query tokens (?token=) are rejected to prevent long-lived JWT token leakage in URL logs/referrers.
    if (req.query && req.query.token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied: URL query tokens are prohibited for private KYC documents. Use Authorization: Bearer <token> header.',
      });
    }

    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied: Authentication token required to access sensitive KYC documents.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: err.name === 'TokenExpiredError' ? 'Access denied: Token expired.' : 'Access denied: Invalid token.',
      });
    }

    const userId = decoded.id ?? decoded.userId ?? decoded.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Access denied: Invalid token payload.' });
    }

    const user = await User.findOne({
      where: {
        userId,
        is_deleted: false,
        is_active: true,
        status: 'active',
      },
      attributes: ['userId', 'userRole'],
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Access denied: User account unavailable.' });
    }

    // 2. Query database for document ownership
    const doc = await ProviderDocument.findOne({
      where: {
        file_url: {
          [Op.like]: '%' + safeFilename,
        },
        is_deleted: false,
      },
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'KYC Document not found.' });
    }

    // 3. Authorization check: Owner or Admin
    const isOwner = Number(doc.user_id) === Number(userId);
    const isAdmin = isGlobalAdminUser(user);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access this provider KYC document.',
      });
    }

    // 4. Safe file delivery
    const filePath = path.join(env.uploadsPath, 'provider-documents', safeFilename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Document file not found on storage server.' });
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline; filename="' + safeFilename + '"');
    return res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};
