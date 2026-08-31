/**
 * @privapilot/extension - Content Script DOM Action Executor
 *
 * Resolves localId back to the real DOM element and dispatches framework-compatible synthetic events.
 */
import { ActionProposal, ActionExecutionResult } from '@privapilot/protocol';
export declare class ActionExecutor {
    /**
     * Executes an action proposal on the target DOM element.
     */
    static execute(proposal: ActionProposal, elementMap: Map<string, HTMLElement>): ActionExecutionResult;
}
//# sourceMappingURL=action-executor.d.ts.map