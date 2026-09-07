/**
 * Explicit Auditable Multimodal Fusion Policy Test Suite
 *
 * Verifies:
 * 1. IoU >= 0.50 threshold prevents child-container false merges while correctly matching true overlapping elements.
 * 2. DOM wins on: input type, ARIA role, form semantics, tab order, disabled state.
 * 3. Vision wins on: canvas controls, image concept badges, visual layer occlusion, primary CTA salience.
 * 4. Disagreement policy: all lane conflicts are logged to SceneGraph.conflicts (never silently dropped).
 * 5. Perception modes: 'dom-only', 'vision-only', and 'fused'.
 */

import test from 'node:test';
import assert from 'node:assert';
import { FusionPolicy, computeIoU } from '../apps/extension/dist/vision/fusion-policy.js';

const mockMeta = {
  viewportWidth: 1000,
  viewportHeight: 800,
  screenshotWidth: 1000,
  screenshotHeight: 800,
  devicePixelRatio: 1,
  scrollX: 0,
  scrollY: 0,
  captureTimestamp: Date.now()
};

test('IoU Threshold: 0.50 avoids false child-container merges', () => {
  // Container card: 400x200 at (100, 100) -> Area = 80,000
  // Child button: 120x40 at (140, 180) -> Area = 4,800
  // Intersection = 4,800. Union = 80,000. IoU = 4800 / 80000 = 0.06
  const containerBox = { x: 100, y: 100, width: 400, height: 200 };
  const childButtonBox = { x: 140, y: 180, width: 120, height: 40 };

  const iou = computeIoU(containerBox, childButtonBox);
  assert.ok(iou < 0.50, `Child/container IoU (${iou}) must be < 0.50`);

  const domCandidates = [
    {
      id: 'card_container',
      role: 'generic',
      name: 'Card Container',
      boundingBox: containerBox
    }
  ];

  const visionCandidates = [
    {
      ref: 'v_btn_1',
      bbox: [0.14, 0.225, 0.12, 0.05], // normalized 140/1000, 180/800, 120/1000, 40/800
      role: 'button',
      affordances: ['clickable'],
      confidence: 0.88,
      provenance: 'vision',
      rawPixelBox: childButtonBox
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused', iouThreshold: 0.50 });

  // They must NOT merge into a single fused element
  const fusedElement = sceneGraph.elements.find((el) => el.provenance === 'fused');
  assert.strictEqual(fusedElement, undefined, 'Container card and inner button must not falsely merge');

  // Both elements are preserved according to their respective provenance
  assert.ok(sceneGraph.elements.some((el) => el.ref === 'card_container' && el.provenance === 'dom'));
  assert.ok(sceneGraph.elements.some((el) => el.ref === 'v_btn_1' && el.provenance === 'vision'));
});

test('IoU Matching: True element overlap merges into single fused element', () => {
  const domBox = { x: 200, y: 300, width: 150, height: 50 };
  const visBox = { x: 205, y: 298, width: 148, height: 52 };

  const iou = computeIoU(domBox, visBox);
  assert.ok(iou >= 0.80, `True element overlap IoU (${iou}) should be >= 0.80`);

  const domCandidates = [
    {
      id: 'el_login_btn',
      role: 'button',
      name: 'Sign In',
      boundingBox: domBox,
      confidence: 0.92
    }
  ];

  const visionCandidates = [
    {
      ref: 'v_el_1',
      bbox: [0.205, 0.372, 0.148, 0.065],
      role: 'button',
      affordances: ['clickable'],
      confidence: 0.89,
      provenance: 'vision',
      rawPixelBox: visBox
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused' });

  assert.strictEqual(sceneGraph.elements.length, 1);
  const fused = sceneGraph.elements[0];
  assert.strictEqual(fused.ref, 'el_login_btn', 'Fused element preserves DOM ID for action execution');
  assert.strictEqual(fused.provenance, 'fused');
  assert.strictEqual(fused.role, 'button');
  assert.ok(fused.confidence > 0.90, 'Fused element confidence reflects mutual agreement');
});

test('Disagreement & Division: DOM wins on input type, ARIA role, and disabled state', () => {
  const box = { x: 100, y: 100, width: 200, height: 40 };

  const domCandidates = [
    {
      id: 'el_pwd',
      role: 'input',
      name: 'Password',
      boundingBox: box,
      inputType: 'password',
      disabled: true,
      confidence: 0.90
    }
  ];

  const visionCandidates = [
    {
      ref: 'v_1',
      bbox: [0.1, 0.125, 0.2, 0.05],
      role: 'button', // Vision classifier misidentified the box
      affordances: ['clickable'],
      confidence: 0.70,
      provenance: 'vision',
      rawPixelBox: box
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused' });

  // DOM wins
  assert.strictEqual(sceneGraph.elements.length, 1);
  assert.strictEqual(sceneGraph.elements[0].role, 'input', 'DOM semantic priority wins on form control role');

  // Conflict is audited
  assert.strictEqual(sceneGraph.conflicts.length, 1);
  const conflict = sceneGraph.conflicts[0];
  assert.strictEqual(conflict.ref, 'el_pwd');
  assert.strictEqual(conflict.resolvedTo, 'dom');
  assert.strictEqual(conflict.domClaim.role, 'input');
  assert.strictEqual(conflict.visionClaim.role, 'button');
  assert.ok(conflict.reason.includes('DOM semantic hierarchy wins'));
});

test('Disagreement & Division: Vision wins on primary CTA visual salience', () => {
  const box = { x: 300, y: 400, width: 180, height: 50 };

  const domCandidates = [
    {
      id: 'el_div_btn',
      role: 'generic', // DIV styled as a button
      name: 'Complete Purchase',
      boundingBox: box
    }
  ];

  const visionCandidates = [
    {
      ref: 'v_cta_1',
      bbox: [0.3, 0.5, 0.18, 0.062],
      role: 'button',
      affordances: ['clickable'],
      confidence: 0.95,
      provenance: 'vision',
      primaryCta: true,
      rawPixelBox: box
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused' });

  assert.strictEqual(sceneGraph.elements.length, 1);
  assert.strictEqual(sceneGraph.elements[0].role, 'button', 'Vision wins: upgrades generic DOM element to button CTA');
  assert.strictEqual(sceneGraph.elements[0].primaryCta, true);

  // Audited conflict
  assert.ok(sceneGraph.conflicts.length >= 1);
  const conflict = sceneGraph.conflicts.find((c) => c.resolvedTo === 'vision');
  assert.ok(conflict, 'Must record conflict resolving to vision for primary CTA');
  assert.ok(conflict.reason.includes('Vision visual prominence overrides'));
});

test('Disagreement & Division: Vision wins on visual layer occlusion', () => {
  const box = { x: 150, y: 250, width: 120, height: 40 };

  const domCandidates = [
    {
      id: 'el_covered',
      role: 'button',
      name: 'Hidden Underlying Button',
      boundingBox: box,
      isOccluded: true // Visual layers overlap and completely obscure this button
    }
  ];

  const visionCandidates = [
    {
      ref: 'v_cov_1',
      bbox: [0.15, 0.31, 0.12, 0.05],
      role: 'button',
      affordances: ['clickable'],
      confidence: 0.85,
      provenance: 'vision',
      rawPixelBox: box
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused' });

  // Occluded element must be excluded from interactive elements
  const found = sceneGraph.elements.find((el) => el.ref === 'el_covered');
  assert.strictEqual(found, undefined, 'Occluded element must be omitted from interactive elements');

  // Conflict must be logged
  const occlusionConflict = sceneGraph.conflicts.find((c) => c.resolvedTo === 'vision');
  assert.ok(occlusionConflict, 'Must log conflict resolving to vision on occlusion');
  assert.strictEqual(occlusionConflict.visionClaim.visuallyOccluded, true);
});

test('Vision Wins: Preserves unmatched canvas controls and image concept badges', () => {
  // DOM sees nothing (e.g. inside <canvas> or image badge)
  const domCandidates = [];

  const visionCandidates = [
    {
      ref: 'v_canvas_input',
      bbox: [0.1, 0.2, 0.8, 0.08],
      role: 'input',
      affordances: ['clickable', 'typable'],
      confidence: 0.88,
      provenance: 'vision',
      surfaceType: 'canvas',
      labelHint: 'Canvas Input'
    },
    {
      ref: 'v_img_badge',
      bbox: [0.4, 0.1, 0.2, 0.2],
      role: 'image',
      affordances: ['clickable'],
      confidence: 0.92,
      provenance: 'vision',
      surfaceType: 'img',
      conceptMatch: 'security_seal',
      labelHint: 'Security Seal'
    }
  ];

  const sceneGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'fused' });

  assert.strictEqual(sceneGraph.elements.length, 2);
  assert.ok(sceneGraph.elements.some((el) => el.ref === 'v_canvas_input' && el.provenance === 'vision'));
  assert.ok(sceneGraph.elements.some((el) => el.ref === 'v_img_badge' && el.provenance === 'vision'));
});

test('Perception Modes: dom-only and vision-only operate independently', () => {
  const domCandidates = [
    {
      id: 'dom_el_1',
      role: 'button',
      name: 'DOM Button',
      boundingBox: { x: 50, y: 50, width: 100, height: 40 }
    }
  ];

  const visionCandidates = [
    {
      ref: 'vis_el_1',
      bbox: [0.2, 0.2, 0.15, 0.05],
      role: 'input',
      affordances: ['clickable', 'typable'],
      confidence: 0.85,
      provenance: 'vision'
    }
  ];

  // dom-only mode
  const domOnlyGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'dom-only' });
  assert.strictEqual(domOnlyGraph.elements.length, 1);
  assert.strictEqual(domOnlyGraph.elements[0].ref, 'dom_el_1');
  assert.strictEqual(domOnlyGraph.elements[0].provenance, 'dom');
  assert.strictEqual(domOnlyGraph.conflicts.length, 0);

  // vision-only mode
  const visionOnlyGraph = FusionPolicy.fuse(domCandidates, visionCandidates, mockMeta, { mode: 'vision-only' });
  assert.strictEqual(visionOnlyGraph.elements.length, 1);
  assert.strictEqual(visionOnlyGraph.elements[0].provenance, 'vision');
  assert.strictEqual(visionOnlyGraph.conflicts.length, 0);
});
