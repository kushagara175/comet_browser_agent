import { SanitizedElement } from './payload.js';
export type ActionKind = 'observe' | 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'request_user_confirmation' | 'finish' | 'blocked';
export type RiskLevel = 'safe' | 'protected' | 'blocked';
export interface ActionProposal {
    readonly actionId: string;
    readonly kind: ActionKind;
    readonly targetLocalId?: string;
    readonly confidence: number;
    readonly risk: RiskLevel;
    readonly rationale: string;
    readonly expectedState?: string;
    readonly textToType?: string;
    readonly selectOptionValue?: string;
    readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
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