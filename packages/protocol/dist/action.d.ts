import { SanitizedElement } from './payload.js';
import { StructuredTaskIntent } from './grounding.js';
export type ActionKind = 'observe' | 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'request_user_confirmation' | 'finish' | 'blocked';
export type RiskLevel = 'safe' | 'protected' | 'blocked';
export type ExpectedPostcondition = {
    readonly kind: 'dialog_visible';
    readonly dialogId?: string;
} | {
    readonly kind: 'url_changed';
    readonly expectedPathFragment?: string;
} | {
    readonly kind: 'attribute_changed';
    readonly attributeName: 'aria-expanded' | 'aria-checked' | 'aria-selected' | 'disabled' | 'open' | 'class';
    readonly expectedValue?: string;
} | {
    readonly kind: 'value_present';
    readonly expectedValueFragment?: string;
} | {
    readonly kind: 'select_changed';
    readonly expectedOptionValue?: string;
} | {
    readonly kind: 'status_changed';
    readonly statusId?: string;
} | {
    readonly kind: 'scroll_changed';
    readonly direction: 'up' | 'down' | 'top' | 'bottom';
} | {
    readonly kind: 'visibility_changed';
    readonly targetLocalId?: string;
    readonly state: 'visible' | 'hidden';
};
export interface TaskContract {
    readonly supported: boolean;
    readonly goalPattern: string;
    readonly expectedTerminal: ExpectedPostcondition;
    readonly expectedTargetNameSubstring?: string;
    readonly structuredIntent?: StructuredTaskIntent;
    readonly isPassive?: boolean;
    readonly abstentionReason?: string;
    readonly requiresUserInput?: boolean;
    readonly userInputKind?: 'credentials' | 'text_input';
    readonly userInputPrompt?: string;
}
export declare function cleanContextPhrase(phrase: string | undefined): string | undefined;
/**
 * Resolves a natural-language goal into a closed, structured task contract
 * binding expected semantic terminal postconditions to the run.
 */
export declare function resolveTaskContract(goal: string): TaskContract;
export interface ActionProposal {
    readonly actionId: string;
    readonly kind: ActionKind;
    readonly targetLocalId?: string;
    readonly confidence: number;
    readonly risk: RiskLevel;
    readonly rationale: string;
    readonly expectedState?: string;
    readonly expectedPostcondition?: ExpectedPostcondition;
    readonly textToType?: string;
    readonly selectOptionValue?: string;
    readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
    readonly userApproved?: boolean;
}
export interface ActionExecutionResult {
    readonly actionId: string;
    readonly success: boolean;
    readonly timestamp: number;
    readonly message?: string;
    readonly semanticOutcomeVerified: boolean;
    readonly reasonCode?: string;
    readonly staleTarget?: boolean;
}
export interface ActionValidationResult {
    readonly isValid: boolean;
    readonly proposal?: ActionProposal;
    readonly errorMessage?: string;
}
/**
 * Validates an ActionProposal against strict closed runtime schema and optional context elements.
 */
export declare function validateActionProposal(proposal: any, validElements?: ReadonlyArray<SanitizedElement>): ActionValidationResult;
/**
 * Validates whether an action proposed by the reasoning server is safe to auto-execute.
 */
export declare function classifyActionRisk(proposal: ActionProposal, elementName?: string): RiskLevel;
//# sourceMappingURL=action.d.ts.map