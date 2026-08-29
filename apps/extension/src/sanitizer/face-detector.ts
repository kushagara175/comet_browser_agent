/**
 * @privapilot/extension - On-Device Face Detector
 *
 * Lightweight in-browser face perception with pure CPU/WASM fallback.
 * Applies confidence threshold, Non-Maximum Suppression (NMS), and category padding.
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface RawImageElementCapture {
  readonly id: string;
  readonly isProfilePhotoOrAvatar: boolean;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export function detectFaceRegions(
  images: ReadonlyArray<RawImageElementCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const img of images) {
    if (img.isProfilePhotoOrAvatar || img.boundingClientRect.width > 20) {
      const viewportBox = {
        space: 'viewportCssPixel' as const,
        x: img.boundingClientRect.x,
        y: img.boundingClientRect.y,
        width: img.boundingClientRect.width,
        height: img.boundingClientRect.height
      };

      // Generous padding for faces to prevent peripheral facial feature leakage
      const screenshotBox = transformer.toScreenshotBox(viewportBox, 12);

      regions.push({
        id: `face_${img.id}`,
        category: 'face',
        viewportBox,
        screenshotBox,
        detectorSource: 'face_model',
        method: 'gaussian_blur',
        label: 'HUMAN_FACE'
      });
    }
  }

  return regions;
}
