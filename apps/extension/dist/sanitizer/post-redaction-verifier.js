/**
 * @privapilot/extension - Fail-Closed Post-Redaction Verifier
 *
 * Implements Section B of the Production Execution Playbook:
 * Validates that all sensitive regions were physically rendered and verified,
 * checks pixel-level destruction, and asserts zero canary/PII leakage.
 */
import { scanTextForPII, CANARY_SECRET } from '@privapilot/pii-rules';
import { verifyCanvasRedaction } from './pixel-verifier.js';
export class PostRedactionVerifier {
    /**
     * Runs local post-redaction assertions.
     */
    static verify(regions, renderedMaskCount, sanitizedElements, pageTitle, regionRecords, canvases) {
        // 1. Verify every identified sensitive region received a rendered mask
        if (regions.length !== renderedMaskCount) {
            return {
                isValid: false,
                reason: `Mask count mismatch: detected ${regions.length} regions but rendered ${renderedMaskCount} masks.`
            };
        }
        // 2. Validate per-region render records (Stage B2 & B8)
        if (regionRecords) {
            if (regionRecords.length !== regions.length) {
                return {
                    isValid: false,
                    reason: `Region record count mismatch: expected ${regions.length}, got ${regionRecords.length}.`
                };
            }
            const failedRecord = regionRecords.find((r) => !r.success);
            if (failedRecord) {
                return {
                    isValid: false,
                    reason: `Pixel mask failed for region '${failedRecord.regionId}': ${failedRecord.failureReason || 'unknown render failure'}`
                };
            }
        }
        // 3. Pixel-true canvas verification if canvas is available (Stage B4 & B5)
        let pixelReport;
        if (canvases?.sanitizedCanvas && regions.length > 0) {
            pixelReport = verifyCanvasRedaction(canvases.sanitizedCanvas, canvases.rawCanvas || null, regions);
            if (!pixelReport.allPassed) {
                return {
                    isValid: false,
                    reason: `Pixel verification failed: ${pixelReport.failureReason || 'one or more regions unmasked'}`,
                    pixelVerificationReport: pixelReport
                };
            }
        }
        // 4. Canary check in sanitized element names & page title
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
        return {
            isValid: true,
            ...(pixelReport ? { pixelVerificationReport: pixelReport } : {})
        };
    }
}
//# sourceMappingURL=post-redaction-verifier.js.map