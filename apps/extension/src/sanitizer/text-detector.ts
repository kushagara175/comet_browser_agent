/**
 * @privapilot/extension - In-Browser Visible Text PII Detector
 */

import { SensitiveRegion } from '@privapilot/protocol';
import { scanTextForPII } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface RawTextNodeCapture {
  readonly id: string;
  readonly text: string;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export function detectTextSensitiveRegions(
  textNodes: ReadonlyArray<RawTextNodeCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const regions: SensitiveRegion[] = [];

  for (const node of textNodes) {
    const matches = scanTextForPII(node.text);
    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const viewportBox = {
          space: 'viewportCssPixel' as const,
          x: node.boundingClientRect.x,
          y: node.boundingClientRect.y,
          width: node.boundingClientRect.width,
          height: node.boundingClientRect.height
        };

        const screenshotBox = transformer.toScreenshotBox(viewportBox, 4);

        regions.push({
          id: `text_pii_${node.id}_${i}`,
          category: match.category,
          viewportBox,
          screenshotBox,
          detectorSource: 'text_pii_regex',
          method: 'opaque_mask',
          label: match.category.toUpperCase()
        });
      }
    }
  }

  return regions;
}
