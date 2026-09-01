import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importEnv = (overrides) =>
  spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', "import './src/config/env.js'"],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...overrides },
    },
  );

test('production configuration fails fast when required values are absent', () => {
  const result = importEnv({
    NODE_ENV: 'production',
    JWT_SECRET: '',
    DB_HOST: '',
    DB_USER: '',
    DB_NAME: '',
    CORS_ORIGINS: '',
    PUBLIC_API_ORIGIN: '',
    PUBLIC_MEDIA_ORIGIN: '',
    UPLOADS_PATH: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid production configuration/);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('complete production configuration imports successfully', () => {
  const result = importEnv({
    NODE_ENV: 'production',
    JWT_SECRET: 'test-only-secret-that-is-not-used-for-real-tokens',
    JWT_REFRESH_SECRET: 'different-test-refresh-secret-with-32-characters',
    DB_HOST: 'db.invalid',
    DB_USER: 'test',
    DB_NAME: 'test',
    CORS_ORIGINS: 'https://app.example.test',
    PUBLIC_API_ORIGIN: 'https://api.example.test',
    PUBLIC_MEDIA_ORIGIN: 'https://media.example.test',
    UPLOADS_PATH: path.join(root, '.test-uploads'),
    EMAIL_HOST: 'smtp.example.test',
    EMAIL_USER: 'test@example.test',
    EMAIL_PASS: 'test-only-password',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('production refresh secret must be strong and distinct', () => {
  const shared = 'shared-test-secret-that-is-at-least-32-characters';
  const result = importEnv({
    NODE_ENV: 'production',
    JWT_SECRET: shared,
    JWT_REFRESH_SECRET: shared,
    DB_HOST: 'db.invalid',
    DB_USER: 'test',
    DB_NAME: 'test',
    CORS_ORIGINS: 'https://app.example.test',
    PUBLIC_API_ORIGIN: 'https://api.example.test',
    PUBLIC_MEDIA_ORIGIN: 'https://media.example.test',
    UPLOADS_PATH: path.join(root, '.test-uploads'),
    EMAIL_HOST: 'smtp.example.test',
    EMAIL_USER: 'test@example.test',
    EMAIL_PASS: 'test-only-password',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_REFRESH_SECRET/);
});
