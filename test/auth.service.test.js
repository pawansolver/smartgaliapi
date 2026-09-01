import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import PendingSignup from '../src/modules/auth/pending_signup.model.js';
import RefreshToken from '../src/modules/auth/refresh_token.model.js';
import { createPassword, forgotPassword, signin } from '../src/modules/auth/auth.service.js';
import { hashValue, issueSessionToken } from '../src/modules/auth/auth.tokens.js';

test('create password completes the account without issuing authentication tokens', async () => {
  const originals = {
    transaction: sequelize.transaction,
    findPending: PendingSignup.findByPk,
    findUser: User.findOne,
    createUser: User.create,
    createRefreshToken: RefreshToken.create,
    hashPassword: bcrypt.hash,
  };
  const jti = 'signup-session-jti';
  const pending = {
    id: 'd72c1a24-a911-4af0-a30d-3883ecbeab23',
    name: 'Asha Singh',
    email: 'asha@example.com',
    mobile: '9876543210',
    consumed_at: null,
    email_verified_at: new Date(),
    session_expires_at: new Date(Date.now() + 60_000),
    session_jti_hash: hashValue(jti),
    update: async (values) => Object.assign(pending, values),
  };
  let createdPayload;
  let refreshRowsCreated = 0;
  const transaction = {
    LOCK: { UPDATE: 'UPDATE' },
    finished: null,
    commit: async () => { transaction.finished = 'commit'; },
    rollback: async () => { transaction.finished = 'rollback'; },
  };

  sequelize.transaction = async () => transaction;
  PendingSignup.findByPk = async () => pending;
  User.findOne = async () => null;
  User.create = async (values) => {
    createdPayload = values;
    return {
      userId: 42,
      userName: values.userName,
      email: values.email,
      phone: values.phone,
      userRole: values.userRole,
      is_verified: values.is_verified,
    };
  };
  RefreshToken.create = async () => {
    refreshRowsCreated += 1;
    throw new Error('create-password must not persist a refresh token');
  };
  bcrypt.hash = async () => 'hashed-password';

  try {
    const result = await createPassword({
      signupSessionToken: issueSessionToken({
        subject: pending.id,
        purpose: 'signup',
        jti,
      }),
      password: 'Strong123!',
    });

    assert.deepEqual(result, {
      user: {
        id: 42,
        name: 'Asha Singh',
        email: 'asha@example.com',
        mobile: '9876543210',
        phone: '9876543210',
        role: 'resident',
        isVerified: true,
      },
      requiresSignIn: true,
    });
    assert.equal(result.accessToken, undefined);
    assert.equal(result.refreshToken, undefined);
    assert.equal(refreshRowsCreated, 0);
    assert.equal(createdPayload.last_login, undefined);
    assert.equal(pending.consumed_at instanceof Date, true);
    assert.equal(pending.session_jti_hash, null);
    assert.equal(transaction.finished, 'commit');
  } finally {
    sequelize.transaction = originals.transaction;
    PendingSignup.findByPk = originals.findPending;
    User.findOne = originals.findUser;
    User.create = originals.createUser;
    RefreshToken.create = originals.createRefreshToken;
    bcrypt.hash = originals.hashPassword;
  }
});

test('signin uses one generic response for unknown accounts', async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;
  try {
    await assert.rejects(
      signin({ identifier: 'unknown@example.com', password: 'Wrong123!' }, {}),
      (error) => error.statusCode === 401 && error.message === 'Invalid identifier or password.',
    );
  } finally {
    User.findOne = originalFindOne;
  }
});

test('forgot password is enumeration-safe for unknown accounts', async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;
  try {
    assert.equal(await forgotPassword({ identifier: 'unknown@example.com' }), undefined);
  } finally {
    User.findOne = originalFindOne;
  }
});
