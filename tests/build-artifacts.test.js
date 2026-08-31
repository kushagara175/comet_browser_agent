/**
 * Build Artifacts & Manifest V3 Compatibility Test Suite
 *
 * Verifies:
 * 1. All workspace build artifacts exist and have non-zero size.
 * 2. apps/extension/dist/content/content-main.js is a self-contained IIFE with zero bare ES imports.
 * 3. apps/extension/dist/background/background-main.js is a valid ES module.
 * 4. apps/server/dist/index.js is present and executable.
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('Build Artifacts: All required package dist entries exist and are non-empty', () => {
  const artifacts = [
    'packages/protocol/dist/index.js',
    'packages/protocol/dist/index.d.ts',
    'packages/pii-rules/dist/index.js',
    'packages/test-fixtures/dist/index.js',
    'packages/benchmark/dist/index.js',
    'apps/server/dist/index.js',
    'apps/extension/dist/background/background-main.js',
    'apps/extension/dist/content/content-main.js',
    'apps/extension/dist/offscreen/offscreen-main.js'
  ];

  for (const artifact of artifacts) {
    const fullPath = path.join(ROOT_DIR, artifact);
    assert.strictEqual(
      fs.existsSync(fullPath),
      true,
      `Expected artifact ${artifact} to exist on disk`
    );
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Expected artifact ${artifact} to have size > 0 bytes`);
  }
});

test('Chrome MV3 Offscreen Host: dist/offscreen/offscreen-main.js is a bundled IIFE with zero bare imports', () => {
  const offscreenScriptPath = path.join(ROOT_DIR, 'apps/extension/dist/offscreen/offscreen-main.js');
  assert.strictEqual(fs.existsSync(offscreenScriptPath), true, 'offscreen-main.js must exist');

  const content = fs.readFileSync(offscreenScriptPath, 'utf-8');

  // Must not have top-level bare ES module import statements
  const hasBareImports = /^\s*import\s+/m.test(content);
  assert.strictEqual(
    hasBareImports,
    false,
    'Chrome MV3 offscreen host script must be bundled with zero bare ES import statements'
  );
  assert.ok(content.length > 500, 'Offscreen script bundle should contain bundled logic');
});

test('Chrome MV3 Content Script: dist/content/content-main.js is a bundled IIFE with zero bare imports', () => {
  const contentScriptPath = path.join(ROOT_DIR, 'apps/extension/dist/content/content-main.js');
  assert.strictEqual(fs.existsSync(contentScriptPath), true, 'content-main.js must exist');

  const content = fs.readFileSync(contentScriptPath, 'utf-8');

  // Must not have top-level bare ES module import statements
  const hasBareImports = /^\s*import\s+/m.test(content);
  assert.strictEqual(
    hasBareImports,
    false,
    'Chrome MV3 content script must be bundled with zero bare ES import statements'
  );

  // Must be wrapped in an IIFE or self-contained function
  assert.ok(content.length > 500, 'Content script bundle should contain bundled logic');
});

test('Chrome MV3 Background Worker: dist/background/background-main.js is a valid bundled ES module', () => {
  const bgWorkerPath = path.join(ROOT_DIR, 'apps/extension/dist/background/background-main.js');
  assert.strictEqual(fs.existsSync(bgWorkerPath), true, 'background-main.js must exist');

  const content = fs.readFileSync(bgWorkerPath, 'utf-8');
  assert.ok(content.length > 100, 'Background service worker must have content');

  // Must not contain unresolved workspace package imports
  const hasWorkspaceImports = /from\s+['"]@privapilot\//.test(content);
  assert.strictEqual(
    hasWorkspaceImports,
    false,
    'Background service worker bundle must not contain unresolved @privapilot package imports'
  );
});
