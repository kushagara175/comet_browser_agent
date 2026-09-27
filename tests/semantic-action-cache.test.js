import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticActionCache } from '../apps/extension/dist/cache/semantic-action-cache.js';

test('SemanticActionCache: computes deterministic key from goal and topology', () => {
  const cache = SemanticActionCache.getInstance();
  const sanitized = {
    captureId: 'cap_1',
    pageState: { domain: 'isro.gov.in', url: 'https://isro.gov.in/register' },
    elements: [
      { localId: 'el_1', role: 'input', sanitizedName: '[FULL NAME]' },
      { localId: 'el_2', role: 'input', sanitizedName: '[EMAIL ADDRESS]' },
      { localId: 'el_3', role: 'button', sanitizedName: 'Submit' }
    ]
  };

  const key1 = cache.computeKey('fill the details for me', sanitized);
  const key2 = cache.computeKey('fill the details for me', sanitized);
  assert.equal(key1, key2);
  assert.match(key1, /sac_isro\.gov\.in/);
});

test('SemanticActionCache: records verified action and retrieves on hit', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const sanitized = {
    captureId: 'cap_2',
    pageState: { domain: 'isro.gov.in', url: 'https://isro.gov.in/register' },
    elements: [
      { localId: 'el_1', role: 'input', sanitizedName: '[FULL NAME]' },
      { localId: 'el_2', role: 'input', sanitizedName: '[EMAIL ADDRESS]' },
      { localId: 'el_3', role: 'button', sanitizedName: 'Submit' }
    ]
  };

  const proposal = {
    actionId: 'act_batch_1',
    kind: 'batch',
    batchActions: [
      { actionId: 'sub_1', kind: 'type', targetLocalId: 'el_1', textToType: '[FULL NAME]' },
      { actionId: 'sub_2', kind: 'type', targetLocalId: 'el_2', textToType: '[EMAIL ADDRESS]' },
      { actionId: 'sub_3', kind: 'click', targetLocalId: 'el_3' }
    ],
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Submitting ISRO registration'
  };

  // 1. Initial lookup -> miss
  const miss = cache.get('fill the details for me', sanitized);
  assert.equal(miss, null);

  // 2. Set cache entry
  cache.set('fill the details for me', sanitized, proposal);

  // 3. Second lookup -> HIT!
  const hit = cache.get('fill the details for me', sanitized);
  assert.ok(hit);
  assert.equal(hit.kind, 'batch');
  assert.equal(hit.batchActions.length, 3);
  assert.match(hit.thought, /Edge Semantic Cache Hit/);
  assert.match(hit.reasoning, /Edge Semantic Cache Hit/);

  // 4. Verify metrics
  const metrics = cache.getMetrics();
  assert.equal(metrics.totalHits, 1);
  assert.ok(metrics.tokensSavedEstimate > 0);
  assert.ok(metrics.latencySavedMsEstimate > 0);
});

test('SemanticActionCache: safely invalidates when page elements change', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const sanitized1 = {
    captureId: 'cap_3',
    pageState: { domain: 'demoqa.com', url: 'https://demoqa.com/form' },
    elements: [{ localId: 'el_1', role: 'input', sanitizedName: 'First Name' }]
  };

  const proposal = {
    actionId: 'act_1',
    kind: 'click',
    targetLocalId: 'el_1',
    confidence: 0.95,
    risk: 'safe'
  };

  cache.set('click name', sanitized1, proposal);

  // Alter elements (mutated page state)
  const sanitized2 = {
    captureId: 'cap_4',
    pageState: { domain: 'demoqa.com', url: 'https://demoqa.com/form' },
    elements: [{ localId: 'el_2', role: 'button', sanitizedName: 'Different Button' }]
  };

  const result = cache.get('click name', sanitized2);
  assert.equal(result, null);
});
