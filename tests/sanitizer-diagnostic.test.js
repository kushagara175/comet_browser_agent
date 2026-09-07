/**
 * Sanitizer Diagnostic Classification & Privacy Sanitization Test Suite
 *
 * Verifies:
 * 1. Raw image data URLs and base64 blobs are strictly stripped.
 * 2. Web URLs are stripped to avoid leaking page locations or query params.
 * 3. Sanitizer errors are classified into safe predefined failure categories.
 * 4. Exception details are bounded to at most 120 characters.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  sanitizeErrorDetail,
  classifySanitizerError
} from '../apps/extension/dist/background/coordinator.js';

test('Sanitizer Diagnostic: Strips raw screenshot data URLs and base64 blobs', () => {
  const rawDataUrl = 'Failed to process data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== in canvas';
  const sanitized = sanitizeErrorDetail(rawDataUrl);

  assert.strictEqual(sanitized.includes('data:image/'), false, 'Must not contain data:image/');
  assert.strictEqual(sanitized.includes('base64'), false, 'Must not contain base64');
  assert.ok(sanitized.includes('[IMAGE_DATA]'), 'Must replace with [IMAGE_DATA]');
});

test('Sanitizer Diagnostic: Strips web URLs to prevent leaking query params or origins', () => {
  const rawUrlMsg = 'Failed during fetch to https://example.com/api/v1/secret?token=secret123 on target';
  const sanitized = sanitizeErrorDetail(rawUrlMsg);

  assert.strictEqual(sanitized.includes('https://'), false, 'Must not contain https://');
  assert.strictEqual(sanitized.includes('secret123'), false, 'Must not contain raw token/query param');
  assert.ok(sanitized.includes('[URL]'), 'Must replace with [URL]');
});

test('Sanitizer Diagnostic: Accurately classifies timeout, decode, verification, and canvas errors', () => {
  // Timeout
  const diagTimeout = classifySanitizerError(new Error('Offscreen document did not respond within 15000ms'));
  assert.strictEqual(diagTimeout.failureClass, 'SANITIZER_TIMEOUT');

  // Decode
  const diagDecode = classifySanitizerError(new Error('Failed to decode raw screenshot bitmap in offscreen document'));
  assert.strictEqual(diagDecode.failureClass, 'SCREENSHOT_DECODE_FAILED');

  // Canvas
  const diagCanvas = classifySanitizerError(new Error('Canvas 2D context unavailable in offscreen document host'));
  assert.strictEqual(diagCanvas.failureClass, 'CANVAS_UNAVAILABLE');

  // Verification
  const diagVerify = classifySanitizerError(new Error('Sanitization Blocked: Post-Redaction verification failed'));
  assert.strictEqual(diagVerify.failureClass, 'MASK_VERIFICATION_FAILED');

  // Offscreen
  const diagOffscreen = classifySanitizerError(new Error('Only a single offscreen document may be created'));
  assert.strictEqual(diagOffscreen.failureClass, 'OFFSCREEN_UNAVAILABLE');
});

test('Sanitizer Diagnostic: Bounds error length to at most 120 characters', () => {
  const longMsg = 'Z'.repeat(500);
  const sanitized = sanitizeErrorDetail(longMsg);
  assert.ok(sanitized.length <= 120, `Length must be <= 120, was ${sanitized.length}`);
  assert.ok(sanitized.endsWith('...'), 'Must end with ellipsis when truncated');
});
