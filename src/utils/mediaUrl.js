import env from '../config/env.js';

const MEDIA_KEYS = new Set([
  'avatar_url', 'avatarUrl', 'bannerUrl', 'media_url', 'profile_image',
  'thumbnail_url', 'image_url',
]);

export const normalizeMediaUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return value;
  const raw = value.trim().replace(/\\/g, '/');
  try {
    return new URL(raw, `${env.publicMediaOrigin}/`).toString();
  } catch {
    return value;
  }
};

export const normalizeMediaPayload = (value, key = '') => {
  if (value == null) return value;
  if (MEDIA_KEYS.has(key) && typeof value === 'string') return normalizeMediaUrl(value);
  if (Array.isArray(value)) return value.map((item) => normalizeMediaPayload(item));
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const plain = typeof value.toJSON === 'function' ? value.toJSON() : value;
    return Object.fromEntries(
      Object.entries(plain).map(([childKey, childValue]) => [
        childKey,
        normalizeMediaPayload(childValue, childKey),
      ])
    );
  }
  return value;
};
