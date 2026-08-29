/**
 * Monorepo Build Script
 * Builds packages in correct dependency order using TypeScript.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PACKAGES = [
  'packages/protocol',
  'packages/pii-rules',
  'packages/test-fixtures',
  'packages/benchmark',
  'apps/server',
  'apps/extension'
];

console.log('🚀 [PrivaPilot] Building Monorepo Packages in Dependency Order...\n');

for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT_DIR, pkg);
  console.log(`📦 Building ${pkg}...`);
  try {
    execSync('npx tsc', { cwd: pkgDir, stdio: 'inherit' });
    console.log(`✓ ${pkg} built successfully.\n`);
  } catch (err) {
    console.error(`❌ Build failed for ${pkg}`);
    process.exit(1);
  }
}

console.log('🎉 [PrivaPilot] Full monorepo build completed successfully!');
