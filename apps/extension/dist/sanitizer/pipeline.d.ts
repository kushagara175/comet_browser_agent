/**
 * @privapilot/extension - On-Device Fail-Closed Sanitizer Pipeline
 *
 * Enforces the core privacy boundary:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 */
import { RawCapture, SanitizedContext, ScrollMetrics } from '@privapilot/protocol';
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
        readonly containerContext?: string;
        readonly nearestHeading?: string;
        readonly isInsideDialog?: boolean;
        readonly verticalOffset?: 'in_view' | 'above' | 'below';
        readonly inViewport?: boolean;
        readonly publicAuthorHandles?: boolean;
    }>;
    readonly pageTitle: string;
    readonly visibleDialogCount?: number;
    readonly dialogTitles?: ReadonlyArray<string>;
    readonly statusSummaries?: ReadonlyArray<string>;
    readonly routeFingerprint?: string;
    readonly postconditionSummary?: string;
    readonly counters?: ReadonlyArray<{
        readonly label: string;
        readonly value: string;
    }>;
    readonly contentSummaries?: ReadonlyArray<string>;
    readonly domain?: string;
    readonly scrollMetrics?: ScrollMetrics;
    readonly pageZone?: 'private_workspace' | 'hybrid' | 'public_broadcast';
    readonly focusedRegion?: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly type?: 'dialog' | 'form' | 'cluster' | string;
    };
}
export declare class SanitizerPipeline {
    /**
     * Transforms raw capture into sanitized context or fails closed.
     */
    static sanitize(rawCapture: RawCapture, snapshot: LocalDomSnapshot, goal: string, imageCanvas?: HTMLCanvasElement | OffscreenCanvas): Promise<SanitizedContext>;
}
//# sourceMappingURL=pipeline.d.ts.map