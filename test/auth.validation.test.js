import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordSchema,
  normalizeEmail,
  normalizeMobile,
  signinSchema,
  signupSchema,
  verifySignupOtpSchema,
} from '../src/modules/auth/auth.validation.js';

test('auth signup normalizes identifiers and enforces Indian mobile format', () => {
  const result = signupSchema.validate({
    name: '  Asha Singh  ',
    email: ' ASHA@Example.COM ',
    mobile: '+91 98765-43210',
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    name: 'Asha Singh',
    email: 'asha@example.com',
    mobile: '9876543210',
  });
  assert.ok(signupSchema.validate({
    name: 'Asha',
    email: 'asha@example.com',
    mobile: '123',
  }).error);
  assert.equal(normalizeEmail(' A@B.COM '), 'a@b.com');
  assert.equal(normalizeMobile('91-9876543210'), '9876543210');
});

test('auth password and OTP validation reject weak or malformed credentials', () => {
  assert.equal(createPasswordSchema.validate({
    signupSessionToken: 'token',
    password: 'Strong123!',
  }).error, undefined);
  assert.ok(createPasswordSchema.validate({
    signupSessionToken: 'token',
    password: 'password',
  }).error);
  assert.ok(verifySignupOtpSchema.validate({ email: 'a@example.com', otp: '12345' }).error);
  assert.equal(signinSchema.validate({ identifier: 'a@example.com', password: 'anything' }).error, undefined);
});
