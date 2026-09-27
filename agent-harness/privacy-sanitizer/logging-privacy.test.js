/**
 * @privapilot/tests - Logging & Diagnostics Privacy Boundary Tests
 *
 * Verifies that production logs, diagnostics, and error handlers NEVER leak:
 * - Raw screenshots or data:image base64 URLs
 * - Sensitive URLs and query strings
 * - API keys and Authorization headers
 * - Raw PII or canary strings
 */

import test from 'node:test';
import assert from 'node:assert';
import { sanitizeErrorDetail, classifySanitizerError } from '../../apps/extension/dist/background/coordinator.js';
import { sanitizeHeadersForLogging } from '../../apps/server/dist/middleware/zero-log.js';

test('Privacy Boundary: sanitizeErrorDetail scrubs base64 image data URLs', () => {
  const fakeImageDataUrl = 'Failed to decode: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== in offscreen canvas';
  const sanitized = sanitizeErrorDetail(fakeImageDataUrl);

  assert.strictEqual(sanitized.includes('data:image'), false);
  assert.strictEqual(sanitized.includes('iVBORw0KGgoAAAANSUhEUg'), false);
  assert.ok(sanitized.includes('[IMAGE_DATA]'));
});

test('Privacy Boundary: sanitizeErrorDetail scrubs web URLs and query strings', () => {
  const sensitiveUrlError = 'Navigation failed at https://portal.internal.corp/view?secret_token=sec_abc1234567890&user=alice@company.com with timeout';
  const sanitized = sanitizeErrorDetail(sensitiveUrlError);

  assert.strictEqual(sanitized.includes('https://'), false);
  assert.strictEqual(sanitized.includes('secret_token'), false);
  assert.strictEqual(sanitized.includes('alice@company.com'), false);
  assert.ok(sanitized.includes('[URL]'));
});

test('Privacy Boundary: sanitizeErrorDetail strips long hex tokens/hashes and bounds length', () => {
  const longHexMsg = 'Invalid session key 4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a exceeded limit';
  const sanitized = sanitizeErrorDetail(longHexMsg);

  assert.strictEqual(sanitized.includes('4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c'), false);
  assert.ok(sanitized.includes('[HASH]'));
  assert.ok(sanitized.length <= 120);
});

test('Privacy Boundary: classifySanitizerError returns safe technical reason code without payload leakage', () => {
  const rawLeakErr = new Error('Offscreen document timed out while processing data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD... on https://internal.dev/app');
  const diagnostic = classifySanitizerError(rawLeakErr);

  assert.strictEqual(diagnostic.failureClass, 'SANITIZER_TIMEOUT');
  assert.strictEqual(diagnostic.sanitizedDetail.includes('data:image'), false);
  assert.strictEqual(diagnostic.sanitizedDetail.includes('/9j/4AAQSkZJRg'), false);
  assert.strictEqual(diagnostic.sanitizedDetail.includes('https://'), false);
});

test('Privacy Boundary: sanitizeHeadersForLogging strips authorization and api-key headers', () => {
  const rawHeaders = {
    'content-type': 'application/json',
    'authorization': 'Bearer sk-or-v1-secret-openrouter-key-999999999',
    'x-api-key': 'super-secret-azure-api-key-12345',
    'cookie': 'session_id=confidential_cookie_value_here',
    'host': 'localhost:4501'
  };

  const sanitized = sanitizeHeadersForLogging(rawHeaders);

  assert.strictEqual(sanitized['content-type'], 'application/json');
  assert.strictEqual(sanitized['host'], 'localhost:4501');
  assert.strictEqual(sanitized['authorization'], '[REDACTED_HEADER]');
  assert.strictEqual(sanitized['x-api-key'], '[REDACTED_HEADER]');
  assert.strictEqual(sanitized['cookie'], '[REDACTED_HEADER]');
  assert.strictEqual(JSON.stringify(sanitized).includes('sk-or-v1-secret'), false);
  assert.strictEqual(JSON.stringify(sanitized).includes('super-secret-azure'), false);
  assert.strictEqual(JSON.stringify(sanitized).includes('confidential_cookie'), false);
});
