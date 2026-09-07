/**
 * @privapilot/protocol - Deterministic Intent Grounding & Target Resolution
 *
 * Implements strict, privacy-preserving candidate ranking and ambiguity evaluation
 * to ensure that browser actions are bound to the exact intended DOM elements.
 */
import { SanitizedElement, ElementRole } from './payload.js';
export interface StructuredTaskIntent {
    readonly intent: 'click' | 'type' | 'select' | 'scroll' | 'observe' | 'dismiss';
    readonly targetPhrase?: string;
    readonly roleHint?: ElementRole;
    readonly targetTokens: ReadonlyArray<string>;
    readonly contextPhrase?: string;
    readonly requestedValue?: string;
    readonly requestedOption?: string;
    readonly isProtected?: boolean;
    readonly submitAfter?: boolean;
    readonly pressEnter?: boolean;
}
export interface ScoredCandidate {
    readonly element: SanitizedElement;
    readonly score: number;
    readonly confidence: number;
    readonly rationale: string;
}
export interface GroundingResult {
    readonly status: 'unambiguous_match' | 'ambiguous_match' | 'no_match' | 'passive_or_unscoped';
    readonly bestCandidate?: ScoredCandidate;
    readonly candidates: ReadonlyArray<ScoredCandidate>;
    readonly ambiguityReason?: string;
}
/**
 * Normalizes a text string for semantic token comparison.
 */
export declare function normalizeSemanticText(text: string): string;
/**
 * Splits normalized text into meaningful tokens (filtering trivial single chars).
 */
export declare function tokenizeSemanticText(text: string): string[];
/**
 * Computes Levenshtein edit distance between two strings.
 */
export declare function levenshteinDistance(a: string, b: string): number;
/**
 * Checks whether two semantic tokens match, accommodating minor typos (e.g. "knwo" vs "know")
 * or prefix abbreviations (e.g. "pass" for "password").
 */
export declare function isFuzzyTokenMatch(a: string, b: string): boolean;
export declare const SEMANTIC_SYNONYMS: Record<string, string[]>;
/**
 * Evaluates and scores an individual SanitizedElement against a StructuredTaskIntent.
 */
export declare function scoreCandidate(element: SanitizedElement, intent: StructuredTaskIntent, activeDialogVisible?: boolean): {
    score: number;
    confidence: number;
    rationale: string;
    isDisqualified: boolean;
};
/**
 * Grounds and ranks all interactive candidates on the page against the structured intent.
 * Evaluates ambiguity and returns the unambiguous winner or ambiguity diagnosis.
 */
export declare function groundTargetCandidates(elements: ReadonlyArray<SanitizedElement>, intent: StructuredTaskIntent, activeDialogVisible?: boolean): GroundingResult;
//# sourceMappingURL=grounding.d.ts.map