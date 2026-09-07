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

    const hasVisibleDialog = Boolean(
      (payload.pageState?.visibleDialogCount && payload.pageState.visibleDialogCount > 0) ||
      elements.some(el => el.role === 'dialog')
    );
    const isInspectionGoal = !goal.includes('submit') && !goal.includes('approve') && !goal.includes('confirm');
    const statusSummaries = (payload.pageState?.statusSummaries || []).map((s) => s.toLowerCase());
    const isApproved = statusSummaries.some((s) => s.includes('approved'));
    const isSynchronized =
      statusSummaries.some((s) => s.includes('synchronized') || s.includes('sync')) ||
      Boolean(payload.pageState?.postconditionSummary && payload.pageState.postconditionSummary.includes('STATUS'));

    if (goal.includes('clearance') && isApproved) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'finish',
        confidence: 1.0,
        risk: 'safe',
        rationale: 'Security clearance access request is approved. Goal complete.',
        expectedState: 'Clearance approved'
      };
    }

    if ((goal.includes('sync') || goal.includes('refresh')) && isSynchronized) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'finish',
        confidence: 1.0,
        risk: 'safe',
        rationale: 'Synchronization is complete and verified. Goal complete.',
        expectedState: 'Status synchronized'
      };
    }

    const wantsFiltering = goal.includes('search') || goal.includes('filter') || goal.includes('find') || goal.includes('clearance');
    const isFiltered = statusSummaries.some((s) => s.includes('filtered'));

    if (wantsFiltering && isFiltered) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'finish',
        confidence: 1.0,
        risk: 'safe',
        rationale: 'Table search filtering is active and verified. Goal complete.',
        expectedState: 'Results filtered'
      };
    }

    // 2. Ambiguity check: repeated ambiguous buttons (e.g. "Click Inspect")
    const inspectButtons = elements.filter(
      (el) => el.role === 'button' && el.sanitizedName.toLowerCase() === 'inspect'
    );
    if (goal.includes('inspect') && inspectButtons.length > 1) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: inspectButtons[0].localId,
        confidence: 0.95,
        risk: 'protected',
        rationale: `Multiple ambiguous elements found matching "Inspect" (${inspectButtons.length} candidates); requiring user confirmation before proceeding.`,
        expectedState: 'Confirmation requested'
      };
    }

    // 3. Active modal / drawer with submit/approval button
    if (submitOrApproveBtn) {
      if (hasVisibleDialog && isInspectionGoal) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'finish',
          confidence: 1.0,
          risk: 'safe',
          rationale: 'Active dialog/modal is open and verified in page landmarks. Goal completed successfully.',
          expectedState: 'Dialog open'
        };
      }

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

    // 4. Select dropdown option
    if (goal.includes('select') || goal.includes('choose')) {
      const selectEl = elements.find((el) => el.role === 'select');
      if (selectEl) {
        let optVal = 'pending';
        if (goal.includes('pending')) optVal = 'pending';
        else if (goal.includes('approved') || goal.includes('completed')) optVal = 'approved';
        else if (goal.includes('review')) optVal = 'review';
        else if (goal.includes('all')) optVal = 'all';
        else {
          const m = goal.match(/(?:select|choose)(?:\s+(?:status|option))*\s+["']?([a-zA-Z0-9_-]+)["']?/i);
          if (m) optVal = m[1].toLowerCase();
        }

        return {
          actionId: `act_${Date.now()}`,
          kind: 'select',
          targetLocalId: selectEl.localId,
          selectOptionValue: optVal,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Selecting option "${optVal}" in dropdown "${selectEl.sanitizedName}"`,
          expectedState: `Dropdown value changed to ${optVal}`
        };
      }
    }

    // 5. Explicit button matching (e.g. Refresh Sync button)
    if (goal.includes('sync') || goal.includes('refresh')) {
      const syncBtn = elements.find(
        (el) =>
          el.role === 'button' &&
          (el.sanitizedName.toLowerCase().includes('sync') || el.sanitizedName.toLowerCase().includes('refresh'))
      );
      if (syncBtn) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: syncBtn.localId,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Triggering synchronization via "${syncBtn.sanitizedName}"`,
          expectedState: 'Sync status changes to Synchronized'
        };
      }
    }

    // 6. If search / filter is requested and a search/filter input is present
    const searchInput = elements.find(
      (el) =>
        el.role === 'input' &&
        (el.sanitizedName.toLowerCase().includes('search') ||
         el.sanitizedName.toLowerCase().includes('filter') ||
         el.sanitizedName.toLowerCase().includes('query'))
    );

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

    // 7. Open preview / details
    const previewBtn = elements.find(
      (el) =>
        el.role === 'button' &&
        (el.sanitizedName.toLowerCase().includes('preview') ||
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

    // 8. Fallback: observe safe first button or finish
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

