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
export declare class PostRedactionVerifier {
    /**
     * Runs local post-redaction assertions.
     */
    static verify(regions: ReadonlyArray<SensitiveRegion>, renderedMaskCount: number, sanitizedElements: ReadonlyArray<SanitizedElement>, pageTitle: string): VerificationResult;
}
//# sourceMappingURL=post-redaction-verifier.d.ts.map