/**
 * @privapilot/pii-rules - Detection Fusion
 *
 * Multiple independent detectors intentionally overlap: a card field is caught by
 * its `autocomplete="cc-number"` attribute AND by the Luhn-validated regex over its
 * value. That redundancy is good for recall and bad for everything downstream — it
 * doubles the mask count, inflates the over-mask ratio, and reports one secret twice.
 *
 * Fusion collapses detections that refer to the same underlying secret while keeping
 * the highest-confidence category for it. It never drops a region that no other
 * detection covers, so recall cannot decrease.
 */
import { SensitiveCategory } from '@privapilot/protocol';
export interface FusableDetection {
    readonly category: SensitiveCategory;
    /** The matched value, used to recognise the same secret found by two detectors. */
    readonly text?: string;
    readonly confidence?: number;
    readonly normX?: number;
    readonly normY?: number;
    readonly normW?: number;
    readonly normH?: number;
}
/**
 * Collapses duplicate detections of the same secret.
 *
 * Two detections are the same secret when they carry the same normalised value, or
 * when their regions substantially coincide. Detections with no value and no region
 * are always kept — there is not enough information to prove they are redundant, and
 * fusion must never discard a region on a guess.
 */
export interface FusionOptions {
    /**
     * Merge detections whose regions substantially coincide. Only meaningful when
     * coordinates come from real layout. Callers working with synthetic or estimated
     * boxes must leave this off, or unrelated secrets that happen to share a
     * placeholder position will be collapsed into one.
     */
    readonly spatial?: boolean;
}
export declare function fuseSensitiveDetections<T extends FusableDetection>(detections: ReadonlyArray<T>, options?: FusionOptions): T[];
//# sourceMappingURL=fusion.d.ts.map