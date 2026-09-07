/**
 * @privapilot/extension - Production Pixel Verifier
 *
 * Shared pixel-true verification algorithms used across production pipeline,
 * post-redaction verification, and benchmark evaluation harness.
 *
 * Inspects the actual pixel buffer to guarantee that:
 * 1. Opaque masks physically cover sensitive coordinates with verified overlay palette.
 * 2. Spatial face blur destroys high-frequency variance or triggers verified opaque fallback.
 * 3. Geometry is strictly valid and within canvas bounds (no NaN, inf, or degenerate 1px boxes).
 */

import { SensitiveRegion, ScreenshotPixelBox, RedactionMethod } from '@privapilot/protocol';

export const MASK_FILL_RGB = [0x0f, 0x17, 0x2a] as const;
export const MASK_CHROME_RGB = [0x38, 0xbd, 0xf8] as const;

export interface GeometryValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
}

export interface RegionVerificationVerdict {
  readonly id: string;
  readonly covered: boolean;
  readonly method: RedactionMethod;
  readonly opaqueFraction: number;
  readonly overlayFraction: number;
  readonly residualVariance: number;
  readonly rawVariance: number;
  readonly varianceReduction: number;
  readonly sampledPixels: number;
  readonly fallbackApplied?: boolean;
  readonly failureReason?: string;
}

export interface CanvasVerificationReport {
  readonly allPassed: boolean;
  readonly verdicts: ReadonlyArray<RegionVerificationVerdict>;
  readonly failureReason?: string;
}

/**
 * Validates region bounding box geometry against canvas constraints.
 * Rejects NaN, Inf, non-positive dimensions, fully off-canvas boxes, and degenerate inputs.
 */
export function validateRegionGeometry(
  box: ScreenshotPixelBox,
  canvasWidth: number,
  canvasHeight: number
): GeometryValidationResult {
  if (box.space !== 'screenshotPixel') {
    return { isValid: false, reason: `Invalid coordinate space '${box.space}', expected 'screenshotPixel'` };
  }

  if (
    isNaN(box.x) ||
    isNaN(box.y) ||
    isNaN(box.width) ||
    isNaN(box.height) ||
    !isFinite(box.x) ||
    !isFinite(box.y) ||
    !isFinite(box.width) ||
    !isFinite(box.height)
  ) {
    return { isValid: false, reason: `Non-finite coordinate values in box [${box.x}, ${box.y}, ${box.width}, ${box.height}]` };
  }

  if (box.width <= 0 || box.height <= 0) {
    return { isValid: false, reason: `Non-positive box dimensions (${box.width}x${box.height})` };
  }

  // Reject degenerate 1-pixel boxes resulting from empty or invalid inputs
  if (box.width <= 1 && box.height <= 1) {
    return { isValid: false, reason: `Degenerate 1-pixel box (${box.width}x${box.height}) rejected` };
  }

  // Check if completely outside canvas
  if (box.x + box.width <= 0 || box.y + box.height <= 0 || box.x >= canvasWidth || box.y >= canvasHeight) {
    return { isValid: false, reason: `Box is completely outside canvas boundaries (${canvasWidth}x${canvasHeight})` };
  }

  return { isValid: true };
}

/**
 * Computes luminance variance of an RGBA image buffer.
 */
export function computeLuminanceVariance(data: Uint8ClampedArray): number {
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

export const varianceOf = computeLuminanceVariance;

/**
 * Fraction of pixels matching the opaque mask fill #0f172a within tolerance.
 */
export function opaqueFractionOf(data: Uint8ClampedArray, tolerance = 24): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - MASK_FILL_RGB[0]) <= tolerance &&
      Math.abs(data[i + 1] - MASK_FILL_RGB[1]) <= tolerance &&
      Math.abs(data[i + 2] - MASK_FILL_RGB[2]) <= tolerance
    ) {
      hits++;
    }
  }
  return hits / n;
}

/**
 * Fraction of pixels belonging to the redaction overlay rather than original page content.
 * Matches fill (#0f172a), chrome border/label (#38bdf8), and their antialiased blends.
 */
export function overlayFractionOf(data: Uint8ClampedArray, tolerance = 30): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  const dg = MASK_CHROME_RGB[1] - MASK_FILL_RGB[1];
  let hits = 0;

  for (let i = 0; i < data.length; i += 4) {
    const t = Math.max(0, Math.min(1, (data[i + 1] - MASK_FILL_RGB[1]) / dg));
    const er = Math.abs(data[i] - (MASK_FILL_RGB[0] + t * (MASK_CHROME_RGB[0] - MASK_FILL_RGB[0])));
    const eg = Math.abs(data[i + 1] - (MASK_FILL_RGB[1] + t * dg));
    const eb = Math.abs(data[i + 2] - (MASK_FILL_RGB[2] + t * (MASK_CHROME_RGB[2] - MASK_FILL_RGB[2])));
    if (er <= tolerance && eg <= tolerance && eb <= tolerance) {
      hits++;
    }
  }
  return hits / n;
}

/**
 * Verifies that a specific sensitive region in the sanitized pixel buffer is properly destroyed.
 */
export function verifyRegionPixelBuffer(
  sanitizedData: Uint8ClampedArray,
  rawData: Uint8ClampedArray | null,
  method: RedactionMethod,
  regionId: string = 'region'
): RegionVerificationVerdict {
  const sampledPixels = sanitizedData.length / 4;
  if (sampledPixels === 0) {
    return {
      id: regionId,
      covered: false,
      method,
      opaqueFraction: 0,
      overlayFraction: 0,
      residualVariance: 0,
      rawVariance: 0,
      varianceReduction: 0,
      sampledPixels: 0,
      failureReason: 'Empty pixel buffer for region'
    };
  }

  // Fail closed if pixel buffer is all zeros (unrendered / cleared / transparent)
  const hasAnyData = sanitizedData.some((v) => v !== 0);
  if (!hasAnyData) {
    return {
      id: regionId,
      covered: false,
      method,
      opaqueFraction: 0,
      overlayFraction: 0,
      residualVariance: 0,
      rawVariance: 0,
      varianceReduction: 0,
      sampledPixels,
      failureReason: 'Zero-filled unrendered pixel buffer; no redaction overlay found'
    };
  }

  const opaqueFrac = opaqueFractionOf(sanitizedData);
  const overlayFrac = overlayFractionOf(sanitizedData);
  const residualVar = varianceOf(sanitizedData);
  const rawVar = rawData ? varianceOf(rawData) : 0;
  const rawHasDetail = rawVar >= 5;
  const varianceRed = rawHasDetail && rawData ? 1 - residualVar / rawVar : 0;

  // 1. Opaque Mask verification: overlayFraction must be >= 0.95 (handles badges and thin borders)
  if (method === 'opaque_mask') {
    const covered = overlayFrac >= 0.95;
    return {
      id: regionId,
      covered,
      method,
      opaqueFraction: Math.round(opaqueFrac * 1000) / 1000,
      overlayFraction: Math.round(overlayFrac * 1000) / 1000,
      residualVariance: Math.round(residualVar * 10) / 10,
      rawVariance: Math.round(rawVar * 10) / 10,
      varianceReduction: Math.round(varianceRed * 1000) / 1000,
      sampledPixels,
      ...(!covered ? { failureReason: `Opaque mask incomplete: overlay fraction ${Math.round(overlayFrac * 100)}% < 95%` } : {})
    };
  }

  // 2. Gaussian Blur / Face Pixelation verification:
  // If face blur destroyed high-frequency detail (>80% variance reduction with residual < 150)
  const blurEffective = rawHasDetail && varianceRed >= 0.8 && residualVar < 150;
  // If blur could not be proven, was an opaque fallback applied?
  const fallbackApplied = overlayFrac >= 0.95;
  const covered = blurEffective || fallbackApplied;

  return {
    id: regionId,
    covered,
    method,
    opaqueFraction: Math.round(opaqueFrac * 1000) / 1000,
    overlayFraction: Math.round(overlayFrac * 1000) / 1000,
    residualVariance: Math.round(residualVar * 10) / 10,
    rawVariance: Math.round(rawVar * 10) / 10,
    varianceReduction: Math.round(varianceRed * 1000) / 1000,
    sampledPixels,
    fallbackApplied,
    ...(!covered ? { failureReason: `Blur verification failed: variance reduction ${Math.round(varianceRed * 100)}% insufficient and no opaque fallback` } : {})
  };
}

/**
 * Runs end-to-end pixel verification across an entire canvas given raw and sanitized canvases.
 */
export function verifyCanvasRedaction(
  sanitizedCanvas: HTMLCanvasElement | OffscreenCanvas,
  rawCanvas: HTMLCanvasElement | OffscreenCanvas | null,
  regions: ReadonlyArray<SensitiveRegion>
): CanvasVerificationReport {
  const sCtx = sanitizedCanvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null);
  const rCtx = rawCanvas ? (rawCanvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null)) : null;

  if (!sCtx || typeof (sCtx as any).getImageData !== 'function') {
    return {
      allPassed: false,
      verdicts: [],
      failureReason: 'Canvas 2D context or getImageData is unavailable - failing closed'
    };
  }

  const canvasWidth = sanitizedCanvas.width;
  const canvasHeight = sanitizedCanvas.height;
  const verdicts: RegionVerificationVerdict[] = [];

  for (const region of regions) {
    const box = region.screenshotBox;
    const geom = validateRegionGeometry(box, canvasWidth, canvasHeight);
    if (!geom.isValid) {
      verdicts.push({
        id: region.id,
        covered: false,
        method: region.method,
        opaqueFraction: 0,
        overlayFraction: 0,
        residualVariance: 0,
        rawVariance: 0,
        varianceReduction: 0,
        sampledPixels: 0,
        failureReason: geom.reason
      });
      continue;
    }

    const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x)));
    const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y)));
    const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width)));
    const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height)));

    let sData: Uint8ClampedArray;
    let rData: Uint8ClampedArray | null = null;
    try {
      sData = sCtx.getImageData(x, y, w, h).data;
      if (sData.length !== w * h * 4) {
        throw new Error(`Pixel buffer size mismatch: expected ${w * h * 4}, got ${sData.length}`);
      }
      if (rCtx) {
        rData = rCtx.getImageData(x, y, w, h).data;
      }
    } catch (err: any) {
      verdicts.push({
        id: region.id,
        covered: false,
        method: region.method,
        opaqueFraction: 0,
        overlayFraction: 0,
        residualVariance: 0,
        rawVariance: 0,
        varianceReduction: 0,
        sampledPixels: 0,
        failureReason: `Canvas getImageData extraction failed: ${err?.message || 'unknown error'}`
      });
      continue;
    }

    const verdict = verifyRegionPixelBuffer(sData, rData, region.method, region.id);
    verdicts.push(verdict);
  }

  const failed = verdicts.find((v) => !v.covered);
  return {
    allPassed: !failed,
    verdicts,
    failureReason: failed ? `Region '${failed.id}' failed verification: ${failed.failureReason}` : undefined
  };
}
