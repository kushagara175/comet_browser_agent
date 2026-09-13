import test from 'node:test';
import assert from 'node:assert';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { PostRedactionVerifier } from '../apps/extension/dist/sanitizer/post-redaction-verifier.js';
import { SECRET_CANARY, createMockCanvas } from '../packages/test-fixtures/dist/index.js';
import { toSanitizedNetworkPayload } from '../packages/protocol/dist/index.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';

test('Sanitizer Pipeline - Produces Verified SanitizedContext and Redacts PII', async () => {
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_unit_1',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: {},
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 2560,
      screenshotHeight: 1440,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const snapshot = {
    domElements: [
      {
        id: 'el_1',
        descriptor: { tagName: 'input', type: 'password', name: 'user_pass', value: 'Secret123!' },
        boundingClientRect: { x: 50, y: 100, width: 200, height: 30 }
      }
    ],
    textNodes: [
      {
        id: 'txt_1',
        text: 'Contact admin at sec.admin@isro.local or phone 9876543210',
        boundingClientRect: { x: 50, y: 150, width: 300, height: 20 }
      }
    ],
    imageElements: [
      {
        id: 'img_1',
        isProfilePhotoOrAvatar: true,
        boundingClientRect: { x: 10, y: 10, width: 60, height: 60 }
      }
    ],
    surfaces: [
      {
        id: 'cvs_1',
        surfaceType: 'canvas',
        isCrossOriginOrUninspectable: true,
        boundingClientRect: { x: 500, y: 200, width: 300, height: 150 }
      }
    ],
    interactiveElements: [
      {
        localId: 'el_2',
        role: 'button',
        rawName: 'Open Safe Preview',
        boundingBox: { x: 100, y: 300, width: 120, height: 40 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageTitle: 'Mission Portal Dashboard'
  };

  const testCanvas = createMockCanvas(2560, 1440);

  const sanitized = await SanitizerPipeline.sanitize(
    rawCapture,
    snapshot,
    'Find pending request and preview',
    testCanvas
  );

  assert.strictEqual(sanitized._brand, 'SanitizedContext_Verified');
  assert.strictEqual(sanitized.protocolVersion, '1.0');
  assert.strictEqual(sanitized.maskCount, 5); // 1 password + 2 text pii (email+phone) + 1 face + 1 canvas surface
  assert.strictEqual(sanitized.elements.length, 1);
  assert.strictEqual(sanitized.elements[0].localId, 'el_2');
  assert.strictEqual(sanitized.elements[0].sanitizedName, 'Open Safe Preview');
  assert.ok(sanitized.payloadDigestSha256.startsWith('sha256_'));

  // Redaction manifest consistency assertions (guaranteeing 400 prevention)
  assert.ok(sanitized.redactionManifest);
  const m = sanitized.redactionManifest;
  assert.strictEqual(m.totalRegions, 5);
  const catSum = m.categoryCounts.piiText + m.categoryCounts.domInput + m.categoryCounts.face + m.categoryCounts.surface;
  assert.strictEqual(catSum, m.totalRegions, `categoryCounts sum (${catSum}) must equal totalRegions (${m.totalRegions})`);
  const methSum = m.methodCounts.opaqueBox + m.methodCounts.spatialBlur;
  assert.strictEqual(methSum, m.totalRegions, `methodCounts sum (${methSum}) must equal totalRegions (${m.totalRegions})`);

  // Ensure network payload with this manifest passes server payload validator cleanly
  const netPayload = toSanitizedNetworkPayload(sanitized);
  const serverValidation = validateSanitizedPayload(netPayload);
  assert.strictEqual(serverValidation.isValid, true, `Server schema rejected payload: ${serverValidation.errorMessage}`);
});

test('Post-Redaction Verifier - Fails Closed on Mask Mismatch or Unscrubbed Canary', () => {
  const regions = [
    {
      id: 'reg_1',
      category: 'password',
      viewportBox: { space: 'viewportCssPixel', x: 0, y: 0, width: 10, height: 10 },
      screenshotBox: { space: 'screenshotPixel', x: 0, y: 0, width: 10, height: 10 },
      detectorSource: 'dom_semantic',
      method: 'opaque_mask'
    }
  ];

  // 1. Mask count mismatch (rendered 0 instead of 1) -> Fail closed
  const mismatchResult = PostRedactionVerifier.verify(regions, 0, [], 'Safe Title');
  assert.strictEqual(mismatchResult.isValid, false);
  assert.ok(mismatchResult.reason?.includes('Mask count mismatch'));

  // 2. Unscrubbed canary leak in title -> Fail closed
  const leakResult = PostRedactionVerifier.verify(regions, 1, [], `Title with ${SECRET_CANARY}`);
  assert.strictEqual(leakResult.isValid, false);
  assert.ok(leakResult.reason?.includes('Canary leak detected'));
});

test('Targeted PII - Detects and redacts handle @kushagracretes without affecting post text', async () => {
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_unit_handle',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: {},
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 2560,
      screenshotHeight: 1440,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const snapshot = {
    domElements: [],
    textNodes: [
      {
        id: 'txt_handle',
        text: 'Follow @kushagracretes on X for updates on AI privacy!',
        boundingClientRect: { x: 50, y: 100, width: 400, height: 30 }
      }
    ],
    imageElements: [],
    surfaces: [],
    interactiveElements: [],
    pageTitle: 'Profile Page'
  };

  const testCanvas = createMockCanvas(2560, 1440);

  const sanitized = await SanitizerPipeline.sanitize(
    rawCapture,
    snapshot,
    'Summarize visible post',
    testCanvas
  );

  assert.strictEqual(sanitized.maskCount, 1, 'Exactly one mask for the @handle');
  assert.ok(sanitized.redactionManifest);
  assert.strictEqual(sanitized.redactionManifest.categoryCounts.piiText, 1);
  assert.strictEqual(sanitized.redactionManifest.categoryCounts.face, 0);
  assert.strictEqual(sanitized.redactionManifest.categoryCounts.domInput, 0);
  assert.strictEqual(sanitized.redactionManifest.categoryCounts.surface, 0);

  const netPayload = toSanitizedNetworkPayload(sanitized);
  const serverValidation = validateSanitizedPayload(netPayload);
  assert.strictEqual(serverValidation.isValid, true);
});
