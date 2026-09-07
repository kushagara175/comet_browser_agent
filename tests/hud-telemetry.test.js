import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceGovernor } from '../apps/extension/dist/background/resource-governor.js';
import { renderResourceTelemetry, drawLatencySparkline, renderDowngradeEvents } from '../apps/extension/src/sidepanel/sidepanel.js';

function createMockElement(initialAttrs = {}) {
  const classListSet = new Set();
  const attrs = { ...initialAttrs };
  return {
    textContent: '',
    innerHTML: '',
    style: {},
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        } else if (force) {
          classListSet.add(cls);
        } else {
          classListSet.delete(cls);
        }
      },
      has: (cls) => classListSet.has(cls)
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k],
    appendChild: function(child) {
      this.innerHTML += child.innerHTML || '';
    }
  };
}

function createMockDomRefs() {
  return {
    budgetTierPill: createMockElement(),
    budgetTierText: createMockElement(),
    budgetLatencyPill: createMockElement(),
    budgetLatencyText: createMockElement(),
    budgetMemoryPill: createMockElement(),
    budgetMemoryText: createMockElement(),
    budgetCacheText: createMockElement(),
    meterP95Latency: createMockElement(),
    meterLatencyBar: createMockElement(),
    meterResidentMemory: createMockElement(),
    meterMemoryBar: createMockElement(),
    meterAccountingMethod: createMockElement(),
    meterCacheHitRate: createMockElement(),
    meterCacheCounts: createMockElement(),
    meterCacheBar: createMockElement(),
    meterCaptureRate: createMockElement(),
    meterCaptureBar: createMockElement(),
    governorBudgetBadge: createMockElement(),
    sparklinePolyline: createMockElement(),
    downgradeEventFeed: createMockElement(),
    tierButtons: [
      createMockElement({ 'data-override': 'auto' }),
      createMockElement({ 'data-override': 'force-t0' }),
      createMockElement({ 'data-override': 'force-t1' }),
      createMockElement({ 'data-override': 'force-t2' })
    ]
  };
}

test('HUD Integration: Direct binding from live ResourceGovernor telemetry to DOM elements', () => {
  const governor = new ResourceGovernor({
    maxMsPerFrame: 500,
    maxResidentMb: 160,
    warmupInferenceCount: 0
  });

  // Record realistic frames through governor: (perceptionMs, cacheHit, estimatedResidentMb)
  governor.recordFramePerception(142.4, true, 78); // Cache hit
  governor.recordFramePerception(185.6, false, 84); // Cache miss
  governor.recordFramePerception(160.0, true, 88); // Cache hit

  const telemetry = governor.getTelemetry();
  const dom = createMockDomRefs();

  // Feed real governor telemetry directly into HUD renderer
  renderResourceTelemetry(telemetry, dom);

  // 1. Assert Tier Display
  assert.equal(dom.budgetTierText.textContent, 'T1: CLIP ViT-B/32');
  assert.equal(dom.budgetTierPill.className, 'budget-pill tier-t1');

  // 2. Assert Latency Metrics (honest frame and p95 latency)
  assert.equal(dom.budgetLatencyText.textContent, '160 ms');
  assert.equal(dom.meterP95Latency.textContent, `${Math.round(telemetry.p95PerceptionMs)} ms`);
  assert.equal(dom.meterLatencyBar.className.includes('fill-green'), true);

  // 3. Assert Memory Accounting (honest method and MB)
  assert.equal(dom.budgetMemoryText.textContent, '88 MB');
  assert.equal(dom.meterResidentMemory.textContent, '88 MB');
  assert.equal(dom.meterAccountingMethod.textContent, telemetry.memoryAccountingMethod);

  // 4. Assert Cache Metrics
  const expectedHitPct = `${Math.round(telemetry.cacheHitRate * 100)}%`;
  assert.equal(dom.budgetCacheText.textContent, expectedHitPct);
  const hits = telemetry.totalCacheHits ?? telemetry.cacheHits;
  const queries = telemetry.totalPerceptionQueries ?? (telemetry.cacheHits + telemetry.cacheMisses);
  assert.equal(dom.meterCacheCounts.textContent, `(${hits} / ${queries} queries)`);

  // 5. Assert Sparkline Polyline contains points from governor history
  const points = dom.sparklinePolyline.getAttribute('points');
  assert.ok(points && points.length > 0, 'Sparkline polyline points must be populated');
  assert.ok(points.includes(','), 'Sparkline points must contain comma-separated coordinates');

  // 6. Assert Badge shows BUDGET ENFORCED when within bounds
  assert.equal(dom.governorBudgetBadge.textContent, 'BUDGET ENFORCED');
  assert.equal(dom.governorBudgetBadge.className, 'budget-status-pill budget-ok');
});

test('HUD Integration: Downgrade and backpressure states reflect truthfully in HUD', () => {
  const dom = createMockDomRefs();

  const downgradedTelemetry = {
    activeTier: 'T0',
    requestedTier: 'T1',
    tierOverride: 'auto',
    tierDowngraded: true,
    tierDowngradeReason: 'Perception p95 (520ms) exceeded ceiling (500ms)',
    perceptionMs: 12.0,
    p95PerceptionMs: 520.0,
    estimatedResidentMb: 35,
    maxMemoryMbCeiling: 160,
    memoryAccountingMethod: 'wasm_linear_memory + dom_tree',
    capturesInLastMinute: 5,
    cacheHitRate: 0.5,
    cacheHits: 5,
    cacheMisses: 5,
    recentLatencies: [520, 510, 12],
    recentDowngrades: [
      {
        timestamp: Date.now(),
        fromTier: 'T1',
        toTier: 'T0',
        reason: 'Perception p95 (520ms) exceeded ceiling (500ms)',
        metricValue: 520,
        ceilingValue: 500
      }
    ]
  };

  renderResourceTelemetry(downgradedTelemetry, dom);

  // Assert Tier shows T0 Heuristics
  assert.equal(dom.budgetTierText.textContent, 'T0: Heuristics & DOM');
  assert.equal(dom.budgetTierPill.className, 'budget-pill tier-t0');

  // Pure latency downgrade lights TIER DOWNGRADED (NOT backpressure)
  assert.equal(dom.governorBudgetBadge.textContent, 'TIER DOWNGRADED');
  assert.equal(dom.meterLatencyBar.className.includes('fill-red'), true);

  // Assert Downgrade event rendered with clean reason
  assert.ok(dom.downgradeEventFeed.innerHTML.includes('T1 &rarr; T0'));
  assert.ok(dom.downgradeEventFeed.innerHTML.includes('520ms'));

  // Now test that explicit backpressure (captures > 45 or backpressureApplied) lights BACKPRESSURE ACTIVE
  const backpressureTelemetry = {
    ...downgradedTelemetry,
    activeTier: 'T1',
    tierDowngraded: false,
    backpressureApplied: true,
    capturesInLastMinute: 48
  };
  renderResourceTelemetry(backpressureTelemetry, dom);
  assert.equal(dom.governorBudgetBadge.textContent, 'BACKPRESSURE ACTIVE');
});
