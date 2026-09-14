/**
 * Monorepo Build Script
 * Builds packages in strict dependency order using repository-local binaries.
 * Bundles Chrome MV3 content script into a standalone IIFE.
 * Validates all required production build artifacts.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Resolve repository-local compiler and bundler binaries
const TSC_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsc');
const ESBUILD_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'esbuild');

if (!fs.existsSync(TSC_BIN)) {
  console.error(`❌ Missing local TypeScript compiler at ${TSC_BIN}. Please run 'npm install' first.`);
  process.exit(1);
}

if (!fs.existsSync(ESBUILD_BIN)) {
  console.error(`❌ Missing local esbuild binary at ${ESBUILD_BIN}. Please run 'npm install' first.`);
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

console.log('🚀 [PrivaPilot] Building Monorepo Packages in Dependency Order...\n');

// 1. Build all packages with repository-local TypeScript compiler
for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT_DIR, pkg);
  console.log(`📦 Compiling ${pkg}...`);
  try {
    execSync(`"${TSC_BIN}"`, { cwd: pkgDir, stdio: 'inherit' });
    console.log(`✓ ${pkg} compiled successfully.\n`);
  } catch (err) {
    console.error(`❌ Compilation failed for ${pkg}`);
    process.exit(1);
  }
}

// 2. Bundle Chrome MV3 Content Script into standalone IIFE
console.log('📦 Bundling Chrome MV3 content script (IIFE)...');
const extensionDir = path.join(ROOT_DIR, 'apps', 'extension');
const contentEntry = path.join(extensionDir, 'src', 'content', 'content-main.ts');
const contentOutfile = path.join(extensionDir, 'dist', 'content', 'content-main.js');

try {
  execSync(
    `"${ESBUILD_BIN}" "${contentEntry}" --bundle --outfile="${contentOutfile}" --format=iife --target=es2022`,
    { cwd: extensionDir, stdio: 'inherit' }
  );
  console.log('✓ apps/extension content script bundled successfully as standalone IIFE.\n');
} catch (err) {
  console.error('❌ Failed to bundle apps/extension content script with esbuild');
  process.exit(1);
}

// 2b. Bundle Chrome MV3 Offscreen Host Script into standalone IIFE
console.log('📦 Bundling Chrome MV3 offscreen host script (IIFE)...');
const offscreenEntry = path.join(extensionDir, 'src', 'offscreen', 'offscreen-main.ts');
const offscreenOutfile = path.join(extensionDir, 'dist', 'offscreen', 'offscreen-main.js');

try {
  execSync(
    `"${ESBUILD_BIN}" "${offscreenEntry}" --bundle --outfile="${offscreenOutfile}" --format=iife --target=es2022`,
    { cwd: extensionDir, stdio: 'inherit' }
  );
  console.log('✓ apps/extension offscreen script bundled successfully as standalone IIFE.\n');
} catch (err) {
  console.error('❌ Failed to bundle apps/extension offscreen script with esbuild');
  process.exit(1);
}

// 2c. Bundle Chrome MV3 Background Service Worker into standalone ESM module
console.log('📦 Bundling Chrome MV3 background service worker (ESM)...');
const backgroundEntry = path.join(extensionDir, 'src', 'background', 'background-main.ts');
const backgroundOutfile = path.join(extensionDir, 'dist', 'background', 'background-main.js');

try {
  execSync(
    `"${ESBUILD_BIN}" "${backgroundEntry}" --bundle --outfile="${backgroundOutfile}" --format=esm --platform=browser --target=es2022`,
    { cwd: extensionDir, stdio: 'inherit' }
  );
  console.log('✓ apps/extension background service worker bundled successfully as standalone ESM.\n');
} catch (err) {
  console.error('❌ Failed to bundle apps/extension background service worker with esbuild');
  process.exit(1);
}

// 2d. Bundle the benchmark harness entry as an IIFE with a global name, so a
// CDP-driven benchmark can call the SHIPPED pipeline inside a real page via
// Runtime.evaluate. The content-script bundle cannot be reused for this: it is an
// IIFE with no --global-name, so it exposes nothing to evaluate against.
console.log('📦 Bundling benchmark harness entry (IIFE, global __privapilot)...');
const harnessEntry = path.join(extensionDir, 'src', 'harness', 'harness-entry.ts');
const harnessOutfile = path.join(extensionDir, 'dist', 'harness', 'harness-entry.js');

try {
  execSync(
    `"${ESBUILD_BIN}" "${harnessEntry}" --bundle --outfile="${harnessOutfile}" --format=iife --global-name=__privapilot --target=es2022`,
    { cwd: extensionDir, stdio: 'inherit' }
  );
  console.log('✓ benchmark harness entry bundled successfully.\n');
} catch (err) {
  console.error('❌ Failed to bundle benchmark harness entry with esbuild');
  process.exit(1);
}

// 2e. Bundle Chrome MV3 Sidepanel Orbloom Living 3D Visualizer (ESM)
console.log('📦 Bundling Orbloom 3D visualizer module for sidepanel (ESM)...');
const orbloomEntry = path.join(ROOT_DIR, 'node_modules', 'orbloom', 'src', 'index.js');
const orbloomOutfile = path.join(extensionDir, 'src', 'sidepanel', 'orbloom-bundle.js');

try {
  execSync(
    `"${ESBUILD_BIN}" "${orbloomEntry}" --bundle --outfile="${orbloomOutfile}" --format=esm --platform=browser --target=es2022`,
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );
  console.log('✓ apps/extension orbloom visualizer bundled successfully as standalone ESM.\n');
} catch (err) {
  console.error('❌ Failed to bundle orbloom module with esbuild');
  process.exit(1);
}

// 3. Validate All Required Production Build Artifacts
console.log('🔍 Validating production build artifacts...');

const REQUIRED_ARTIFACTS = [
  { path: 'packages/protocol/dist/index.js', desc: 'Protocol library entry' },
  { path: 'packages/protocol/dist/index.d.ts', desc: 'Protocol type definitions' },
  { path: 'packages/pii-rules/dist/index.js', desc: 'PII Rules library entry' },
  { path: 'packages/test-fixtures/dist/index.js', desc: 'Test fixtures library entry' },
  { path: 'packages/benchmark/dist/index.js', desc: 'Benchmark suite entry' },
  { path: 'apps/server/dist/index.js', desc: 'Reasoning server gateway' },
  { path: 'apps/extension/dist/background/background-main.js', desc: 'Extension background service worker' },
  { path: 'apps/extension/dist/content/content-main.js', desc: 'Bundled standalone content script (IIFE)' },
  { path: 'apps/extension/dist/offscreen/offscreen-main.js', desc: 'Bundled standalone offscreen host script (IIFE)' },
  { path: 'apps/extension/assets/models/version-RFB-320.onnx', desc: 'Locally bundled UltraFace-320 ONNX model weights' },
  { path: 'apps/extension/dist/harness/harness-entry.js', desc: 'Benchmark harness bundle (IIFE, global __privapilot)' },
  { path: 'apps/extension/src/sidepanel/orbloom-bundle.js', desc: 'Bundled standalone Orbloom 3D visualizer (ESM)' }
];

for (const artifact of REQUIRED_ARTIFACTS) {
  const fullPath = path.join(ROOT_DIR, artifact.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Build Artifact Missing: ${artifact.desc} (${artifact.path})`);
    process.exit(1);
  }
  const stat = fs.statSync(fullPath);
  if (stat.size === 0) {
    console.error(`❌ Build Artifact Empty (0 bytes): ${artifact.desc} (${artifact.path})`);
    process.exit(1);
  }
}

// Verify content script has zero unresolved bare import statements
const contentBundle = fs.readFileSync(contentOutfile, 'utf-8');
const hasUnresolvedImports = /^\s*import\s+/m.test(contentBundle);
if (hasUnresolvedImports) {
  console.error('❌ Build Validation Failed: apps/extension/dist/content/content-main.js contains unresolved ES import statements!');
  process.exit(1);
}

// Verify offscreen host bundle has zero unresolved bare import statements
const offscreenBundle = fs.readFileSync(offscreenOutfile, 'utf-8');
const hasOffscreenUnresolvedImports = /^\s*import\s+/m.test(offscreenBundle);
if (hasOffscreenUnresolvedImports) {
  console.error('❌ Build Validation Failed: apps/extension/dist/offscreen/offscreen-main.js contains unresolved ES import statements!');
  process.exit(1);
}

// Verify background worker has zero unresolved workspace import statements
const backgroundBundle = fs.readFileSync(backgroundOutfile, 'utf-8');
const hasBackgroundUnresolvedImports = /from\s+['"]@privapilot\//.test(backgroundBundle);
if (hasBackgroundUnresolvedImports) {
  console.error('❌ Build Validation Failed: apps/extension/dist/background/background-main.js contains unresolved @privapilot package imports!');
  process.exit(1);
}

console.log(`✓ All ${REQUIRED_ARTIFACTS.length} production build artifacts verified and ready for deployment.\n`);
console.log('🎉 [PrivaPilot] Full monorepo build completed successfully!');

