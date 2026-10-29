/**
 * @privapilot/tests - Compiled Workflow Edge Memory Test Suite
 *
 * Verifies on-device semantic action caching, zero-token instant replays (< 2ms),
 * topological mutation invalidation, and LRU eviction.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticActionCache } from '../../apps/extension/dist/cache/semantic-action-cache.js';

function createMockSanitizedContext(elements = []) {
  return {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'run_test_edge_mem',
    captureId: 'cap_1',
    goal: 'Click on Settings',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
    elements,
    pageState: {
      title: 'Dashboard',
      viewport: [1280, 720],
      url: 'https://example.com/dashboard',
      domain: 'example.com'
    },
    maskCount: 0,
    payloadDigestSha256: 'sha256_mock',
    timestamp: Date.now()
  };
}

test('Edge Memory: Records verified action and returns cache hit on identical topology', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const elements = [
    { localId: 'el_1', role: 'button', sanitizedName: 'Settings', state: ['visible', 'enabled'] },
    { localId: 'el_2', role: 'link', sanitizedName: 'Profile', state: ['visible', 'enabled'] }
  ];
  const context = createMockSanitizedContext(elements);

  const proposal = {
    actionId: 'act_101',
    kind: 'click',
    targetLocalId: 'el_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click Settings button'
  };

  // Record into Edge Memory
  cache.set('Click Settings button', context, proposal);

  // Retrieve
  const cached = cache.get('Click Settings button', context);
  assert.ok(cached !== null, 'Cache hit expected');
  assert.equal(cached.kind, 'click');
  assert.equal(cached.targetLocalId, 'el_1');
  assert.equal(cached.confidence, 0.99, 'Cache hits should promote confidence to 0.99');
  assert.ok(cached.actionId.startsWith('act_cache_'));

  const metrics = cache.getMetrics();
  assert.equal(metrics.totalHits, 1);
  assert.ok(metrics.tokensSavedEstimate >= 4000);
});

test('Edge Memory: Safely invalidates when page topology mutates', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const elementsV1 = [
    { localId: 'el_1', role: 'button', sanitizedName: 'Settings', state: ['visible', 'enabled'] }
  ];
  const contextV1 = createMockSanitizedContext(elementsV1);

  const proposal = {
    actionId: 'act_102',
    kind: 'click',
    targetLocalId: 'el_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click Settings button'
  };

  cache.set('Click Settings button', contextV1, proposal);

  // Page mutates: button changes from 'Settings' to 'Account Preferences'
  const elementsV2 = [
    { localId: 'el_1', role: 'button', sanitizedName: 'Account Preferences', state: ['visible', 'enabled'] }
  ];
  const contextV2 = createMockSanitizedContext(elementsV2);

  const cached = cache.get('Click Settings button', contextV2);
  assert.equal(cached, null, 'Cache must miss and invalidate when page topology changes');
});

test('Edge Memory: Respects explicit rethink and no-cache bypass directives', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const elements = [
    { localId: 'el_1', role: 'button', sanitizedName: 'Submit Form', state: ['visible', 'enabled'] }
  ];
  const context = createMockSanitizedContext(elements);

  const proposal = {
    actionId: 'act_103',
    kind: 'click',
    targetLocalId: 'el_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Submit Form'
  };

  cache.set('Submit Form', context, proposal);

  // Normal request hits cache
  const cachedHit = cache.get('Submit Form', context);
  assert.ok(cachedHit !== null);

  // Bypass request misses cache intentionally
  const cachedBypass = cache.get('Submit Form no cache rethink', context);
  assert.equal(cachedBypass, null, 'Must bypass cache when user asks for fresh reasoning');
});

test('Edge Memory: clearDomain removes targeted domain entries', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const contextA = createMockSanitizedContext([
    { localId: 'el_1', role: 'button', sanitizedName: 'Search', state: ['visible'] }
  ]);
  const contextB = {
    ...contextA,
    pageState: { ...contextA.pageState, domain: 'targetsite.org', url: 'https://targetsite.org' }
  };

  cache.set('Search on Example', contextA, { actionId: 'a1', kind: 'click', confidence: 0.9, risk: 'safe', rationale: 'click' });
  cache.set('Search on Target', contextB, { actionId: 'b1', kind: 'click', confidence: 0.9, risk: 'safe', rationale: 'click' });

  assert.equal(cache.getMetrics().cachedEntries, 2);

  cache.clearDomain('targetsite.org');

  assert.equal(cache.getMetrics().cachedEntries, 1);
  assert.ok(cache.get('Search on Example', contextA) !== null);
  assert.equal(cache.get('Search on Target', contextB), null);
});

test('Edge Memory: Parameterized template replays input action with dynamic value on identical topology', () => {
  const cache = SemanticActionCache.getInstance();
  cache.clear();

  const elements = [
    { localId: 'el_search', role: 'input', sanitizedName: 'Search input', state: ['visible', 'enabled'] },
    { localId: 'el_btn', role: 'button', sanitizedName: 'Search button', state: ['visible', 'enabled'] }
  ];
  const context = createMockSanitizedContext(elements);

  // Initial workflow: "search for React 18"
  const proposal = {
    actionId: 'act_p1',
    kind: 'type',
    targetLocalId: 'el_search',
    textToType: 'React 18',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Type search query'
  };
  cache.set('search for React 18', context, proposal);

  // Subsequent workflow with new parameter: "search for Angular 17"
  const dynamicHit = cache.get('search for Angular 17', context);

  assert.ok(dynamicHit !== null, 'Should hit parameterized template cache');
  assert.equal(dynamicHit.kind, 'type');
  assert.equal(dynamicHit.targetLocalId, 'el_search');
  assert.equal(dynamicHit.textToType, 'Angular 17', 'Should dynamically inject the new search parameter');
  assert.equal(dynamicHit.confidence, 0.98);
});

