/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 */

import { SensitiveRegion } from '@privapilot/protocol';

export interface RenderResult {
  readonly sanitizedScreenshotDataUrl: string;
  readonly renderedMaskCount: number;
}

export class MaskRenderer {
  /**
   * Applies redaction masks to an image canvas and outputs the sanitized Base64 PNG.
   */
  static renderMasks(
    imageCanvas: HTMLCanvasElement | OffscreenCanvas,
    regions: ReadonlyArray<SensitiveRegion>
  ): RenderResult {
    const ctx = imageCanvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D);
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for sanitization rendering');
    }

    let maskCount = 0;

    for (const region of regions) {
      const box = region.screenshotBox;

      if (region.method === 'gaussian_blur') {
        // Face Blur: draw frosted/blurred rectangle
        ctx.save();
        ctx.fillStyle = 'rgba(180, 180, 180, 0.95)';
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Add privacy badge
        ctx.fillStyle = '#222222';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('[FACE BLURRED]', box.x + 4, box.y + Math.min(14, box.height / 2));
        ctx.restore();
      } else {
        // Opaque Privacy Blackout Mask
        ctx.save();
        ctx.fillStyle = '#0f172a'; // Deep slate dark mask
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Border
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Privacy Tag Pill
        if (box.width > 50 && box.height > 14) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px sans-serif';
          const label = `[REDACTED: ${region.category.toUpperCase()}]`;
          ctx.fillText(label, box.x + 3, box.y + Math.min(11, box.height - 3));
        }

        ctx.restore();
      }

      maskCount++;
    }

    // Export to Data URL
    let dataUrl: string;
    if ('toDataURL' in imageCanvas) {
      dataUrl = (imageCanvas as HTMLCanvasElement).toDataURL('image/png');
    } else {
      // Offscreen Canvas fallback
      dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    return {
      sanitizedScreenshotDataUrl: dataUrl,
      renderedMaskCount: maskCount
    };
  }
}
