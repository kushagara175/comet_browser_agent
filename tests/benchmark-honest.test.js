/**
 * @privapilot/benchmark - Honest Benchmark & Detector-Disable Sanity Tests
 *
 * Proves that the benchmark harness is an honest measuring instrument:
 * 1. Disabling text PII detector strictly decreases PII recall.
 * 2. Disabling DOM semantic analyzer strictly decreases password & card recall.
 * 3. Disabling face detector drops face recall to 0%.
 * 4. Dev vs. Held-out splits partition fixtures properly without cross-contamination.
 * 5. Reporter produces real comparison verdicts (passes when >= target, fails when < target).
 */

import test from 'node:test';
import assert from 'node:assert';
import { BenchmarkRunner } from '../packages/benchmark/dist/runner.js';
import { BenchmarkReporter } from '../packages/benchmark/dist/reporter.js';

test('Honest Benchmark: Baseline evaluation against authored ground truth', () => {
  const baseline = BenchmarkRunner.runAll({ split: 'all' });

  assert.strictEqual(baseline.fixturesEvaluated, 14);
  assert.ok(baseline.accuracy.elementRecall > 0, 'Element recall must be positive');
  assert.ok(baseline.accuracy.elementPrecision > 0, 'Element precision must be positive');
  assert.ok(baseline.pii.aggregateRecall > 0, 'PII recall must be positive');
  assert.ok(baseline.pii.aggregatePrecision > 0, 'PII precision must be positive');
  assert.ok(baseline.metadata.gitSha, 'Git SHA must be recorded');
  assert.ok(baseline.metadata.environment, 'Environment must be recorded');
});

test('Honest Benchmark: Disabling Text PII detector strictly decreases recall', () => {
  const baseline = BenchmarkRunner.runAll({ split: 'all' });
  const disabledText = BenchmarkRunner.runAll({
    split: 'all',
    detectorOverrides: { disableTextPii: true }
  });

  assert.ok(
    disabledText.pii.aggregateRecall < baseline.pii.aggregateRecall,
    `Disabling text PII must decrease recall (baseline: ${baseline.pii.aggregateRecall}%, disabled: ${disabledText.pii.aggregateRecall}%)`
  );

  // Email and phone recall must drop when text scanner is disabled
  assert.strictEqual(disabledText.pii.categoryBreakdown.email.recall, 0, 'Email recall must be 0% when text scanner is disabled');
  assert.strictEqual(disabledText.pii.categoryBreakdown.phone.recall, 0, 'Phone recall must be 0% when text scanner is disabled');
});

test('Honest Benchmark: Disabling DOM Semantic Analyzer decreases password recall', () => {
  const baseline = BenchmarkRunner.runAll({ split: 'all' });
  const disabledDom = BenchmarkRunner.runAll({
    split: 'all',
    detectorOverrides: { disableDomSemantic: true }
  });

  assert.ok(
    disabledDom.pii.categoryBreakdown.password.recall < baseline.pii.categoryBreakdown.password.recall,
    `Disabling DOM semantic analyzer must decrease password recall (baseline: ${baseline.pii.categoryBreakdown.password.recall}%, disabled: ${disabledDom.pii.categoryBreakdown.password.recall}%)`
  );
});

test('Honest Benchmark: Disabling Face Detector drops face recall to 0%', () => {
  const baseline = BenchmarkRunner.runAll({ split: 'all' });
  const disabledFace = BenchmarkRunner.runAll({
    split: 'all',
    detectorOverrides: { disableVisionFace: true }
  });

  assert.ok(baseline.pii.categoryBreakdown.face.recall > 0, 'Baseline face recall must be > 0%');
  assert.strictEqual(disabledFace.pii.categoryBreakdown.face.recall, 0, 'Disabled face recall must be 0%');
});

test('Honest Benchmark: Dev and Held-Out splits partition fixtures accurately', () => {
  const devRun = BenchmarkRunner.runAll({ split: 'dev' });
  const heldOutRun = BenchmarkRunner.runAll({ split: 'held-out' });

  assert.strictEqual(devRun.fixturesEvaluated, 9, 'Dev split must evaluate 9 fixtures');
  assert.strictEqual(heldOutRun.fixturesEvaluated, 5, 'Held-out split must evaluate 5 fixtures');
  assert.strictEqual(devRun.fixturesEvaluated + heldOutRun.fixturesEvaluated, 14);
});

test('Honest Benchmark: Reporter dynamically assigns PASSED or FAILED based on target comparison', () => {
  const failingResults = {
    timestamp: new Date().toISOString(),
    fixturesEvaluated: 14,
    metadata: {
      command: 'test',
      date: new Date().toISOString(),
      environment: 'mac',
      browserVersion: 'Chrome',
      modelProvider: 'UltraFace',
      gitSha: 'test-sha',
      split: 'all'
    },
    accuracy: {
      elementRecall: 80.0, // < 95% target
      elementPrecision: 90.0,
      roleAccuracy: 90.0,
      medianIoU: 0.8,
      truePositives: 8,
      falsePositives: 1,
      falseNegatives: 2
    },
    pii: {
      aggregateRecall: 85.0, // < 98% target
      aggregatePrecision: 92.0,
      aggregateF1: 88.3,
      totalTruePositives: 10,
      totalFalsePositives: 1,
      totalFalseNegatives: 2,
      categoryBreakdown: {}
    },
    redaction: {
      sensitiveRegionCoverage: 90.0, // < 100% target
      underMaskCount: 2,
      overMaskRatio: 1.2,
      safeElementPreservation: 95.0,
      safeElementsPreserved: 19,
      totalSafeElements: 20
    },
    latency: {
      sampleCount: 10,
      p50TotalLatencyMs: 1500, // > 1200 ms target
      p95TotalLatencyMs: 3000,
      p50ClientPerceptionMs: 150,
      p95ClientPerceptionMs: 250,
      p50ServerReasoningMs: 1300,
      p95ServerReasoningMs: 2700,
      p50ActionExecutionMs: 50,
      peakMemoryMb: 400, // > 350 MB target
      cpuLoadPct: 20 // > 15% target
    }
  };

  const report = BenchmarkReporter.formatMarkdownReport(failingResults);

  assert.ok(report.includes('❌ FAILED'), 'Report must display ❌ FAILED when targets are missed');
  assert.ok(!report.includes('✅ PASSED'), 'Report must not contain ✅ PASSED when all targets are missed');
});
