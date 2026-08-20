/**
 * Feed Controller — Phase 9
 */
import { successResponse } from '../../utils/response.js';
import { getHomeFeed } from './feed.service.js';

/** GET /api/v1/feed/home?limit=20&cursor=<base64> */
export const homeFeed = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit, cursor } = req.query;
    const result = await getHomeFeed(userId, { limit, cursor });
    return successResponse(res, 200, 'Feed fetched.', result);
  } catch (err) { next(err); }
};
