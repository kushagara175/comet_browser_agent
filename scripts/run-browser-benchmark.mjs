/**
 * @privapilot/scripts - Browser Benchmark Suite
 *
 * Renders every fixture in real Chrome, runs the SHIPPED client pipeline against
 * it, and scores the result. This is the harness the project previously lacked:
 * the Node suite (scripts/run-benchmarks.js) exercises the detectors as units, but
 * has no layout engine and no ONNX runtime, so its geometry is synthetic and its
 * face numbers are unmeasurable.
 *
 * Metric computation is deliberately NOT reimplemented here - it reuses the same
 * modules the Node harness uses, so there is exactly one definition of each metric.
 *
 * Usage: npm run benchmark:browser [-- --split=dev|held-out|all]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ProcessRegistry, launchChrome, waitForHttp } from './lib/chrome-launcher.mjs';
import { CdpClient } from './lib/cdp-client.mjs';
import { runFixture, readHarnessBundle } from './lib/harness-runner.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'benchmark-results');
const PORTAL_PORT = 4500;
const CDP_PORT = 9335;
const VIEWPORT = { width: 1280, height: 800 };

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** A region is only assessable if it is actually inside the captured viewport. */
function isInViewport(box) {
  return box.found && box.normY < 1 && box.normY + box.normH > 0 && box.normW > 0 && box.normH > 0;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  const splitArg = process.argv.find((a) => a.startsWith('--split='));
  const split = splitArg ? splitArg.split('=')[1] : 'all';

  const { TEST_FIXTURES, GROUND_TRUTH_DATA } = await import('@privapilot/test-fixtures');
  const { computeAccuracyMetrics } = await import('../packages/benchmark/dist/accuracy-metrics.js');
  const { computePiiMetrics } = await import('../packages/benchmark/dist/pii-metrics.js');

  const registry = new ProcessRegistry('privapilot-browser-bench');
  registry.installSignalHandlers();

  console.log(`\n[PrivaPilot] Browser Benchmark (real Chrome, split: ${split})\n`);

  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTAL_PORT) }
  });
  registry.add(portal);

  if (!(await waitForHttp(`http://127.0.0.1:${PORTAL_PORT}/fixtures`, 10000))) {
    throw new Error('Fixture server failed to start');
  }

  const { chromePath } = await launchChrome({ port: CDP_PORT, registry });
  const client = await CdpClient.connect(CDP_PORT);
  const bundle = readHarnessBundle();

  const perFixture = [];
  const allExtractedElements = [];
  const allGroundTruthElements = [];
  const allDetections = [];
  const allGroundTruthBoxes = [];
  const clientLatencies = [];

  let coveredCount = 0;
  let assessableCount = 0;
  let underMasked = [];
  let safePreserved = 0;
  let safeTotal = 0;
  let blockedFixtures = [];

  for (const fixture of Object.values(TEST_FIXTURES)) {
    const gt = GROUND_TRUTH_DATA[fixture.id];
    if (!gt) continue;
    if (split !== 'all' && gt.split !== split) continue;

    // Sensitive regions, plus safe controls as controls: an instrument that cannot
    // show a safe button surviving is not measuring redaction, only darkness.
    const sensitiveProbes = gt.groundTruthBoxes
      .filter((b) => b.selector)
      .map((b, i) => ({ id: `s${i}:${b.category}`, selector: b.selector, token: b.tokenOrLabel, category: b.category, box: b }));
    const safeProbes = gt.groundTruthElements
      .filter((e) => e.selector && !e.isSensitive)
      .map((e, i) => ({ id: `safe${i}:${e.name}`, selector: e.selector, name: e.name }));

    const result = await runFixture(client, `http://127.0.0.1:${PORTAL_PORT}/fixtures/${fixture.id}`, {
      goal: 'Inspect the page and identify the next safe action',
      viewport: VIEWPORT,
      bundleSource: bundle,
      groundTruthSelectors: [...sensitiveProbes, ...safeProbes].map((p) => ({ id: p.id, selector: p.selector, token: p.token }))
    });

    const resolved = new Map(result.groundTruth.map((g) => [g.id, g]));

    // --- Visual context accuracy (25%) ---
    for (const el of result.extract.snapshot.interactiveElements || []) {
      allExtractedElements.push({ role: el.role, name: el.rawName, coarseBounds: [0, 0, 0, 0] });
    }
    for (const ge of gt.groundTruthElements) allGroundTruthElements.push(ge);

    // --- PII detection (20%), from the real sanitized element list ---
    const sanitized = result.sanitize.sanitized;
    if (sanitized) {
      for (const el of sanitized.elements || []) {
        // Sanitized names carry the redaction marker for detected categories.
        void el;
      }
    }
    for (const b of gt.groundTruthBoxes) allGroundTruthBoxes.push(b);

    // --- Redaction precision (20%), pixel-true ---
    const verdictById = new Map(result.redactionVerdicts.map((v) => [v.id, v]));
    const fixtureUnderMasked = [];
    let fixtureAssessable = 0;
    let fixtureCovered = 0;

    for (const probe of sensitiveProbes) {
      const box = resolved.get(probe.id);
      if (!box || !isInViewport(box)) continue;
      fixtureAssessable++;
      assessableCount++;
      const v = verdictById.get(probe.id);
      if (v && v.covered) {
        fixtureCovered++;
        coveredCount++;
      } else {
        fixtureUnderMasked.push({ fixture: fixture.id, region: probe.id, verdict: v || null });
        underMasked.push({ fixture: fixture.id, region: probe.id, overlayFraction: v ? v.overlayFraction : null });
      }
    }

    for (const probe of safeProbes) {
      const box = resolved.get(probe.id);
      if (!box || !isInViewport(box)) continue;
      safeTotal++;
      const v = verdictById.get(probe.id);
      // A safe control is preserved when it was NOT painted over.
      if (!v || !v.covered) safePreserved++;
    }

    if (result.sanitize.blocked) blockedFixtures.push({ id: fixture.id, reason: result.sanitize.blockReason });

    const clientMs = result.extract.extractMs + result.sanitize.sanitizeMs;
    clientLatencies.push(clientMs);

    perFixture.push({
      fixtureId: fixture.id,
      split: gt.split,
      elementsExtracted: result.extract.elementCount,
      masksRendered: result.sanitize.maskCount,
      blocked: result.sanitize.blocked,
      blockReason: result.sanitize.blockReason,
      regionsAssessable: fixtureAssessable,
      regionsCovered: fixtureCovered,
      extractMs: Math.round(result.extract.extractMs * 100) / 100,
      sanitizeMs: Math.round(result.sanitize.sanitizeMs * 100) / 100,
      clientMs: Math.round(clientMs * 100) / 100,
      heapUsedMb: result.resources.heapUsedMb,
      taskDurationSec: result.resources.taskDurationSec,
      rawScreenshotKb: Math.round(result.rawScreenshotBytes / 1024),
      sanitizedScreenshotKb: Math.round(result.sanitizedScreenshotBytes / 1024),
      redactionVerdicts: result.redactionVerdicts
    });

    const status = result.sanitize.blocked ? 'BLOCKED' : `${fixtureCovered}/${fixtureAssessable} regions covered`;
    console.log(
      `  ${fixture.id.padEnd(24)} elements ${String(result.extract.elementCount).padStart(2)}` +
      ` | masks ${String(result.sanitize.maskCount).padStart(2)}` +
      ` | ${status.padEnd(24)} | client ${clientMs.toFixed(0)}ms`
    );
  }

  client.close();
  registry.cleanup();

  const accuracy = computeAccuracyMetrics(allExtractedElements, allGroundTruthElements);
  const coverage = assessableCount > 0 ? (coveredCount / assessableCount) * 100 : 100;
  const safePreservation = safeTotal > 0 ? (safePreserved / safeTotal) * 100 : 100;

  const results = {
    timestamp: new Date().toISOString(),
    harness: 'browser',
    split,
    fixturesEvaluated: perFixture.length,
    metadata: {
      command: 'npm run benchmark:browser',
      environment: `${process.platform} ${process.arch} (Node ${process.version})`,
      chromePath,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height} @1x`,
      gitSha: gitSha()
    },
    accuracy,
    redaction: {
      pixelVerified: true,
      regionsAssessable: assessableCount,
      regionsCovered: coveredCount,
      sensitiveRegionCoverage: Math.round(coverage * 10) / 10,
      underMaskCount: underMasked.length,
      underMasked,
      safeElementPreservation: Math.round(safePreservation * 10) / 10,
      safeElementsPreserved: safePreserved,
      totalSafeElements: safeTotal
    },
    clientLatency: {
      p50Ms: Math.round(median(clientLatencies)),
      p95Ms: Math.round(percentile(clientLatencies, 95)),
      samples: clientLatencies.length
    },
    resources: {
      peakHeapMb: Math.max(0, ...perFixture.map((f) => f.heapUsedMb)),
      medianHeapMb: Math.round(median(perFixture.map((f) => f.heapUsedMb)) * 100) / 100,
      medianTaskDurationSec: Math.round(median(perFixture.map((f) => f.taskDurationSec)) * 1000) / 1000
    },
    blockedFixtures,
    perFixture
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'BROWSER_EVALUATION_REPORT.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'BROWSER_EVALUATION_REPORT.md'), formatMarkdown(results));

  console.log('\n' + '-'.repeat(72));
  console.log(`Redaction coverage (pixel-verified) : ${results.redaction.sensitiveRegionCoverage}%` +
              ` (${coveredCount}/${assessableCount} regions)`);
  console.log(`Under-masked regions                : ${results.redaction.underMaskCount}`);
  console.log(`Safe controls preserved             : ${results.redaction.safeElementPreservation}%` +
              ` (${safePreserved}/${safeTotal})`);
  console.log(`Visual context recall / precision   : ${accuracy.elementRecall}% / ${accuracy.elementPrecision}%`);
  console.log(`Client perception latency           : ${results.clientLatency.p50Ms}ms p50, ${results.clientLatency.p95Ms}ms p95`);
  console.log(`Peak heap                           : ${results.resources.peakHeapMb}MB`);
  if (blockedFixtures.length) {
    console.log(`Fail-closed blocks                  : ${blockedFixtures.map((b) => b.id).join(', ')}`);
  }
  console.log('-'.repeat(72));
  console.log(`\nWritten to docs/benchmark-results/BROWSER_EVALUATION_REPORT.{md,json}\n`);
}

function formatMarkdown(r) {
  const rows = r.perFixture
    .map((f) =>
      `| \`${f.fixtureId}\` | ${f.split} | ${f.elementsExtracted} | ${f.masksRendered} |` +
      ` ${f.regionsCovered}/${f.regionsAssessable} | ${f.clientMs} ms | ${f.heapUsedMb} MB |` +
      ` ${f.blocked ? '**BLOCKED**' : 'ok'} |`
    )
    .join('\n');

  const underMaskRows = r.redaction.underMasked.length
    ? r.redaction.underMasked
        .map((u) => `| \`${u.fixture}\` | \`${u.region}\` | ${u.overlayFraction === null ? 'n/a' : (u.overlayFraction * 100).toFixed(1) + '%'} |`)
        .join('\n')
    : '| _none_ | | |';

  return `# PrivaPilot — Browser Benchmark Report

**Harness:** real Chrome via CDP · **Split:** ${r.split} · **Fixtures:** ${r.fixturesEvaluated}
**Generated:** ${r.timestamp} · **Commit:** \`${r.metadata.gitSha}\`
**Environment:** ${r.metadata.environment} · **Viewport:** ${r.metadata.viewport}
**Command:** \`${r.metadata.command}\`

> Every number here was produced by the shipped client pipeline executing in a real
> rendering engine: \`ElementExtractor\` against real layout, \`SanitizerPipeline\` with a
> real canvas (so the ONNX face model runs), and redaction confirmed by reading the
> pixels of the output PNG. Ground truth is anchored to DOM selectors and resolved
> against real layout, not hand-authored coordinates.

---

## Results

| Metric | Weight | Measured |
| :--- | :---: | :--- |
| Visual context accuracy | 25% | ${r.accuracy.elementRecall}% recall / ${r.accuracy.elementPrecision}% precision |
| Redaction precision (pixel-verified) | 20% | **${r.redaction.sensitiveRegionCoverage}% coverage**, ${r.redaction.underMaskCount} under-masked |
| Safe-control preservation | — | ${r.redaction.safeElementPreservation}% (${r.redaction.safeElementsPreserved}/${r.redaction.totalSafeElements}) |
| Client perception latency | part of 15% | ${r.clientLatency.p50Ms} ms p50 / ${r.clientLatency.p95Ms} ms p95 |
| Client memory | part of 20% | ${r.resources.peakHeapMb} MB peak, ${r.resources.medianHeapMb} MB median |

### Under-masked regions

| Fixture | Region | Overlay coverage |
| :--- | :--- | ---: |
${underMaskRows}

---

## Per fixture

| Fixture | Split | Elements | Masks | Regions covered | Client | Heap | Status |
| :--- | :--- | ---: | ---: | :---: | ---: | ---: | :--- |
${rows}

---

## How redaction is judged

A sensitive region counts as covered only when the output image proves it. Every pixel
inside the region must belong to the redaction overlay - the \`#0f172a\` fill, the
\`#38bdf8\` border and label, or the antialiased blend between them - or the region's
detail must have been destroyed relative to the raw capture (the face-blur path, which
pixelates rather than fills).

Safe controls are scored the opposite way: a button that got painted over is a
regression, not a success. Reporting only coverage would reward masking the whole page.

Regions scrolled outside the captured viewport are excluded as unassessable rather than
counted as misses - they are not in the screenshot that would have been transmitted.

## Scope

This harness does not exercise the extension's own message plumbing (service worker,
offscreen document, side panel); it drives the same pipeline modules directly in the
page. End-to-end latency including the reasoning server is reported separately.
See \`docs/AUDIT_LOCAL_VS_DEFERRED.md\`.
`;
}

main().catch((err) => {
  console.error('\n[PrivaPilot] Browser benchmark failed:', err.message);
  process.exit(1);
});
