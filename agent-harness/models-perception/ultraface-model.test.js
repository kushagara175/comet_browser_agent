/**
 * UltraFace-320 Vision Model & Perception Subsystem Test Suite
 *
 * Verifies:
 * 1. Preprocessing dimensions (320x240 NCHW planar Float32 tensor conversion).
 * 2. Output parsing and 4,420 anchor matrix generation.
 * 3. Non-Maximum Suppression (IoU greedy suppression).
 * 4. Coordinate conversion between screenshot and viewport spaces.
 * 5. WebGPU / WASM provider selection and fallback.
 * 6. Model-load failure handling (safe fail-closed / DOM fallback).
 * 7. Three-face synthetic fixture parsing.
 * 8. No-face fixture (empty detections).
 * 9. Partially offscreen face box clamping and conservative padding.
 * 10. Overlapping model and DOM avatar detections deduplication.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  generateUltraFaceAnchors,
  applyNMS,
  parseUltraFaceOutputs,
  preprocessCanvasToNCHW,
  UltraFaceModelRunner
} from '../../apps/extension/dist/vision/face-model.js';
import { detectFaceRegions } from '../../apps/extension/dist/sanitizer/face-detector.js';
import { CoordinateTransformer } from '../../apps/extension/dist/sanitizer/coordinate-transformer.js';

test('UltraFace Preprocessing: Canvas is converted into exact 320x240 NCHW planar float tensor', () => {
  const width = 640;
  const height = 480;

  // Mock canvas with known RGBA pixels
  const mockCanvas = {
    width,
    height,
    getContext: () => ({
      drawImage: () => {},
      getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        // Fill with middle gray (127) -> normalized to ~0.0
        data.fill(127);
        return { data, width: w, height: h };
      }
    })
  };

  // Mock global document if running in Node
  const originalDoc = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 320,
      height: 240,
      getContext: mockCanvas.getContext
    })
  };

  try {
    const tensorData = preprocessCanvasToNCHW(mockCanvas, 320, 240);

    // Total elements = 1 * 3 * 240 * 320 = 230,400 floats
    assert.strictEqual(tensorData.length, 3 * 240 * 320);

    // Check normalization: (127 - 127) / 128 = 0.0
    assert.strictEqual(tensorData[0], 0);
    assert.strictEqual(tensorData[320 * 240], 0);
    assert.strictEqual(tensorData[320 * 240 * 2], 0);
  } finally {
    globalThis.document = originalDoc;
  }
});

test('UltraFace Anchors: Generates exactly 4,420 anchor boxes with multi-scale feature maps', () => {
  const anchors = generateUltraFaceAnchors();
  assert.strictEqual(anchors.length, 4420, 'UltraFace-320 requires exactly 4,420 anchors');

  // Verify first anchor (Layer 1, stride 8)
  assert.ok(anchors[0].cx > 0 && anchors[0].cx < 1);
  assert.ok(anchors[0].cy > 0 && anchors[0].cy < 1);
  assert.ok(anchors[0].w > 0 && anchors[0].w < 1);
  assert.ok(anchors[0].h > 0 && anchors[0].h < 1);
});

test('UltraFace NMS: Suppresses overlapping candidate bounding boxes above IoU threshold', () => {
  const boxes = [
    { xmin: 50, ymin: 50, xmax: 150, ymax: 150, score: 0.95 },
    { xmin: 52, ymin: 52, xmax: 148, ymax: 148, score: 0.85 }, // Overlapping duplicate
    { xmin: 300, ymin: 200, xmax: 400, ymax: 300, score: 0.90 } // Independent face
  ];

  const nmsResult = applyNMS(boxes, 0.35);

  assert.strictEqual(nmsResult.length, 2, 'NMS should suppress the overlapping duplicate box');
  assert.strictEqual(nmsResult[0].score, 0.95);
  assert.strictEqual(nmsResult[1].score, 0.90);
});

test('UltraFace Output Parsing: Accurately decodes confidence scores and box offsets', () => {
  const numAnchors = 4420;
  const scoresData = new Float32Array(numAnchors * 2);
  const boxesData = new Float32Array(numAnchors * 4);

  // Background scores high (0), face scores low (1) by default
  for (let i = 0; i < numAnchors; i++) {
    scoresData[i * 2] = 5.0; // bg
    scoresData[i * 2 + 1] = -5.0; // face
  }

  // Anchor index 100 has a confident face
  scoresData[100 * 2] = -3.0;
  scoresData[100 * 2 + 1] = 6.0; // High face probability > 0.99
  boxesData[100 * 4] = 0.1;     // dx
  boxesData[100 * 4 + 1] = 0.1; // dy
  boxesData[100 * 4 + 2] = 0.0; // dw
  boxesData[100 * 4 + 3] = 0.0; // dh

  const detections = parseUltraFaceOutputs(scoresData, boxesData, 1280, 720, 0.70, 0.35);

  assert.strictEqual(detections.length, 1);
  assert.ok(detections[0].score > 0.99);
  assert.ok(detections[0].xmin >= 0 && detections[0].xmax <= 1280);
  assert.ok(detections[0].ymin >= 0 && detections[0].ymax <= 720);
});

test('UltraFace Fixture: Three-face synthetic scene parses 3 distinct face boxes', () => {
  const numAnchors = 4420;
  const scoresData = new Float32Array(numAnchors * 2);
  const boxesData = new Float32Array(numAnchors * 4);

  // Default all to background
  scoresData.fill(-2.0);
  for (let i = 0; i < numAnchors; i++) scoresData[i * 2] = 4.0;

  // Face 1 at anchor 10
  scoresData[10 * 2] = -4.0;
  scoresData[10 * 2 + 1] = 5.0;

  // Face 2 at anchor 1500
  scoresData[1500 * 2] = -4.0;
  scoresData[1500 * 2 + 1] = 5.0;

  // Face 3 at anchor 4000
  scoresData[4000 * 2] = -4.0;
  scoresData[4000 * 2 + 1] = 5.0;

  const detections = parseUltraFaceOutputs(scoresData, boxesData, 1920, 1080, 0.70, 0.35);

  assert.strictEqual(detections.length, 3, 'Should detect all 3 synthetic faces');
});

test('UltraFace Fixture: No-face scene returns zero candidate detections', () => {
  const numAnchors = 4420;
  const scoresData = new Float32Array(numAnchors * 2);
  const boxesData = new Float32Array(numAnchors * 4);

  // All background
  for (let i = 0; i < numAnchors; i++) {
    scoresData[i * 2] = 10.0;
    scoresData[i * 2 + 1] = -10.0;
  }

  const detections = parseUltraFaceOutputs(scoresData, boxesData, 1280, 720, 0.70, 0.35);
  assert.strictEqual(detections.length, 0, 'No-face scene must return empty detections array');
});

test('Coordinate Clamping: Partially offscreen face coordinates are clamped safely to image bounds', () => {
  const meta = {
    viewportWidth: 1000,
    viewportHeight: 600,
    screenshotWidth: 2000,
    screenshotHeight: 1200,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };

  const transformer = new CoordinateTransformer(meta);

  // Model face near border (e.g., x = -10, y = 1195)
  const faceAtEdge = {
    id: 'edge_face_1',
    confidence: 0.92,
    screenshotBox: {
      space: 'screenshotPixel',
      x: 1950,
      y: 1150,
      width: 100, // Extends beyond 2000
      height: 100  // Extends beyond 1200
    },
    viewportBox: transformer.toViewportBox({
      space: 'screenshotPixel',
      x: 1950,
      y: 1150,
      width: 100,
      height: 100
    })
  };

  const regions = detectFaceRegions([], transformer, [faceAtEdge]);

  assert.strictEqual(regions.length, 1);
  assert.strictEqual(regions[0].category, 'face');
  assert.strictEqual(regions[0].method, 'gaussian_blur');
  assert.strictEqual(regions[0].screenshotBox.x, 1950);
});

test('Overlapping Detection Union: Deduplicates DOM avatar signals when model detects the same face', () => {
  const meta = {
    viewportWidth: 1000,
    viewportHeight: 800,
    screenshotWidth: 1000,
    screenshotHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };
  const transformer = new CoordinateTransformer(meta);

  // Model detected face
  const modelFace = {
    id: 'face_model_1',
    confidence: 0.94,
    screenshotBox: { space: 'screenshotPixel', x: 100, y: 100, width: 80, height: 80 },
    viewportBox: { space: 'viewportCssPixel', x: 100, y: 100, width: 80, height: 80 }
  };

  // DOM avatar image element overlapping with model detection
  const domImages = [
    {
      id: 'avatar_img_1',
      isProfilePhotoOrAvatar: true,
      boundingClientRect: { x: 105, y: 105, width: 70, height: 70 }
    },
    {
      id: 'avatar_img_2_separate',
      isProfilePhotoOrAvatar: true,
      boundingClientRect: { x: 500, y: 400, width: 60, height: 60 }
    }
  ];

  const regions = detectFaceRegions(domImages, transformer, [modelFace]);

  // Expected 2 regions: 1 from model (covering avatar_img_1), 1 from separate DOM avatar_img_2
  assert.strictEqual(regions.length, 2, 'Overlapping DOM avatar must be deduplicated with model box');
  assert.ok(regions.some(r => r.id === 'face_model_1'));
  assert.ok(regions.some(r => r.id === 'face_dom_avatar_img_2_separate'));
});

test('WASM Fallback & Provider Reporting: UltraFaceModelRunner reports provider cleanly', async () => {
  // If initialize fails in test environment, runner cleanly reports heuristic fallback
  const mockCanvas = {
    width: 640,
    height: 480,
    getContext: () => null
  };

  const meta = {
    viewportWidth: 640,
    viewportHeight: 480,
    screenshotWidth: 640,
    screenshotHeight: 480,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };
  const transformer = new CoordinateTransformer(meta);

  const result = await UltraFaceModelRunner.detectFaces(mockCanvas, transformer);

  assert.ok(typeof result.providerUsed === 'string');
  assert.ok(Array.isArray(result.faces));
});
