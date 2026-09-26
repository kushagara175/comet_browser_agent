/**
 * @privapilot/pii-rules - DOM Semantic Analyzer
 *
 * Only editable fields can be classified by their form semantics. Navigation and
 * ordinary search controls stay actionable; validated PII in live values still wins.
 */
import { SensitiveCategory } from '@privapilot/protocol';
export interface DomElementDescriptor {
    readonly tagName: string;
    readonly type?: string;
    readonly name?: string;
    readonly id?: string;
    readonly autocomplete?: string;
    readonly inputmode?: string;
    readonly placeholder?: string;
    readonly ariaLabel?: string;
    readonly associatedLabelText?: string;
    readonly value?: string;
}
export interface DomSensitivityDecision {
    readonly isSensitive: boolean;
    readonly category?: SensitiveCategory;
    readonly reason?: string;
    readonly confidence: number;
}
/** Evaluates the semantics of an editable field without classifying navigation labels. */
export declare function analyzeDomElementSensitivity(desc: DomElementDescriptor): DomSensitivityDecision;
//# sourceMappingURL=dom-semantic.d.ts.map