import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import {
  resolveOneToOneTarget,
  saveUploadedAttachment,
} from '../src/modules/chat/chat.service.js';

test('phone chat targets resolve only through the active-user query', async (t) => {
  let receivedOptions;
  t.mock.method(User, 'findOne', async (options) => {
    receivedOptions = options;
    return { userId: 42 };
  });

  const userId = await resolveOneToOneTarget({
    phoneNumber: '+91 (98765) 43210',
  });

  assert.equal(userId, 42);
  assert.equal(receivedOptions.where.is_active, true);
  assert.equal(receivedOptions.where.is_deleted, false);
  assert.equal(receivedOptions.where.status, 'active');
  assert.ok(receivedOptions.where.phone);
});

test('phone chat target validation rejects ambiguous recipient identity', async () => {
  await assert.rejects(
    resolveOneToOneTarget({ targetUserId: 2, phoneNumber: '9876543210' }),
    /exactly one/,
  );
  await assert.rejects(
    resolveOneToOneTarget({ phoneNumber: '123' }),
    /7 to 15 digits/,
  );
});

test('attachment metadata emits canonical and legacy aliases', () => {
  const result = saveUploadedAttachment({
    originalname: 'voice.m4a',
    filename: 'stored.m4a',
    mimetype: 'audio/mp4',
    size: 1234,
    sha256: 'hash',
    messageType: 'audio',
  });

  assert.equal(result.media_metadata.file_name, 'voice.m4a');
  assert.equal(result.media_metadata.size_bytes, 1234);
  assert.equal(result.media_metadata.original_name, 'voice.m4a');
  assert.equal(result.media_metadata.file_size, 1234);
});
