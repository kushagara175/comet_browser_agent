/**
 * @privapilot/extension - In-Browser Visible Text PII Detector
 *
 * Implements precise text-range redaction:
 * - Uses exact Range getClientRects() for matched substrings
 * - Supports multi-line wrapped text matches
 * - Adds small documented safety padding (2px CSS)
 * - Conservatively masks parent element on geometry failure
 * - Merges overlapping output regions with mergeBoundingBoxes
 */

import {
  SensitiveRegion,
  SensitiveCategory,
  ViewportCssPixelBox,
  ScreenshotPixelBox,
  mergeBoundingBoxes
} from '@privapilot/protocol';
import { scanTextForPII } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';

export interface TextRangeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MatchedTextRange {
  readonly category: SensitiveCategory;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly rects: ReadonlyArray<TextRangeRect>;
  readonly fallbackParentRect?: TextRangeRect;
}

export interface RawTextNodeCapture {
  readonly id: string;
  readonly text: string;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly matchedRanges?: ReadonlyArray<MatchedTextRange>;
}

/**
 * Detects sensitive text PII regions using exact matched text-range client rects
 * when available, falling back conservatively to parent bounding boxes if geometry is unavailable.
 */
export function detectTextSensitiveRegions(
  textNodes: ReadonlyArray<RawTextNodeCapture>,
  transformer: CoordinateTransformer
): SensitiveRegion[] {
  const unmergedRegions: SensitiveRegion[] = [];

  for (const node of textNodes) {
    // 1. Pre-computed exact range rects from DOM Range measurement
    if (node.matchedRanges && node.matchedRanges.length > 0) {
      for (let i = 0; i < node.matchedRanges.length; i++) {
        const rangeMatch = node.matchedRanges[i];

        if (rangeMatch.rects && rangeMatch.rects.length > 0) {
          // Exact text range box(es) per line (e.g. wrapped lines)
          for (let rIdx = 0; rIdx < rangeMatch.rects.length; rIdx++) {
            const rect = rangeMatch.rects[rIdx];
            const viewportBox: ViewportCssPixelBox = {
              space: 'viewportCssPixel',
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            };

            // Small documented safety padding: 2px CSS padding for font ascenders/descenders/anti-aliasing
            const screenshotBox = transformer.toScreenshotBox(viewportBox, 2);
            if (screenshotBox.width <= 1 || screenshotBox.height <= 1) continue;

            unmergedRegions.push({
              id: `text_pii_${node.id}_${i}_${rIdx}`,
              category: rangeMatch.category,
              viewportBox,
              screenshotBox,
              detectorSource: 'text_pii_regex',
              method: 'opaque_mask',
              label: rangeMatch.category.toUpperCase()
            });
          }
        } else {
          // Exact geometry failed -> conservatively mask parent element bounding box
          const fallbackRect = rangeMatch.fallbackParentRect || node.boundingClientRect;
          const viewportBox: ViewportCssPixelBox = {
            space: 'viewportCssPixel',
            x: fallbackRect.x,
            y: fallbackRect.y,
            width: fallbackRect.width,
            height: fallbackRect.height
          };

          const screenshotBox = transformer.toScreenshotBox(viewportBox, 4);
          if (screenshotBox.width > 1 && screenshotBox.height > 1) {
            unmergedRegions.push({
              id: `text_pii_${node.id}_${i}_fallback`,
              category: rangeMatch.category,
              viewportBox,
              screenshotBox,
              detectorSource: 'text_pii_regex',
              method: 'opaque_mask',
              label: rangeMatch.category.toUpperCase()
            });
          }
        }
      }
    } else {
      // 2. Direct fallback for nodes without pre-computed range rects
      const matches = scanTextForPII(node.text);
      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const viewportBox: ViewportCssPixelBox = {
            space: 'viewportCssPixel',
            x: node.boundingClientRect.x,
            y: node.boundingClientRect.y,
            width: node.boundingClientRect.width,
            height: node.boundingClientRect.height
          };

          const screenshotBox = transformer.toScreenshotBox(viewportBox, 4);
          if (screenshotBox.width > 1 && screenshotBox.height > 1) {
            unmergedRegions.push({
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
    }
  }

  if (unmergedRegions.length <= 1) {
    return unmergedRegions;
  }

  // 3. Merge overlapping output regions with mergeBoundingBoxes
  const categoryGroups = new Map<SensitiveCategory, SensitiveRegion[]>();
  for (const reg of unmergedRegions) {
    const list = categoryGroups.get(reg.category) || [];
    list.push(reg);
    categoryGroups.set(reg.category, list);
  }

  const mergedRegions: SensitiveRegion[] = [];
  let mergedIdx = 0;

  for (const [category, group] of categoryGroups.entries()) {
    const screenshotBoxes: ScreenshotPixelBox[] = group.map((r) => r.screenshotBox);
    const mergedBoxes = mergeBoundingBoxes(screenshotBoxes);

    for (const mergedScreenshotBox of mergedBoxes) {
      mergedIdx++;
      const viewportBox = transformer.toViewportBox(mergedScreenshotBox);

      mergedRegions.push({
        id: `text_pii_merged_${category}_${mergedIdx}`,
        category,
        viewportBox,
        screenshotBox: mergedScreenshotBox,
        detectorSource: 'text_pii_regex',
        method: 'opaque_mask',
        label: category.toUpperCase()
      });
    }
  }

  return mergedRegions;
}

