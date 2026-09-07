/**
 * @privapilot/tests - Target Grounding & Execution Accuracy Test Suite
 *
 * Comprehensive regression tests verifying strict intent grounding,
 * candidate ranking, ambiguity gating, and postcondition verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTaskContract,
  groundTargetCandidates,
  scoreCandidate
} from '@privapilot/protocol';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';

// Sample elements simulating a real problem statements table
function createProblemStatementsLayout() {
  return [
    {
      localId: 'el_nav_problems',
      role: 'link',
      sanitizedName: 'Problem Statements',
      coarseBounds: [0.05, 0.02, 0.15, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_nav_home',
      role: 'link',
      sanitizedName: 'Home',
      coarseBounds: [0.01, 0.02, 0.04, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_link_sih26001',
      role: 'link',
      sanitizedName: 'SIH26001',
      coarseBounds: [0.1, 0.2, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click'],
      containerContext: 'Row 1: Smart Automated Water Management System SIH26001'
    },
    {
      localId: 'el_btn_details_1',
      role: 'button',
      sanitizedName: 'View Details',
      coarseBounds: [0.8, 0.2, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click'],
      containerContext: 'Row 1: Smart Automated Water Management System SIH26001'
    },
    {
      localId: 'el_link_sih26003',
      role: 'link',
      sanitizedName: 'SIH26003',
      coarseBounds: [0.1, 0.3, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click'],
      containerContext: 'Row 2: Secure Autonomous Navigation System SIH26003'
    },
    {
      localId: 'el_btn_details_2',
      role: 'button',
      sanitizedName: 'View Details',
      coarseBounds: [0.8, 0.3, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click'],
      containerContext: 'Row 2: Secure Autonomous Navigation System SIH26003'
    },
    {
      localId: 'el_input_search',
      role: 'input',
      sanitizedName: 'Search Problem Statements',
      coarseBounds: [0.4, 0.1, 0.3, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type', 'click']
    }
  ];
}

// ----------------------------------------------------------------------------
// Test 1: Exact Navigation Link
// ----------------------------------------------------------------------------
test('Grounding 1: Exact navigation link "Click the Problem Statements link" selects correct target', () => {
  const elements = createProblemStatementsLayout();
  const contract = resolveTaskContract('Click the Problem Statements link');

  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent?.intent, 'click');
  assert.equal(contract.structuredIntent?.targetPhrase?.toLowerCase(), 'problem statements');
  assert.equal(contract.structuredIntent?.roleHint, 'link');

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'unambiguous_match');
  assert.ok(result.bestCandidate);
  assert.equal(result.bestCandidate.element.localId, 'el_nav_problems');
  assert.equal(result.bestCandidate.element.sanitizedName, 'Problem Statements');
  assert.ok(result.bestCandidate.score >= 100);
});

// ----------------------------------------------------------------------------
// Test 2: Identifier Link
// ----------------------------------------------------------------------------
test('Grounding 2: Identifier link "Click SIH26003" wins over partial candidates', () => {
  const elements = createProblemStatementsLayout();
  const contract = resolveTaskContract('Click SIH26003');

  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent?.targetPhrase?.toLowerCase(), 'sih26003');

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'unambiguous_match');
  assert.ok(result.bestCandidate);
  assert.equal(result.bestCandidate.element.localId, 'el_link_sih26003');
  assert.equal(result.bestCandidate.element.sanitizedName, 'SIH26003');
});

// ----------------------------------------------------------------------------
// Test 3: Duplicate Labels With Context
// ----------------------------------------------------------------------------
test('Grounding 3: Duplicate labels with context "Open View Details for SIH26003" selects row 2 button', () => {
  const elements = createProblemStatementsLayout();
  const contract = resolveTaskContract('Open View Details for SIH26003');

  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent?.targetPhrase?.toLowerCase(), 'view details');
  assert.equal(contract.structuredIntent?.contextPhrase?.toLowerCase(), 'sih26003');

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'unambiguous_match');
  assert.ok(result.bestCandidate);
  // Row 2 View Details button MUST be chosen over Row 1 View Details button
  assert.equal(result.bestCandidate.element.localId, 'el_btn_details_2');
  assert.ok(result.bestCandidate.rationale.includes('Container context matches qualifier'));

  // Ensure Row 1 button was penalized
  const row1Eval = scoreCandidate(elements.find(e => e.localId === 'el_btn_details_1'), contract.structuredIntent);
  assert.ok(result.bestCandidate.score > row1Eval.score + 50);
});

// ----------------------------------------------------------------------------
// Test 4: Ambiguous Duplicates Without Context
// ----------------------------------------------------------------------------
test('Grounding 4: Ambiguous duplicates "Click View Details" triggers ambiguous_match and zero blind clicks', () => {
  const elements = createProblemStatementsLayout();
  const contract = resolveTaskContract('Click View Details');

  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent?.contextPhrase, undefined);

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'ambiguous_match');
  assert.ok(result.ambiguityReason?.includes('Ambiguous candidates'));
  assert.ok(result.candidates.length >= 2);
});

// ----------------------------------------------------------------------------
// Test 5: Missing Target
// ----------------------------------------------------------------------------
test('Grounding 5: Missing target "Click NonExistentControl" triggers no_match', () => {
  const elements = createProblemStatementsLayout();
  const contract = resolveTaskContract('Click NonExistentControl');

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'no_match');
  assert.equal(result.bestCandidate, undefined);
});

// ----------------------------------------------------------------------------
// Test 6: Model Proposes Wrong Target ID -> Re-grounded to Semantically Superior Candidate
// ----------------------------------------------------------------------------
test('Grounding 6: Re-grounds inferior model proposal to top scored candidate in coordinator', async () => {
  const elements = createProblemStatementsLayout();
  let executedAction = null;
  let callCount = 0;

  const mockBrowser = {
    getActiveTab: async () => ({ id: 42, url: 'https://sih.gov.in/problem-statements' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements, url: 'https://sih.gov.in/problem-statements' },
          viewport: { viewportWidth: 1280, viewportHeight: 800 }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedAction = msg.proposal;
        return { success: true, actionId: msg.proposal.actionId, semanticOutcomeVerified: true };
      }
      return { success: true };
    },
    runInSanitizerHost: async (req) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_grounding_test',
      captureId: req.rawCapture.captureId,
      goal: req.goal,
      sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
      elements,
      pageState: {
        title: 'SIH Portal',
        viewport: [1280, 800],
        visibleDialogCount: executedAction ? 1 : 0,
        dialogTitles: executedAction ? ['Details for SIH26003 Navigation'] : [],
        statusSummaries: []
      },
      maskCount: 0,
      payloadDigestSha256: 'digest_1',
      timestamp: Date.now()
    })
  };

  // Model erroneously proposes el_btn_details_1 (row 1) instead of el_btn_details_2 (row 2)
  const wrongModelProposal = {
    actionId: 'act_model_erroneous',
    kind: 'click',
    targetLocalId: 'el_btn_details_1', // Wrong row
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Click details button'
  };

  const finishProposal = {
    actionId: 'act_finish',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Details modal verified open'
  };

  const httpClient = {
    async requestReasoningAction() {
      callCount++;
      return callCount === 1 ? wrongModelProposal : finishProposal;
    }
  };

  const coordinator = new RunCoordinator(mockBrowser, httpClient);
  const result = await coordinator.startRun('Open View Details for SIH26003', { maxSteps: 2 });

  assert.equal(result.success, true);
  assert.ok(executedAction);
  // Coordinator must have re-grounded the action to row 2
  assert.equal(executedAction.targetLocalId, 'el_btn_details_2');
  assert.ok(executedAction.rationale.includes('semantically grounded'));
});

// ----------------------------------------------------------------------------
// Test 7: Stale Target / Non-Existent Target Rejected
// ----------------------------------------------------------------------------
test('Grounding 7: Non-existent target proposed by model is rejected fail-safe', async () => {
  const elements = createProblemStatementsLayout();

  const mockBrowser = {
    getActiveTab: async () => ({ id: 42, url: 'https://sih.gov.in/problem-statements' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements, url: 'https://sih.gov.in/problem-statements' },
          viewport: { viewportWidth: 1280, viewportHeight: 800 }
        };
      }
      return { success: true };
    },
    runInSanitizerHost: async (req) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: req.rawCapture.captureId,
      goal: req.goal,
      sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
      elements,
      pageState: { title: 'SIH Portal', viewport: [1280, 800], visibleDialogCount: 0, dialogTitles: [], statusSummaries: [] },
      maskCount: 0,
      payloadDigestSha256: 'digest_1',
      timestamp: Date.now()
    })
  };

  const hallucinatoryProposal = {
    actionId: 'act_hallucinated',
    kind: 'click',
    targetLocalId: 'el_non_existent_999',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click hallucinated item'
  };

  const httpClient = {
    async requestReasoningAction() { return hallucinatoryProposal; }
  };

  const coordinator = new RunCoordinator(mockBrowser, httpClient);
  const result = await coordinator.startRun('Click button', { maxSteps: 1 });

  assert.equal(result.success, false);
  assert.equal(result.state, 'failed-safe');
  assert.ok(result.error?.includes('not found in sanitized context') || result.error?.includes('non-existent target ID'));
});

// ----------------------------------------------------------------------------
// Test 8: Overlay Safety
// ----------------------------------------------------------------------------
test('Grounding 8: Overlay elements are ignored and cannot intercept clicks', () => {
  const overlayElement = {
    localId: 'el_overlay_hud',
    role: 'button',
    sanitizedName: 'Overlay Status Pill',
    coarseBounds: [0.9, 0.9, 0.05, 0.05],
    state: ['visible', 'enabled'],
    actionCapabilities: ['click']
  };

  // If passed directly to grounding against task intent
  const contract = resolveTaskContract('Click Problem Statements');
  const evalOverlay = scoreCandidate(overlayElement, contract.structuredIntent);
  assert.equal(evalOverlay.score, 0);
  assert.equal(evalOverlay.isDisqualified, true);
});

// ----------------------------------------------------------------------------
// Test 9: Contextual Postcondition Verification
// ----------------------------------------------------------------------------
test('Grounding 9: Dialog opened with mismatched context fails terminal verification', async () => {
  const elements = createProblemStatementsLayout();

  let executedCount = 0;
  const mockBrowser = {
    getActiveTab: async () => ({ id: 42, url: 'https://sih.gov.in/problem-statements' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements, url: 'https://sih.gov.in/problem-statements' },
          viewport: { viewportWidth: 1280, viewportHeight: 800 }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedCount++;
        return { success: true, actionId: msg.proposal.actionId, semanticOutcomeVerified: true };
      }
      return { success: true };
    },
    runInSanitizerHost: async (req) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: req.rawCapture.captureId,
      goal: req.goal,
      sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
      elements,
      pageState: {
        title: 'SIH Portal',
        viewport: [1280, 800],
        visibleDialogCount: executedCount > 0 ? 1 : 0,
        // Dialog opened was for SIH26001, but user requested SIH26003!
        dialogTitles: executedCount > 0 ? ['Details for SIH26001 Water Management'] : [],
        statusSummaries: []
      },
      maskCount: 0,
      payloadDigestSha256: 'digest_1',
      timestamp: Date.now()
    })
  };

  const step1 = {
    actionId: 'act_step_1',
    kind: 'click',
    targetLocalId: 'el_btn_details_2',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open details modal'
  };

  const step2 = {
    actionId: 'act_step_2',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Modal is open'
  };

  let callCount = 0;
  const httpClient = {
    async requestReasoningAction() {
      callCount++;
      return callCount === 1 ? step1 : step2;
    }
  };

  const coordinator = new RunCoordinator(mockBrowser, httpClient);
  const result = await coordinator.startRun('Open View Details for SIH26003', { maxSteps: 3 });

  // Postcondition verification should reject because dialog does NOT correspond to SIH26003
  assert.equal(result.success, false);
  assert.equal(result.state, 'failed-safe');
  assert.ok(result.error?.toLowerCase().includes('sih26003'));
});

// ----------------------------------------------------------------------------
// Test 10: Polite Phrasing Normalization
// ----------------------------------------------------------------------------
test('Grounding 10: Polite natural language prefix preserves exact target intent', () => {
  const c1 = resolveTaskContract('Please kindly click the Problem Statements link');
  assert.equal(c1.structuredIntent?.targetPhrase?.toLowerCase(), 'problem statements');
  assert.equal(c1.structuredIntent?.roleHint, 'link');

  const c2 = resolveTaskContract('Could you please navigate to SIH26003?');
  assert.equal(c2.structuredIntent?.targetPhrase?.toLowerCase(), 'sih26003');

  const c3 = resolveTaskContract('Hey PrivaPilot, go ahead and open View Details for SIH26003');
  assert.equal(c3.structuredIntent?.targetPhrase?.toLowerCase(), 'view details');
  assert.equal(c3.structuredIntent?.contextPhrase?.toLowerCase(), 'sih26003');
});

// ----------------------------------------------------------------------------
// Test 11: State-Altering Actions Require Confirmation
// ----------------------------------------------------------------------------
test('Grounding 11: Delete / remove action is classified protected and pauses for confirmation', async () => {
  const elements = [
    {
      localId: 'el_del_btn',
      role: 'button',
      sanitizedName: 'Delete Statement SIH26003',
      coarseBounds: [0.8, 0.3, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const mockBrowser = {
    getActiveTab: async () => ({ id: 42, url: 'https://sih.gov.in' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements, url: 'https://sih.gov.in' },
          viewport: { viewportWidth: 1280, viewportHeight: 800 }
        };
      }
      return { success: true };
    },
    runInSanitizerHost: async (req) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: req.rawCapture.captureId,
      goal: req.goal,
      sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
      elements,
      pageState: { title: 'Portal', viewport: [1280, 800], visibleDialogCount: 0, dialogTitles: [], statusSummaries: [] },
      maskCount: 0,
      payloadDigestSha256: 'd',
      timestamp: Date.now()
    })
  };

  const deleteProposal = {
    actionId: 'act_del',
    kind: 'click',
    targetLocalId: 'el_del_btn',
    confidence: 0.95,
    risk: 'safe', // Model claimed safe
    rationale: 'Delete entry'
  };

  const httpClient = {
    async requestReasoningAction() { return deleteProposal; }
  };

  const coordinator = new RunCoordinator(mockBrowser, httpClient);
  const result = await coordinator.startRun('Delete statement SIH26003');

  assert.equal(result.success, false);
  assert.equal(result.state, 'awaiting-user-confirmation');
  assert.equal(coordinator.getState(), 'awaiting-user-confirmation');
});

// ----------------------------------------------------------------------------
// Test 12: Closed Schema Validation for Container Context & Landmarks
// ----------------------------------------------------------------------------
test('Grounding 12: Server Schema Validator accepts containerContext and rejects prototype pollution/scripts', () => {
  // 1. Valid payload with containerContext, nearestHeading, isInsideDialog
  const validPayload = {
    protocolVersion: '1.0',
    runId: 'run_schema_valid',
    goal: 'Click Problem Statements link',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      {
        localId: 'el_1',
        role: 'button',
        sanitizedName: 'View Details',
        coarseBounds: [0.1, 0.1, 0.2, 0.05],
        state: ['visible'],
        actionCapabilities: ['click'],
        containerContext: 'Row 2: SIH26003 Secure Navigation',
        nearestHeading: 'Problem Statement Catalog',
        isInsideDialog: false
      }
    ],
    pageState: {
      title: 'Portal',
      viewport: [1280, 800],
      visibleDialogCount: 0,
      dialogTitles: [],
      statusSummaries: []
    }
  };

  const resValid = validateSanitizedPayload(validPayload);
  assert.equal(resValid.isValid, true);

  // 2. Unsafe script pattern in containerContext is rejected
  const maliciousPayload = JSON.parse(JSON.stringify(validPayload));
  maliciousPayload.elements[0].containerContext = 'Row 2 <script>alert(1)</script>';
  const resMalicious = validateSanitizedPayload(maliciousPayload);
  assert.equal(resMalicious.isValid, false);
  assert.ok(resMalicious.errorMessage?.includes('Unsafe characters or script patterns'));

  // 3. Prototype pollution in element is rejected
  const pollutedPayload = JSON.parse(JSON.stringify(validPayload));
  pollutedPayload.elements[0]['__proto__'] = { admin: true };
  const resPolluted = validateSanitizedPayload(pollutedPayload);
  assert.equal(resPolluted.isValid, false);
});

// ----------------------------------------------------------------------------
// Test 13: Typo-Tolerant Candidate Grounding ("knwo your spoc" -> "Know Your SPOC")
// ----------------------------------------------------------------------------
test('Grounding 13: Typo tolerance grounds "knwo your spoc" to "Know Your SPOC" with high confidence', () => {
  const elements = [
    {
      localId: 'el_spoc',
      role: 'link',
      sanitizedName: 'Know Your SPOC',
      coarseBounds: [0.1, 0.1, 0.15, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_guidelines',
      role: 'link',
      sanitizedName: 'Guidelines',
      coarseBounds: [0.3, 0.1, 0.1, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const contract = resolveTaskContract('click on knwo your spoc');
  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent?.intent, 'click');

  const result = groundTargetCandidates(elements, contract.structuredIntent);
  assert.equal(result.status, 'unambiguous_match');
  assert.ok(result.bestCandidate);
  assert.equal(result.bestCandidate.element.localId, 'el_spoc');
  assert.ok(result.bestCandidate.confidence >= 0.75, `Expected high confidence >= 0.75, got ${result.bestCandidate.confidence}`);
  assert.ok(result.bestCandidate.rationale.includes('typo tolerance') || result.bestCandidate.rationale.includes('Fuzzy'));
});

// ----------------------------------------------------------------------------
// Test 14: Interactive Credential Input Request Detection
// ----------------------------------------------------------------------------
test('Grounding 14: Intent parser detects credential/login requests without explicit values and prompts for user input', () => {
  const c1 = resolveTaskContract('type email nad pass');
  assert.equal(c1.supported, true);
  assert.equal(c1.requiresUserInput, true);
  assert.equal(c1.userInputKind, 'credentials');

  const c2 = resolveTaskContract('fill sih login for me');
  assert.equal(c2.supported, true);
  assert.equal(c2.requiresUserInput, true);
  assert.equal(c2.userInputKind, 'credentials');

  const c3 = resolveTaskContract('fill my credentials');
  assert.equal(c3.supported, true);
  assert.equal(c3.requiresUserInput, true);
  assert.equal(c3.userInputKind, 'credentials');
});

// ----------------------------------------------------------------------------
// Test 15: Run Preemption (Eliminating "Cannot start new run" block)
// ----------------------------------------------------------------------------
test('Grounding 15: Coordinator auto-preempts in-progress state when user submits new command', async () => {
  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: 'http://localhost:4500', title: 'Portal' };
    },
    async sendMessageToTab(tabId, message) {
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: message.captureId || 'cap_1',
          snapshot: {
            elements: [
              {
                localId: 'el_1',
                role: 'button',
                sanitizedName: 'Search Button',
                coarseBounds: [0.1, 0.1, 0.1, 0.05],
                state: ['visible', 'enabled'],
                actionCapabilities: ['click']
              }
            ]
          }
        };
      }
      if (message.type === 'EXECUTE_ACTION') {
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: 'Clicked search button'
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_preempt',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: [
          {
            localId: 'el_1',
            role: 'button',
            sanitizedName: 'Search Button',
            coarseBounds: [0.1, 0.1, 0.1, 0.05],
            state: ['visible', 'enabled'],
            actionCapabilities: ['click']
          }
        ],
        pageState: { title: 'Portal', viewport: [1280, 720] },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  const httpClient = {
    async requestReasoningAction() {
      return {
        actionId: 'act_1',
        kind: 'click',
        targetLocalId: 'el_1',
        confidence: 0.95,
        risk: 'safe',
        rationale: 'Click search button'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient);

  // Simulate an agent in non-idle state (e.g. paused / in progress)
  coordinator.state = 'reasoning';

  // Starting a new run should NOT fail with "already in progress"
  const result = await coordinator.startRun('Click Search Button');
  console.log('TEST 15 RESULT:', result);
  assert.notEqual(result.error, 'Cannot start new run: an agent run is already in progress');
  assert.equal(result.success, true);
  assert.equal(result.state, 'complete');
});

// ----------------------------------------------------------------------------
// Test 16: Single-Click Directive Clean Completion ("Terminal if Done")
// ----------------------------------------------------------------------------
test('Grounding 16: Single-click directive completes after 1 step without entering duplicate action loop', async () => {
  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: 'http://localhost:4500', title: 'Portal' };
    },
    async sendMessageToTab(tabId, message) {
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: message.captureId || 'cap_spoc',
          snapshot: {
            elements: [
              {
                localId: 'el_spoc',
                role: 'link',
                sanitizedName: 'Know Your SPOC',
                coarseBounds: [0.1, 0.1, 0.15, 0.04],
                state: ['visible', 'enabled'],
                actionCapabilities: ['click']
              }
            ]
          }
        };
      }
      if (message.type === 'EXECUTE_ACTION') {
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: 'Clicked element el_spoc'
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_spoc',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: [
          {
            localId: 'el_spoc',
            role: 'link',
            sanitizedName: 'Know Your SPOC',
            coarseBounds: [0.1, 0.1, 0.15, 0.04],
            state: ['visible', 'enabled'],
            actionCapabilities: ['click']
          }
        ],
        pageState: { title: 'Portal', viewport: [1280, 720] },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  let stepsExecuted = 0;
  const httpClient = {
    async requestReasoningAction() {
      stepsExecuted++;
      return {
        actionId: `act_${stepsExecuted}`,
        kind: 'click',
        targetLocalId: 'el_spoc',
        confidence: 0.95,
        risk: 'safe',
        rationale: 'Click Know Your SPOC link'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 5 });

  const result = await coordinator.startRun('click on knwo your spoc');
  console.log('TEST 16 RESULT:', result);
  assert.equal(result.success, true);
  assert.equal(result.state, 'complete');
  assert.equal(result.stepCount, 1);
  assert.equal(stepsExecuted, 1, 'Direct single click must finish in 1 step without redundant Step 2 perception cycles');
});

// ----------------------------------------------------------------------------
// Test 17: Natural Typing Intent Parsing & Chatbox Semantic Grounding
// ----------------------------------------------------------------------------
test('Grounding 17: "type in the chatbox hi and sent" resolves to chat input and ignores misleading approval buttons', () => {
  const contract = resolveTaskContract('type in the chatbox hi and sent');
  assert.equal(contract.supported, true);
  assert.equal(contract.structuredIntent.intent, 'type');
  assert.equal(contract.structuredIntent.targetPhrase, 'chatbox');
  assert.equal(contract.structuredIntent.requestedValue, 'hi');
  assert.equal(contract.structuredIntent.submitAfter, true);
  assert.equal(contract.structuredIntent.pressEnter, true);

  const elements = [
    {
      localId: 'el_draft_accordion',
      role: 'button',
      sanitizedName: 'Sending approved draft',
      coarseBounds: [0.2, 0.4, 0.4, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_chatbox_input',
      role: 'input',
      sanitizedName: 'Ask a follow-up...',
      coarseBounds: [0.2, 0.85, 0.5, 0.06],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type', 'click']
    },
    {
      localId: 'el_send_btn',
      role: 'button',
      sanitizedName: 'Send (↑)',
      coarseBounds: [0.72, 0.85, 0.05, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const grounding = groundTargetCandidates(elements, contract.structuredIntent);
  assert.ok(grounding.bestCandidate);
  assert.equal(grounding.bestCandidate.element.localId, 'el_chatbox_input');
  assert.ok(grounding.bestCandidate.score >= 50);
});

// ----------------------------------------------------------------------------
// Test 18: MockReasoningEngine Offline Fallback Handles Chat Typing Safely
// ----------------------------------------------------------------------------
test('Grounding 18: MockReasoningEngine proposes typing into chatbox and ignores "Sending approved draft"', async () => {
  const { MockReasoningEngine } = await import('../apps/server/dist/engines/mock-engine.js');
  const engine = new MockReasoningEngine();

  const payload = {
    _brand: 'SanitizedNetworkPayload_Verified',
    protocolVersion: '1.0',
    runId: 'run_chat',
    captureId: 'cap_chat_1',
    goal: 'type in the chatbox hi and sent',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,mock',
    elements: [
      {
        localId: 'el_47',
        role: 'button',
        sanitizedName: 'Sending approved draft',
        coarseBounds: [0.2, 0.4, 0.4, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      },
      {
        localId: 'el_chat',
        role: 'input',
        sanitizedName: 'Ask a follow-up...',
        coarseBounds: [0.2, 0.85, 0.5, 0.06],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type', 'click']
      },
      {
        localId: 'el_send',
        role: 'button',
        sanitizedName: 'Send',
        coarseBounds: [0.72, 0.85, 0.05, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: { title: 'Dashboard', viewport: [1280, 720] }
  };

  const proposal = await engine.decideNextAction(payload);
  assert.equal(proposal.kind, 'type');
  assert.equal(proposal.targetLocalId, 'el_chat');
  assert.equal(proposal.textToType, 'hi');
  assert.notEqual(proposal.targetLocalId, 'el_47');
});

// ----------------------------------------------------------------------------
// Test 19: Coordinator Executes Chatbox Typing & Send End-to-End
// ----------------------------------------------------------------------------
test('Grounding 19: Coordinator resolves and executes "type in the chatbox hi and sent"', async () => {
  const executedActions = [];
  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: 'https://allel.co/dashboard', title: 'Dashboard' };
    },
    async sendMessageToTab(tabId, message) {
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: message.captureId || 'cap_chat',
          snapshot: {
            elements: [
              {
                localId: 'el_47',
                role: 'button',
                sanitizedName: 'Sending approved draft',
                coarseBounds: [0.2, 0.4, 0.4, 0.05],
                state: ['visible', 'enabled'],
                actionCapabilities: ['click']
              },
              {
                localId: 'el_chat',
                role: 'input',
                sanitizedName: 'Ask a follow-up...',
                coarseBounds: [0.2, 0.85, 0.5, 0.06],
                state: ['visible', 'enabled'],
                actionCapabilities: ['type', 'click']
              },
              {
                localId: 'el_send',
                role: 'button',
                sanitizedName: 'Send',
                coarseBounds: [0.72, 0.85, 0.05, 0.05],
                state: ['visible', 'enabled'],
                actionCapabilities: ['click']
              }
            ]
          }
        };
      }
      if (message.type === 'EXECUTE_ACTION') {
        executedActions.push(message.proposal);
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: `Executed ${message.proposal.kind}`
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_chat',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: [
          {
            localId: 'el_47',
            role: 'button',
            sanitizedName: 'Sending approved draft',
            coarseBounds: [0.2, 0.4, 0.4, 0.05],
            state: ['visible', 'enabled'],
            actionCapabilities: ['click']
          },
          {
            localId: 'el_chat',
            role: 'input',
            sanitizedName: 'Ask a follow-up...',
            coarseBounds: [0.2, 0.85, 0.5, 0.06],
            state: ['visible', 'enabled'],
            actionCapabilities: ['type', 'click']
          },
          {
            localId: 'el_send',
            role: 'button',
            sanitizedName: 'Send',
            coarseBounds: [0.72, 0.85, 0.05, 0.05],
            state: ['visible', 'enabled'],
            actionCapabilities: ['click']
          }
        ],
        pageState: { title: 'Dashboard', viewport: [1280, 720] },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  const httpClient = {
    async requestReasoningAction() {
      throw new Error('Should resolve locally without network requirement');
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 5 });
  const result = await coordinator.startRun('type in the chatbox hi and sent');

  assert.equal(result.success, true);
  assert.equal(result.state, 'complete');
  assert.ok(executedActions.length >= 2, 'Should execute type then send');
  assert.equal(executedActions[0].kind, 'type');
  assert.equal(executedActions[0].targetLocalId, 'el_chat');
  assert.equal(executedActions[0].textToType, 'hi');
  assert.equal(executedActions[1].kind, 'click');
  assert.equal(executedActions[1].targetLocalId, 'el_send');
});


