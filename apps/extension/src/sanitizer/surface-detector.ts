/**
 * @privapilot/extension - Uninspectable & High-Risk Surface Detector
 *
 * Implements granular detection of uninspectable visual surfaces:
 * - Differentiates same-origin vs cross-origin iframes (same-origin recursively inspected)
 * - Detects 2D canvas, WebGL canvas, video streams, embedded PDF / plugin objects
 * - Detects closed shadow roots and images likely to contain sensitive text
 * - Fails closed on any unknown surface type
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { CoordinateTransformer } from './coordinate-transformer.js';

export type SurfaceType =
  | 'iframe'
  | 'canvas'
  | 'webgl_canvas'
  | 'video'
  | 'pdf'
  | 'plugin'
  | 'shadow_root'
  | 'image_text'
  | 'restricted_page'
  | 'unknown';

export type SurfaceInspectionStatus =
  | 'inspected_same_origin'
  | 'uninspectable_cross_origin'
  | 'uninspectable_media'
  | 'uninspectable_canvas'
  | 'uninspectable_plugin'
  | 'uninspectable_closed_shadow'
  | 'uninspectable_image_text'
  | 'restricted_browser_page'
  | 'unknown_fail_closed';

export interface RawSurfaceCapture {
  readonly id: string;
  readonly surfaceType: SurfaceType;
  readonly isCrossOriginOrUninspectable: boolean;
  readonly inspectionStatus?: SurfaceInspectionStatus;
  readonly reason?: string;
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
    // If surface was verified as permitted same-origin and recursively inspected, do not mask entire container
    if (surface.inspectionStatus === 'inspected_same_origin' && !surface.isCrossOriginOrUninspectable) {
      continue;
    }

    // High risk / uninspectable / unknown surface -> Mask rectangle fail-closed
    const viewportBox = {
      space: 'viewportCssPixel' as const,
      x: surface.boundingClientRect.x,
      y: surface.boundingClientRect.y,
      width: surface.boundingClientRect.width,
      height: surface.boundingClientRect.height
    };

    // Add 2px safety padding to cover borders / anti-aliasing around frame boundaries
    const screenshotBox = transformer.toScreenshotBox(viewportBox, 2);
    if (screenshotBox.width <= 1 || screenshotBox.height <= 1) continue;

    const surfaceLabel = surface.surfaceType ? surface.surfaceType.toUpperCase() : 'UNKNOWN_SURFACE';

    regions.push({
      id: `surface_${surface.surfaceType || 'unknown'}_${surface.id}`,
      category: 'high_risk_surface',
      viewportBox,
      screenshotBox,
      detectorSource: 'surface_detector',
      method: 'opaque_mask',
      label: `HIGH_RISK_SURFACE: ${surfaceLabel}`
    });
  }

  return regions;
}

