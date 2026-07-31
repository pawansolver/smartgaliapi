/**
 * Backward-compatible alias for the versioned profile migration.
 * Existing deployments may continue to run `npm run setup:profile`.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  process.execPath,
  [path.join(scriptDirectory, 'migrateProfile.js'), 'up'],
  { stdio: 'inherit' }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
