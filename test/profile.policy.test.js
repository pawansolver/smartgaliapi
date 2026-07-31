import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import {
  activeAddressWhere,
  pendingExportWhere,
  shouldMakeAddressDefault,
} from '../src/modules/profile/profile.service.js';

test('address ownership scope excludes other, deleted, and inactive addresses', () => {
  assert.deepEqual(activeAddressWhere(91), {
    user_id: 91,
    is_deleted: false,
    is_active: true,
  });
});

test('first address or explicit selection becomes default', () => {
  assert.equal(
    shouldMakeAddressDefault({ requestedDefault: false, activeAddressCount: 0 }),
    true,
  );
  assert.equal(
    shouldMakeAddressDefault({ requestedDefault: true, activeAddressCount: 3 }),
    true,
  );
  assert.equal(
    shouldMakeAddressDefault({ requestedDefault: false, activeAddressCount: 3 }),
    false,
  );
});

test('export duplicate policy covers pending and processing requests only', () => {
  const where = pendingExportWhere(12);
  assert.equal(where.user_id, 12);
  assert.equal(where.is_deleted, false);
  assert.deepEqual(where.status[Op.in], ['pending', 'processing']);
});
