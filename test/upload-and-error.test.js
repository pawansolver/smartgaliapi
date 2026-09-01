import test from 'node:test';
import assert from 'node:assert/strict';
import multer from 'multer';
import { errorHandler } from '../src/middleware/error.middleware.js';
import {
  getImageUrl,
  isAllowedImageMime,
  safeFolder,
} from '../src/utils/fileUpload.js';
import { contentMatchesMime } from '../src/utils/chatAttachmentUpload.js';
import { normalizeMediaPayload, normalizeMediaUrl } from '../src/utils/mediaUrl.js';

const response = () => {
  const result = {};
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return body;
  };
  return result;
};

test('upload validation accepts only supported image MIME types and safe folders', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.equal(isAllowedImageMime(mime), true);
  }
  assert.equal(isAllowedImageMime('image/svg+xml'), false);
  assert.equal(safeFolder('profile_images-2'), 'profile_images-2');
  assert.throws(() => safeFolder('../outside'), /Invalid upload folder/);
});

test('image URL generation ignores client filenames and uses configured media origin', () => {
  const url = getImageUrl({}, { filename: 'server-generated.jpg' }, 'avatars');
  assert.match(url, /^https?:\/\/.+\/uploads\/avatars\/server-generated\.jpg$/);
});

test('upload errors map to safe HTTP 400 responses', (t) => {
  t.mock.method(console, 'error', () => {});
  const tooLarge = new multer.MulterError('LIMIT_FILE_SIZE');
  const sizeResponse = response();
  errorHandler(tooLarge, {}, sizeResponse, () => {});
  assert.equal(sizeResponse.statusCode, 400);
  assert.equal(sizeResponse.body.message, 'Image must be 5 MB or smaller.');

  const invalidType = new Error('Only approved images are allowed.');
  invalidType.code = 'INVALID_IMAGE_TYPE';
  const typeResponse = response();
  errorHandler(invalidType, {}, typeResponse, () => {});
  assert.equal(typeResponse.statusCode, 400);
  assert.equal(typeResponse.body.message, invalidType.message);
});

test('chat attachments require content signatures matching the declared MIME type', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(contentMatchesMime(png, 'image/png'), true);
  assert.equal(contentMatchesMime(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
  assert.equal(contentMatchesMime(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(contentMatchesMime(Buffer.from('PK\u0003\u0004'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
});

test('mobile camera and recorder attachment signatures are accepted', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const m4a = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')]);

  assert.equal(contentMatchesMime(jpeg, 'image/jpg'), true);
  assert.equal(contentMatchesMime(heic, 'image/heic'), true);
  assert.equal(contentMatchesMime(webm, 'video/webm'), true);
  assert.equal(contentMatchesMime(webm, 'audio/webm'), true);
  assert.equal(contentMatchesMime(m4a, 'audio/x-m4a'), true);
});

test('media URLs are absolute and normalized throughout response payloads', () => {
  assert.match(normalizeMediaUrl('/uploads/file.jpg'), /^https?:\/\/.+\/uploads\/file\.jpg$/);
  const payload = normalizeMediaPayload({
    media_url: '/uploads/video.mp4',
    sender: { profile: { avatarUrl: '/uploads/avatars/user.jpg' } },
  });
  assert.match(payload.media_url, /^https?:\/\//);
  assert.match(payload.sender.profile.avatarUrl, /^https?:\/\//);
});
