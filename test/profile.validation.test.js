import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressSchema,
  changePasswordSchema,
  dataExportRequestSchema,
  deleteAccountSchema,
  notificationPreferencesSchema,
  privacySettingsSchema,
  supportTicketSchema,
  updateProfileSchema,
  validate,
} from '../src/modules/profile/profile.validation.js';

test('profile update accepts bounded coordinates and rejects empty or invalid data', () => {
  assert.equal(updateProfileSchema.validate({ fullName: 'Asha', latitude: 30.7 }).error, undefined);
  assert.ok(updateProfileSchema.validate({}).error);
  assert.ok(updateProfileSchema.validate({ email: 'not-an-email' }).error);
  assert.ok(updateProfileSchema.validate({ latitude: 91 }).error);
});

test('address and preference schemas enforce supported values', () => {
  assert.equal(addressSchema.validate({ label: 'Home', isDefault: true }).error, undefined);
  assert.ok(addressSchema.validate({ longitude: 181 }).error);
  assert.equal(
    notificationPreferencesSchema.validate({
      pushNotifications: { visitorAlerts: false },
    }).error,
    undefined,
  );
  assert.ok(notificationPreferencesSchema.validate({ pushNotifications: { unknown: true } }).error);
  assert.ok(privacySettingsSchema.validate({ profileVisibility: 'private' }).error);
});

test('support, export, password and deletion payload policies are validated', () => {
  assert.equal(
    supportTicketSchema.validate({
      category: 'Account',
      description: 'I need help with my profile.',
    }).error,
    undefined,
  );
  assert.ok(supportTicketSchema.validate({ category: 'A', description: 'short' }).error);
  assert.equal(dataExportRequestSchema.validate({}).error, undefined);
  assert.ok(dataExportRequestSchema.validate({ format: 'csv' }).error);
  assert.equal(changePasswordSchema.validate({ newPassword: 'Valid123!' }).error, undefined);
  assert.ok(changePasswordSchema.validate({ newPassword: 'password' }).error);
  assert.ok(deleteAccountSchema.validate({ confirm: false }).error);
});

test('validation middleware returns all Joi failures and strips unknown fields', () => {
  const req = { body: { category: 'x', description: 'short', ignored: true } };
  let status;
  let body;
  const res = {
    status(value) {
      status = value;
      return this;
    },
    json(value) {
      body = value;
      return value;
    },
  };

  validate(supportTicketSchema)(req, res, () => assert.fail('next must not run'));
  assert.equal(status, 422);
  assert.equal(body.message, 'Validation failed');
  assert.equal(body.errors.length, 2);
});
