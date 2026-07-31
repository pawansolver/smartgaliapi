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
    DB_HOST: 'db.invalid',
    DB_USER: 'test',
    DB_NAME: 'test',
    CORS_ORIGINS: 'https://app.example.test',
    PUBLIC_API_ORIGIN: 'https://api.example.test',
    PUBLIC_MEDIA_ORIGIN: 'https://media.example.test',
    UPLOADS_PATH: path.join(root, '.test-uploads'),
  });
  assert.equal(result.status, 0, result.stderr);
});
