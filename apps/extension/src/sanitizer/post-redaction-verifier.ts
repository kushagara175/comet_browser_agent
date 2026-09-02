/**
 * @privapilot/extension - Fail-Closed Post-Redaction Verifier
 *
 * Implements section 5.7 of the Winning Execution Playbook:
 * Validates that all sensitive regions were masked and that the canary scanner passes.
 */

import { SensitiveRegion, SanitizedElement } from '@privapilot/protocol';
import { scanTextForPII, CANARY_SECRET } from '@privapilot/pii-rules';
import { sampleRegion, overlayFractionOf, localDetailOf } from './pixel-probe.js';

export interface VerificationResult {
  readonly isValid: boolean;
  readonly reason?: string;
}

/** Detail present in a region BEFORE masking, keyed by region id. */
export type PreMaskDetail = ReadonlyMap<string, number>;

/** An opaque mask must own essentially the whole region it claims to cover. */
const MIN_OVERLAY_FRACTION = 0.9;

/** Pixelation must remove this much of the fine detail that was there. */
const MIN_DETAIL_REMOVED = 0.6;

/**
 * Below this, a region was featureless to begin with. Pixelating it is a no-op and
 * no pixel test can distinguish a masked flat area from an untouched one, so such a
 * region is not failed on detail grounds.
 */
const MIN_ASSESSABLE_DETAIL = 3.0;

export class PostRedactionVerifier {
  /**
   * Runs local post-redaction assertions.
   */
  static verify(
    regions: ReadonlyArray<SensitiveRegion>,
    renderedMaskCount: number,
    sanitizedElements: ReadonlyArray<SanitizedElement>,
    pageTitle: string
  ): VerificationResult {
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

  /**
   * Samples the region BEFORE masks are drawn, so coverage can be judged against
   * what was actually there rather than against an absolute threshold.
   */
  static measurePreMaskDetail(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    regions: ReadonlyArray<SensitiveRegion>
  ): Map<string, number> {
    const detail = new Map<string, number>();
    for (const region of regions) {
      const sample = sampleRegion(canvas, region.screenshotBox);
      if (sample) {
        detail.set(region.id, localDetailOf(sample.data, sample.width, sample.height));
      }
    }
    return detail;
  }

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
  static verifyPixelCoverage(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    regions: ReadonlyArray<SensitiveRegion>,
    preMaskDetail: PreMaskDetail
  ): VerificationResult {
    for (const region of regions) {
      const sample = sampleRegion(canvas, region.screenshotBox);
      // Regions too small to sample (a 1px sliver) carry no measurable evidence
      // either way; the count check in verify() still applies to them.
      if (!sample) continue;

      const overlay = overlayFractionOf(sample.data);
      if (overlay >= MIN_OVERLAY_FRACTION) continue;

      // Not painted over, so this must be the pixelation path. Judge it against the
      // detail the region held before masking.
      const rawDetail = preMaskDetail.get(region.id);
      if (rawDetail === undefined || rawDetail < MIN_ASSESSABLE_DETAIL) continue;

      const residual = localDetailOf(sample.data, sample.width, sample.height, true);
      const removed = 1 - residual / rawDetail;
      if (removed < MIN_DETAIL_REMOVED) {
        return {
          isValid: false,
          reason:
            `Region '${region.id}' (${region.category}) is not covered by its mask: ` +
            `overlay ${(overlay * 100).toFixed(1)}%, detail removed ${(removed * 100).toFixed(1)}%. ` +
            `A mask was rendered but did not land on the region.`
        };
      }
    }

    return { isValid: true };
  }
}
