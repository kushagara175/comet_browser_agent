/**
 * @privapilot/extension - In-Browser Visible Text PII Detector
 *
 * Implements precise text-range redaction:
 * - Uses exact Range getClientRects() for matched substrings
 * - Supports multi-line wrapped text matches
 * - Masks only measured glyph bounds, without padding adjacent controls
 * - Uses an explicitly supplied fallback rect only when range geometry is unavailable
 * - Merges overlapping output regions with mergeBoundingBoxes
 */
import { SensitiveRegion, SensitiveCategory } from '@privapilot/protocol';
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
export declare function detectTextSensitiveRegions(textNodes: ReadonlyArray<RawTextNodeCapture>, transformer: CoordinateTransformer): SensitiveRegion[];
//# sourceMappingURL=text-detector.d.ts.map