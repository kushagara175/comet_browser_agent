/**
 * R3 - the on-device Vision Transformer.
 *
 * The model itself can only be exercised in a browser, so it is measured by the
 * browser harness. What is pinned here is everything around it that can silently go
 * wrong without failing: the abstain rule, the prototype table's shape, the region
 * budget, and the honesty of the status reporting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyEmbedding, MIN_CLASSIFICATION_MARGIN } from '../apps/extension/dist/vision/ui-classifier.js';
import { UI_PROTOTYPES, UI_PROTOTYPE_DIMENSIONS } from '../apps/extension/dist/vision/ui-prototypes.generated.js';
import { cosineSimilarity } from '../apps/extension/dist/vision/vit-encoder.js';
import { renderVisionPill } from '../apps/extension/src/sidepanel/sidepanel.js';

function l2(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

test('ViT prototypes - table is well formed and L2-normalized', () => {
  const names = Object.keys(UI_PROTOTYPES);
  assert.ok(names.length >= 8, 'expected a usable set of UI affordance classes');

  for (const name of names) {
    const v = UI_PROTOTYPES[name];
    assert.equal(v.length, UI_PROTOTYPE_DIMENSIONS, `${name} has the wrong dimensionality`);
    let norm = 0;
    for (const x of v) norm += x * x;
    // A prototype that is not unit length makes cosine similarity meaningless, and
    // the error would show up as quietly skewed rankings rather than as a failure.
    assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-3, `${name} is not L2-normalized`);
  }
});

test('ViT prototypes - classes are distinct, but only barely', () => {
  // Documents the fact the abstain rule exists for: CLIP embeddings of UI controls
  // sit in a very tight cone, so absolute similarity carries almost no information
  // and only the top1-top2 margin does.
  const names = Object.keys(UI_PROTOTYPES);
  let maxPairwise = -1;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const sim = cosineSimilarity(UI_PROTOTYPES[names[i]], UI_PROTOTYPES[names[j]]);
      assert.ok(sim < 0.999, `${names[i]} and ${names[j]} are effectively the same prototype`);
      maxPairwise = Math.max(maxPairwise, sim);
    }
  }
  assert.ok(maxPairwise > 0.5, 'prototypes unexpectedly far apart - regenerate and re-calibrate the margin');
});

test('ViT classifier - commits when one class clearly wins', () => {
  const names = Object.keys(UI_PROTOTYPES);
  // A vector identical to one prototype must classify as that prototype.
  const target = names[0];
  const result = classifyEmbedding(UI_PROTOTYPES[target]);
  assert.equal(result.bestLabel, target);
  assert.ok(result.similarity > 0.99);
});

test('ViT classifier - abstains rather than guessing on an ambiguous vector', () => {
  // Exactly between two prototypes: the margin collapses, so no label may be
  // asserted. For an agent that ACTS on the label, a confident wrong answer is worse
  // than no answer.
  const names = Object.keys(UI_PROTOTYPES);
  const blend = l2(UI_PROTOTYPES[names[0]].map((x, i) => x + UI_PROTOTYPES[names[1]][i]));
  const result = classifyEmbedding(blend);

  assert.ok(result.margin < MIN_CLASSIFICATION_MARGIN, `margin ${result.margin} should be below threshold`);
  assert.equal(result.confident, false);
  assert.equal(result.label, null, 'an ambiguous region must not be labelled');
  assert.ok(result.bestLabel, 'the best guess is still reported, for diagnostics');
});

test('ViT classifier - the abstain threshold is the calibrated value', () => {
  // Measured on held-out renders: every misclassification had a margin at or below
  // 0.0152, so the threshold sits just above that. Changing it silently would change
  // the precision/coverage trade this phase was signed off on.
  assert.equal(MIN_CLASSIFICATION_MARGIN, 0.0162);
});

test('Side panel - reports the vision model truthfully, including failure', () => {
  const unavailable = renderVisionPill({ available: false, error: 'model 404', modelFamily: 'X' }, []);
  assert.match(unavailable, /unavailable/);
  assert.match(unavailable, /model 404/);

  const idle = renderVisionPill(
    { available: true, regionsEmbedded: 0, modelFamily: 'CLIP ViT-B/32', providerUsed: 'wasm', totalInferenceMs: 0 },
    []
  );
  assert.match(idle, /idle/, 'a page the DOM described needs no ViT pass, and should say so');

  const active = renderVisionPill(
    { available: true, regionsEmbedded: 4, modelFamily: 'CLIP ViT-B/32', providerUsed: 'wasm', totalInferenceMs: 812 },
    [{ label: 'button' }, { label: null }, { label: 'chart_or_graph' }, { label: null }]
  );
  assert.match(active, /CLIP ViT-B\/32/);
  assert.match(active, /wasm/, 'the engaged provider must be named, never assumed');
  assert.match(active, /4 region/);
  assert.match(active, /2 labelled/, 'abstentions must not be counted as labels');
  assert.match(active, /812ms/);
});

test('Side panel - renders nothing rather than inventing a status', () => {
  assert.equal(renderVisionPill(null, []), '');
});
