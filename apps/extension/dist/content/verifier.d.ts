/**
 * @privapilot/extension - Content Script Semantic State Verifier
 *
 * Implements deterministic semantic outcome validation with explicit bounded postconditions:
 * - Landmark appearance / disappearance
 * - Target element state mutations (enabled, disabled, checked, expanded, selected)
 * - Modal / drawer / dialog visibility
 * - Safe path / navigation changes (without raw URL / sensitive data transmission)
 * - Safe status text & alert region changes
 * - MutationObserver with bounded timeouts (no generic document.readyState fallbacks)
 */
import { ActionProposal } from '@privapilot/protocol';
export type VerificationReasonCode = 'LANDMARK_MUTATION_VERIFIED' | 'TARGET_STATE_MUTATION_VERIFIED' | 'MODAL_DRAWER_VISIBILITY_VERIFIED' | 'SAFE_NAVIGATION_VERIFIED' | 'STATUS_REGION_MUTATION_VERIFIED' | 'INPUT_VALUE_MUTATION_VERIFIED' | 'PASSIVE_ACTION_VERIFIED' | 'TIMEOUT_EXPIRED' | 'UNRELATED_MUTATION' | 'NO_SEMANTIC_CHANGE_OBSERVED' | 'TARGET_ELEMENT_MISSING' | 'CONDITION_NOT_MET';
export interface TargetSemanticState {
    readonly id?: string;
    readonly tagName?: string;
    readonly role?: string;
    readonly disabled?: boolean;
    readonly checked?: boolean;
    readonly readOnly?: boolean;
    readonly selectedIndex?: number;
    readonly ariaExpanded?: string | null;
    readonly ariaSelected?: string | null;
    readonly ariaChecked?: string | null;
    readonly isFocused?: boolean;
    readonly classListSummary?: string;
    readonly valuePresence?: boolean;
}
export interface SafePreActionSnapshot {
    readonly timestamp: number;
    readonly pathFingerprint: string;
    readonly openDialogOrDrawerCount: number;
    readonly openDialogIds: ReadonlySet<string>;
    readonly landmarkCounts: Record<string, number>;
    readonly statusRegionCount: number;
    readonly statusRegionTextSummary?: string;
    readonly targetState?: TargetSemanticState;
    readonly documentElementCount: number;
}
export interface VerificationOutcome {
    readonly verified: boolean;
    readonly reasonCode: VerificationReasonCode;
    readonly message: string;
    readonly details?: {
        readonly durationMs?: number;
        readonly matchedCondition?: string;
        readonly corroboratedByImageDiff?: boolean;
    };
}
export interface VerificationOptions {
    readonly timeoutMs?: number;
    readonly imageDiffCorroborated?: boolean;
    readonly doc?: Document;
}
export declare class SemanticStateVerifier {
    /**
     * Captures a safe, non-sensitive pre-action semantic baseline snapshot.
     */
    static captureSnapshot(targetEl?: HTMLElement | null, doc?: Document): SafePreActionSnapshot;
    /**
     * Verifies that explicit bounded postconditions occurred after action execution.
     */
    static verifyOutcome(proposal: ActionProposal, targetEl?: HTMLElement | null, preSnapshot?: SafePreActionSnapshot, options?: VerificationOptions): Promise<VerificationOutcome>;
}
//# sourceMappingURL=verifier.d.ts.map