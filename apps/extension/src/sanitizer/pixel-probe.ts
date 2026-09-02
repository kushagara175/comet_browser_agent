/**
 * @privapilot/extension - Shared pixel sampling for redaction verification
 *
 * The benchmark harness proved a mask landed on its region by reading the output
 * pixels; the shipped PostRedactionVerifier only compared a region count to a mask
 * count, so a mask drawn at the wrong coordinates passed it. These are the routines
 * both now use, so the product enforces exactly what the benchmark measures.
 */

/** The mask overlay palette: MaskRenderer fills #0f172a and draws chrome in #38bdf8. */
const MASK_FILL = [0x0f, 0x17, 0x2a];
const MASK_CHROME = [0x38, 0xbd, 0xf8];

/** Caps work on large regions - full sampling of a full-page surface is wasteful. */
const MAX_SAMPLES = 20000;

export interface RegionSample {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** True when a pixel lies on the fill-to-chrome line of the redaction palette. */
export function isOverlayPixel(r: number, g: number, b: number, tolerance = 30): boolean {
  const dg = MASK_CHROME[1] - MASK_FILL[1];
  const t = Math.max(0, Math.min(1, (g - MASK_FILL[1]) / dg));
  return (
    Math.abs(r - (MASK_FILL[0] + t * (MASK_CHROME[0] - MASK_FILL[0]))) <= tolerance &&
    Math.abs(g - (MASK_FILL[1] + t * dg)) <= tolerance &&
    Math.abs(b - (MASK_FILL[2] + t * (MASK_CHROME[2] - MASK_FILL[2]))) <= tolerance
  );
}

/** Fraction of pixels belonging to the redaction overlay rather than page content. */
export function overlayFractionOf(data: Uint8ClampedArray): number {
  const n = data.length / 4;
  if (n === 0) return 0;
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isOverlayPixel(data[i], data[i + 1], data[i + 2])) hits++;
  }
  return hits / n;
}

/**
 * Mean absolute luminance gradient between adjacent pixels - how much fine detail
 * survives.
 *
 * This, not variance, is the measure for the pixelation path: replacing each block
 * with its own mean preserves between-block variance and destroys only within-block
 * variance, so a correctly pixelated face barely moves a variance ratio.
 */
export function localDetailOf(
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

/**
 * Reads a clamped region out of a canvas, downscaling the sampled area when the
 * region is very large so verification stays cheap.
 */
export function sampleRegion(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  box: { x: number; y: number; width: number; height: number }
): RegionSample | null {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx || typeof (ctx as any).getImageData !== 'function') return null;

  const cw = canvas.width;
  const ch = canvas.height;
  const x = Math.max(0, Math.min(cw - 1, Math.floor(box.x)));
  const y = Math.max(0, Math.min(ch - 1, Math.floor(box.y)));
  const w = Math.max(1, Math.min(cw - x, Math.ceil(box.width)));
  const h = Math.max(1, Math.min(ch - y, Math.ceil(box.height)));
  if (w < 2 || h < 2) return null;

  try {
    const imgData = ctx.getImageData(x, y, w, h);
    if (w * h <= MAX_SAMPLES) {
      return { data: imgData.data, width: w, height: h };
    }

    // Uniform stride keeps the block structure of a pixelated region intact, which
    // a random subsample would destroy.
    const stride = Math.ceil(Math.sqrt((w * h) / MAX_SAMPLES));
    const sw = Math.floor(w / stride);
    const sh = Math.floor(h / stride);
    if (sw < 2 || sh < 2) return { data: imgData.data, width: w, height: h };

    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let yy = 0; yy < sh; yy++) {
      for (let xx = 0; xx < sw; xx++) {
        const src = ((yy * stride) * w + xx * stride) * 4;
        const dst = (yy * sw + xx) * 4;
        out[dst] = imgData.data[src];
        out[dst + 1] = imgData.data[src + 1];
        out[dst + 2] = imgData.data[src + 2];
        out[dst + 3] = imgData.data[src + 3];
      }
    }
    return { data: out, width: sw, height: sh };
  } catch {
    return null;
  }
}
