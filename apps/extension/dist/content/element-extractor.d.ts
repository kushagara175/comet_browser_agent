/**
 * @privapilot/extension - Content Script DOM Element Extractor
 *
 * Scans the active document, extracts interactive elements and sensitive node descriptors,
 * and assigns ephemeral local IDs (e.g. "el_1", "el_2").
 */
import { LocalDomSnapshot } from '../sanitizer/pipeline.js';
import { TextRangeRect } from '../sanitizer/text-detector.js';
/**
 * Measures exact client rectangles for a text range, handling text nodes, multi-line wrapping,
 * and nested inline elements (e.g. <span>, <b>, <em>).
 */
export declare function measureTextRangeRects(doc: Document, nodeOrContainer: Node, startIndex: number, endIndex: number, viewportWidth: number, viewportHeight: number): TextRangeRect[];
export declare class ElementExtractor {
    private elementMap;
    private counter;
    extractSnapshot(doc?: Document): {
        snapshot: LocalDomSnapshot;
        elementMap: Map<string, HTMLElement>;
    };
}
//# sourceMappingURL=element-extractor.d.ts.map