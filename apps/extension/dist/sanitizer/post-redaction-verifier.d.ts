/**
 * @privapilot/extension - Fail-Closed Post-Redaction Verifier
 *
 * Implements section 5.7 of the Winning Execution Playbook:
 * Validates that all sensitive regions were masked and that the canary scanner passes.
 */
import { SensitiveRegion, SanitizedElement } from '@privapilot/protocol';
export interface VerificationResult {
    readonly isValid: boolean;
    readonly reason?: string;
}
/** Detail present in a region BEFORE masking, keyed by region id. */
export type PreMaskDetail = ReadonlyMap<string, number>;
export declare class PostRedactionVerifier {
    /**
     * Runs local post-redaction assertions.
     */
    static verify(regions: ReadonlyArray<SensitiveRegion>, renderedMaskCount: number, sanitizedElements: ReadonlyArray<SanitizedElement>, pageTitle: string): VerificationResult;
    /**
     * Samples the region BEFORE masks are drawn, so coverage can be judged against
     * what was actually there rather than against an absolute threshold.
     */
    static measurePreMaskDetail(canvas: HTMLCanvasElement | OffscreenCanvas, regions: ReadonlyArray<SensitiveRegion>): Map<string, number>;
    /**
     * Reads the masked pixels and asserts every sensitive region was actually
     * destroyed.
     *
     * The count comparison in `verify()` cannot catch a mask drawn at the wrong
     * coordinates: the mask exists, the count matches, and the secret is still
     * legible. This is the check that closes that hole, and it is deliberately the
     * same measurement the browser benchmark scores redaction with, so the product
     * enforces the metric rather than merely being graded on it.
     */
    static verifyPixelCoverage(canvas: HTMLCanvasElement | OffscreenCanvas, regions: ReadonlyArray<SensitiveRegion>, preMaskDetail: PreMaskDetail): VerificationResult;
}
//# sourceMappingURL=post-redaction-verifier.d.ts.map