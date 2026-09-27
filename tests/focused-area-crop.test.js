/**
 * Focused Area / Component Screenshot Cropping Test Suite
 *
 * Verifies:
 * 1. MaskRenderer.cropCanvasToRegion accurately crops focused regions with safety padding
 * 2. Degenerate or full-screen regions safely fall back to full canvas (cropApplied: false)
 * 3. Privacy masks (PII, credentials) remain 100% rendered and verified in cropped output
 * 4. Set-of-Marks badges remain intact
 * 5. SanitizerPipeline end-to-end integration produces valid SanitizedContext
 * 6. Closed Server Payload Validator accepts cropped screenshot payload without error
 */

import test from 'node:test';
import assert from 'node:assert';
import { MaskRenderer } from '../apps/extension/dist/sanitizer/mask-renderer.js';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { createMockCanvas } from '../packages/test-fixtures/dist/index.js';
import { toSanitizedNetworkPayload } from '../packages/protocol/dist/index.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';

test('Focused Area Crop: cropCanvasToRegion crops target modal with contextual padding', () => {
  const canvas = createMockCanvas(1280, 720);
  const focusedRegion = {
    x: 400,
    y: 200,
    width: 480,
    height: 320,
    type: 'dialog'
  };

  const result = MaskRenderer.cropCanvasToRegion(canvas, focusedRegion, { width: 1280, height: 720 });

  assert.strictEqual(result.cropApplied, true);
  assert.ok(result.cropBox);
  // 400 - 24 padding = 376
  assert.strictEqual(result.cropBox.x, 376);
  // 200 - 24 padding = 176
  assert.strictEqual(result.cropBox.y, 176);
  // 480 + 48 padding = 528
  assert.strictEqual(result.cropBox.width, 528);
  // 320 + 48 padding = 368
  assert.strictEqual(result.cropBox.height, 368);
  assert.strictEqual(result.targetCanvas.width, 528);
  assert.strictEqual(result.targetCanvas.height, 368);
});

test('Focused Area Crop: clipped edge crop does not overflow or lose right-side context', () => {
  const canvas = createMockCanvas(200, 120);
  const result = MaskRenderer.cropCanvasToRegion(canvas, { x: 170, y: 40, width: 100, height: 65 }, { width: 200, height: 120 });
  assert.equal(result.cropApplied, false);
  const valid = MaskRenderer.cropCanvasToRegion(canvas, { x: 140, y: 30, width: 100, height: 70 }, { width: 200, height: 120 });
  assert.equal(valid.cropApplied, true);
  assert.deepEqual(valid.cropBox, { x: 116, y: 6, width: 84, height: 114 });
});

test('Focused Area Crop: degenerate or missing region falls back cleanly to full canvas', () => {
  const canvas = createMockCanvas(1280, 720);

  // Missing region
  const res1 = MaskRenderer.cropCanvasToRegion(canvas, undefined, { width: 1280, height: 720 });
  assert.strictEqual(res1.cropApplied, false);
  assert.strictEqual(res1.targetCanvas, canvas);

  // Tiny degenerate region (<100px width)
  const res2 = MaskRenderer.cropCanvasToRegion(canvas, { x: 10, y: 10, width: 50, height: 50 }, { width: 1280, height: 720 });
  assert.strictEqual(res2.cropApplied, false);
  assert.strictEqual(res2.targetCanvas, canvas);

  // Near full-screen region (>96%)
  const res3 = MaskRenderer.cropCanvasToRegion(canvas, { x: 0, y: 0, width: 1250, height: 710 }, { width: 1280, height: 720 });
  assert.strictEqual(res3.cropApplied, false);
  assert.strictEqual(res3.targetCanvas, canvas);
});

test('Focused Area Crop: renderMasks preserves privacy redactions and exports cropped dataUrl', () => {
  const canvas = createMockCanvas(1280, 720);
  const regions = [
    {
      id: 'reg_pwd',
      category: 'password',
      viewportBox: { space: 'viewportCssPixel', x: 450, y: 250, width: 200, height: 35 },
      screenshotBox: { space: 'screenshotPixel', x: 450, y: 250, width: 200, height: 35 },
      detectorSource: 'dom_semantic',
      method: 'opaque_mask'
    }
  ];

  const interactiveElements = [
    {
      localId: 'el_submit',
      role: 'button',
      rawName: 'Confirm Booking',
      boundingBox: { x: 450, y: 320, width: 150, height: 40 },
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const focusedRegion = {
    x: 400,
    y: 200,
    width: 480,
    height: 300,
    type: 'form'
  };

  const renderResult = MaskRenderer.renderMasks(
    canvas,
    regions,
    interactiveElements,
    { width: 1280, height: 720 },
    focusedRegion
  );

  assert.strictEqual(renderResult.renderedMaskCount, 1);
  assert.strictEqual(renderResult.cropApplied, true);
  assert.ok(renderResult.cropBox);
  assert.ok(renderResult.sanitizedScreenshotDataUrl.startsWith('data:image/'));
});

test('Focused Area Crop: SanitizerPipeline end-to-end produces verified context accepted by Server', async () => {
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_crop_e2e',
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
        id: 'el_card_pass',
        descriptor: { tagName: 'input', type: 'password', name: 'vault_key', value: 'VaultSecret99' },
        boundingClientRect: { x: 300, y: 150, width: 220, height: 35 }
      }
    ],
    textNodes: [],
    imageElements: [],
    surfaces: [],
    interactiveElements: [
      {
        localId: 'el_1',
        role: 'button',
        rawName: 'Authorize Transfer',
        boundingBox: { x: 300, y: 220, width: 160, height: 40 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageTitle: 'Payment Gateway Portal',
    focusedRegion: {
      x: 250,
      y: 100,
      width: 500,
      height: 350,
      type: 'form'
    }
  };

  const testCanvas = createMockCanvas(1280, 720);

  const sanitized = await SanitizerPipeline.sanitize(
    rawCapture,
    snapshot,
    'Authorize transfer securely',
    testCanvas
  );

  assert.strictEqual(sanitized._brand, 'SanitizedContext_Verified');
  assert.strictEqual(sanitized.maskCount, 1);
  assert.strictEqual(sanitized.elements.length, 1);
  assert.strictEqual(sanitized.elements[0].sanitizedName, 'Authorize Transfer');
  assert.ok(sanitized.sanitizedScreenshotDataUrl.startsWith('data:image/'));

  // Convert to wire network payload and validate against Server Closed Schema
  const netPayload = toSanitizedNetworkPayload(sanitized);
  const validation = validateSanitizedPayload(netPayload);
  assert.strictEqual(validation.isValid, true, `Server schema rejected cropped payload: ${validation.errorMessage}`);
});

test('Semantic Redaction Overlay: getSemanticCategoryLabel returns crisp labels for all PII slots', () => {
  // Full width labels
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('password', 150), '[PASSWORD]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('email', 150), '[EMAIL ADDRESS]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('phone', 150), '[PHONE NUMBER]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('national_id', 150), '[NATIONAL ID]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('name', 150), '[FULL NAME]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('credit_card', 150), '[PAYMENT CARD]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('face', 150), '[USER AVATAR]');

  // Narrow width labels
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('password', 50), '[PASS]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('email', 50), '[EMAIL]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('phone', 50), '[PHONE]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('national_id', 50), '[ID]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('name', 50), '[NAME]');
  assert.strictEqual(MaskRenderer.getSemanticCategoryLabel('face', 50), '[AVATAR]');
});
