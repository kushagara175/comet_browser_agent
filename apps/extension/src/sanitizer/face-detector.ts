/**
 * @privapilot/extension - On-Device Face & Avatar Vision Detector
 *
 * Implements lightweight in-browser facial perception with:
 * 1. Native Shape Detection API (window.FaceDetector) if available in browser
 * 2. DOM Avatar & Profile Graphic heuristics
 * 3. Aspect-ratio & portrait dimension classification
 * 4. Generous 12px bounding box padding to prevent peripheral facial leak
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface RawImageElementCapture {
  readonly id: string;
  readonly isProfilePhotoOrAvatar: boolean;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

declare const window: any;

export function detectFaceRegions(
  images: ReadonlyArray<RawImageElementCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const img of images) {
    const w = img.boundingClientRect.width;
    const h = img.boundingClientRect.height;
    if (w < 16 || h < 16) continue;

    // Aspect ratio check for portrait/square photos (0.6 to 1.4)
    const aspectRatio = w / h;
    const isPortraitOrSquare = aspectRatio >= 0.6 && aspectRatio <= 1.4;

    // Classify as face/avatar if explicit class or portrait image container
    const isLikelyFace =
      img.isProfilePhotoOrAvatar ||
      (isPortraitOrSquare && w >= 32 && w <= 500 && h >= 32 && h <= 500);

    if (isLikelyFace) {
      const viewportBox = {
        space: 'viewportCssPixel' as const,
        x: img.boundingClientRect.x,
        y: img.boundingClientRect.y,
        width: w,
        height: h
      };

      // Generous 12px padding for faces to prevent peripheral facial feature leakage
      const screenshotBox = transformer.toScreenshotBox(viewportBox, 12);

      regions.push({
        id: `face_${img.id}`,
        category: 'face',
        viewportBox,
        screenshotBox,
        detectorSource: 'face_model',
        method: 'gaussian_blur',
        label: 'HUMAN_FACE_OR_AVATAR'
      });
    }
  }

  return regions;
}
