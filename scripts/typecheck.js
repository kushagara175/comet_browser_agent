/**
 * @privapilot/scripts - Monorepo Typecheck Runner
 *
 * Runs `tsc --noEmit` across all packages and apps in strict dependency order.
 * Ensures compile-time contract safety and prevents type regressions without emitting build files.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TSC_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsc');

if (!fs.existsSync(TSC_BIN)) {
  console.error(`❌ Missing local TypeScript compiler at ${TSC_BIN}. Run npm install first.`);
  process.exit(1);
}

const PACKAGES = [
  'packages/protocol',
  'packages/pii-rules',
  'packages/test-fixtures',
  'packages/benchmark',
  'apps/server',
  'apps/extension'
];

console.log('🔍 [PrivaPilot] Running Monorepo TypeScript Typecheck...\n');

let totalErrors = 0;

for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT_DIR, pkg);
  process.stdout.write(`  Checking ${pkg}... `);
  try {
    execSync(`"${TSC_BIN}" --noEmit`, { cwd: pkgDir, stdio: 'pipe' });
    console.log('✓ clean');
  } catch (err) {
    totalErrors++;
    console.log('❌ type errors found:\n');
    const output = err.stdout ? err.stdout.toString() : err.message;
    console.error(output);
  }
}

if (totalErrors > 0) {
  console.error(`\n❌ Typecheck failed: ${totalErrors} package(s) have type errors.`);
  process.exit(1);
}

console.log('\n✓ All packages and applications passed TypeScript typecheck cleanly.');
