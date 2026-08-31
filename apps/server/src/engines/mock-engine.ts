/**
 * @privapilot/server - Deterministic Offline Reasoning Engine
 *
 * Provides instant, zero-dependency reasoning over sanitized layout for tests and offline demos.
 */

import { SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';

export class MockReasoningEngine {
  async decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal> {
    const goal = (payload.goal || '').toLowerCase();
    const elements = payload.elements || [];

    // 1. Check if an active modal / drawer is already open with a protected submit or approval button
    const submitOrApproveBtn = elements.find(
      (el) =>
        el.role === 'button' &&
        (el.sanitizedName.toLowerCase().includes('submit') ||
         el.sanitizedName.toLowerCase().includes('approve') ||
         el.sanitizedName.toLowerCase().includes('confirm') ||
         el.sanitizedName.toLowerCase().includes('authorize'))
    );

    if (submitOrApproveBtn) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: submitOrApproveBtn.localId,
        confidence: 0.96,
        risk: 'protected',
        rationale: `Targeting "${submitOrApproveBtn.sanitizedName}". This is a state-altering protected action requiring user confirmation.`,
        expectedState: 'Protected action submitted, drawer dismissed and clearance approved'
      };
    }

    // 2. If search / filter is requested and a search/filter input is present
    const searchInput = elements.find(
      (el) =>
        el.role === 'input' &&
        (el.sanitizedName.toLowerCase().includes('search') ||
         el.sanitizedName.toLowerCase().includes('filter') ||
         el.sanitizedName.toLowerCase().includes('query'))
    );

    const wantsFiltering = goal.includes('search') || goal.includes('filter') || goal.includes('find') || goal.includes('clearance');
    if (searchInput && wantsFiltering && !searchInput.state?.includes('focused')) {
      const queryText = goal.includes('clearance') ? 'Security Clearance' : 'Pending Request';
      return {
        actionId: `act_${Date.now()}`,
        kind: 'type',
        targetLocalId: searchInput.localId,
        confidence: 0.94,
        risk: 'safe',
        textToType: queryText,
        rationale: `Entering query "${queryText}" into filter field "${searchInput.sanitizedName}"`,
        expectedState: 'Search field updated with query text'
      };
    }

    // 3. Open preview / details
    const previewBtn = elements.find(
      (el) =>
        el.role === 'button' &&
        (el.sanitizedName.toLowerCase().includes('preview') ||
         el.sanitizedName.toLowerCase().includes('inspect') ||
         el.sanitizedName.toLowerCase().includes('view') ||
         el.sanitizedName.toLowerCase().includes('open') ||
         el.sanitizedName.toLowerCase().includes('details'))
    );

    if (previewBtn) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: previewBtn.localId,
        confidence: 0.95,
        risk: 'safe',
        rationale: `Opening request preview via "${previewBtn.sanitizedName}"`,
        expectedState: 'Preview drawer or details modal becomes visible'
      };
    }

    // 4. Fallback: observe safe first button or finish
    const firstSafeButton = elements.find((el) => el.role === 'button');
    if (firstSafeButton) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: firstSafeButton.localId,
        confidence: 0.75,
        risk: 'safe',
        rationale: `Selecting safe button "${firstSafeButton.sanitizedName}"`,
        expectedState: 'Interaction dispatched'
      };
    }

    return {
      actionId: `act_${Date.now()}`,
      kind: 'finish',
      confidence: 1.0,
      risk: 'safe',
      rationale: 'Workflow steps complete. Target request handled.'
    };
  }
}

