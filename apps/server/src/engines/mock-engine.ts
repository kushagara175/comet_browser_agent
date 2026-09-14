/**
 * @privapilot/server - Deterministic Offline Reasoning Engine
 *
 * Provides instant, zero-dependency reasoning over sanitized layout for tests and offline demos.
 */

import {
  SanitizedNetworkPayload,
  ActionProposal,
  resolveTaskContract,
  groundTargetCandidates
} from '@privapilot/protocol';

export class MockReasoningEngine {
  async decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal> {
    const proposal = await this.computeAction(payload);
    if (!proposal.reasoning && proposal.rationale) {
      const targetDesc = proposal.targetLocalId ? `element ${proposal.targetLocalId}` : 'the page';
      const count = payload.elements?.length || 0;
      return {
        ...proposal,
        reasoning: [
          `👁️ Observation: Analyzed viewport containing ${count} interactive element${count === 1 ? '' : 's'}.`,
          `🎯 User Intent: Aligning execution strategy for: "${payload.goal || ''}".`,
          `⚡ Action Selection: Selecting ${proposal.kind} on ${targetDesc} (${proposal.rationale}).`
        ].join('\n')
      };
    }
    return proposal;
  }

  private async computeAction(payload: SanitizedNetworkPayload): Promise<ActionProposal> {
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
      statusSummaries.some((s) => s.includes('synchronized')) ||
      Boolean(payload.pageState?.postconditionSummary && payload.pageState.postconditionSummary.toLowerCase().includes('synchronized'));
    const isSyncing =
      statusSummaries.some((s) => s.includes('syncing')) ||
      Boolean(payload.pageState?.postconditionSummary && payload.pageState.postconditionSummary.toLowerCase().includes('syncing'));

    // Safety injection: Low confidence action proposal (< 0.25)
    if (goal.includes('low confidence') || goal.includes('uncertain')) {
      const firstBtn = elements.find((el) => el.role === 'button');
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: firstBtn?.localId || 'el_1',
        confidence: 0.18,
        risk: 'safe',
        rationale: 'Candidate action proposed with low confidence (0.18 < 0.25 threshold) due to ambiguous visual layout.',
        expectedState: 'Action should not execute'
      };
    }

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

    if ((goal.includes('sync') || goal.includes('refresh')) && isSyncing) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'wait',
        confidence: 0.98,
        risk: 'safe',
        rationale: 'Synchronization is in progress (Syncing...). Waiting for terminal state Synchronized.',
        expectedState: 'Status synchronized'
      };
    }

    const wantsFiltering = goal.includes('search') || goal.includes('filter') || goal.includes('find');
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

    const contract = resolveTaskContract(payload.goal || '');
    const intent = contract.structuredIntent;

    // Information retrieval & question-answering
    if (contract.isAnswerGoal) {
      const topic = (contract.queryTopic || 'submission').toLowerCase();
      const pageCounters = (payload.pageState as any)?.counters || [];
      const counter = pageCounters.find((c: any) =>
        c.label.toLowerCase().includes(topic) ||
        topic.split(/\s+/).some((t: string) => c.label.toLowerCase().includes(t))
      );
      if (counter) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'finish',
          confidence: 0.98,
          risk: 'safe',
          rationale: `Answer verified: ${counter.value} ${counter.label} reported on page.`,
          expectedState: 'Answer verified'
        };
      }

      const navTarget = elements.find(el => {
        const name = el.sanitizedName.toLowerCase();
        return (el.role === 'tab' || el.role === 'link' || el.role === 'button') &&
          (name.includes('submission') || name.includes('problem') || name.includes('statement'));
      });
      if (navTarget) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: navTarget.localId,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Navigating to section "${navTarget.sanitizedName}" to find ${topic} metrics.`,
          expectedState: 'Navigation to target section'
        };
      }

      return {
        actionId: `act_${Date.now()}`,
        kind: 'finish',
        confidence: 0.90,
        risk: 'safe',
        rationale: `Observed page context for "${topic}".`,
        expectedState: 'Information query answered'
      };
    }

    // Structured target grounding if intent is present
    if (intent && intent.intent === 'click') {
      const grounding = groundTargetCandidates(elements, intent);
      if (grounding.status === 'ambiguous_match' && grounding.bestCandidate) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: grounding.bestCandidate.element.localId,
          confidence: 0.95,
          risk: 'protected',
          rationale: `Multiple ambiguous elements found matching "${intent.targetPhrase}" (${grounding.candidates.length} candidates); requiring user confirmation before proceeding.`,
          expectedState: 'Confirmation requested'
        };
      }
      if (grounding.bestCandidate && (grounding.status === 'unambiguous_match' || grounding.bestCandidate.score >= 50)) {
        const target = grounding.bestCandidate.element;
        if (hasVisibleDialog && isInspectionGoal && (target.sanitizedName.toLowerCase().includes('view') || target.sanitizedName.toLowerCase().includes('details'))) {
          return {
            actionId: `act_${Date.now()}`,
            kind: 'finish',
            confidence: 1.0,
            risk: 'safe',
            rationale: `Active dialog/modal is open and verified for "${target.sanitizedName}". Goal completed successfully.`,
            expectedState: 'Dialog open'
          };
        }
        const isProtected = intent.isProtected ||
          target.sanitizedName.toLowerCase().includes('submit') ||
          target.sanitizedName.toLowerCase().includes('approve') ||
          target.sanitizedName.toLowerCase().includes('confirm') ||
          target.sanitizedName.toLowerCase().includes('authorize') ||
          target.sanitizedName.toLowerCase().includes('delete');
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: target.localId,
          confidence: 0.96,
          risk: isProtected ? 'protected' : 'safe',
          rationale: `Grounded target "${target.sanitizedName}" (${grounding.status}, score ${grounding.bestCandidate.score}) for goal "${payload.goal}"`,
          expectedState: isProtected
            ? 'Protected action submitted, drawer dismissed and clearance approved'
            : (target.sanitizedName.toLowerCase().includes('preview') || target.sanitizedName.toLowerCase().includes('view') || target.sanitizedName.toLowerCase().includes('details'))
              ? 'Preview drawer or details modal becomes visible'
              : 'Target clicked'
        };
      }
      if (intent.targetPhrase && grounding.status === 'no_match' && !goal.includes('pending') && !goal.includes('clearance') && !goal.includes('approval')) {
        // Fallback 1: If there is an active search/input field, type the search/target query
        const searchInput = elements.find(
          (el) => el.actionCapabilities.includes('type') && !el.state.includes('disabled')
        );
        if (searchInput && intent.targetPhrase) {
          return {
            actionId: `act_${Date.now()}`,
            kind: 'type',
            targetLocalId: searchInput.localId,
            textToType: intent.targetPhrase,
            confidence: 0.88,
            risk: 'safe',
            rationale: `Search bar "${searchInput.sanitizedName}" found on page. Entering "${intent.targetPhrase}" to locate relevant content.`,
            expectedState: `Query "${intent.targetPhrase}" entered into search input`
          };
        }

        // Fallback 2: Check for navigational explore, category, or application links
        const exploreLink = elements.find(
          (el) =>
            el.actionCapabilities.includes('click') &&
            /\b(explore|applications|services|thematic|data|store|overview|menu|about|updates|kyr)\b/i.test(
              el.sanitizedName
            )
        );
        if (exploreLink) {
          return {
            actionId: `act_${Date.now()}`,
            kind: 'click',
            targetLocalId: exploreLink.localId,
            confidence: 0.85,
            risk: 'safe',
            rationale: `Navigating to "${exploreLink.sanitizedName}" to explore relevant resources for "${intent.targetPhrase}".`,
            expectedState: `"${exploreLink.sanitizedName}" page opens`
          };
        }

        return {
          actionId: `act_${Date.now()}`,
          kind: 'finish',
          confidence: 0.95,
          risk: 'safe',
          rationale: `Requested target "${intent.targetPhrase}" was not found on the page.`,
          expectedState: 'Target not found'
        };
      }
    }

    // Structured typing grounding if intent is type
    if (intent && intent.intent === 'type') {
      if (intent.formAssignments && intent.formAssignments.length > 0) {
        const assignment = intent.formAssignments[0];
        const subIntent = {
          intent: 'type' as const,
          targetPhrase: assignment.target,
          targetTokens: [assignment.target],
          requestedValue: assignment.value
        };
        const subGrounding = groundTargetCandidates(elements, subIntent);
        const subTarget = (subGrounding.bestCandidate && (subGrounding.status === 'unambiguous_match' || subGrounding.bestCandidate.score >= 40))
          ? subGrounding.bestCandidate.element
          : elements.find((el) => el.actionCapabilities.includes('type') && !el.state.includes('disabled'));
        if (subTarget) {
          return {
            actionId: `act_${Date.now()}`,
            kind: 'type',
            targetLocalId: subTarget.localId,
            textToType: assignment.value,
            confidence: 0.95,
            risk: 'safe',
            rationale: `Form filling: entering "${assignment.value}" into "${subTarget.sanitizedName || assignment.target}"`,
            expectedState: 'Text entered into input field'
          };
        }
      }

      const grounding = groundTargetCandidates(elements, intent);
      const textToType = goal.includes('clearance')
        ? 'Security Clearance'
        : (intent.requestedValue || '');
      if (grounding.bestCandidate && (grounding.status === 'unambiguous_match' || grounding.bestCandidate.score >= 50)) {
        const target = grounding.bestCandidate.element;
        return {
          actionId: `act_${Date.now()}`,
          kind: 'type',
          targetLocalId: target.localId,
          textToType,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Typing "${textToType}" into "${target.sanitizedName}" (${grounding.bestCandidate.rationale})`,
          expectedState: 'Text entered into input field'
        };
      }
      // Fallback: find any editable input or textarea if none matched by name
      const fallbackInput = elements.find(
        (el) => el.actionCapabilities.includes('type') && !el.state.includes('disabled')
      );
      if (fallbackInput) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'type',
          targetLocalId: fallbackInput.localId,
          textToType,
          confidence: 0.90,
          risk: 'safe',
          rationale: `Typing "${textToType}" into active field "${fallbackInput.sanitizedName}"`,
          expectedState: 'Text entered into input field'
        };
      }
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

    // 3. Active modal / drawer with submit/approval button (only if goal is an approval/submit goal)
    const isApprovalOrSubmitGoal =
      /(?:approve|submit|confirm|authorize|pay|order|release|clearance)/i.test(goal) ||
      Boolean(intent?.isProtected);

    if (submitOrApproveBtn && isApprovalOrSubmitGoal) {
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

    // 4b. Hover directive
    if (contract.goalPattern === 'hover_control' || goal.includes('hover') || goal.includes('mouse over')) {
      const targetPhrase = (contract.structuredIntent?.targetPhrase || '').toLowerCase();
      const target = elements.find((el) => targetPhrase && el.sanitizedName.toLowerCase().includes(targetPhrase)) ||
        elements.find((el) => el.actionCapabilities.includes('hover')) ||
        elements[0];
      if (target) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'hover',
          targetLocalId: target.localId,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Hovering over "${target.sanitizedName}" to inspect flyout/submenu`,
          expectedState: 'Hover trigger activated'
        };
      }
    }

    // 4c. Drag and drop directive
    if (contract.goalPattern === 'drag_and_drop' || goal.includes('drag')) {
      const sourcePhrase = (contract.structuredIntent?.targetPhrase || '').toLowerCase();
      const destPhrase = (contract.structuredIntent?.destinationPhrase || '').toLowerCase();
      const sourceEl = elements.find((el) => sourcePhrase && el.sanitizedName.toLowerCase().includes(sourcePhrase)) ||
        elements.find((el) => el.actionCapabilities.includes('drag')) ||
        elements[0];
      const destEl = elements.find((el) => destPhrase && el.localId !== sourceEl?.localId && el.sanitizedName.toLowerCase().includes(destPhrase)) ||
        elements.find((el) => el.localId !== sourceEl?.localId) ||
        elements[1] || elements[0];
      if (sourceEl && destEl) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'drag_and_drop',
          targetLocalId: sourceEl.localId,
          destinationLocalId: destEl.localId,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Dragging "${sourceEl.sanitizedName}" onto "${destEl.sanitizedName}"`,
          expectedState: 'Element dragged and dropped to destination'
        };
      }
    }

    // 4d. File upload directive
    if (contract.goalPattern === 'upload_file' || goal.includes('upload') || goal.includes('attach')) {
      const targetPhrase = (contract.structuredIntent?.targetPhrase || '').toLowerCase();
      const fileName = contract.structuredIntent?.fileName || 'document.pdf';
      const fileInput = elements.find((el) =>
        (el.actionCapabilities.includes('upload') || el.role === 'input') &&
        (!targetPhrase || el.sanitizedName.toLowerCase().includes(targetPhrase))
      ) ||
        elements.find((el) => el.actionCapabilities.includes('upload')) ||
        elements.find((el) => el.role === 'input');
      if (fileInput) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'upload_file',
          targetLocalId: fileInput.localId,
          fileName,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Uploading file "${fileName}" to input "${fileInput.sanitizedName}"`,
          expectedState: 'File uploaded and value present'
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
          expectedState: 'Sync status changes to Synchronized',
          expectedPostcondition: {
            kind: 'status_changed'
          }
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

    // 7b. Matching control/link/button by name in request (e.g. "click standard-login")
    if (goal.includes('click') || goal.includes('navigate') || goal.includes('go to') || goal.includes('open')) {
      const matchTerms = goal
        .replace(/^(?:please\s+)?(?:kindly\s+)?(?:click|navigate\s+to|go\s+to|open|press)\s+(?:on\s+)?(?:the\s+)?/i, '')
        .trim()
        .replace(/["']/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const targetEl = elements.find((el) => {
        if (el.role !== 'link' && el.role !== 'button' && el.role !== 'tab') return false;
        const name = el.sanitizedName.toLowerCase();
        return matchTerms.some((term) => name.includes(term.toLowerCase()));
      });

      if (targetEl) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: targetEl.localId,
          confidence: 0.95,
          risk: 'safe',
          rationale: `Clicking "${targetEl.sanitizedName}" matching requested action in "${goal}"`,
          expectedState: 'Target activated'
        };
      }
    }

    // 8. Fallback: observe safe first button, link, or finish
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

