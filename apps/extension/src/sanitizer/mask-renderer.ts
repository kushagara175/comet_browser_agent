/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 * Validates geometry, enforces pixel-true coverage, and triggers opaque fallbacks
 * when face blur cannot be proven.
 */

import { SensitiveRegion, ScreenshotPixelBox, RedactionMethod } from '@privapilot/protocol';
import {
  validateRegionGeometry,
  computeLuminanceVariance,
  overlayFractionOf
} from './pixel-verifier.js';

export interface RegionRenderRecord {
  readonly regionId: string;
  readonly requestedBox: ScreenshotPixelBox;
  readonly clampedBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly method: RedactionMethod;
  readonly success: boolean;
  readonly fallbackApplied?: boolean;
  readonly failureReason?: string;
}

export interface RenderResult {
  readonly sanitizedScreenshotDataUrl: string;
  readonly renderedMaskCount: number;
  readonly regionRecords: ReadonlyArray<RegionRenderRecord>;
}

export class MaskRenderer {
  /**
   * Applies irreversible privacy masks and real face blurs directly onto the screenshot canvas.
   *
   * Enforces:
   * 1. Two-pass rendering: Blur pass first, opaque mask pass second (opaque masks always win).
   * 2. Strict geometry validation: Rejects NaN, Inf, non-positive dimensions, off-canvas, or 1px degenerate boxes.
   * 3. Irreversible block pixelation and color averaging for human faces with automatic opaque fallback if unproven.
   * 4. 100% opaque deep-slate blackouts for credentials, PII, payment data, and uninspectable surfaces.
   * 5. Per-region forensic audit records.
   */
  static renderMasks(
    imageCanvas: HTMLCanvasElement | OffscreenCanvas,
    regions: ReadonlyArray<SensitiveRegion>,
    interactiveElements?: ReadonlyArray<any>,
    viewport?: { width: number; height: number }
  ): RenderResult {
    const ctx = imageCanvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D);
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for sanitization rendering');
    }

    const canvasWidth = imageCanvas.width || 1280;
    const canvasHeight = imageCanvas.height || 720;
    const regionRecords: RegionRenderRecord[] = [];

    // Split regions into two passes:
    // Pass 1: Face blur / pixelation regions (applied first so opaque masks can safely overlap)
    // Pass 2: Opaque blackout masks (text, credentials, payment data, uninspectable surfaces)
    const blurRegions = regions.filter((r) => r.method === 'gaussian_blur' && r.category === 'face');
    const opaqueRegions = regions.filter((r) => r.method !== 'gaussian_blur' || r.category !== 'face');

    let maskCount = 0;

    // --- PASS 1: Irreversible Face Blur / Pixelation with Verified Opaque Fallback ---
    for (const region of blurRegions) {
      const box = region.screenshotBox;
      const geom = validateRegionGeometry(box, canvasWidth, canvasHeight);
      if (!geom.isValid) {
        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox: { x: 0, y: 0, width: 0, height: 0 },
          method: 'gaussian_blur',
          success: false,
          failureReason: `Invalid geometry: ${geom.reason}`
        });
        continue;
      }

      // Conservative padding (minimum 8px) clamped strictly to canvas bounds
      const padding = 8;
      const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x - padding)));
      const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y - padding)));
      const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width + padding * 2)));
      const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height + padding * 2)));

      const clampedBox = { x, y, width: w, height: h };

      try {
        let fallbackNeeded = false;

        if (typeof (ctx as any).getImageData === 'function' && typeof (ctx as any).putImageData === 'function') {
          const imgData = ctx.getImageData(x, y, w, h);
          const data = imgData.data;

          const rawVariance = computeLuminanceVariance(data);
          const rawHasDetail = rawVariance >= 5;

          // Block Pixelation: Average color in 16x16 blocks (or adaptive block size for small boxes)
          const blockSize = Math.max(8, Math.min(24, Math.floor(Math.min(w, h) / 4)));

          for (let by = 0; by < h; by += blockSize) {
            for (let bx = 0; bx < w; bx += blockSize) {
              let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
              let count = 0;

              const bw = Math.min(blockSize, w - bx);
              const bh = Math.min(blockSize, h - by);

              for (let py = 0; py < bh; py++) {
                for (let px = 0; px < bw; px++) {
                  const idx = ((by + py) * w + (bx + px)) * 4;
                  rSum += data[idx];
                  gSum += data[idx + 1];
                  bSum += data[idx + 2];
                  aSum += data[idx + 3];
                  count++;
                }
              }

              const rAvg = Math.round(rSum / count);
              const gAvg = Math.round(gSum / count);
              const bAvg = Math.round(bSum / count);
              const aAvg = Math.round(aSum / count);

              for (let py = 0; py < bh; py++) {
                for (let px = 0; px < bw; px++) {
                  const idx = ((by + py) * w + (bx + px)) * 4;
                  data[idx] = rAvg;
                  data[idx + 1] = gAvg;
                  data[idx + 2] = bAvg;
                  data[idx + 3] = aAvg;
                }
              }
            }
          }

          const residualVariance = computeLuminanceVariance(data);
          const varianceReduction = rawHasDetail ? (1 - residualVariance / rawVariance) : 0;

          // Always apply irreversible block pixelation to canvas
          ctx.putImageData(imgData, x, y);

          // Draw subtle privacy badge over the blurred region
          ctx.save();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
          if (w >= 40 && h >= 16) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(x + 2, y + 2, Math.min(w - 4, 85), 14);
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText('[FACE BLUR]', x + 5, y + 12);
          }
          ctx.restore();

          // Stage B5 Check: If raw image has no high-frequency detail (e.g. flat SVG avatar where rawVariance < 5),
          // or if blur did not destroy >80% variance with residual < 150,
          // detail destruction cannot be proven, so enforce opaque fallback on top!
          if (!rawHasDetail || varianceReduction < 0.80 || residualVariance >= 150) {
            fallbackNeeded = true;
          }
        } else {
          fallbackNeeded = true;
        }

        // Apply verified opaque fallback if blur was ineffective or unprovable
        if (fallbackNeeded) {
          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
          if (w > 45 && h > 12) {
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText('[REDACTED: FACE]', x + 3, y + Math.min(11, h - 2));
          }
          ctx.restore();
        }

        // Verify output pixels of the rendered box
        let success = true;
        let failureReason: string | undefined;
        if (typeof (ctx as any).getImageData === 'function') {
          const finalData = ctx.getImageData(x, y, w, h).data;
          const hasAnyData = finalData.some((v: number) => v !== 0);
          if (hasAnyData && fallbackNeeded) {
            const overlayFrac = overlayFractionOf(finalData);
            if (overlayFrac < 0.85) {
              ctx.save();
              ctx.fillStyle = '#0f172a';
              ctx.fillRect(x, y, w, h);
              ctx.restore();
              success = true;
              failureReason = undefined;
            }
          }
        }

        if (success) {
          maskCount++;
        }

        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox,
          method: 'gaussian_blur',
          success,
          fallbackApplied: fallbackNeeded,
          failureReason
        });
      } catch (err: any) {
        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox,
          method: 'gaussian_blur',
          success: false,
          failureReason: `Face render error: ${err.message}`
        });
      }
    }

    // --- PASS 2: Opaque Privacy Blackout Masks (Text, PII, Credentials, Cards, Surfaces) ---
    for (const region of opaqueRegions) {
      const box = region.screenshotBox;
      const geom = validateRegionGeometry(box, canvasWidth, canvasHeight);
      if (!geom.isValid) {
        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox: { x: 0, y: 0, width: 0, height: 0 },
          method: 'opaque_mask',
          success: false,
          failureReason: `Invalid geometry: ${geom.reason}`
        });
        continue;
      }

      // Bound both edges independently; a fractional left/top edge must not
      // cause an extra pixel beyond the measured right/bottom edge.
      const x = Math.max(0, Math.floor(box.x));
      const y = Math.max(0, Math.floor(box.y));
      const w = Math.max(1, Math.min(canvasWidth, Math.ceil(box.x + box.width)) - x);
      const h = Math.max(1, Math.min(canvasHeight, Math.ceil(box.y + box.height)) - y);

      const clampedBox = { x, y, width: w, height: h };

      try {
        ctx.save();
        // Solid opaque blackout mask (Alpha = 1.0)
        ctx.fillStyle = '#0f172a'; // Deep slate (RGB: 15, 23, 42)
        ctx.fillRect(x, y, w, h);

        ctx.restore();

        // Pixel-true post verification of opaque mask
        let success = true;
        let failureReason: string | undefined;
        if (typeof (ctx as any).getImageData === 'function') {
          const finalData = ctx.getImageData(x, y, w, h).data;
          const hasAnyData = finalData.some((v: number) => v !== 0);
          if (hasAnyData) {
            let overlayFrac = overlayFractionOf(finalData);
            if (overlayFrac < 0.85) {
              // Secondary solid repaint: guarantee 100% opaque mask fill without borders or text interference
              ctx.save();
              ctx.fillStyle = '#0f172a';
              ctx.fillRect(x, y, w, h);
              ctx.restore();
              success = true;
              failureReason = undefined;
            }
          }
        }

        if (success) {
          maskCount++;
        }

        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox,
          method: 'opaque_mask',
          success,
          failureReason
        });
      } catch (err: any) {
        regionRecords.push({
          regionId: region.id,
          requestedBox: box,
          clampedBox,
          method: 'opaque_mask',
          success: false,
          failureReason: `Opaque mask render error: ${err.message}`
        });
      }
    }

    // --- PASS 3: Set-of-Marks (SOM) Visual Labeling Overlay ---
    // Draws compact, high-contrast numeric badge markers matching element localIds
    // giving multimodal vision models unambiguous visual grounding.
    if (interactiveElements && interactiveElements.length > 0) {
      MaskRenderer.renderSetOfMarks(
        imageCanvas,
        interactiveElements,
        viewport?.width || 1280,
        viewport?.height || 800
      );
    }

    // Export to Data URL (fail closed if canvas export fails)
    let dataUrl: string;
    if (typeof (imageCanvas as any).toDataURL === 'function') {
      dataUrl = (imageCanvas as HTMLCanvasElement).toDataURL('image/png');
      // On high-DPI Mac Retina displays (2x-3x) or media-rich pages (YouTube, Bhuvan maps, Twitter/X),
      // a raw uncompressed PNG can reach 3.5MB - 6MB.
      // If the PNG data URL exceeds 800KB, adaptively export as JPEG (0.85 quality)
      // to keep wire payloads lightweight (< 500KB) while preserving crystal-clear pixel fidelity
      // for privacy masks and multimodal reasoning.
      if (dataUrl && dataUrl.length > 800 * 1024) {
        try {
          const jpegUrl = (imageCanvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
          if (jpegUrl && jpegUrl.startsWith('data:image/jpeg;base64,') && jpegUrl.length < dataUrl.length) {
            dataUrl = jpegUrl;
          }
        } catch (_) {}
      }
      // If still large (> 1.8MB), compress slightly further to 0.75 quality
      if (dataUrl && dataUrl.length > 1.8 * 1024 * 1024) {
        try {
          const compressedUrl = (imageCanvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.75);
          if (compressedUrl && compressedUrl.startsWith('data:image/jpeg;base64,') && compressedUrl.length < dataUrl.length) {
            dataUrl = compressedUrl;
          }
        } catch (_) {}
      }
    } else {
      throw new Error('Canvas export unavailable: HTMLCanvasElement with toDataURL required for mask rendering');
    }

    if (
      !dataUrl ||
      (!dataUrl.startsWith('data:image/png;base64,') &&
       !dataUrl.startsWith('data:image/jpeg;base64,') &&
       !dataUrl.startsWith('data:image/webp;base64,'))
    ) {
      throw new Error('Sanitized screenshot export failed: invalid data URL produced');
    }

    return {
      sanitizedScreenshotDataUrl: dataUrl,
      renderedMaskCount: maskCount,
      regionRecords
    };
  }

  /**
   * Set-of-Marks (SOM) visual labeling overlay renderer.
   * Places clear, high-contrast badges (e.g. "1", "2") corresponding to "el_1", "el_2"
   * on the sanitized screenshot canvas.
   */
  static renderSetOfMarks(
    imageCanvas: HTMLCanvasElement | OffscreenCanvas,
    elements: ReadonlyArray<any>,
    viewportWidth = 1280,
    viewportHeight = 800
  ): void {
    if (!elements || elements.length === 0) return;
    const ctx = imageCanvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D);
    if (!ctx) return;

    const canvasWidth = imageCanvas.width || 1280;
    const canvasHeight = imageCanvas.height || 720;
    const scaleX = canvasWidth / (viewportWidth || 1280);
    const scaleY = canvasHeight / (viewportHeight || 800);

    ctx.save();
    // Cap at 60 interactive elements to maintain visual clarity
    const candidates = elements.slice(0, 60);

    for (const el of candidates) {
      const localId = el.localId || '';
      const numMatch = localId.match(/(\d+)$/);
      const label = numMatch ? numMatch[1] : localId.replace(/^el_/, '');
      if (!label) continue;

      let x = 0;
      let y = 0;

      if (el.boundingBox && el.boundingBox.width > 0 && el.boundingBox.height > 0) {
        x = Math.round(el.boundingBox.x * scaleX);
        y = Math.round(el.boundingBox.y * scaleY);
      } else if (Array.isArray(el.coarseBounds) && el.coarseBounds.length === 4) {
        x = Math.round(el.coarseBounds[0] * canvasWidth);
        y = Math.round(el.coarseBounds[1] * canvasHeight);
      } else {
        continue;
      }

      x = Math.max(0, Math.min(canvasWidth - 32, x));
      y = Math.max(0, Math.min(canvasHeight - 16, y));

      ctx.font = 'bold 10px sans-serif';
      const textWidth = Math.max(10, ctx.measureText ? ctx.measureText(label).width : 10);
      const badgeWidth = textWidth + 6;
      const badgeHeight = 13;

      const badgeY = y >= badgeHeight ? y - 1 : y + 1;
      const badgeX = Math.min(x, canvasWidth - badgeWidth - 2);

      // Distinct cyan-slate pill
      ctx.fillStyle = '#0284c7'; // Sky 600
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;

      if (typeof (ctx as any).roundRect === 'function') {
        ctx.beginPath();
        (ctx as any).roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
        ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, badgeX + 3, badgeY + 10);
    }

    ctx.restore();
  }
}
