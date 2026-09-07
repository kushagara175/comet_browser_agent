/**
 * @privapilot/extension - Explicit Auditable Multimodal Fusion Policy
 *
 * Fuses candidate elements from the parallel DOM lane and Vision lane into a single
 * unified SceneGraph.
 *
 * Hard Design Rules (Zero black-box ML):
 * 1. Spatial Matching: IoU >= 0.50 greedy bipartite matching sorted by combined confidence.
 * 2. DOM wins on: input type, ARIA role, form semantics, tab order, disabled state.
 * 3. Vision wins on: canvas content, <img> concept content, shadow-DOM / iframe content,
 *    visual layer occlusion, and primary CTA visual salience.
 * 4. Disagreement Policy: Whenever lanes conflict, log to SceneGraph.conflicts.
 *    NEVER silently discard a disagreement.
 * 5. Execution Modes: Supports 'fused' (default), 'dom-only' (ablation), and 'vision-only' (ablation).
 */
import { SceneGraph, ViewportMetadata } from '@privapilot/protocol';
import { CandidateVisionElement } from './vision-lane.js';
export interface DomCandidateElement {
    readonly id: string;
    readonly role: string;
    readonly name: string;
    readonly boundingBox: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly disabled?: boolean;
    readonly inputType?: string;
    readonly ariaRole?: string;
    readonly tabIndex?: number;
    readonly confidence?: number;
    readonly isOccluded?: boolean;
    readonly isZeroSized?: boolean;
    readonly isOffscreen?: boolean;
}
export type PerceptionMode = 'fused' | 'dom-only' | 'vision-only';
export interface FusionOptions {
    readonly mode?: PerceptionMode;
    readonly iouThreshold?: number;
}
/**
 * Computes standard Intersection over Union (IoU) between two 2D boxes.
 * Box coordinates are in the same scale space [x, y, w, h].
 */
export declare function computeIoU(boxA: {
    x: number;
    y: number;
    width: number;
    height: number;
}, boxB: {
    x: number;
    y: number;
    width: number;
    height: number;
}): number;
export declare class FusionPolicy {
    /**
     * Fuses candidate elements from DOM and Vision into a unified SceneGraph.
     */
    static fuse(domCandidates: ReadonlyArray<DomCandidateElement>, visionCandidates: ReadonlyArray<CandidateVisionElement>, meta: ViewportMetadata, options?: FusionOptions): SceneGraph;
}
//# sourceMappingURL=fusion-policy.d.ts.map