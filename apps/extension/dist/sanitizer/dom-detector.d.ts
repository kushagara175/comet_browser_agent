/**
 * @privapilot/extension - In-Browser DOM Semantic Detector
 */
import { SensitiveRegion } from '@privapilot/protocol';
import { DomElementDescriptor } from '@privapilot/pii-rules';
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
export declare function detectDomSensitiveRegions(elements: ReadonlyArray<RawDomElementCapture>, transformer: CoordinateTransformer): SensitiveRegion[];
//# sourceMappingURL=dom-detector.d.ts.map