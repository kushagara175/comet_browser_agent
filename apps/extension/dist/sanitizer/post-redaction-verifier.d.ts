/**
 * @privapilot/extension - Fail-Closed Post-Redaction Verifier
 *
 * Implements Section B of the Production Execution Playbook:
 * Validates that all sensitive regions were physically rendered and verified,
 * checks pixel-level destruction, and asserts zero canary/PII leakage.
 */
import { SensitiveRegion, SanitizedElement } from '@privapilot/protocol';
import { RegionRenderRecord } from './mask-renderer.js';
import { CanvasVerificationReport } from './pixel-verifier.js';
export interface VerificationResult {
    readonly isValid: boolean;
    readonly reason?: string;
    readonly pixelVerificationReport?: CanvasVerificationReport;
}
export declare class PostRedactionVerifier {
    /**
     * Runs local post-redaction assertions.
     */
    static verify(regions: ReadonlyArray<SensitiveRegion>, renderedMaskCount: number, sanitizedElements: ReadonlyArray<SanitizedElement>, pageTitle: string, regionRecords?: ReadonlyArray<RegionRenderRecord>, canvases?: {
        sanitizedCanvas?: HTMLCanvasElement | OffscreenCanvas;
        rawCanvas?: HTMLCanvasElement | OffscreenCanvas | null;
    }): VerificationResult;
}
//# sourceMappingURL=post-redaction-verifier.d.ts.map