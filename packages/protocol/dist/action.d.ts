import { SanitizedElement } from './payload.js';
import { StructuredTaskIntent, FormFieldAssignment } from './grounding.js';
export type ActionKind = 'observe' | 'navigate' | 'click' | 'hover' | 'type' | 'select' | 'drag_and_drop' | 'upload_file' | 'scroll' | 'wait' | 'extract' | 'answer' | 'request_user_confirmation' | 'request_user_input' | 'batch' | 'spawn_subagents' | 'finish' | 'blocked';
export type RiskLevel = 'safe' | 'protected' | 'blocked';
export interface ExecutionFeedback {
    readonly lastActionId?: string;
    readonly lastActionKind?: string;
    readonly targetLocalId?: string;
    readonly verified?: boolean;
    readonly outcomeCode?: string;
    readonly stepIndex?: number;
    readonly completedTasks?: ReadonlyArray<string>;
    readonly remainingTasks?: ReadonlyArray<string>;
}
export interface TaskSpecification {
    readonly goal: string;
    readonly tasksToDo: ReadonlyArray<string>;
    readonly tasksNotToDo: ReadonlyArray<string>;
    readonly successCriteria: string;
    readonly requiresSubAgents?: boolean;
    readonly subAgentTasks?: ReadonlyArray<{
        readonly subAgentId: string;
        readonly targetEntityOrUrl: string;
        readonly goal: string;
    }>;
}
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
} | {
    readonly kind: 'answer_supported';
    readonly queryTopic?: string;
};
export interface TaskContract {
    readonly supported: boolean;
    readonly goalPattern: string;
    readonly expectedTerminal: ExpectedPostcondition;
    readonly expectedTargetNameSubstring?: string;
    readonly structuredIntent?: StructuredTaskIntent;
    readonly isPassive?: boolean;
    readonly isAnswerGoal?: boolean;
    readonly isMultiStep?: boolean;
    readonly mode?: 'act' | 'answer' | 'extract';
    readonly queryTopic?: string;
    readonly abstentionReason?: string;
    readonly requiresUserInput?: boolean;
    readonly userInputKind?: 'credentials' | 'text_input';
    readonly userInputPrompt?: string;
}
export declare function cleanContextPhrase(phrase: string | undefined): string | undefined;
/**
 * Extracts multiple form field and value assignments from natural language instructions.
 * E.g. "in the place of name type kushagra and email tyoe kushagarasingh175@gmail.com"
 */
export declare function parseFormFieldAssignments(text: string): FormFieldAssignment[];
/**
 * Resolves a natural-language goal into a closed, structured task contract
 * binding expected semantic terminal postconditions to the run.
 */
export declare function resolveTaskContract(goal: string): TaskContract;
export interface AtomicActionProposal {
    readonly actionId: string;
    readonly kind: 'click' | 'hover' | 'type' | 'select' | 'drag_and_drop' | 'upload_file' | 'scroll' | 'wait' | 'observe' | 'extract' | 'answer' | 'navigate';
    readonly targetLocalId?: string;
    readonly destinationLocalId?: string;
    readonly textToType?: string;
    readonly selectOptionValue?: string;
    readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
    readonly pressEnter?: boolean;
    readonly fileName?: string;
    readonly rationale?: string;
    readonly url?: string;
    readonly targetUrl?: string;
    readonly createNewTab?: boolean;
}
export interface ActionProposal {
    readonly actionId: string;
    readonly kind: ActionKind;
    readonly targetLocalId?: string;
    readonly destinationLocalId?: string;
    readonly confidence: number;
    readonly risk: RiskLevel;
    readonly rationale: string;
    readonly expectedState?: string;
    readonly expectedPostcondition?: ExpectedPostcondition;
    readonly textToType?: string;
    readonly fileName?: string;
    readonly fileData?: string;
    readonly mimeType?: string;
    readonly selectOptionValue?: string;
    readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
    readonly tabId?: number;
    readonly userApproved?: boolean;
    readonly pressEnter?: boolean;
    readonly extractedData?: string;
    readonly answerText?: string;
    readonly reply?: string;
    readonly message?: string;
    readonly reasoning?: string;
    readonly batchActions?: ReadonlyArray<AtomicActionProposal>;
    readonly userInputPrompt?: string;
    readonly inputKey?: string;
    readonly subTasks?: ReadonlyArray<any>;
    readonly coordinates?: readonly [number, number];
    readonly url?: string;
    readonly targetUrl?: string;
    readonly createNewTab?: boolean;
    readonly targetName?: string;
    readonly elementText?: string;
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
export declare const ALLOWED_ACTION_PROPOSAL_KEYS: Set<string>;
export declare const ALLOWED_ATOMIC_ACTION_KEYS: Set<string>;
/**
 * Validates an ActionProposal against strict closed runtime schema and optional context elements.
 */
export declare function validateActionProposal(proposal: any, validElements?: ReadonlyArray<SanitizedElement>): ActionValidationResult;
/**
 * Validates whether an action proposed by the reasoning server is safe to auto-execute.
 */
export declare function classifyActionRisk(proposal: ActionProposal, elementName?: string): RiskLevel;
/**
 * Strips leading navigation clauses from compound goals (e.g. "open bhuvan and explore earth observation" -> "explore earth observation")
 */
export declare function stripNavigationPrefixFromGoal(goal: string): string;
/**
 * Detects if a user instruction is purely a navigation request without trailing action directives.
 * E.g. "open gmail.com", "go to sih.gov.in", "https://isro.gov.in", "navigate to github.com"
 */
export declare function isPureNavigationGoal(goal: string): boolean;
//# sourceMappingURL=action.d.ts.map