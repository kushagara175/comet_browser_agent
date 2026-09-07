import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualCandidateGenerator } from '../apps/extension/dist/vision/visual-candidate-generator.js';
import { PerceptionFuser, computeBoxIoU } from '../apps/extension/dist/vision/perception-fuser.js';

test('Stage E: computeBoxIoU computes exact intersection over union for normalized boxes', () => {
  // Identical boxes
  const b1 = [0.1, 0.2, 0.3, 0.4];
  assert.equal(computeBoxIoU(b1, b1), 1.0);

  // Disjoint boxes
  const bDisjoint = [0.5, 0.5, 0.8, 0.8];
  assert.equal(computeBoxIoU(b1, bDisjoint), 0.0);

  // 50% overlapping box
  // Box 1: [0, 0, 10, 10], area = 100
  // Box 2: [0, 5, 10, 15], area = 100
  // Intersection: [0, 5, 10, 10], area = 50
  // Union: 100 + 100 - 50 = 150 -> IoU = 50/150 = 1/3
  const bA = [0, 0, 10, 10];
  const bB = [0, 5, 10, 15];
  const iou = computeBoxIoU(bA, bB);
  assert.ok(Math.abs(iou - 1 / 3) < 0.001);
});

test('Stage E: VisualCandidateGenerator extracts geometric visual UI candidate proposals from canvas buffer', () => {
  const width = 400;
  const height = 300;
  const buffer = new Uint8ClampedArray(width * height * 4);

  // Background light slate
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 240;
    buffer[i + 1] = 240;
    buffer[i + 2] = 245;
    buffer[i + 3] = 255;
  }

  // Draw a high-contrast dark button at (50, 50) of size (120, 36) -> Aspect ratio 3.33 (Button)
  for (let y = 50; y < 86; y++) {
    for (let x = 50; x < 170; x++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 30;
      buffer[idx + 1] = 64;
      buffer[idx + 2] = 175;
      buffer[idx + 3] = 255;
    }
  }

  // Draw a white input box at (50, 120) of size (220, 32) -> Aspect ratio 6.875 (Input)
  for (let y = 120; y < 152; y++) {
    for (let x = 50; x < 270; x++) {
      const idx = (y * width + x) * 4;
      buffer[idx] = 15;
      buffer[idx + 1] = 23;
      buffer[idx + 2] = 42;
      buffer[idx + 3] = 255;
    }
  }

  const proposals = VisualCandidateGenerator.extractProposals(buffer, width, height);

  assert.ok(proposals.length >= 1, `Expected at least 1 proposal, got ${proposals.length}`);
  const buttonProp = proposals.find(p => p.role === 'button');
  assert.ok(buttonProp, 'Should detect button-like visual candidate');
  assert.ok(buttonProp.edgeConfidence > 0);
  assert.ok(buttonProp.bounds[0] >= 0 && buttonProp.bounds[2] <= 1.0);
  assert.ok(buttonProp.bounds[1] >= 0 && buttonProp.bounds[3] <= 1.0);
});

test('Stage E: PerceptionFuser routes DOM-only, Vision-only, and Fused modes accurately', () => {
  const domElements = [
    {
      localId: 'el_btn',
      role: 'button',
      sanitizedName: 'Sign In',
      coarseBounds: [0.1, 0.1, 0.15, 0.3], // Normalized
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_input',
      role: 'input',
      sanitizedName: '[EMAIL FIELD]',
      coarseBounds: [0.2, 0.1, 0.25, 0.4],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click', 'type']
    }
  ];

  const visualProposals = [
    {
      visualRegionId: 'vis_1',
      role: 'button',
      bounds: [0.1, 0.1, 0.15, 0.3], // Perfectly matching el_btn
      pixelBox: { x: 40, y: 30, width: 80, height: 20 },
      edgeConfidence: 0.95,
      aspectRatio: 4.0
    },
    {
      visualRegionId: 'vis_2',
      role: 'icon',
      bounds: [0.8, 0.8, 0.85, 0.85], // Visual-only icon (e.g. canvas or uninspected)
      pixelBox: { x: 320, y: 240, width: 20, height: 20 },
      edgeConfidence: 0.85,
      aspectRatio: 1.0
    }
  ];

  // 1. DOM-Only mode
  const domOnlyRes = PerceptionFuser.fuse('cap_1', domElements, visualProposals, 'dom-only');
  assert.equal(domOnlyRes.mode, 'dom-only');
  assert.equal(domOnlyRes.candidates.length, 2);
  assert.ok(domOnlyRes.candidates.every(c => c.provenance === 'dom'));
  assert.equal(domOnlyRes.visualCandidateCount, 0);

  // 2. Vision-Only mode (Non-zero grounding, pure visual candidate names)
  const visOnlyRes = PerceptionFuser.fuse('cap_1', domElements, visualProposals, 'vision-only');
  assert.equal(visOnlyRes.mode, 'vision-only');
  assert.equal(visOnlyRes.candidates.length, 2);
  assert.ok(visOnlyRes.candidates.every(c => c.provenance === 'vision'));
  assert.ok(visOnlyRes.candidates[0].sanitizedName.startsWith('[VISUAL_'));

  // 3. Fused mode (Spatial & Semantic Agreement)
  const fusedRes = PerceptionFuser.fuse('cap_1', domElements, visualProposals, 'fused');
  assert.equal(fusedRes.mode, 'fused');
  // Expected: 1 fused candidate (el_btn + vis_1) + 1 unmatched DOM (el_input) + 1 unmatched visual (vis_2) = 3 candidates
  assert.equal(fusedRes.candidates.length, 3);

  const fusedCandidate = fusedRes.candidates.find(c => c.provenance === 'fused');
  assert.ok(fusedCandidate, 'Should contain fused candidate');
  assert.equal(fusedCandidate.domLocalId, 'el_btn');
  assert.equal(fusedCandidate.visualRegionId, 'vis_1');
  assert.equal(fusedCandidate.spatialAgreement, 1.0);
  assert.equal(fusedCandidate.semanticAgreement, 1.0);
  assert.ok(fusedCandidate.confidence >= 0.9, `Fused candidate should have elevated confidence, got ${fusedCandidate.confidence}`);

  // Unmatched visual candidate preserved
  const visualCandidate = fusedRes.candidates.find(c => c.provenance === 'vision');
  assert.ok(visualCandidate, 'Should preserve unmatched visual candidate');
  assert.equal(visualCandidate.visualRegionId, 'vis_2');

  // Unmatched DOM candidate preserved
  const domCandidate = fusedRes.candidates.find(c => c.provenance === 'dom');
  assert.ok(domCandidate, 'Should preserve unmatched DOM candidate');
  assert.equal(domCandidate.domLocalId, 'el_input');
});
