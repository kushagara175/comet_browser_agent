/**
 * @privapilot/pii-rules - DOM Semantic Analyzer
 *
 * Inspects DOM element descriptors (input type, autocomplete, inputmode, id, name, aria-label, placeholder, labels)
 * to detect sensitive form fields deterministically.
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
/**
 * Evaluates whether a DOM element is sensitive based on semantic attributes.
 */
export declare function analyzeDomElementSensitivity(desc: DomElementDescriptor): DomSensitivityDecision;
//# sourceMappingURL=dom-semantic.d.ts.map