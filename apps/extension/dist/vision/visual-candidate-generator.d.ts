/**
 * @privapilot/extension - On-Device Visual UI Region Proposal Generator (Stage E)
 *
 * Implements browser-compatible classical visual region proposal extraction:
 * - Gradient edge detection across downsampled pixel grid
 * - Connected component bounding-box grouping
 * - Aspect ratio and geometric scale classification for UI elements (buttons, inputs, dialogs, icons)
 * - Pure on-device computation without external network/CDN calls
 */
import { VisualRegionProposal } from '@privapilot/protocol';
export interface VisualExtractionOptions {
    readonly minWidth?: number;
    readonly minHeight?: number;
    readonly maxProposals?: number;
}
export declare class VisualCandidateGenerator {
    /**
     * Generates visual UI candidate region proposals from canvas pixel data.
     */
    static extractProposals(pixelBuffer: Uint8ClampedArray | Uint8Array, width: number, height: number, options?: VisualExtractionOptions): VisualRegionProposal[];
}
//# sourceMappingURL=visual-candidate-generator.d.ts.map