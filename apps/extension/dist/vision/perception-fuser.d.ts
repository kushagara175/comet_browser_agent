/**
 * @privapilot/extension - Multi-Modal Perception Fuser (Stage E)
 *
 * Merges DOM layout extractions with on-device visual UI candidate proposals:
 * - Computes spatial IoU and semantic role agreement
 * - Supports three strictly benchmarked modes: 'dom-only', 'vision-only', 'fused'
 * - Fused candidates enhance confidence; disagreements preserve provenance
 */
import { SanitizedElement, VisualRegionProposal, PerceptionResult, PerceptionMode } from '@privapilot/protocol';
export declare function computeBoxIoU(b1: readonly [number, number, number, number], b2: readonly [number, number, number, number]): number;
export declare class PerceptionFuser {
    /**
     * Fuses DOM elements and visual region proposals according to perception mode.
     */
    static fuse(captureId: string, domElements: ReadonlyArray<SanitizedElement>, visualProposals: ReadonlyArray<VisualRegionProposal>, mode?: PerceptionMode): PerceptionResult;
}
//# sourceMappingURL=perception-fuser.d.ts.map