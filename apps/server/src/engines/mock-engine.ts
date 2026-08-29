/**
 * @privapilot/server - Deterministic Offline Reasoning Engine
 *
 * Provides instant, zero-dependency reasoning over sanitized layout for tests and offline demos.
 */

import { SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';

export class MockReasoningEngine {
  async decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal> {
    const goal = (payload.goal || '').toLowerCase();

    // 1. Task: Find pending request and open preview
    if (goal.includes('preview') || goal.includes('pending')) {
      const previewBtn = payload.elements.find(
        (el) =>
          el.role === 'button' &&
          (el.sanitizedName.toLowerCase().includes('preview') ||
           el.sanitizedName.toLowerCase().includes('view') ||
           el.sanitizedName.toLowerCase().includes('open'))
      );

      if (previewBtn) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: previewBtn.localId,
          confidence: 0.96,
          risk: 'safe',
          rationale: `Found actionable element matching preview request: "${previewBtn.sanitizedName}"`,
          expectedState: 'Preview drawer or details modal becomes visible'
        };
      }
    }

    // 2. Task: Search or Filter
    if (goal.includes('search') || goal.includes('filter')) {
      const searchInput = payload.elements.find(
        (el) => el.role === 'input' && (el.sanitizedName.toLowerCase().includes('search') || el.sanitizedName.toLowerCase().includes('query'))
      );

      if (searchInput) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'type',
          targetLocalId: searchInput.localId,
          confidence: 0.92,
          risk: 'safe',
          textToType: 'Telemetry Subsystem A',
          rationale: `Focusing search field "${searchInput.sanitizedName}" to query subsystem data`,
          expectedState: 'Search field updated'
        };
      }
    }

    // 3. Task: Submit or Approve (Protected Action)
    if (goal.includes('submit') || goal.includes('approve') || goal.includes('confirm')) {
      const submitBtn = payload.elements.find(
        (el) =>
          el.role === 'button' &&
          (el.sanitizedName.toLowerCase().includes('submit') ||
           el.sanitizedName.toLowerCase().includes('approve') ||
           el.sanitizedName.toLowerCase().includes('confirm'))
      );

      if (submitBtn) {
        return {
          actionId: `act_${Date.now()}`,
          kind: 'click',
          targetLocalId: submitBtn.localId,
          confidence: 0.95,
          risk: 'protected',
          rationale: `Targeting "${submitBtn.sanitizedName}". This is a state-altering protected action requiring confirmation.`,
          expectedState: 'Form submission or approval dispatched'
        };
      }
    }

    // Fallback: observe safe first button or finish
    const firstButton = payload.elements.find((el) => el.role === 'button');
    if (firstButton) {
      return {
        actionId: `act_${Date.now()}`,
        kind: 'click',
        targetLocalId: firstButton.localId,
        confidence: 0.75,
        risk: 'safe',
        rationale: `Selecting initial safe button "${firstButton.sanitizedName}"`,
        expectedState: 'Interaction dispatched'
      };
    }

    return {
      actionId: `act_${Date.now()}`,
      kind: 'finish',
      confidence: 1.0,
      risk: 'safe',
      rationale: 'No further automated actions required. Task complete.'
    };
  }
}
