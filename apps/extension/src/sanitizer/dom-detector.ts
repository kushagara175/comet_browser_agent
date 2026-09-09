/**
 * @privapilot/extension - In-Browser DOM Semantic Detector
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { analyzeDomElementSensitivity, DomElementDescriptor } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface RawDomElementCapture {
  readonly id: string;
  readonly descriptor: DomElementDescriptor;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export function detectDomSensitiveRegions(
  elements: ReadonlyArray<RawDomElementCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const el of elements) {
    const decision = analyzeDomElementSensitivity(el.descriptor);
    if (decision.isSensitive && decision.category) {
      const viewportBox = {
        space: 'viewportCssPixel' as const,
        x: el.boundingClientRect.x,
        y: el.boundingClientRect.y,
        width: el.boundingClientRect.width,
        height: el.boundingClientRect.height
      };

      const screenshotBox = transformer.toScreenshotBox(viewportBox, 6);
      if (screenshotBox.width <= 1 || screenshotBox.height <= 1) continue;

      regions.push({
        id: `dom_sens_${el.id}`,
        category: decision.category,
        viewportBox,
        screenshotBox,
        detectorSource: 'dom_semantic',
        method: 'opaque_mask',
        label: decision.reason
      });
    }
  }

  return regions;
}
