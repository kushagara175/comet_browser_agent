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
  readonly opaqueFraction: number;
  readonly overlayFraction: number;
  readonly residualVariance: number;
  readonly rawVariance: number;
  readonly varianceReduction: number;
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
 * Pixel-true redaction check.
 *
 * The shipped PostRedactionVerifier only compares detected-region count to
 * rendered-mask count and never reads a pixel, so a mask drawn at the wrong
 * coordinates passes it. This reads the actual output image and asks the question
 * the rubric asks: is this region genuinely destroyed?
 *
 * A region counts as covered if it is painted with the opaque mask fill, or if
 * most of its original detail is gone relative to the raw capture (the blur path).
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
    // A featureless region carries no detail to destroy, so variance says nothing
    // about whether it was masked. Reporting 1.0 there let an unmasked flat region
    // pass as covered. Only the overlay test is meaningful in that case.
    const rawHasDetail = rawVariance >= 5;
    const varianceReduction = rawHasDetail ? 1 - residualVariance / rawVariance : 0;

    // Covered when essentially every pixel belongs to the redaction overlay, or when
    // the blur path has destroyed the detail that was there (faces are pixelated, not
    // filled, so they never match the overlay palette).
    // Covered when essentially every pixel belongs to the redaction overlay, or when
    // the blur path destroyed real detail that was present (faces are pixelated, not
    // filled, so they never match the overlay palette).
    const covered =
      overlayFraction >= 0.98 ||
      (rawHasDetail && varianceReduction >= 0.8 && residualVariance < 150);

    return {
      id: region.id,
      covered,
      opaqueFraction: Math.round(opaqueFraction * 1000) / 1000,
      overlayFraction: Math.round(overlayFraction * 1000) / 1000,
      residualVariance: Math.round(residualVariance * 10) / 10,
      rawVariance: Math.round(rawVariance * 10) / 10,
      varianceReduction: Math.round(varianceReduction * 1000) / 1000,
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
