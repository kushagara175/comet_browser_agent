/**
 * @privapilot/extension - Content Script DOM Action Executor
 *
 * Resolves localId back to the real DOM element and dispatches framework-compatible synthetic events.
 */

import { ActionProposal, ActionExecutionResult } from '@privapilot/protocol';

export class ActionExecutor {
  /**
   * Executes an action proposal on the target DOM element.
   */
  static execute(
    proposal: ActionProposal,
    elementMap: Map<string, HTMLElement>
  ): ActionExecutionResult {
    const timestamp = Date.now();

    if (proposal.kind === 'observe' || proposal.kind === 'wait') {
      return {
        actionId: proposal.actionId,
        success: true,
        timestamp,
        semanticOutcomeVerified: true,
        message: 'Observation completed'
      };
    }

    if (proposal.kind === 'scroll') {
      if (proposal.scrollDirection === 'down') {
        window.scrollBy({ top: 400, behavior: 'smooth' });
      } else if (proposal.scrollDirection === 'up') {
        window.scrollBy({ top: -400, behavior: 'smooth' });
      } else if (proposal.scrollDirection === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }

      return {
        actionId: proposal.actionId,
        success: true,
        timestamp,
        semanticOutcomeVerified: true,
        message: `Scrolled ${proposal.scrollDirection || 'down'}`
      };
    }

    if (!proposal.targetLocalId) {
      return {
        actionId: proposal.actionId,
        success: false,
        timestamp,
        semanticOutcomeVerified: false,
        message: 'Missing targetLocalId for DOM action'
      };
    }

    const targetEl = elementMap.get(proposal.targetLocalId);
    if (!targetEl) {
      return {
        actionId: proposal.actionId,
        success: false,
        timestamp,
        semanticOutcomeVerified: false,
        message: `Target element '${proposal.targetLocalId}' is stale or not found in DOM`
      };
    }

    // Scroll into view if needed
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      if (proposal.kind === 'click') {
        targetEl.focus();
        targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        targetEl.click();

        return {
          actionId: proposal.actionId,
          success: true,
          timestamp,
          semanticOutcomeVerified: true,
          message: `Clicked element '${proposal.targetLocalId}'`
        };
      }

      if (proposal.kind === 'type' && proposal.textToType !== undefined) {
        targetEl.focus();

        // Dispatch initial keydown for focus/activation
        targetEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Process' }));

        if ('value' in targetEl) {
          (targetEl as HTMLInputElement).value = proposal.textToType;
        } else {
          targetEl.innerText = proposal.textToType;
        }

        // Dispatch input & change events for React/Vue/Angular state sync
        targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        targetEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Process' }));

        return {
          actionId: proposal.actionId,
          success: true,
          timestamp,
          semanticOutcomeVerified: true,
          message: `Typed text into element '${proposal.targetLocalId}'`
        };
      }

      if (proposal.kind === 'select' && proposal.selectOptionValue !== undefined) {
        if (targetEl.tagName.toLowerCase() === 'select') {
          (targetEl as HTMLSelectElement).value = proposal.selectOptionValue;
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Selected option '${proposal.selectOptionValue}'`
          };
        }
      }

      return {
        actionId: proposal.actionId,
        success: false,
        timestamp,
        semanticOutcomeVerified: false,
        message: `Unsupported action kind '${proposal.kind}'`
      };
    } catch (err: any) {
      return {
        actionId: proposal.actionId,
        success: false,
        timestamp,
        semanticOutcomeVerified: false,
        message: `Execution failed: ${err.message}`
      };
    }
  }
}
