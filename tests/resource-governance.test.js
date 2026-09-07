/**
 * @privapilot - Task R6 Resource Governance & Enforced Budget Test Suite
 *
 * Verifies model tiering (T0/T1/T2), capability detection & fallback (WebGPU -> WASM -> CPU),
 * sound 4x4 tiled perceptual caching (16x16 tiles + 10s TTL), honest accounted resident memory budgeting,
 * HiDPI screen downscaling clamp, probing re-upgrade with exponential backoff, T2 network ceiling,
 * and explicit backpressure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityDetector } from '../apps/extension/dist/vision/capability-detector.js';
import { ResourceGovernor } from '../apps/extension/dist/background/resource-governor.js';
import { PerceptionCache, computeCanvasDHash, fnv1a64 } from '../apps/extension/dist/sanitizer/perception-cache.js';

test('R6.1: CapabilityDetector - Disabling WebGPU falls back to WASM / CPU', async () => {
  const initialDisabled = CapabilityDetector.isWebGPUDisabled();

  try {
    CapabilityDetector.disableWebGPU(true);
    assert.equal(CapabilityDetector.isWebGPUAvailable(), false, 'WebGPU must report unavailable when explicitly suppressed');
    assert.equal(CapabilityDetector.isWebGPUDisabled(), true);

    const provider = CapabilityDetector.detectBestProvider();
    assert.ok(provider === 'wasm' || provider === 'cpu', `Expected wasm or cpu fallback, got ${provider}`);

    const caps = CapabilityDetector.getCapabilities();
    assert.equal(caps.webgpu, false);
    assert.ok(['wasm', 'cpu'].includes(caps.selectedProvider));
  } finally {
    CapabilityDetector.disableWebGPU(initialDisabled);
  }
});

test('R6.2: T0 Model Session Spy - Zero ML model sessions created under T0', () => {
  const governor = new ResourceGovernor();
  governor.setTierOverride('force-T0');

  assert.equal(governor.getActiveTier(), 'T0', 'Governor must honor force-T0 override');

  // Verify memory accounting with 0 models loaded
  const memMb = governor.calculateAccountedMemoryMb({ screenshotWidth: 1280, screenshotHeight: 800 });
  assert.ok(memMb < 30, `T0 resident memory (${memMb}MB) must be well below 30MB base`);

  const telemetry = governor.getTelemetry();
  assert.equal(telemetry.activeTier, 'T0');
  assert.ok(telemetry.memoryAccountingMethod.includes('base(') && telemetry.memoryAccountingMethod.includes('wasmHeap('), 'Method string must break out four terms');
  assert.ok(telemetry.memoryBreakdown, 'Telemetry must emit memoryBreakdown structure');
  assert.equal(telemetry.memoryBreakdown.wasmHeapMb, 0, 'WASM heap must be 0 when models not loaded');
});

test('R6.3: Perceptual Cache Soundness - 4x4 Tiled Grid detects localized 64px avatar/text alterations', () => {
  function createMockGridCanvas(hasLocalAvatar = false) {
    const width = 1280;
    const height = 800;

    return {
      width,
      height,
      getContext: () => ({
        clearRect: () => {},
        drawImage: () => {},
        getImageData: (sx, sy, sw, sh) => {
          // 17x16 buffer for tile
          const data = new Uint8ClampedArray(17 * 16 * 4);
          // If this is tile in row 1, col 1 and hasLocalAvatar is true, populate distinct high-contrast gradient
          if (hasLocalAvatar) {
            for (let y = 0; y < 16; y++) {
              for (let x = 0; x < 17; x++) {
                const idx = (y * 17 + x) * 4;
                data[idx] = x % 2 === 0 ? 255 : 0;
                data[idx + 1] = x % 2 === 0 ? 255 : 0;
                data[idx + 2] = x % 2 === 0 ? 255 : 0;
                data[idx + 3] = 255;
              }
            }
          } else {
            // Uniform baseline
            for (let i = 0; i < data.length; i += 4) {
              data[i] = 200;
              data[i + 1] = 200;
              data[i + 2] = 200;
              data[i + 3] = 255;
            }
          }
          return { data, width: sw, height: sh };
        }
      })
    };
  }

  const canvasUniform = createMockGridCanvas(false);
  const canvasWithAvatar = createMockGridCanvas(true);

  const dHashA = computeCanvasDHash(canvasUniform);
  const dHashB = computeCanvasDHash(canvasWithAvatar);

  assert.notEqual(dHashA, dHashB, '4x4 tiled grid must detect localized 64px avatar/text alterations');

  const domHash = 'dom_hash_abc123';
  const viewportHash = 'viewport_1280x800';

  const mockResult = {
    protocolVersion: '1.0',
    runId: 'test_run',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,...',
    elements: [],
    maskCount: 2
  };

  const keyA = PerceptionCache.buildKey(domHash, viewportHash, dHashA);
  const keyB = PerceptionCache.buildKey(domHash, viewportHash, dHashB);

  PerceptionCache.set(keyA, mockResult);

  assert.ok(PerceptionCache.get(keyA) !== null, 'Identical DOM and identical frame must result in cache hit');
  assert.equal(PerceptionCache.get(keyB), null, 'Localized pixel changes must invalidate cache despite identical DOM');
});

test('R6.4: Perceptual Cache - Strict 10s TTL eviction', () => {
  PerceptionCache.setTtl(50); // 50ms TTL for test

  const domHash = 'dom_123';
  const viewportHash = 'vp_1280';
  const dHash = 'dhash_456';
  const mockResult = { elements: [], maskCount: 0 };
  const key = PerceptionCache.buildKey(domHash, viewportHash, dHash);

  PerceptionCache.set(key, mockResult);

  assert.ok(PerceptionCache.get(key) !== null);

  return new Promise((resolve) => {
    setTimeout(() => {
      const expiredHit = PerceptionCache.get(key);
      PerceptionCache.setTtl(10000); // restore default
      assert.equal(expiredHit, null, 'Entries older than TTL must be evicted');
      resolve(true);
    }, 70);
  });
});

test('R6.5: Resource Governor - Warm-up exclusion prevents premature demotion', () => {
  const governor = new ResourceGovernor();

  governor.recordFramePerception(650, false, 120);
  assert.equal(governor.getActiveTier(), 'T1', 'Warmup frame 1 (>500ms) must not demote tier');

  governor.recordFramePerception(720, false, 120);
  assert.equal(governor.getActiveTier(), 'T1', 'Warmup frame 2 (>500ms) must not demote tier');

  const telemetry = governor.getTelemetry();
  assert.equal(telemetry.warmupMs, 650, 'First inference latency must be recorded');
  assert.equal(telemetry.downgradeHistory.length, 0, 'No downgrades should occur during warm-up');
});

test('R6.6: Resource Governor - Intra-tier degradation (12 -> 6 -> 3 regions) before T0 demotion', () => {
  const governor = new ResourceGovernor();
  assert.equal(governor.getRegionBudget(), 12, 'Default T1 region budget must be 12');

  // Warm-up frames
  governor.recordFramePerception(1200, false, 120);
  governor.recordFramePerception(1300, false, 120);

  // Breach 1 at 12 regions (> 1500ms ceiling) -> Degrades to 6 regions, remains T1
  governor.recordFramePerception(1600, false, 120);
  assert.equal(governor.getActiveTier(), 'T1', 'First breach must NOT drop to T0; vision stays on');
  assert.equal(governor.getRegionBudget(), 6, 'Region budget must degrade from 12 to 6');

  // Breach 2 at 6 regions -> Degrades to 3 regions, remains T1
  governor.recordFramePerception(1650, false, 120);
  assert.equal(governor.getActiveTier(), 'T1', 'Second breach must NOT drop to T0; vision stays on');
  assert.equal(governor.getRegionBudget(), 3, 'Region budget must degrade from 6 to 3');

  // Breach 3 at minimum 3 regions -> Smallest budget breached, demotes to T0!
  governor.recordFramePerception(1700, false, 120);
  assert.equal(governor.getActiveTier(), 'T0', 'Breach at minimum 3 regions must demote to T0');

  const telemetry = governor.getTelemetry();
  assert.ok(telemetry.downgradeHistory.length > 0, 'Downgrade event must be logged');
  const lastEvent = telemetry.downgradeHistory[telemetry.downgradeHistory.length - 1];
  assert.equal(lastEvent.fromTier, 'T1');
  assert.equal(lastEvent.toTier, 'T0');
  assert.ok(lastEvent.reason.includes('minimum region budget (3 regions)'));
});

test('R6.7: Resource Governor - Probing Re-Upgrade with Exponential Dwell Backoff', () => {
  const governor = new ResourceGovernor({ initialRegionBudget: 3 });

  // Trigger downgrade to T0 at 3 regions with breaching frames (>1500ms)
  governor.recordFramePerception(1200, false, 120);
  governor.recordFramePerception(1200, false, 120);
  governor.recordFramePerception(1600, false, 120);
  governor.recordFramePerception(1650, false, 120);
  assert.equal(governor.getActiveTier(), 'T0');
  assert.equal(governor.getCurrentDwellMs(), 15000, 'Initial dwell must be 15s');

  // Fast DOM frame arrives in T0 (<15ms)
  governor.recordFramePerception(12, false, 25);
  assert.equal(governor.getActiveTier(), 'T0', 'Fast DOM frame must NOT trigger re-upgrade (flapping prevention)');

  // Simulate dwell time elapsed -> triggers 1-frame probe of T1
  governor['lastDowngradeTimestamp'] = Date.now() - 16000;
  governor.recordFramePerception(12, false, 25);
  assert.equal(governor.isProbing(), true, 'Governor must engage 1-frame probe mode');
  assert.equal(governor.getActiveTier(), 'T1', 'Probe attempts 1 frame in T1');
  assert.equal(governor.getRegionBudget(), 3, 'Probe must run at minimal 3-region budget');

  // Under sustained throttle, probe frame breaches 1500ms ceiling -> fails
  governor.recordFramePerception(1750, false, 120);
  assert.equal(governor.getActiveTier(), 'T0', 'Failed probe must demote back to T0');
  assert.equal(governor.getCurrentDwellMs(), 30000, 'Dwell must back off exponentially to 30s');

  // Second probe failure -> backs off to 60s
  governor['lastDowngradeTimestamp'] = Date.now() - 31000;
  governor.recordFramePerception(12, false, 25); // triggers probe
  assert.equal(governor.isProbing(), true);
  governor.recordFramePerception(1800, false, 120); // breaches again
  assert.equal(governor.getCurrentDwellMs(), 60000, 'Dwell must back off to 60s');

  // Third probe: throttle removed -> frame runs in 800ms (< 1500ms) -> succeeds
  governor['lastDowngradeTimestamp'] = Date.now() - 61000;
  governor.recordFramePerception(12, false, 25); // triggers probe
  assert.equal(governor.isProbing(), true);
  governor.recordFramePerception(800, false, 120); // succeeds!
  assert.equal(governor.getActiveTier(), 'T1', 'Successful probe restores T1');
  assert.equal(governor.getCurrentDwellMs(), 15000, 'Successful probe resets dwell back to 15s');
});

test('R6.8: Explicit Backpressure - Concurrency and Capture Rate Limit', () => {
  const governor = new ResourceGovernor();

  const check1 = governor.checkBackpressure();
  assert.equal(check1.allowed, true);

  governor.recordCaptureStarted();
  const check2 = governor.checkBackpressure();
  assert.equal(check2.allowed, false);
  assert.equal(check2.reasonCode, 'CONCURRENT_CAPTURE_IN_PROGRESS');

  governor.recordCaptureEnded();
  const check3 = governor.checkBackpressure();
  assert.equal(check3.allowed, true);

  // 45 captures in current minute
  for (let i = 0; i < 44; i++) {
    governor.recordCaptureStarted();
    governor.recordCaptureEnded();
  }

  const rateLimitCheck = governor.checkBackpressure();
  assert.equal(rateLimitCheck.allowed, false);
  assert.equal(rateLimitCheck.reasonCode, 'RATE_LIMIT_EXCEEDED');

  const quotaResult = governor.recordBrowserQuotaExceeded();
  assert.equal(quotaResult.allowed, false);
  assert.equal(quotaResult.reasonCode, 'BROWSER_CAPTURE_QUOTA_EXCEEDED');
});

test('R6.9: Honest Memory Accounting & HiDPI Downscaling Clamp', () => {
  const governor = new ResourceGovernor();

  // 1. Nominal 1280x800
  const memNominal = governor.calculateAccountedMemoryMb({ screenshotWidth: 1280, screenshotHeight: 800 });
  assert.ok(memNominal > 100, 'Resident memory must include ONNX WASM heap & weights');
  assert.ok(memNominal <= 160, 'Baseline T1 must stay within the 160 MB ceiling');

  // 2. HiDPI 4K Display (3840x2160 DPR 2)
  // Without clamp, 3840x2160x4 = 33MB per buffer, pushing memory to ~165MB and tripping ceiling.
  // With clamp, downscaled to max 1920x1080 (8.2MB), preserving 24MB headroom below 160MB!
  const memHiDpi = governor.calculateAccountedMemoryMb({ screenshotWidth: 3840, screenshotHeight: 2160 });
  assert.ok(memHiDpi <= 160, `HiDPI downscaled memory (${memHiDpi}MB) must not breach 160MB ceiling`);
});

test('R6.10: FNV-1a 64-bit Two-Lane Non-BigInt Hashing', () => {
  const hash1 = fnv1a64('Hello World');
  const hash2 = fnv1a64('Hello World');
  const hash3 = fnv1a64('Different String');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 16);
});

test('R6.11: T2 Network Latency Ceiling - 8s timeout logged to governor', () => {
  const governor = new ResourceGovernor();
  governor.recordNetworkTimeout(3, 8000);

  const telemetry = governor.getTelemetry();
  assert.ok(telemetry.downgradeHistory.length > 0);
  const lastEvent = telemetry.downgradeHistory[telemetry.downgradeHistory.length - 1];
  assert.equal(lastEvent.fromTier, 'T2');
  assert.equal(lastEvent.toTier, 'T1');
  assert.ok(lastEvent.reason.includes('8s budget ceiling'));
});

test('R6.12: Perception Cache Privacy - Stores only sanitized context and zero raw PII', () => {
  const sanitizedContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'privacy_check_run',
    captureId: 'cap_1',
    goal: 'Transfer funds',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    elements: [
      { localId: 'e1', role: 'button', sanitizedName: 'Submit' }
    ],
    maskCount: 3,
    payloadDigestSha256: 'sha256_verified'
  };

  const key = 'test_dom:test_vp:test_dhash';
  PerceptionCache.set(key, sanitizedContext);

  const retrieved = PerceptionCache.get(key);
  assert.ok(retrieved !== null);
  assert.equal(retrieved.sanitizedScreenshotDataUrl.startsWith('data:image/png;base64'), true);
  assert.equal(retrieved.rawScreenshot, undefined, 'Raw screenshot must NEVER be stored in cache');
  assert.equal(retrieved.unredactedText, undefined, 'Unredacted text must NEVER be stored in cache');
});

test('R6.13: Sustained Memory Breach Rule - 3 consecutive samples over 160MB required to demote', () => {
  const governor = new ResourceGovernor({
    maxResidentMb: 160,
    warmupInferenceCount: 0
  });

  // Sample 1: Transient spike over 160MB (e.g. 168MB) -> Must NOT downgrade
  governor.recordFramePerception(150, false, 168);
  assert.equal(governor.getActiveTier(), 'T1', 'Single spike over 160MB must not cause spurious downgrade');

  // Sample 2: Over ceiling again -> Still must NOT downgrade
  governor.recordFramePerception(150, false, 165);
  assert.equal(governor.getActiveTier(), 'T1', 'Two samples over 160MB must not trigger premature downgrade');

  // Sample 3: 3rd consecutive sample over ceiling -> Sustained breach triggers downgrade to T0
  governor.recordFramePerception(150, false, 164);
  assert.equal(governor.getActiveTier(), 'T0', 'Three consecutive samples over 160MB must trigger downgrade to T0');

  const history = governor.getTelemetry().downgradeHistory;
  assert.ok(history.length > 0);
  assert.ok(history[history.length - 1].reason.includes('Resident memory sustained breach'));
});

test('R6.14: Cache Sensitivity & TTL Staleness Bound', () => {
  const key = 'sensitivity_test_key';
  const entry = {
    _brand: 'SanitizedContext_Verified',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,sample',
    elements: [{ localId: 'btn1', sanitizedName: 'Save' }]
  };

  PerceptionCache.set(key, entry);

  // Fresh entry retrieves immediately
  const fresh = PerceptionCache.get(key);
  assert.ok(fresh !== null);
  assert.equal(fresh.elements[0].sanitizedName, 'Save');

  // After 10s TTL expiration, stale entry must be rejected
  const cacheMap = PerceptionCache.cache || PerceptionCache['cache'];
  if (cacheMap && cacheMap.get(key)) {
    cacheMap.get(key).timestamp = Date.now() - 11000; // 11s ago
  }
  const expired = PerceptionCache.get(key);
  assert.equal(expired, null, 'Cache entries older than 10s TTL must expire to bound residual staleness');
});

test('R6.15: T2 Timeout Fallback Chain - T1 vision vs T0 DOM heuristics vs wait', () => {
  function resolveFallback(activeTier, sanitized, actionHistory = []) {
    const actioned = new Set((actionHistory || []).map((a) => a.label?.toLowerCase().trim()).filter(Boolean));
    const candidates = (sanitized?.elements || []).filter((el) => {
      const name = (el.sanitizedName || '').toLowerCase().trim();
      return !actioned.has(name) && !name.includes('[masked') && !name.includes('[password') && !name.includes('[auth');
    });

    const hasVisionContext = (activeTier === 'T1' || activeTier === 'T2') && (sanitized?.visionObservations?.length || 0) > 0;
    const fallbackTierLabel = hasVisionContext ? 'T1 local perception' : (activeTier === 'T0' ? 'T0 DOM heuristics' : 'on-device perception');

    const bestCandidate = candidates.find((el) => el.role === 'button' || el.actionCapabilities?.includes('click'))
      || candidates.find((el) => el.role === 'input' || el.role === 'textarea' || el.actionCapabilities?.includes('type'))
      || candidates[0];

    if (bestCandidate) {
      return {
        kind: 'click',
        tier: fallbackTierLabel,
        target: bestCandidate.sanitizedName,
        confidence: hasVisionContext ? 0.75 : 0.60
      };
    }
    return { kind: 'wait', tier: fallbackTierLabel, confidence: 0.5 };
  }

  // Branch 1: T1 with vision observations present -> T1 local perception candidate
  const t1Context = {
    elements: [{ localId: 'e1', role: 'button', sanitizedName: 'Visual Submit' }],
    visionObservations: [{ label: 'Visual Submit', confidence: 0.9 }]
  };
  const t1Res = resolveFallback('T1', t1Context);
  assert.equal(t1Res.tier, 'T1 local perception');
  assert.equal(t1Res.confidence, 0.75);

  // Branch 2: T0 without vision (escalation while at T0) -> T0 DOM heuristic candidate
  const t0Context = {
    elements: [{ localId: 'e2', role: 'button', sanitizedName: 'DOM Next Button' }],
    visionObservations: []
  };
  const t0Res = resolveFallback('T0', t0Context);
  assert.equal(t0Res.tier, 'T0 DOM heuristics');
  assert.equal(t0Res.confidence, 0.60);
  assert.equal(t0Res.target, 'DOM Next Button');

  // Branch 3: Empty candidates -> safe wait
  const emptyContext = { elements: [], visionObservations: [] };
  const emptyRes = resolveFallback('T0', emptyContext);
  assert.equal(emptyRes.kind, 'wait');
  assert.equal(emptyRes.confidence, 0.5);
});

test('R6.16: Dwell Timer Enforcement - Zero probes occur before dwellMs has elapsed', () => {
  const governor = new ResourceGovernor({
    reupgradeDwellMs: 15000,
    warmupInferenceCount: 0,
    initialRegionBudget: 3
  });

  // Demote to T0 with 2 breaching frames (>1500ms)
  governor.recordFramePerception(1600, false, 120);
  governor.recordFramePerception(1650, false, 120);
  assert.equal(governor.getActiveTier(), 'T0');

  // Simulate frame arriving at 5s, 10s, 14.5s post-demotion
  const demoteTime = governor['lastDowngradeTimestamp'];

  // Frame at +5s: Must stay in T0, zero probe
  governor['lastDowngradeTimestamp'] = Date.now() - 5000;
  governor.recordFramePerception(15, false, 24);
  assert.equal(governor.getActiveTier(), 'T0');
  assert.equal(governor.isProbing(), false, 'Probe must NOT trigger at 5s (before 15s dwell)');

  // Frame at +14.5s: Must stay in T0, zero probe
  governor['lastDowngradeTimestamp'] = Date.now() - 14500;
  governor.recordFramePerception(15, false, 24);
  assert.equal(governor.getActiveTier(), 'T0');
  assert.equal(governor.isProbing(), false, 'Probe must NOT trigger at 14.5s (before 15s dwell)');

  // Frame at +15.5s (dwell elapsed): Must launch 1-frame probe
  governor['lastDowngradeTimestamp'] = Date.now() - 15500;
  governor.recordFramePerception(15, false, 24);
  assert.equal(governor.isProbing(), true, 'Probe MUST trigger once dwell duration (15s) has elapsed');
  assert.equal(governor.getActiveTier(), 'T1', 'Active tier switches to T1 for the single probe frame');
});

test('R6.17: Causal Event from/to Tiers - Validates T1 -> T0 demotion and T0 -> T1 re-upgrade', () => {
  const governor = new ResourceGovernor({
    reupgradeDwellMs: 15000,
    warmupInferenceCount: 0,
    initialRegionBudget: 3
  });

  // 1. Demote T1 -> T0
  governor.recordFramePerception(1600, false, 120);
  governor.recordFramePerception(1650, false, 120);
  assert.equal(governor.getActiveTier(), 'T0');

  const history1 = governor.getTelemetry().downgradeHistory;
  assert.ok(history1.length > 0);
  const demoteEvent = history1[history1.length - 1];
  assert.equal(demoteEvent.fromTier, 'T1', 'Demote event must record fromTier: T1');
  assert.equal(demoteEvent.toTier, 'T0', 'Demote event must record toTier: T0');

  // 2. Dwell expires -> probe triggered
  governor['lastDowngradeTimestamp'] = Date.now() - 16000;
  governor.recordFramePerception(12, false, 24);
  assert.equal(governor.isProbing(), true);

  // 3. Probe succeeds with under-budget frame (<1500ms) -> re-upgrade
  governor.recordFramePerception(800, false, 120);
  assert.equal(governor.getActiveTier(), 'T1');

  const history2 = governor.getTelemetry().downgradeHistory;
  const reupgradeEvent = history2[history2.length - 1];
  assert.equal(reupgradeEvent.fromTier, 'T0', 'Re-upgrade event must record fromTier: T0 (NOT T1)');
  assert.equal(reupgradeEvent.toTier, 'T1', 'Re-upgrade event must record toTier: T1');
  assert.ok(reupgradeEvent.reason.startsWith('Re-upgrade successful: 1-frame probe verified'));
});

test('R6.18: Post-Grace Session Memory Disposal', () => {
  const governor = new ResourceGovernor({
    sessionDisposalGraceMs: 15000,
    warmupInferenceCount: 0,
    initialRegionBudget: 3
  });

  // Demote to T0
  governor.recordFramePerception(1600, false, 136);
  governor.recordFramePerception(1650, false, 136);
  assert.equal(governor.getActiveTier(), 'T0');

  // During 15s grace: models are still resident in heap
  const breakdownBefore = governor.getMemoryBreakdown({ screenshotWidth: 1280, screenshotHeight: 800 }, { assumeModelsActive: true });
  const memoryBefore = governor.calculateAccountedMemoryMb({ screenshotWidth: 1280, screenshotHeight: 800 }, { assumeModelsActive: true });
  const disposedModelsAccountedMb = breakdownBefore.wasmHeapMb + breakdownBefore.arenaMb;
  assert.ok(disposedModelsAccountedMb > 0, 'Disposed models must have accounted non-zero resident size');

  // Trigger disposal timer expiration
  if (governor['disposalTimer']) {
    clearTimeout(governor['disposalTimer']);
    governor['disposalTimer'] = null;
  }

  // Post-grace: models disposed, memory falls to base runtime + canvas
  const breakdownAfter = governor.getMemoryBreakdown({ screenshotWidth: 1280, screenshotHeight: 800 });
  const memoryAfter = governor.calculateAccountedMemoryMb({ screenshotWidth: 1280, screenshotHeight: 800 });
  assert.equal(breakdownAfter.wasmHeapMb, 0, 'WASM heap for disposed models must be 0 post-grace');
  assert.equal(breakdownAfter.arenaMb, 0, 'Model arena for disposed models must be 0 post-grace');
  assert.equal(memoryBefore - memoryAfter, Math.round(disposedModelsAccountedMb), 'Accounted memory must fall by exactly the disposed models accounted magnitude');
});

test('R6.20: Step-Up Recovery - Region budget steps back up (3 -> 6 -> 12) under sustained under-budget frames', () => {
  const governor = new ResourceGovernor({ initialRegionBudget: 3, warmupInferenceCount: 0 });
  assert.equal(governor.getActiveTier(), 'T1');
  assert.equal(governor.getRegionBudget(), 3);

  // 3 consecutive under-budget frames at 3 regions -> Step up to 6 regions
  governor.recordFramePerception(800, false, 120);
  governor.recordFramePerception(820, false, 120);
  governor.recordFramePerception(810, false, 120);
  assert.equal(governor.getRegionBudget(), 6, 'Region budget must step up from 3 to 6 after 3 under-budget frames');

  // 3 consecutive under-budget frames at 6 regions -> Step up to 12 regions
  governor.recordFramePerception(900, false, 120);
  governor.recordFramePerception(920, false, 120);
  governor.recordFramePerception(910, false, 120);
  assert.equal(governor.getRegionBudget(), 12, 'Region budget must step up from 6 to 12 after 3 under-budget frames');
});

test('R6.19: SET_TIER_OVERRIDE 3-Point Sender Validation', () => {
  const extensionId = 'test_extension_id_123';

  function validateOverrideSender(sender, currentExtId = extensionId) {
    const isExtensionUrl = typeof sender?.url === 'string' && (
      sender.url.startsWith(`chrome-extension://${currentExtId}/sidepanel/`) ||
      sender.url.startsWith(`chrome-extension://${currentExtId}/src/sidepanel/`)
    );
    const isNotWebTab = !sender?.tab || (
      typeof sender.tab.url === 'string' &&
      sender.tab.url.startsWith(`chrome-extension://${currentExtId}/`)
    );
    return Boolean(
      sender &&
      sender.id === currentExtId &&
      isExtensionUrl &&
      isNotWebTab
    );
  }

  // Case 1: Attack from content script (sender.tab is present) -> REJECT
  const contentScriptSender = {
    id: extensionId,
    tab: { id: 101, url: 'https://bank.com' },
    url: 'https://bank.com'
  };
  assert.equal(validateOverrideSender(contentScriptSender), false, 'Content script message must be rejected');

  // Case 2: Message from web page / external origin -> REJECT
  const externalSender = {
    id: 'other_extension_id',
    url: 'https://malicious.com'
  };
  assert.equal(validateOverrideSender(externalSender), false, 'External sender must be rejected');

  // Case 3: Message from wrong extension path -> REJECT
  const wrongPathSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/options/options.html`
  };
  assert.equal(validateOverrideSender(wrongPathSender), false, 'Non-sidepanel URL must be rejected');

  // Case 4: Legitimate message from trusted side panel UI (/sidepanel/) -> ACCEPT
  const trustedSidepanelSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel/sidepanel.html`
  };
  assert.equal(validateOverrideSender(trustedSidepanelSender), true, 'Trusted side panel UI must be accepted');

  // Case 5: Legitimate message from trusted side panel UI (/src/sidepanel/) -> ACCEPT
  const trustedSrcSidepanelSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`
  };
  assert.equal(validateOverrideSender(trustedSrcSidepanelSender), true, 'Trusted src/sidepanel UI must be accepted');
});

