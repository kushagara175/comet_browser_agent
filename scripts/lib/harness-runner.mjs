/**
 * @privapilot/scripts - Browser harness runner
 *
 * Renders a page in real Chrome, injects the shipped pipeline bundle, and runs
 * extraction -> sanitization -> pixel-true redaction verification against it.
 *
 * This is the piece the project has never had: every previous "benchmark" number
 * for visual accuracy, redaction and client resources was produced without a
 * browser, without layout, and without the ONNX model ever executing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpPage } from './cdp-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const HARNESS_BUNDLE = path.join(ROOT_DIR, 'apps', 'extension', 'dist', 'harness', 'harness-entry.js');

export function readHarnessBundle() {
  if (!fs.existsSync(HARNESS_BUNDLE)) {
    throw new Error(`Harness bundle missing at ${HARNESS_BUNDLE}. Run \`npm run build\` first.`);
  }
  return fs.readFileSync(HARNESS_BUNDLE, 'utf-8');
}

/** JSON-encodes a value for safe embedding in an evaluated expression. */
function lit(value) {
  return JSON.stringify(value);
}

/**
 * Runs the full client perception pipeline against one URL.
 *
 * Returns raw results only - all scoring happens in the metric modules, which are
 * shared with the Node harness so there is exactly one implementation of each metric.
 */
export async function runFixture(client, url, {
  goal = 'Inspect the page',
  viewport = { width: 1280, height: 800 },
  groundTruthSelectors = [],
  bundleSource = null,
  freeze = true,
  beforeExtraction = null
} = {}) {
  const source = bundleSource || readHarnessBundle();

  const { targetId, sessionId } = await client.newPage('about:blank');
  const page = new CdpPage(client, sessionId, targetId);

  try {
    await page.enableDomains();
    await page.setViewport(viewport.width, viewport.height);

    const metricsBefore = await page.metrics();
    const navStart = Date.now();
    await page.goto(url);
    const navMs = Date.now() - navStart;

    // Inject the shipped pipeline. Injected after load so it sees final layout.
    await page.evaluate(source, { awaitPromise: false });

    const hasGlobal = await page.evaluate('typeof __privapilot === "object"', { awaitPromise: false });
    if (!hasGlobal) {
      throw new Error('Harness bundle did not expose the __privapilot global');
    }

    if (freeze) {
      await page.evaluate('__privapilot.freezeAnimations(), true', { awaitPromise: false });
    }
    if (beforeExtraction) await beforeExtraction(page);

    // 1. Real element extraction against real layout
    const extraction = await page.evaluate('JSON.stringify(__privapilot.extractSnapshot())', { awaitPromise: false });
    const extract = JSON.parse(extraction);

    // 2. Ground truth resolved against real layout, not a synthetic grid
    let resolvedGroundTruth = [];
    if (groundTruthSelectors.length) {
      const gt = await page.evaluate(
        `JSON.stringify(__privapilot.resolveSelectorBoxes(${lit(groundTruthSelectors)}))`,
        { awaitPromise: false }
      );
      resolvedGroundTruth = JSON.parse(gt);
    }

    // 3. Real screenshot
    const rawScreenshot = await page.captureScreenshot();

    // 4. Real sanitization, canvas supplied so the ONNX model actually runs
    const sanitizeExpr =
      `__privapilot.sanitize(${lit(rawScreenshot)}, ` +
      `${lit(extract.snapshot)}, ${lit(extract.viewport)}, ${lit(goal)})` +
      `.then(r => JSON.stringify({ blocked: r.blocked, blockReason: r.blockReason, ` +
      `sanitizeMs: r.sanitizeMs, maskCount: r.maskCount, elementCount: r.elementCount, ` +
      `sanitized: r.sanitized, shot: r.sanitizedScreenshotDataUrl }))`;

    const sanitizeJson = await page.evaluate(sanitizeExpr, { timeoutMs: 120000 });
    const sanitizeResult = JSON.parse(sanitizeJson);

    // 5. Pixel-true redaction verification against the ground-truth regions
    let redactionVerdicts = [];
    const probes = resolvedGroundTruth
      .filter((g) => g.found)
      .map((g) => ({ id: g.id, normX: g.normX, normY: g.normY, normW: g.normW, normH: g.normH }));

    if (!sanitizeResult.blocked && probes.length && sanitizeResult.shot) {
      const verifyExpr =
        `__privapilot.verifyRedaction(${lit(rawScreenshot)}, ${lit(sanitizeResult.shot)}, ${lit(probes)})` +
        `.then(v => JSON.stringify(v))`;
      redactionVerdicts = JSON.parse(await page.evaluate(verifyExpr, { timeoutMs: 60000 }));
    }

    const metricsAfter = await page.metrics();

    return {
      url,
      navMs,
      extract: {
        elementCount: extract.elementCount,
        extractMs: extract.extractMs,
        snapshot: extract.snapshot,
        viewport: extract.viewport
      },
      groundTruth: resolvedGroundTruth,
      sanitize: {
        blocked: sanitizeResult.blocked,
        blockReason: sanitizeResult.blockReason,
        sanitizeMs: sanitizeResult.sanitizeMs,
        maskCount: sanitizeResult.maskCount,
        elementCount: sanitizeResult.elementCount,
        sanitized: sanitizeResult.sanitized
      },
      rawScreenshotBytes: Math.round(rawScreenshot.length * 0.75),
      sanitizedScreenshotBytes: sanitizeResult.shot ? Math.round(sanitizeResult.shot.length * 0.75) : 0,
      redactionVerdicts,
      resources: {
        heapUsedMb: Math.round(((metricsAfter.JSHeapUsedSize || 0) / 1048576) * 100) / 100,
        heapDeltaMb:
          Math.round((((metricsAfter.JSHeapUsedSize || 0) - (metricsBefore.JSHeapUsedSize || 0)) / 1048576) * 100) / 100,
        taskDurationSec: Math.round(((metricsAfter.TaskDuration || 0) - (metricsBefore.TaskDuration || 0)) * 1000) / 1000,
        layoutDurationSec:
          Math.round(((metricsAfter.LayoutDuration || 0) - (metricsBefore.LayoutDuration || 0)) * 1000) / 1000
      }
    };
  } finally {
    await page.close();
  }
}
