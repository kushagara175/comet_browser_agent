/**
 * @privapilot/extension - On-Device Fail-Closed Sanitizer Pipeline
 *
 * Enforces the core privacy boundary:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 */
import { RawCapture, SanitizedContext } from '@privapilot/protocol';
import { RawDomElementCapture } from './dom-detector.js';
import { RawTextNodeCapture } from './text-detector.js';
import { RawImageElementCapture } from './face-detector.js';
import { RawSurfaceCapture } from './surface-detector.js';
export interface LocalDomSnapshot {
    readonly domElements: ReadonlyArray<RawDomElementCapture>;
    readonly textNodes: ReadonlyArray<RawTextNodeCapture>;
    readonly imageElements: ReadonlyArray<RawImageElementCapture>;
    readonly surfaces: ReadonlyArray<RawSurfaceCapture>;
    readonly interactiveElements: ReadonlyArray<{
        readonly localId: string;
        readonly role: any;
        readonly rawName: string;
        readonly boundingBox: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        readonly state: ReadonlyArray<any>;
        readonly actionCapabilities: ReadonlyArray<any>;
    }>;
    readonly pageTitle: string;
}
export declare class SanitizerPipeline {
    /**
     * Transforms raw capture into sanitized context or fails closed.
     */
    static sanitize(rawCapture: RawCapture, snapshot: LocalDomSnapshot, goal: string, imageCanvas?: HTMLCanvasElement | OffscreenCanvas): Promise<SanitizedContext>;
}
//# sourceMappingURL=pipeline.d.ts.map