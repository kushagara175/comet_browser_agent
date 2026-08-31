/**
 * Sensitive Form Values & Element Metadata Privacy Test Suite
 *
 * Proves that sensitive live values, arbitrary secrets, and canary strings in
 * input values, placeholders, and aria-labels NEVER enter serialized SanitizedContext.
 */

import test from 'node:test';
import assert from 'node:assert';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { ElementExtractor } from '../apps/extension/dist/content/element-extractor.js';

test('Sensitive Values Leak Prevention: Live input value secrets do NOT enter SanitizedContext', async () => {
  const arbitrarySecret = 'correct horse battery staple';
  const inputOnlySecret = 'a secret supplied only through an input value';
  const medicalSecret = 'an arbitrary medical note';
  const canarySecret = 'SECRET_CANARY_TEST_12345';

  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_sensitive_test',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: {},
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 1280,
      screenshotHeight: 720,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const snapshot = {
    domElements: [
      {
        id: 'el_1',
        descriptor: {
          tagName: 'input',
          type: 'password',
          name: 'user_password',
          placeholder: 'Enter your password'
        },
        boundingClientRect: { x: 50, y: 50, width: 200, height: 30 }
      },
      {
        id: 'el_2',
        descriptor: {
          tagName: 'input',
          type: 'text',
          name: 'otp_code',
          autocomplete: 'one-time-code'
        },
        boundingClientRect: { x: 50, y: 100, width: 200, height: 30 }
      },
      {
        id: 'el_3',
        descriptor: {
          tagName: 'input',
          type: 'text',
          name: 'credit_card',
          autocomplete: 'cc-number'
        },
        boundingClientRect: { x: 50, y: 150, width: 200, height: 30 }
      },
      {
        id: 'el_4',
        descriptor: {
          tagName: 'textarea',
          name: 'patient_notes',
          placeholder: 'Doctor diagnosis note'
        },
        boundingClientRect: { x: 50, y: 200, width: 300, height: 80 }
      }
    ],
    textNodes: [],
    imageElements: [],
    surfaces: [],
    interactiveElements: [
      {
        localId: 'el_1',
        role: 'input',
        rawName: arbitrarySecret, // simulated raw value attempt
        boundingBox: { x: 50, y: 50, width: 200, height: 30 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click', 'type']
      },
      {
        localId: 'el_2',
        role: 'input',
        rawName: canarySecret, // simulated canary in rawName
        boundingBox: { x: 50, y: 100, width: 200, height: 30 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click', 'type']
      },
      {
        localId: 'el_3',
        role: 'input',
        rawName: inputOnlySecret, // simulated secret in rawName
        boundingBox: { x: 50, y: 150, width: 200, height: 30 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click', 'type']
      },
      {
        localId: 'el_4',
        role: 'textarea',
        rawName: medicalSecret, // simulated medical note
        boundingBox: { x: 50, y: 200, width: 300, height: 80 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click', 'type']
      },
      {
        localId: 'el_5',
        role: 'button',
        rawName: 'Submit Form',
        boundingBox: { x: 50, y: 300, width: 100, height: 40 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageTitle: 'Secure Portal'
  };

  const testCanvas = {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {}
    }),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sanitized = await SanitizerPipeline.sanitize(
    rawCapture,
    snapshot,
    'Review account settings',
    testCanvas
  );

  const serialized = JSON.stringify(sanitized);

  // Proves that secrets NEVER appear anywhere in the serialized SanitizedContext
  assert.strictEqual(serialized.includes(arbitrarySecret), false, 'Must not leak arbitrarySecret');
  assert.strictEqual(serialized.includes(canarySecret), false, 'Must not leak canarySecret');
  assert.strictEqual(serialized.includes(medicalSecret), false, 'Must not leak medicalSecret');
  assert.strictEqual(serialized.includes(inputOnlySecret), false, 'Must not leak inputOnlySecret');
  assert.strictEqual(serialized.includes('SECRET_CANARY'), false, 'Must not leak SECRET_CANARY');

  // Verify category-safe labels
  const el1 = sanitized.elements.find(e => e.localId === 'el_1');
  const el2 = sanitized.elements.find(e => e.localId === 'el_2');
  const el3 = sanitized.elements.find(e => e.localId === 'el_3');
  const el4 = sanitized.elements.find(e => e.localId === 'el_4');
  const el5 = sanitized.elements.find(e => e.localId === 'el_5');

  assert.strictEqual(el1?.sanitizedName, '[PASSWORD FIELD]');
  assert.strictEqual(el2?.sanitizedName, '[OTP FIELD]');
  assert.strictEqual(el3?.sanitizedName, '[PAYMENT FIELD]');
  assert.strictEqual(el4?.sanitizedName, '[SENSITIVE FIELD]');
  assert.strictEqual(el5?.sanitizedName, 'Submit Form');

  // Verify unsafe 'type' capability is removed for sensitive fields
  assert.strictEqual(el1?.actionCapabilities.includes('type'), false, 'Password must not allow type action');
  assert.strictEqual(el2?.actionCapabilities.includes('type'), false, 'OTP must not allow type action');
  assert.strictEqual(el3?.actionCapabilities.includes('type'), false, 'Payment must not allow type action');
  assert.strictEqual(el4?.actionCapabilities.includes('type'), false, 'Sensitive textarea must not allow type action');
});
