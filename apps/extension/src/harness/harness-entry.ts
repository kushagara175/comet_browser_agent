/**
 * @privapilot/extension - Benchmark Harness Entry Point
 *
 * Exposes the SHIPPED client pipeline to a CDP-driven benchmark so it can be
 * measured in a real rendering engine.
 *
 * This exists because the previous benchmark had no browser: it scored string
 * matches against fixture literals and synthetic coordinates, and never executed
 * the element extractor, the mask renderer, or the ONNX face model. Everything
 * below calls the production modules unmodified - this file contains no detection
 * logic of its own, and must never be allowed to grow any.
 *
 * Bundled by scripts/build.js as an IIFE under the global `__privapilot`.
 */

import { ElementExtractor } from '../content/element-extractor.js';
import { SanitizerPipeline } from '../sanitizer/pipeline.js';
import { CoordinateTransformer } from '../sanitizer/coordinate-transformer.js';
import { MaskRenderer } from '../sanitizer/mask-renderer.js';
import { PostRedactionVerifier } from '../sanitizer/post-redaction-verifier.js';
import { UltraFaceModelRunner } from '../vision/face-model.js';
import { RawCapture, SanitizedContext, ViewportMetadata } from '@privapilot/protocol';

/**
 * Must match protocol ViewportMetadata exactly. Emitting innerWidth/innerHeight
 * instead of viewportWidth/viewportHeight silently produces NaN boxes downstream:
 * fillRect(NaN) is a no-op that still increments the mask count, so nothing is
 * masked and the count-based verifier still passes.
 */
export type HarnessViewport = ViewportMetadata;

export interface HarnessExtractResult {
  readonly snapshot: any;
  readonly viewport: HarnessViewport;
  readonly elementCount: number;
  readonly extractMs: number;
}

/**
 * Mirrors what content-main.ts reads off `window`. The extractor itself does not
 * gather this, so the harness must supply it the same way the content script does.
 */
function readViewport(): HarnessViewport {
  const dpr = window.devicePixelRatio || 1;
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenshotWidth: Math.round(window.innerWidth * dpr),
    screenshotHeight: Math.round(window.innerHeight * dpr),
    devicePixelRatio: dpr,
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
    documentHeight: Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    ),
    captureTimestamp: Date.now()
  };
}

/** Runs the real element extractor against the live document. */
export function extractSnapshot(): HarnessExtractResult {
  const t0 = performance.now();
  const { snapshot } = new ElementExtractor().extractSnapshot(document);
  const extractMs = performance.now() - t0;

  return {
    snapshot,
    viewport: readViewport(),
    elementCount: snapshot.interactiveElements.length,
    extractMs
  };
}

/** Decodes a data URL onto a canvas, exactly as the offscreen host does. */
async function decodeToCanvas(dataUrl: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable in harness');

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Harness failed to decode screenshot data URL'));
    img.src = dataUrl;
  });

  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export interface HarnessSanitizeResult {
  readonly sanitized: SanitizedContext | null;
  readonly blocked: boolean;
  readonly blockReason?: string;
  readonly sanitizeMs: number;
  readonly maskCount: number;
  readonly elementCount: number;
  readonly sanitizedScreenshotDataUrl: string;
}

/**
 * Runs the real sanitizer against a captured screenshot, with a canvas supplied -
 * which is what enables the ONNX face model. Fail-closed blocks are reported
 * rather than thrown, so a blocked fixture stays measurable instead of fatal.
 */
export async function sanitize(
  screenshotDataUrl: string,
  snapshot: any,
  viewport: HarnessViewport,
  goal: string
): Promise<HarnessSanitizeResult> {
  const rawCapture: RawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'harness_' + Date.now(),
    timestamp: Date.now(),
    rawScreenshotDataUrl: screenshotDataUrl,
    rawDomSummary: snapshot,
    metadata: viewport as any
  };

  const canvas = await decodeToCanvas(screenshotDataUrl, viewport.screenshotWidth, viewport.screenshotHeight);

  const t0 = performance.now();
  try {
    const sanitized = await SanitizerPipeline.sanitize(rawCapture, snapshot, goal, canvas);
    return {
      sanitized,
      blocked: false,
      sanitizeMs: performance.now() - t0,
      maskCount: sanitized.maskCount,
      elementCount: sanitized.elements.length,
      sanitizedScreenshotDataUrl: sanitized.sanitizedScreenshotDataUrl
    };
  } catch (err: any) {
    return {
      sanitized: null,
      blocked: true,
      blockReason: String(err && err.message ? err.message : err),
      sanitizeMs: performance.now() - t0,
      maskCount: 0,
      elementCount: 0,
      sanitizedScreenshotDataUrl: ''
    };
  }
}

export interface FailClosedProbe {
  readonly correctPlacement: { isValid: boolean; reason?: string };
  readonly displacedPlacement: { isValid: boolean; reason?: string };
  /** True only when a correct mask passes AND a displaced one is rejected. */
  readonly passed: boolean;
}

/**
 * Proves the SHIPPED verifier fails closed when a mask misses its region.
 *
 * Renders a real mask through MaskRenderer twice - once on the region and once
 * offset away from it - and runs PostRedactionVerifier over both. The second case
 * is the one the old count-based check waved through: a mask was rendered, the
 * count matched, and the secret was still legible underneath.
 */
export function probeDisplacedMaskFailsClosed(): FailClosedProbe {
  const W = 400;
  const H = 200;
  const box = { x: 50, y: 50, width: 140, height: 34 };

  const build = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    // Deterministic high-frequency content, so "detail destroyed" is measurable.
    // NOT a near-black: #101820 sits inside the tolerance of the mask fill #0f172a,
    // so the secret text itself was being counted as redaction overlay and excluded
    // from the residual-detail measurement. The probe passed for the wrong reason.
    ctx.fillStyle = '#7f1d1d';
    ctx.font = 'bold 22px monospace';
    for (let i = 0; i < 6; i++) ctx.fillText('4532 8901 2342', 8, 30 + i * 30);
    return c;
  };

  const region: any = {
    id: 'probe_region',
    category: 'national_id',
    viewportBox: { space: 'viewportCssPixel', ...box },
    screenshotBox: { space: 'screenshotPixel', ...box },
    detectorSource: 'text_regex',
    method: 'opaque_mask',
    label: 'PROBE'
  };

  const onTarget = build();
  const detail = PostRedactionVerifier.measurePreMaskDetail(onTarget, [region]);
  MaskRenderer.renderMasks(onTarget, [region]);
  const correctPlacement = PostRedactionVerifier.verifyPixelCoverage(onTarget, [region], detail);

  // Same mask, drawn 180px to the right of where the secret actually is.
  const displaced = build();
  const displacedRegion = {
    ...region,
    screenshotBox: { ...region.screenshotBox, x: box.x + 180 }
  };
  MaskRenderer.renderMasks(displaced, [displacedRegion]);
  const displacedPlacement = PostRedactionVerifier.verifyPixelCoverage(displaced, [region], detail);

  return {
    correctPlacement,
    displacedPlacement,
    passed: correctPlacement.isValid && !displacedPlacement.isValid
  };
}

/**
 * Points the vision model at an HTTP asset base. Required outside the extension,
 * where `chrome.runtime.getURL` does not exist.
 */
export function configureVisionAssets(assetBase: string | null): void {
  UltraFaceModelRunner.configure(assetBase);
}

export interface HarnessFaceResult {
  readonly providerUsed: string;
  readonly durationMs: number;
  readonly faces: ReadonlyArray<{
    readonly confidence: number;
    readonly box: readonly [number, number, number, number];
    readonly areaFraction: number;
  }>;
}

/**
 * Runs ONLY the ONNX face model and reports what it returned.
 *
 * Face detection had no instrument at all: the model's output reached the mask
 * renderer and nothing else, so a false positive was invisible unless it happened
 * to land on a ground-truth box. Exposing the raw detections is what makes face
 * behaviour - and `providerUsed`, which silently degrades to `heuristic_fallback`
 * on any error - measurable rather than assumed.
 */
export async function detectFaces(
  screenshotDataUrl: string,
  viewport: HarnessViewport
): Promise<HarnessFaceResult> {
  const canvas = await decodeToCanvas(screenshotDataUrl, viewport.screenshotWidth, viewport.screenshotHeight);
  const transformer = new CoordinateTransformer(viewport as any);
  const result = await UltraFaceModelRunner.detectFaces(canvas, transformer);
  const total = viewport.screenshotWidth * viewport.screenshotHeight;

  return {
    providerUsed: result.providerUsed,
    durationMs: result.durationMs,
    faces: result.faces.map((f) => ({
      confidence: Math.round(f.confidence * 1000) / 1000,
      box: [f.screenshotBox.x, f.screenshotBox.y, f.screenshotBox.width, f.screenshotBox.height] as const,
      areaFraction:
        Math.round(((f.screenshotBox.width * f.screenshotBox.height) / Math.max(1, total)) * 10000) / 10000
    }))
  };
}

export interface RegionProbe {
  readonly id: string;
  readonly normX: number;
  readonly normY: number;
  readonly normW: number;
  readonly normH: number;
}

export interface RegionVerdict {
  readonly id: string;
  readonly covered: boolean;
  /** False when the raw region carried too little detail for any pixel test to judge it. */
  readonly assessable: boolean;
  readonly opaqueFraction: number;
  readonly overlayFraction: number;
  readonly residualVariance: number;
  readonly rawVariance: number;
  readonly varianceReduction: number;
  /** Mean local luminance gradient in the raw region. */
  readonly rawDetail: number;
  /** The same, in the sanitized region, ignoring redaction chrome. */
  readonly residualDetail: number;
  readonly detailRemoved: number;
  readonly sampledPixels: number;
}

/** Mean luminance variance over a pixel block - a proxy for "is there still detail here". */
function varianceOf(data: Uint8ClampedArray): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/** Fraction of pixels matching the opaque mask fill #0f172a within tolerance. */
function opaqueFractionOf(data: Uint8ClampedArray, tolerance = 24): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - 0x0f) <= tolerance &&
      Math.abs(data[i + 1] - 0x17) <= tolerance &&
      Math.abs(data[i + 2] - 0x2a) <= tolerance
    ) {
      hits++;
    }
  }
  return hits / n;
}

// The mask overlay's palette. MaskRenderer fills #0f172a, then strokes a #38bdf8
// border and draws a #38bdf8 "[REDACTED: ...]" label ON TOP of that fill.
const MASK_FILL = [0x0f, 0x17, 0x2a];
const MASK_CHROME = [0x38, 0xbd, 0xf8];

/**
 * Fraction of pixels belonging to the redaction overlay rather than page content.
 *
 * Asking only "how much is the fill colour" under-reports, because the border and
 * label are deliberately drawn in a second colour - a correctly masked field reads
 * ~88% fill, never 100%. What actually matters is that no pixel in the region is
 * original page content, so this accepts the fill, the chrome colour, and the
 * antialiased blend between them (which is what the label's edges are).
 */
function overlayFractionOf(data: Uint8ClampedArray, tolerance = 30): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  const dg = MASK_CHROME[1] - MASK_FILL[1];
  let hits = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Estimate the blend factor from green (the widest-separated channel), then
    // check the other channels agree. Pixels off that line are page content.
    const t = Math.max(0, Math.min(1, (data[i + 1] - MASK_FILL[1]) / dg));
    const er = Math.abs(data[i] - (MASK_FILL[0] + t * (MASK_CHROME[0] - MASK_FILL[0])));
    const eg = Math.abs(data[i + 1] - (MASK_FILL[1] + t * dg));
    const eb = Math.abs(data[i + 2] - (MASK_FILL[2] + t * (MASK_CHROME[2] - MASK_FILL[2])));
    if (er <= tolerance && eg <= tolerance && eb <= tolerance) hits++;
  }
  return hits / n;
}

/**
 * Mean absolute luminance gradient between adjacent pixels - "how much fine detail
 * is left here".
 *
 * This is the measure that matters for the pixelation path, and global variance is
 * NOT. MaskRenderer redacts faces by replacing each 8-24px block with its own mean
 * colour, which by construction *preserves* the between-block variance and destroys
 * only the variance within a block. On a region whose detail is mostly large-scale,
 * global variance therefore barely moves, and `1 - residual/raw` never reaches the
 * 0.8 the old check demanded - so a correctly pixelated face scored as under-masked.
 *
 * Local gradient does move: after pixelation, neighbouring pixels are identical
 * everywhere except on block seams.
 *
 * `skipOverlay` excludes pixels belonging to the redaction chrome. The renderer
 * stamps a 1px border and a "[FACE BLUR]" badge over the pixelated area, and that
 * text is high-contrast - counting it would report the mask's own label as surviving
 * page detail.
 */
function localDetailOf(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  skipOverlay = false
): number {
  if (w < 2 || h < 2) return 0;

  const lum = new Float32Array(w * h);
  const usable = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    usable[p] = skipOverlay && isOverlayPixel(data[i], data[i + 1], data[i + 2]) ? 0 : 1;
  }

  let sum = 0;
  let pairs = 0;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const p = yy * w + xx;
      if (!usable[p]) continue;
      if (xx + 1 < w && usable[p + 1]) {
        sum += Math.abs(lum[p] - lum[p + 1]);
        pairs++;
      }
      if (yy + 1 < h && usable[p + w]) {
        sum += Math.abs(lum[p] - lum[p + w]);
        pairs++;
      }
    }
  }

  return pairs === 0 ? 0 : sum / pairs;
}

/** True when a pixel lies on the fill-to-chrome line of the redaction palette. */
function isOverlayPixel(r: number, g: number, b: number, tolerance = 30): boolean {
  const dg = MASK_CHROME[1] - MASK_FILL[1];
  const t = Math.max(0, Math.min(1, (g - MASK_FILL[1]) / dg));
  return (
    Math.abs(r - (MASK_FILL[0] + t * (MASK_CHROME[0] - MASK_FILL[0]))) <= tolerance &&
    Math.abs(g - (MASK_FILL[1] + t * dg)) <= tolerance &&
    Math.abs(b - (MASK_FILL[2] + t * (MASK_CHROME[2] - MASK_FILL[2]))) <= tolerance
  );
}

/**
 * Minimum local detail a raw region must carry before its redaction can be judged
 * at all. Below this the region is featureless, destroying it is a no-op, and no
 * pixel test can tell a masked flat area from an untouched one - so it is reported
 * unassessable rather than being scored either way.
 */
const MIN_RAW_DETAIL = 3.0;

/**
 * Pixel-true redaction check.
 *
 * The shipped PostRedactionVerifier only compares detected-region count to
 * rendered-mask count and never reads a pixel, so a mask drawn at the wrong
 * coordinates passes it. This reads the actual output image and asks the question
 * the rubric asks: is this region genuinely destroyed?
 *
 * A region counts as covered if it is painted with the opaque mask fill, or if the
 * fine detail that was there has been destroyed (the pixelation path).
 */
export async function verifyRedaction(
  rawDataUrl: string,
  sanitizedDataUrl: string,
  regions: ReadonlyArray<RegionProbe>
): Promise<RegionVerdict[]> {
  if (!regions.length) return [];

  const probe = new Image();
  await new Promise<void>((resolve, reject) => {
    probe.onload = () => resolve();
    probe.onerror = () => reject(new Error('Failed to decode sanitized screenshot'));
    probe.src = sanitizedDataUrl;
  });

  const width = probe.naturalWidth;
  const height = probe.naturalHeight;

  const sanitizedCanvas = await decodeToCanvas(sanitizedDataUrl, width, height);
  const rawCanvas = await decodeToCanvas(rawDataUrl, width, height);
  const sCtx = sanitizedCanvas.getContext('2d');
  const rCtx = rawCanvas.getContext('2d');
  if (!sCtx || !rCtx) throw new Error('Canvas 2D context unavailable for redaction verification');

  return regions.map((region) => {
    const x = Math.max(0, Math.min(width - 1, Math.floor(region.normX * width)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(region.normY * height)));
    const w = Math.max(1, Math.min(width - x, Math.round(region.normW * width)));
    const h = Math.max(1, Math.min(height - y, Math.round(region.normH * height)));

    const sData = sCtx.getImageData(x, y, w, h).data;
    const rData = rCtx.getImageData(x, y, w, h).data;

    const opaqueFraction = opaqueFractionOf(sData);
    const overlayFraction = overlayFractionOf(sData);
    const residualVariance = varianceOf(sData);
    const rawVariance = varianceOf(rData);
    const varianceReduction = rawVariance >= 5 ? 1 - residualVariance / rawVariance : 0;

    const rawDetail = localDetailOf(rData, w, h);
    const residualDetail = localDetailOf(sData, w, h, true);
    const detailRemoved = rawDetail >= MIN_RAW_DETAIL ? Math.max(0, 1 - residualDetail / rawDetail) : 0;

    // Fully painted over: settled, whatever the source looked like.
    const paintedOver = overlayFraction >= 0.98;

    // Otherwise the verdict depends on destroying detail that actually existed. A
    // featureless source carries none, so nothing can be proven either way and the
    // region is excluded from the score rather than counted as a pass - this is the
    // same trap that once let an untouched flat region report as covered.
    const assessable = paintedOver || rawDetail >= MIN_RAW_DETAIL;
    const covered = paintedOver || (assessable && detailRemoved >= 0.7);

    return {
      id: region.id,
      covered,
      assessable,
      opaqueFraction: Math.round(opaqueFraction * 1000) / 1000,
      overlayFraction: Math.round(overlayFraction * 1000) / 1000,
      residualVariance: Math.round(residualVariance * 10) / 10,
      rawVariance: Math.round(rawVariance * 10) / 10,
      varianceReduction: Math.round(varianceReduction * 1000) / 1000,
      rawDetail: Math.round(rawDetail * 100) / 100,
      residualDetail: Math.round(residualDetail * 100) / 100,
      detailRemoved: Math.round(detailRemoved * 1000) / 1000,
      sampledPixels: w * h
    };
  });
}

/**
 * Resolves ground-truth selectors against real layout, so ground truth can describe
 * WHICH element is sensitive rather than where it happened to sit in a synthetic grid.
 */
/**
 * Narrows to the on-screen rect of `token` inside `el`, when the secret occupies only
 * part of a block element. A paragraph reading "Token: <secret>" spans the full
 * container width, so scoring the whole paragraph would demand that the product mask
 * text that is not sensitive - i.e. it would penalise correct behaviour and reward
 * over-masking.
 */
function rectOfTokenWithin(el: Element, token: string): DOMRect | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const idx = text.indexOf(token);
    if (idx === -1) continue;
    try {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + token.length);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return rect;
    } catch {
      // Ranges can fail across document boundaries; fall through to the element rect.
    }
  }
  return null;
}

export function resolveSelectorBoxes(
  entries: ReadonlyArray<{ id: string; selector: string; token?: string }>
): Array<{ id: string; found: boolean; anchor: string; normX: number; normY: number; normW: number; normH: number }> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return entries.map((entry) => {
    let el: Element | null = null;
    try {
      el = document.querySelector(entry.selector);
    } catch {
      el = null;
    }
    if (!el) return { id: entry.id, found: false, anchor: 'none', normX: 0, normY: 0, normW: 0, normH: 0 };

    let rect: DOMRect | null = null;
    let anchor = 'element';

    if (entry.token) {
      const tokenRect = rectOfTokenWithin(el, entry.token);
      if (tokenRect) {
        rect = tokenRect;
        anchor = 'text-range';
      }
    }
    if (!rect) rect = el.getBoundingClientRect();

    return {
      id: entry.id,
      found: true,
      anchor,
      normX: rect.left / vw,
      normY: rect.top / vh,
      normW: rect.width / vw,
      normH: rect.height / vh
    };
  });
}

/** Stops animation loops and transitions so repeated screenshots are comparable. */
export function freezeAnimations(): void {
  const w = window as any;
  const highest = w.setTimeout(() => undefined, 0);
  for (let id = highest; id >= 0; id--) {
    w.clearTimeout(id);
    w.clearInterval(id);
  }
  const style = document.createElement('style');
  style.textContent =
    '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  document.head.appendChild(style);
}
