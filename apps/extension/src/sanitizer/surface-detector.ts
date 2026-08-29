/**
 * @privapilot/extension - Uninspectable & High-Risk Surface Detector
 *
 * Implements section 3.6 of the Winning Execution Playbook:
 * High risk surfaces: cross-origin iframes, closed shadow roots, canvas/WebGL, video, image text, PDF viewers.
 * Policy: Masks the entire surface rectangle fail-closed.
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface RawSurfaceCapture {
  readonly id: string;
  readonly surfaceType: 'iframe' | 'canvas' | 'video' | 'image_text' | 'pdf' | 'shadow_root';
  readonly isCrossOriginOrUninspectable: boolean;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export function detectHighRiskSurfaces(
  surfaces: ReadonlyArray<RawSurfaceCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const surface of surfaces) {
    const viewportBox = {
      space: 'viewportCssPixel' as const,
      x: surface.boundingClientRect.x,
      y: surface.boundingClientRect.y,
      width: surface.boundingClientRect.width,
      height: surface.boundingClientRect.height
    };

    const screenshotBox = transformer.toScreenshotBox(viewportBox, 2);

    regions.push({
      id: `surface_${surface.surfaceType}_${surface.id}`,
      category: 'high_risk_surface',
      viewportBox,
      screenshotBox,
      detectorSource: 'surface_detector',
      method: 'opaque_mask',
      label: `HIGH_RISK_SURFACE: ${surface.surfaceType.toUpperCase()}`
    });
  }

  return regions;
}
