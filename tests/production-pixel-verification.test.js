/**
 * Stage B - Production Pixel Verification Gate Test Suite
 *
 * Validates requirements B1 through B9:
 * 1. Geometry rejection (NaN, infinity, non-positive, off-canvas, 1px degenerate)
 * 2. Pixel-level opaque mask verification (correct vs displaced mask)
 * 3. Matching count but unchanged pixels rejection
 * 4. DPR transforms mapping (1x and 2x)
 * 5. Spatial face blur verification with automatic opaque fallback
 * 6. Safe adjacent control preservation
 * 7. Fail-closed prevention of SanitizedContext_Verified on failure
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  validateRegionGeometry,
  computeLuminanceVariance,
  opaqueFractionOf,
  overlayFractionOf,
  verifyRegionPixelBuffer,
  verifyCanvasRedaction
} from '../apps/extension/dist/sanitizer/pixel-verifier.js';
import { MaskRenderer } from '../apps/extension/dist/sanitizer/mask-renderer.js';
import { PostRedactionVerifier } from '../apps/extension/dist/sanitizer/post-redaction-verifier.js';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { viewportToScreenshotBox } from '../packages/protocol/dist/coordinates.js';

// Helper to create mock canvas backed by Uint8ClampedArray
function createMockCanvas(width, height, initialFill = [255, 255, 255, 255]) {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = initialFill[0];
    buffer[i + 1] = initialFill[1];
    buffer[i + 2] = initialFill[2];
    buffer[i + 3] = initialFill[3];
  }

  const canvas = {
    width,
    height,
    toDataURL: (type) => `data:image/png;base64,mock_${width}x${height}`,
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillRect: (x, y, w, h) => {
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const py = y + row;
            const px = x + col;
            if (px >= 0 && px < width && py >= 0 && py < height) {
              const idx = (py * width + px) * 4;
              buffer[idx] = 15;     // #0f172a
              buffer[idx + 1] = 23;
              buffer[idx + 2] = 42;
              buffer[idx + 3] = 255;
            }
          }
        }
      },
      strokeRect: (x, y, w, h) => {},
      fillText: () => {},
      getImageData: (x, y, w, h) => {
        const sub = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const py = y + row;
            const px = x + col;
            const dstIdx = (row * w + col) * 4;
            if (px >= 0 && px < width && py >= 0 && py < height) {
              const srcIdx = (py * width + px) * 4;
              sub[dstIdx] = buffer[srcIdx];
              sub[dstIdx + 1] = buffer[srcIdx + 1];
              sub[dstIdx + 2] = buffer[srcIdx + 2];
              sub[dstIdx + 3] = buffer[srcIdx + 3];
            }
          }
        }
        return { data: sub, width: w, height: h };
      },
      putImageData: (imgData, x, y) => {
        const sub = imgData.data;
        const w = imgData.width;
        const h = imgData.height;
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const py = y + row;
            const px = x + col;
            if (px >= 0 && px < width && py >= 0 && py < height) {
              const srcIdx = (row * w + col) * 4;
              const dstIdx = (py * width + px) * 4;
              buffer[dstIdx] = sub[srcIdx];
              buffer[dstIdx + 1] = sub[srcIdx + 1];
              buffer[dstIdx + 2] = sub[srcIdx + 2];
              buffer[dstIdx + 3] = sub[srcIdx + 3];
            }
          }
        }
      }
    })
  };

  return { canvas, buffer };
}

test('Stage B: validateRegionGeometry rejects invalid geometry', () => {
  const cw = 1280;
  const ch = 800;

  // 1. Valid box
  const valid = validateRegionGeometry({ space: 'screenshotPixel', x: 100, y: 100, width: 200, height: 50 }, cw, ch);
  assert.strictEqual(valid.isValid, true);

  // 2. NaN coordinates
  const nanBox = validateRegionGeometry({ space: 'screenshotPixel', x: NaN, y: 10, width: 50, height: 20 }, cw, ch);
  assert.strictEqual(nanBox.isValid, false);
  assert.match(nanBox.reason, /Non-finite/);

  // 3. Infinity coordinates
  const infBox = validateRegionGeometry({ space: 'screenshotPixel', x: 10, y: Infinity, width: 50, height: 20 }, cw, ch);
  assert.strictEqual(infBox.isValid, false);

  // 4. Non-positive dimensions
  const zeroW = validateRegionGeometry({ space: 'screenshotPixel', x: 10, y: 10, width: 0, height: 20 }, cw, ch);
  assert.strictEqual(zeroW.isValid, false);
  assert.match(zeroW.reason, /Non-positive/);

  // 5. 1-pixel degenerate box
  const onePx = validateRegionGeometry({ space: 'screenshotPixel', x: 10, y: 10, width: 1, height: 1 }, cw, ch);
  assert.strictEqual(onePx.isValid, false);
  assert.match(onePx.reason, /Degenerate 1-pixel/);

  // 6. Completely off-canvas
  const offCanvas = validateRegionGeometry({ space: 'screenshotPixel', x: 1500, y: 900, width: 100, height: 50 }, cw, ch);
  assert.strictEqual(offCanvas.isValid, false);
  assert.match(offCanvas.reason, /outside canvas/);

  // 7. Invalid space
  const wrongSpace = validateRegionGeometry({ space: 'viewportCssPixel', x: 10, y: 10, width: 50, height: 20 }, cw, ch);
  assert.strictEqual(wrongSpace.isValid, false);
  assert.match(wrongSpace.reason, /Invalid coordinate space/);
});

test('Stage B: Correct vs deliberately displaced mask fails pixel verification', () => {
  const { canvas, buffer } = createMockCanvas(400, 300, [240, 240, 240, 255]);

  const sensitiveRegion = {
    id: 'pass_1',
    category: 'password',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 50, y: 50, width: 120, height: 30 },
    screenshotBox: { space: 'screenshotPixel', x: 50, y: 50, width: 120, height: 30 },
    detectorSource: 'dom_semantic'
  };

  // Case 1: Mask rendered at the CORRECT position
  const result1 = MaskRenderer.renderMasks(canvas, [sensitiveRegion]);
  assert.strictEqual(result1.renderedMaskCount, 1);
  assert.strictEqual(result1.regionRecords[0].success, true);

  // Verification passes
  const report1 = verifyCanvasRedaction(canvas, null, [sensitiveRegion]);
  assert.strictEqual(report1.allPassed, true);

  // Case 2: Mask deliberately displaced to (250, 200) while sensitiveRegion is at (50, 50)
  const { canvas: displacedCanvas } = createMockCanvas(400, 300, [240, 240, 240, 255]);
  // Render at displaced coordinates
  const displacedRegion = {
    ...sensitiveRegion,
    screenshotBox: { space: 'screenshotPixel', x: 250, y: 200, width: 120, height: 30 }
  };
  MaskRenderer.renderMasks(displacedCanvas, [displacedRegion]);

  // Now verify against the ACTUAL sensitive position (50, 50)
  const reportDisplaced = verifyCanvasRedaction(displacedCanvas, null, [sensitiveRegion]);
  assert.strictEqual(reportDisplaced.allPassed, false, 'Displaced mask must fail pixel verification');
  assert.match(reportDisplaced.failureReason, /failed verification/);
});

test('Stage B: Matching mask count but unchanged pixels fails verification', () => {
  const { canvas } = createMockCanvas(400, 300, [255, 255, 255, 255]);

  const region = {
    id: 'token_1',
    category: 'token',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 40, y: 40, width: 100, height: 25 },
    screenshotBox: { space: 'screenshotPixel', x: 40, y: 40, width: 100, height: 25 },
    detectorSource: 'text_pii_regex'
  };

  // Fabricate a scenario where renderedMaskCount = 1, but canvas was NOT painted
  const fakeRenderRecord = [{
    regionId: region.id,
    requestedBox: region.screenshotBox,
    clampedBox: { x: 40, y: 40, width: 100, height: 25 },
    method: 'opaque_mask',
    success: true // Lie in record, but pixels are untouched white
  }];

  const verification = PostRedactionVerifier.verify(
    [region],
    1, // count matches
    [],
    'Safe Title',
    fakeRenderRecord,
    { sanitizedCanvas: canvas }
  );

  assert.strictEqual(verification.isValid, false, 'Untouched pixels must fail pixel verification');
  assert.match(verification.reason, /Pixel verification failed/);
});

test('Stage B: DPR transforms correctly scale 1x to 2x physical pixels', () => {
  const viewportBox = {
    space: 'viewportCssPixel',
    x: 100,
    y: 50,
    width: 200,
    height: 30
  };

  const meta1x = {
    viewportWidth: 1280,
    viewportHeight: 800,
    screenshotWidth: 1280,
    screenshotHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };

  const meta2x = {
    viewportWidth: 1280,
    viewportHeight: 800,
    screenshotWidth: 2560,
    screenshotHeight: 1600,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };

  const box1x = viewportToScreenshotBox(viewportBox, meta1x, 4);
  const box2x = viewportToScreenshotBox(viewportBox, meta2x, 8);

  // At 1x: x=100 - 4 = 96, w = 200 + 8 = 208
  assert.strictEqual(box1x.x, 96);
  assert.strictEqual(box1x.width, 208);

  // At 2x: x=100*2 - 8 = 192, w = 200*2 + 16 = 416
  assert.strictEqual(box2x.x, 192);
  assert.strictEqual(box2x.width, 416);
});

test('Stage B: Face blur verification triggers opaque fallback when blur cannot be proven', () => {
  // Flat image: variance is 0 (no detail to destroy)
  const { canvas } = createMockCanvas(300, 300, [255, 204, 153, 255]); // flat skin-tone fill

  const faceRegion = {
    id: 'face_1',
    category: 'face',
    method: 'gaussian_blur',
    viewportBox: { space: 'viewportCssPixel', x: 50, y: 50, width: 80, height: 80 },
    screenshotBox: { space: 'screenshotPixel', x: 50, y: 50, width: 80, height: 80 },
    detectorSource: 'face_model'
  };

  const result = MaskRenderer.renderMasks(canvas, [faceRegion]);
  assert.strictEqual(result.renderedMaskCount, 1);
  assert.strictEqual(result.regionRecords[0].fallbackApplied, true, 'Opaque fallback must be applied when blur is unprovable');
  assert.strictEqual(result.regionRecords[0].success, true);

  // Pixel verification passes via verified fallback
  const report = verifyCanvasRedaction(canvas, null, [faceRegion]);
  assert.strictEqual(report.allPassed, true);
  assert.strictEqual(report.verdicts[0].fallbackApplied, true);
});

test('Stage B: Safe adjacent controls are preserved', () => {
  const { canvas } = createMockCanvas(400, 300, [255, 255, 255, 255]);

  const sensitiveField = {
    id: 'card_num',
    category: 'credit_card',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 50, y: 50, width: 150, height: 35 },
    screenshotBox: { space: 'screenshotPixel', x: 50, y: 50, width: 150, height: 35 },
    detectorSource: 'dom_semantic'
  };

  MaskRenderer.renderMasks(canvas, [sensitiveField]);

  // Probe adjacent safe button at (50, 120, 100, 30)
  const safeButtonProbe = {
    id: 'submit_btn',
    category: 'button',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 50, y: 120, width: 100, height: 30 },
    screenshotBox: { space: 'screenshotPixel', x: 50, y: 120, width: 100, height: 30 },
    detectorSource: 'dom_semantic'
  };

  const safeVerdict = verifyCanvasRedaction(canvas, null, [safeButtonProbe]);
  // The safe button has 0 overlay fraction (not masked) -> covered is false, meaning it is PRESERVED!
  assert.strictEqual(safeVerdict.verdicts[0].overlayFraction, 0);
  assert.strictEqual(safeVerdict.verdicts[0].covered, false, 'Safe button must not be masked');
});

test('Stage B: Fail-Closed Negative Tests - Missing or unreadable 2D context fails closed', () => {
  const dummyRegion = {
    id: 'test_reg',
    category: 'password',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 10, y: 10, width: 50, height: 20 },
    screenshotBox: { space: 'screenshotPixel', x: 10, y: 10, width: 50, height: 20 },
    detectorSource: 'dom_semantic'
  };

  // Case 1: getContext returns null
  const nullCtxCanvas = { width: 200, height: 200, getContext: () => null };
  const report1 = verifyCanvasRedaction(nullCtxCanvas, null, [dummyRegion]);
  assert.strictEqual(report1.allPassed, false);
  assert.ok(report1.failureReason?.includes('unavailable - failing closed'));

  // Case 2: getImageData is not a function
  const noGetImageCanvas = { width: 200, height: 200, getContext: () => ({ fillRect: () => {} }) };
  const report2 = verifyCanvasRedaction(noGetImageCanvas, null, [dummyRegion]);
  assert.strictEqual(report2.allPassed, false);
  assert.ok(report2.failureReason?.includes('unavailable - failing closed'));
});

test('Stage B: Fail-Closed Negative Tests - All-zero and wrong-size pixel buffers fail closed', () => {
  // Case 1: Empty pixel buffer
  const emptyBuf = new Uint8ClampedArray(0);
  const vEmpty = verifyRegionPixelBuffer(emptyBuf, null, 'opaque_mask', 'reg_empty');
  assert.strictEqual(vEmpty.covered, false);
  assert.strictEqual(vEmpty.failureReason, 'Empty pixel buffer for region');

  // Case 2: Zero-filled unrendered pixel buffer
  const zeroBuf = new Uint8ClampedArray(400); // 100 zeroed RGBA pixels
  const vZero = verifyRegionPixelBuffer(zeroBuf, null, 'opaque_mask', 'reg_zero');
  assert.strictEqual(vZero.covered, false);
  assert.ok(vZero.failureReason?.includes('Zero-filled unrendered pixel buffer'));

  // Case 3: Degenerate geometry validation
  const invalidGeom = validateRegionGeometry(
    { space: 'screenshotPixel', x: NaN, y: 10, width: 50, height: 20 },
    1920,
    1080
  );
  assert.strictEqual(invalidGeom.isValid, false);
});

test('Stage B: Fail-Closed Negative Tests - Displaced mask is rejected', () => {
  const { canvas } = createMockCanvas(400, 400, [255, 255, 255, 255]);
  const ctx = canvas.getContext('2d');

  // Secret is located at (100, 100, 50, 30)
  const targetRegion = {
    id: 'secret_box',
    category: 'api_key',
    method: 'opaque_mask',
    viewportBox: { space: 'viewportCssPixel', x: 100, y: 100, width: 50, height: 30 },
    screenshotBox: { space: 'screenshotPixel', x: 100, y: 100, width: 50, height: 30 },
    detectorSource: 'text_regex'
  };

  // Malicious / buggy renderer paints mask at (200, 200) instead of (100, 100)
  ctx.fillRect(200, 200, 50, 30);

  const report = verifyCanvasRedaction(canvas, null, [targetRegion]);
  assert.strictEqual(report.allPassed, false);
  assert.strictEqual(report.verdicts[0].covered, false);
  assert.ok(report.failureReason?.includes('failed verification'));
});

test('Stage B: Fail-Closed Integration - Verification failure halts pipeline and prevents HTTP transmission', async () => {
  let httpRequestsMade = 0;

  // Intercept global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    httpRequestsMade++;
    return { ok: true, json: async () => ({}) };
  };

  try {
    const rawCapture = {
      _brand: 'RawCapture_InternalOnly',
      captureId: 'cap_fail_verify',
      timestamp: Date.now(),
      rawScreenshotDataUrl: 'data:image/png;base64,mock',
      rawDomSummary: {},
      metadata: {
        viewportWidth: 1000,
        viewportHeight: 800,
        screenshotWidth: 1000,
        screenshotHeight: 800,
        devicePixelRatio: 1,
        scrollX: 0,
        scrollY: 0,
        captureTimestamp: Date.now()
      }
    };

    const snapshot = {
      domElements: [
        {
          id: 'sens_pwd',
          descriptor: { tagName: 'input', type: 'password', name: 'pwd', value: 'mySecret123' },
          boundingClientRect: { x: 50, y: 50, width: 100, height: 30 }
        }
      ],
      textNodes: [],
      imageElements: [],
      surfaces: [],
      interactiveElements: [],
      pageTitle: 'Test Login'
    };

    // Broken canvas where fillRect does NOT paint the pixels (unrendered buffer)
    const brokenCanvas = {
      width: 1000,
      height: 800,
      toDataURL: () => 'data:image/png;base64,broken',
      getContext: () => ({
        save: () => {},
        restore: () => {},
        fillRect: () => {}, // no-op: fails to paint mask!
        strokeRect: () => {},
        fillText: () => {},
        getImageData: (x, y, w, h) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(255), // remains white page background!
          width: w,
          height: h
        })
      })
    };

    let sanitizedContext = null;
    let thrownError = null;

    try {
      sanitizedContext = await SanitizerPipeline.sanitize(
        rawCapture,
        snapshot,
        'Sign into account',
        brokenCanvas
      );
    } catch (err) {
      thrownError = err;
    }

    // Pipeline MUST throw fail-closed
    assert.strictEqual(sanitizedContext, null, 'SanitizedContext must never be produced when pixel verification fails');
    assert.ok(thrownError, 'Pipeline must throw an error when pixel verification fails');
    assert.ok(thrownError.message.startsWith('Sanitization Blocked:'), 'Pipeline must fail closed when pixel verification fails');

    // HTTP request count MUST remain ZERO
    assert.strictEqual(httpRequestsMade, 0, 'Zero HTTP reasoning requests must be made when verification fails');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
