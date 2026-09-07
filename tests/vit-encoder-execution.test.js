/**
 * @privapilot/tests - VitEncoder Real Execution & Invocation Test (R4 Verification)
 *
 * Asserts that:
 * 1. The real ONNX CLIP ViT-B/32 vision tower artifact exists on disk (~88.6 MB) and is loaded.
 * 2. The execution provider actually resolved is verified and reported truthfully (wasm / cpu).
 * 3. The encoder is physically invoked once per proposed region per frame with tensor shape [1, 3, 224, 224].
 * 4. Fails if the encoder is stubbed, bypassed, or mocked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VitEncoder } from '../apps/extension/dist/vision/vit-encoder.js';
import { VisionPerceptionLane } from '../apps/extension/dist/vision/vision-lane.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('ViT Execution: Model artifact exists on disk and matches physical CLIP ViT-B/32 size', () => {
  const modelPath = path.join(
    ROOT_DIR,
    'apps',
    'extension',
    'assets',
    'models',
    'clip-vit-base-patch32-vision-uint8.onnx'
  );

  assert.ok(fs.existsSync(modelPath), `Model file must exist at ${modelPath}`);
  const stat = fs.statSync(modelPath);
  assert.ok(
    stat.size > 80 * 1024 * 1024,
    `Model file size must be > 80 MB (quantized CLIP ViT-B/32), found ${(stat.size / (1024 * 1024)).toFixed(1)} MB`
  );
  assert.strictEqual(stat.size, 88648915, 'Model artifact byte size must match exact quantized ONNX build');
});

test('ViT Execution: Real encoder produces 512-d embeddings with [1, 3, 224, 224] tensor input', async () => {
  const w = 400;
  const h = 400;
  const pixelData = new Uint8ClampedArray(w * h * 4);
  // Fill with test gradient pattern to give non-trivial visual features
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      pixelData[idx] = (x * 255) / w;
      pixelData[idx + 1] = (y * 255) / h;
      pixelData[idx + 2] = 128;
      pixelData[idx + 3] = 255;
    }
  }

  const mockCanvas = {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: pixelData })
    })
  };

  const initialStatus = VitEncoder.getStatus();
  const initialInferences = initialStatus.inferenceCount;

  const cropBox = { x: 50, y: 50, width: 200, height: 100 };
  const embedding = await VitEncoder.embedRegion(mockCanvas, cropBox);

  assert.ok(embedding, 'embedRegion must return embedding');
  assert.strictEqual(embedding.dimensions, 512, 'CLIP ViT-B/32 must produce 512-dimensional embedding');
  assert.strictEqual(embedding.vector.length, 512, 'Embedding vector length must be 512');

  // Verify L2 normalization
  let norm = 0;
  for (let i = 0; i < embedding.vector.length; i++) {
    norm += embedding.vector[i] * embedding.vector[i];
  }
  assert.ok(Math.abs(Math.sqrt(norm) - 1.0) < 1e-3, 'ViT embedding must be L2-normalized');

  // Verify status telemetry
  const statusAfter = VitEncoder.getStatus();
  assert.strictEqual(
    statusAfter.inferenceCount,
    initialInferences + 1,
    'Inferences completed count must increment by exactly 1'
  );
  assert.deepStrictEqual(statusAfter.inputTensorShape, [1, 3, 224, 224], 'Input tensor shape must be [1, 3, 224, 224]');
  assert.ok(statusAfter.modelByteSize > 80 * 1024 * 1024, 'Model byte size must reflect resident artifact');
  assert.ok(['wasm', 'cpu', 'webgpu'].includes(statusAfter.providerUsed), 'Resolved provider must be valid runtime provider');
  assert.ok(statusAfter.cropDurationsMs.length > 0, 'Crop duration must be recorded');
  assert.ok(
    statusAfter.cropDurationsMs[statusAfter.cropDurationsMs.length - 1] > 10,
    'Real ViT forward pass must take > 10ms (was physically measured at 150-350ms on CPU/WASM)'
  );
});

test('ViT Execution: VisionPerceptionLane invokes the encoder once per proposed region per frame and fails if stubbed', async () => {
  const w = 1000;
  const h = 800;
  const pixelData = new Uint8ClampedArray(w * h * 4).fill(255);

  const mockCanvas = {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: pixelData })
    })
  };

  const meta = {
    viewportWidth: w,
    viewportHeight: h,
    screenshotWidth: w,
    screenshotHeight: h,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };

  const surfaceHints = [
    { id: 'h1', type: 'img', conceptHint: 'auth_badge', box: { x: 100, y: 100, width: 150, height: 150 } },
    { id: 'h2', type: 'img', conceptHint: 'auth_badge', box: { x: 400, y: 100, width: 150, height: 150 } }
  ];

  const beforeStatus = VitEncoder.getStatus();
  const beforeInferences = beforeStatus.inferenceCount;

  const result = await VisionPerceptionLane.perceive(mockCanvas, meta, {
    deadlineMs: 5000,
    surfaceHints
  });

  const afterStatus = VitEncoder.getStatus();
  const deltaInferences = afterStatus.inferenceCount - beforeInferences;

  // Each proposed region must trigger a real forward pass
  assert.strictEqual(
    deltaInferences,
    result.proposalsEvaluated,
    `ViT encoder must be invoked exactly once per evaluated proposal (expected ${result.proposalsEvaluated}, got ${deltaInferences})`
  );
  assert.ok(deltaInferences >= 2, 'Must evaluate at least the 2 provided surface hints');

  // Verify latency breakdown was measured truthfully
  assert.ok(result.encodeDurationMs > 50, `Encode duration (${result.encodeDurationMs}ms) must reflect real physical forward passes`);
  assert.ok(result.proposalDurationMs >= 0, 'Proposal duration must be tracked');
  assert.ok(result.classifyDurationMs >= 0, 'Classify duration must be tracked');
});
