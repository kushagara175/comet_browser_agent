/**
 * @privapilot/extension - Fail-Closed Post-Redaction Verifier
 *
 * Implements section 5.7 of the Winning Execution Playbook:
 * Validates that all sensitive regions were masked and that the canary scanner passes.
 */
import { scanTextForPII, CANARY_SECRET } from '@privapilot/pii-rules';
export class PostRedactionVerifier {
    /**
     * Runs local post-redaction assertions.
     */
    static verify(regions, renderedMaskCount, sanitizedElements, pageTitle) {
        // 1. Verify every identified sensitive region received a mask
        if (regions.length !== renderedMaskCount) {
            return {
                isValid: false,
                reason: `Mask count mismatch: detected ${regions.length} regions but rendered ${renderedMaskCount} masks.`
            };
        }
        // 2. Canary check in sanitized element names & page title
        if (pageTitle.includes(CANARY_SECRET)) {
            return {
                isValid: false,
                reason: 'Canary leak detected in sanitized page title.'
            };
        }
        for (const el of sanitizedElements) {
            if (el.sanitizedName.includes(CANARY_SECRET)) {
                return {
                    isValid: false,
                    reason: `Canary leak detected in sanitized element '${el.localId}'.`
                };
            }
            // Ensure no raw PII remains in element sanitizedName
            const residualPii = scanTextForPII(el.sanitizedName);
            if (residualPii.length > 0) {
                return {
                    isValid: false,
                    reason: `Residual unredacted PII (${residualPii[0].category}) found in element '${el.localId}'.`
                };
            }
        }
        return { isValid: true };
    }
}
//# sourceMappingURL=post-redaction-verifier.js.map