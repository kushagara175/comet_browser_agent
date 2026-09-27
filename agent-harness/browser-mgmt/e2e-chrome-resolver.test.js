/**
 * Cross-Platform Chrome Path Resolver Unit Tests
 *
 * Verifies pure resolution behavior across macOS, Linux, and Windows without requiring
 * actual browser installs in test environments.
 */

import test from 'node:test';
import assert from 'node:assert';
import { resolveChromeBinary, getPlatformCandidates } from '../../scripts/lib/chrome-launcher.mjs';

test('Chrome Resolver: Respects explicit CHROME_PATH environment variable override', () => {
  const customPath = '/custom/bin/my-chrome';
  const fakeEnv = { CHROME_PATH: customPath };
  const fakeExists = (p) => p === customPath;

  const result = resolveChromeBinary(fakeEnv, 'linux', fakeExists);

  assert.strictEqual(result.path, customPath);
  assert.strictEqual(result.source, 'env');
  assert.deepStrictEqual(result.attempted, [customPath]);
});

test('Chrome Resolver: Falls back to platform candidates if CHROME_PATH does not exist', () => {
  const nonExistentEnvPath = '/non/existent/chrome';
  const realLinuxPath = '/usr/bin/google-chrome';
  const fakeEnv = { CHROME_PATH: nonExistentEnvPath };
  const fakeExists = (p) => p === realLinuxPath;

  const result = resolveChromeBinary(fakeEnv, 'linux', fakeExists);

  assert.strictEqual(result.path, realLinuxPath);
  assert.strictEqual(result.source, 'platform-default');
  assert.ok(result.attempted.includes(nonExistentEnvPath));
  assert.ok(result.attempted.includes(realLinuxPath));
});

test('Chrome Resolver (macOS): Discovers standard macOS Chrome path', () => {
  const expectedMacPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const fakeEnv = {};
  const fakeExists = (p) => p === expectedMacPath;

  const result = resolveChromeBinary(fakeEnv, 'darwin', fakeExists);

  assert.strictEqual(result.path, expectedMacPath);
  assert.strictEqual(result.source, 'platform-default');
});

test('Chrome Resolver (Windows): Discovers standard Windows Chrome path', () => {
  const expectedWinPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const fakeEnv = { ProgramFiles: 'C:\\Program Files' };
  const fakeExists = (p) => p === expectedWinPath;

  const result = resolveChromeBinary(fakeEnv, 'win32', fakeExists);

  assert.strictEqual(result.path, expectedWinPath);
  assert.strictEqual(result.source, 'platform-default');
});

test('Chrome Resolver (Linux): Discovers standard Linux Chromium path', () => {
  const expectedLinuxPath = '/usr/bin/chromium-browser';
  const fakeEnv = {};
  const fakeExists = (p) => p === expectedLinuxPath;

  const result = resolveChromeBinary(fakeEnv, 'linux', fakeExists);

  assert.strictEqual(result.path, expectedLinuxPath);
  assert.strictEqual(result.source, 'platform-default');
});

test('Chrome Resolver: Returns null and complete attempted candidate list if no binary exists', () => {
  const fakeEnv = { CHROME_PATH: '/invalid/custom/chrome' };
  const fakeExists = () => false;

  const result = resolveChromeBinary(fakeEnv, 'darwin', fakeExists);

  assert.strictEqual(result.path, null);
  assert.strictEqual(result.source, 'not-found');
  assert.ok(result.attempted.length >= 4, 'Should attempt all standard candidate paths');
  assert.ok(result.attempted.includes('/invalid/custom/chrome'));
  assert.ok(result.attempted.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
});
