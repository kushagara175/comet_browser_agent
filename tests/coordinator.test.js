/**
 * @privapilot/extension - RunCoordinator Semantic Verification & Lifecycle State Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  RunCoordinator,
  isSubAgentSwarmGoal,
  findFlightOriginElement,
  findFlightDestinationElement,
  findFlightSearchButton,
  findAirportSuggestion
} from '../apps/extension/dist/background/coordinator.js';

function createSampleElements() {
  return [
    {
      localId: 'el_btn_1',
      role: 'button',
      sanitizedName: 'Preview Details Button',
      coarseBounds: [0.1, 0.1, 0.2, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_pay_btn',
      role: 'button',
      sanitizedName: 'Submit Payment Order',
      coarseBounds: [0.1, 0.2, 0.2, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_pwd_input',
      role: 'input',
      sanitizedName: 'Admin Password',
      coarseBounds: [0.1, 0.3, 0.3, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type']
    }
  ];
}

function createFakeBrowserAdapter(options = {}) {
  const elements = options.elements || createSampleElements();
  const sentMessages = [];

  let actionExecuted = false;

  const adapter = {
    sentMessages,
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 42, url: 'http://localhost:4500', title: 'Test Portal' };
    },
    async sendMessageToTab(tabId, message) {
      sentMessages.push({ tabId, message });

      if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
        if (options.domSnapshotError) {
          return { success: false, error: options.domSnapshotError };
        }
        return {
          success: true,
          captureId: message.captureId || 'cap_test_1',
          snapshot: { elements, url: 'http://localhost:4500' },
          viewport: { viewportWidth: 1280, viewportHeight: 720 }
        };
      }

      if (message.type === 'EXECUTE_ACTION') {
        actionExecuted = true;
        if (options.executeActionThrows) {
          throw new Error(options.executeActionThrows);
        }
        if (options.executeResponse) {
          return options.executeResponse;
        }
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: `Executed ${message.proposal.kind}`
        };
      }

      return { success: true };
    },
    async sendMessageToRuntime(message) {
      return { success: true };
    },
    async getStorage(key) {
      return null;
    },
    async setStorage(key, value) {},
    async runInSanitizerHost(request) {
      if (options.sanitizerError) {
        throw new Error(options.sanitizerError);
      }
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_test_coord',
        captureId: request.rawCapture.captureId,
        goal: request.goal,
        sanitizedScreenshotDataUrl: request.rawCapture.rawScreenshotDataUrl,
        elements,
        pageState: {
          title: 'Test Portal',
          viewport: [1280, 720],
          visibleDialogCount: actionExecuted ? 1 : 0,
          dialogTitles: actionExecuted ? ['Safe Preview Drawer'] : [],
          statusSummaries: actionExecuted ? ['Status: Approved'] : []
        },
        maskCount: 1,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  return adapter;
}

function createFakeHttpClient(actionProposalToReturn) {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async requestReasoningAction(sanitized) {
      callCount++;
      if (Array.isArray(actionProposalToReturn)) {
        return actionProposalToReturn[callCount - 1] || actionProposalToReturn[actionProposalToReturn.length - 1];
      }
      return actionProposalToReturn;
    },
    async requestChat() {
      return { reply: 'Chat reply' };
    },
    async requestGeneralChat() {
      return { reply: 'General reply' };
    }
  };
}

// ============================================================================
// RunCoordinator State & Verification Tests
// ============================================================================

test('Coordinator: awaiting-user-confirmation is pending (success: false) and does not execute automatically', async () => {
  const browser = createFakeBrowserAdapter();
  const protectedProposal = {
    actionId: 'act_pay_1',
    kind: 'click',
    targetLocalId: 'el_pay_btn',
    confidence: 0.96,
    risk: 'protected',
    rationale: 'Submitting payment order requires authorization',
    expectedState: 'Order submitted'
  };
  const httpClient = createFakeHttpClient(protectedProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  let confirmationEmitted = false;
  coordinator.setListeners({
    onActionConfirmedRequired(act) {
      confirmationEmitted = true;
    }
  });

  const result = await coordinator.startRun('Pay invoice');

  // Must be marked pending (success: false), not successful execution yet
  assert.strictEqual(result.success, false, 'Pending confirmation must not be marked success: true');
  assert.strictEqual(result.state, 'awaiting-user-confirmation');
  assert.strictEqual(coordinator.getState(), 'awaiting-user-confirmation');
  assert.ok(confirmationEmitted, 'Should have emitted confirmation required event');
  assert.ok(result.message?.includes('Protected action requires user consent'));

  // Ensure EXECUTE_ACTION was NOT sent to tab
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0, 'No execution message should be dispatched before user confirmation');
});

test('Coordinator: approvePendingAction executes action and returns verified CoordinatorRunResult', async () => {
  const browser = createFakeBrowserAdapter();
  const protectedProposal = {
    actionId: 'act_pay_2',
    kind: 'click',
    targetLocalId: 'el_pay_btn',
    confidence: 0.96,
    risk: 'protected',
    rationale: 'Submitting payment order',
    expectedState: 'Order submitted'
  };
  const httpClient = createFakeHttpClient(protectedProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const pending = await coordinator.startRun('Pay invoice');
  assert.strictEqual(coordinator.getState(), 'awaiting-user-confirmation');

  // User clicks Approve
  const approveResult = await coordinator.approvePendingAction({ runId: pending.runId, actionId: pending.proposal.actionId });

  assert.strictEqual(approveResult.success, true);
  assert.strictEqual(approveResult.state, 'complete');
  assert.strictEqual(coordinator.getState(), 'complete');
  assert.ok(approveResult.telemetry, 'Telemetry must be populated upon execution');

  // Ensure EXECUTE_ACTION was sent with correct captureId
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 1);
  assert.strictEqual(execMessages[0].message.proposal.actionId, 'act_pay_2');
});

test('Coordinator: denyPendingAction returns cancelled result and does not execute', async () => {
  const browser = createFakeBrowserAdapter();
  const protectedProposal = {
    actionId: 'act_pay_3',
    kind: 'click',
    targetLocalId: 'el_pay_btn',
    confidence: 0.96,
    risk: 'protected',
    rationale: 'Submitting payment order'
  };
  const httpClient = createFakeHttpClient(protectedProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const pending = await coordinator.startRun('Pay invoice');
  assert.strictEqual(coordinator.getState(), 'awaiting-user-confirmation');

  // User clicks Deny
  const denyResult = coordinator.denyPendingAction({ runId: pending.runId, actionId: pending.proposal.actionId });

  assert.strictEqual(denyResult.success, false);
  assert.strictEqual(denyResult.state, 'idle');
  assert.strictEqual(coordinator.getState(), 'idle');
  assert.ok(denyResult.message?.includes('cancelled'));

  // Ensure EXECUTE_ACTION was NOT sent
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('Coordinator: Verified Complete when action execution and semantic verification both pass', async () => {
  const browser = createFakeBrowserAdapter({
    executeResponse: {
      success: true,
      actionId: 'act_safe_1',
      semanticOutcomeVerified: true,
      message: 'Preview drawer opened and verified'
    }
  });

  const safeProposal = {
    actionId: 'act_safe_1',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open preview drawer',
    expectedState: 'Preview drawer is visible'
  };
  const finishProposal = {
    actionId: 'act_fin_1',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Preview completed'
  };
  const httpClient = createFakeHttpClient([safeProposal, finishProposal]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Preview item');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(coordinator.getState(), 'complete');
  assert.ok(result.telemetry);
  assert.ok(result.telemetry.totalLatencyMs >= 0);
});

test('Coordinator: Verification Failed when expectedState is not observed -> fails safe and preserves telemetry', async () => {
  const browser = createFakeBrowserAdapter({
    executeResponse: {
      success: true, // synthetic click dispatched
      actionId: 'act_safe_unverified',
      semanticOutcomeVerified: false, // but expected state was NOT observed
      message: 'Semantic verification failed: expected preview drawer was not observed'
    }
  });

  const safeProposal = {
    actionId: 'act_safe_unverified',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open preview drawer',
    expectedState: 'Preview drawer is visible'
  };
  const httpClient = createFakeHttpClient(safeProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Preview item');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.strictEqual(coordinator.getState(), 'failed-safe');
  assert.ok(result.error?.includes('Semantic verification failed'));
  assert.ok(result.telemetry, 'Telemetry must be preserved even on verification failure');
});

test('Coordinator: Stale Target / Different Capture ID fails safely and preserves telemetry', async () => {
  const browser = createFakeBrowserAdapter({
    executeResponse: {
      success: false,
      actionId: 'act_stale',
      semanticOutcomeVerified: false,
      staleTarget: true,
      message: 'Stale target: element map is from a different capture'
    }
  });

  const proposal = {
    actionId: 'act_stale',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click button'
  };
  const httpClient = createFakeHttpClient(proposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Click button');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Stale target'));
  assert.ok(result.telemetry, 'Telemetry must be preserved on stale target failure');
});

test('Coordinator: Blocked locally when action targets password or credentials -> zero dispatch', async () => {
  const browser = createFakeBrowserAdapter();
  const blockedProposal = {
    actionId: 'act_blocked_pwd',
    kind: 'type',
    targetLocalId: 'el_pwd_input', // Password field
    confidence: 0.99,
    risk: 'safe', // Model deceptively claimed safe
    rationale: 'Type password',
    textToType: 'Secret123'
  };
  const httpClient = createFakeHttpClient(blockedProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Log into admin');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Action blocked by client safety policy'));

  // Ensure EXECUTE_ACTION was NEVER dispatched
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('Coordinator: Blocked-local-only when local sanitization fails -> server is never called', async () => {
  const browser = createFakeBrowserAdapter({
    sanitizerError: 'Canvas rendering failed in offscreen document'
  });
  const httpClient = createFakeHttpClient({
    actionId: 'act_never',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Should never reach here'
  });
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Do something sensitive');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'blocked-local-only');
  assert.strictEqual(httpClient.callCount, 0, 'HTTP client must never be called if sanitization fails');
});

test('Coordinator: Valid finish action completes without dispatching DOM interaction', async () => {
  const browser = createFakeBrowserAdapter();
  const finishProposal = {
    actionId: 'act_fin_1',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Task complete'
  };
  const httpClient = createFakeHttpClient(finishProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Finish goal');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.ok(result.telemetry);

  // Finish does not dispatch EXECUTE_ACTION
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('Coordinator Safety: Ultra-low confidence action (0.01) cannot automatically click and fails safe', async () => {
  const browser = createFakeBrowserAdapter();
  const lowConfidenceProposal = {
    actionId: 'act_low_1',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.01,
    risk: 'safe',
    rationale: 'Uncertain click attempt'
  };
  const httpClient = createFakeHttpClient(lowConfidenceProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Click button with low confidence');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('below safe execution threshold'));

  // Ensure EXECUTE_ACTION was NEVER sent
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('Coordinator Safety: Premature finish proposal on action task fails safe and rejects false finish', async () => {
  const browser = createFakeBrowserAdapter();
  const prematureFinishProposal = {
    actionId: 'act_premature_finish',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'I claim the task is done without doing anything'
  };
  const httpClient = createFakeHttpClient(prematureFinishProposal);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Open the safe preview for pending request');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('before required action postconditions were established or verified'));
  assert.ok(result.steps);
  assert.strictEqual(result.steps.length, 1);
  assert.strictEqual(result.steps[0].verification?.reasonCode, 'FALSE_FINISH_NO_POSTCONDITION');
});

test('Coordinator Tracing: Ordered multi-step trace captures click, execution, verification, and valid finish', async () => {
  const browser = createFakeBrowserAdapter();
  const step1Proposal = {
    actionId: 'act_click_1',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click preview button'
  };
  const step2Proposal = {
    actionId: 'act_finish_2',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Preview drawer is open'
  };

  let stepCall = 0;
  const multiStepHttpClient = {
    async requestReasoningAction() {
      stepCall++;
      return stepCall === 1 ? step1Proposal : step2Proposal;
    }
  };

  const coordinator = new RunCoordinator(browser, multiStepHttpClient);
  const result = await coordinator.startRun('Open the safe preview for pending request');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.ok(result.steps);
  assert.strictEqual(result.steps.length, 2);

  // Step 1 check
  assert.strictEqual(result.steps[0].step, 1);
  assert.strictEqual(result.steps[0].proposal.kind, 'click');
  assert.strictEqual(result.steps[0].executed, true);
  assert.strictEqual(result.steps[0].executionResult?.success, true);
  assert.strictEqual(result.steps[0].verification?.verified, true);

  // Step 2 check
  assert.strictEqual(result.steps[1].step, 2);
  assert.strictEqual(result.steps[1].proposal.kind, 'finish');
  assert.strictEqual(result.steps[1].executed, false);
  assert.strictEqual(result.steps[1].verification?.verified, true);
});

test('Coordinator Redirection Resilience: Action causing page navigation/port-close recovers cleanly', async () => {
  let tabReadyCalled = false;
  let contentScriptEnsured = false;

  const browser = createFakeBrowserAdapter({
    executeActionThrows: 'The message port closed before a response was received.'
  });
  browser.waitForTabReady = async (tabId) => {
    tabReadyCalled = true;
    return { id: tabId, url: 'https://www.isro.gov.in/Missions.html', title: 'Missions - ISRO' };
  };
  browser.ensureContentScript = async (tabId) => {
    contentScriptEnsured = true;
    return true;
  };

  let stepCall = 0;
  const multiStepHttpClient = {
    async requestReasoningAction() {
      stepCall++;
      if (stepCall === 1) {
        return {
          actionId: 'act_nav_link_1',
          kind: 'click',
          targetLocalId: 'el_btn_1',
          confidence: 0.95,
          risk: 'safe',
          rationale: 'Click link that navigates/redirects'
        };
      }
      return {
        actionId: 'act_finish_2',
        kind: 'finish',
        confidence: 1.0,
        risk: 'safe',
        rationale: 'Redirected destination loaded successfully'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, multiStepHttpClient);
  const result = await coordinator.startRun('Open the safe preview and see results');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(tabReadyCalled, true, 'waitForTabReady should have been called upon port closure');
  assert.strictEqual(contentScriptEnsured, true, 'ensureContentScript should have been called');
  assert.ok(result.steps);
  assert.strictEqual(result.steps.length, 2);
  assert.strictEqual(result.steps[0].executed, true);
  assert.strictEqual(result.steps[0].executionResult?.success, true);
});

test('Coordinator: Preserves and propagates proposal.reasoning to listeners and result', async () => {
  const browser = createFakeBrowserAdapter();
  let proposedActionWithReasoning = null;

  const reasoningHttpClient = {
    async requestReasoningAction() {
      return {
        actionId: 'act_click_1',
        kind: 'click',
        targetLocalId: 'el_btn_1',
        confidence: 0.98,
        risk: 'safe',
        reasoning: 'Observed interactive element el_btn_1. Chosen to satisfy user goal.',
        rationale: 'Click target element'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });
  coordinator.setListeners({
    onActionProposed(proposal) {
      proposedActionWithReasoning = proposal;
    }
  });

  const result = await coordinator.startRun('Preview the details');

  assert.ok(proposedActionWithReasoning);
  assert.strictEqual(proposedActionWithReasoning.reasoning, 'Observed interactive element el_btn_1. Chosen to satisfy user goal.');
  assert.ok(result.reasoning);
  assert.strictEqual(result.reasoning, 'Observed interactive element el_btn_1. Chosen to satisfy user goal.');
});

test('Coordinator: Resolves affirmative user responses using conversation history', async () => {
  const browser = createFakeBrowserAdapter();
  let requestedSanitizedContext = null;

  const reasoningHttpClient = {
    async requestReasoningAction(sanitized) {
      requestedSanitizedContext = sanitized;
      return {
        actionId: 'act_nav_1',
        kind: 'navigate',
        url: 'https://www.flipkart.com/search?q=iPhone+16',
        createNewTab: true,
        confidence: 0.98,
        risk: 'safe',
        rationale: 'Open Flipkart in separate tab'
      };
    },
    async dispatchPlatformTask() {
      return {
        taskId: 'test_task_1',
        status: 'completed',
        plan: {
          shouldDecompose: true,
          rationale: 'Decomposed into parallel workers',
          subTasks: [
            { subTaskId: 'sub_1', title: 'Amazon', status: 'completed', result: { summary: 'Amazon price ₹79,900' } },
            { subTaskId: 'sub_2', title: 'Flipkart', status: 'completed', result: { summary: 'Flipkart price ₹79,900' } }
          ]
        },
        finalSynthesis: 'Both platforms list iPhone 16 at ₹79,900.'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });

  // User says "yeah" with conversation history proposing Flipkart in a separate tab
  const history = [
    { role: 'user', content: 'Check iPhone 16 on Amazon and Flipkart' },
    { role: 'assistant', content: 'To complete your request, I will need to open Flipkart.com in a separate tab to check for iPhone 16 listings there. Would you like me to proceed with that?' }
  ];

  const result = await coordinator.startRun('yeah', { history });

  assert.ok(result);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
});

test('Coordinator: Resolves "yeha" typo affirmative follow-up for flight comparison sub-agent swarm', async () => {
  const browser = createFakeBrowserAdapter();

  const reasoningHttpClient = {
    async requestReasoningAction() {
      throw new Error('Should not reach single-tab reasoning for subagent swarm');
    },
    async dispatchPlatformTask(payload) {
      assert.strictEqual(payload.enableSubAgents, true);
      return {
        taskId: 'flight_task_1',
        status: 'completed',
        plan: {
          shouldDecompose: true,
          rationale: 'Decomposed into IndiGo and Air India parallel workers',
          subTasks: [
            { subTaskId: 'sub_1', title: 'Inspect INDIGO', targetUrl: 'https://www.goindigo.in', status: 'completed', result: { summary: 'IndiGo: ₹2,600' } },
            { subTaskId: 'sub_2', title: 'Inspect AIR INDIA', targetUrl: 'https://www.airindia.com', status: 'completed', result: { summary: 'Air India: ₹2,850' } }
          ]
        },
        finalSynthesis: 'IndiGo starts at ₹2,600; Air India starts at ₹2,850.'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });

  // User previously asked for IndiGo and Air India flights, then types "yeha"
  const history = [
    { role: 'user', content: 'flights from Delhi to Mumbai IndiGo Air India' },
    { role: 'assistant', content: 'IndiGo flight statuses are shown. Would you like me to check Air India as well?' }
  ];

  const result = await coordinator.startRun('yeha', { history });

  assert.ok(result);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.ok(result.reply.includes('IndiGo'));
  assert.ok(result.reply.includes('Air India'));
});

test('Coordinator: isSubAgentSwarmGoal detects multi-airline and comparison queries', () => {
  assert.strictEqual(isSubAgentSwarmGoal('flights from Delhi to Mumbai IndiGo Air India'), true);
  assert.strictEqual(isSubAgentSwarmGoal('Compare flights from Delhi to Mumbai on IndiGo and Air India'), true);
  assert.strictEqual(isSubAgentSwarmGoal('compare iPhone 16 on Amazon and Flipkart'), true);
  assert.strictEqual(isSubAgentSwarmGoal('flights from Delhi to Mumbai'), false);

  // Negative overrides: explicit single-agent or without subagent directives
  assert.strictEqual(isSubAgentSwarmGoal('Compare flights from Delhi to Mumbai on IndiGo and Air India without subagents'), false);
  assert.strictEqual(isSubAgentSwarmGoal('flights from Delhi to Mumbai IndiGo Air India single agent'), false);
  assert.strictEqual(isSubAgentSwarmGoal('compare iPhone 16 on Amazon and Flipkart no subagents'), false);
  assert.strictEqual(isSubAgentSwarmGoal('search flights on IndiGo and Air India single tab'), false);
});

test('Coordinator: Dedicated flight element finders accurately identify form fields and reject banners', () => {
  const mockElements = [
    { localId: 'el_login', role: 'button', sanitizedName: 'Login to unlock your IndiGo BluChip benefits!', state: [] },
    { localId: 'el_promo', role: 'button', sanitizedName: 'Save up to ₹1000 off on flights', state: [] },
    { localId: 'el_cancel', role: 'generic', sanitizedName: 'Free cancellation up to 48 hrs', state: [] },
    { localId: 'el_from', role: 'input', sanitizedName: 'From Delhi, DEL', state: [] },
    { localId: 'el_to', role: 'input', sanitizedName: 'Going to? Search by place/airport', state: [] },
    { localId: 'el_hotel', role: 'button', sanitizedName: 'Search Hotels', state: [] },
    { localId: 'el_search', role: 'button', sanitizedName: 'Search Flight', state: [] }
  ];

  // Origin finder rejects login and promo buttons, matches 'From'
  const origin = findFlightOriginElement(mockElements);
  assert.ok(origin);
  assert.strictEqual(origin.localId, 'el_from');

  // Destination finder rejects 'Login to unlock...' and 'up to' promo, matches 'Going to'
  const dest = findFlightDestinationElement(mockElements, 'el_from');
  assert.ok(dest);
  assert.strictEqual(dest.localId, 'el_to');

  // Focused destination priority check (IndiGo auto-focuses destination input after origin selection)
  const focusedElements = [
    { localId: 'el_login', role: 'button', sanitizedName: 'Login to unlock your IndiGo BluChip benefits!', state: [] },
    { localId: 'el_from', role: 'input', sanitizedName: 'From Delhi, DEL', state: [] },
    { localId: 'el_focused_to', role: 'input', sanitizedName: 'Search destination', state: ['focused'] }
  ];
  const focusedDest = findFlightDestinationElement(focusedElements, 'el_from');
  assert.ok(focusedDest);
  assert.strictEqual(focusedDest.localId, 'el_focused_to');

  // Search button finder matches 'Search Flight' and excludes 'Search Hotels'
  const searchBtn = findFlightSearchButton(mockElements);
  assert.ok(searchBtn);
  assert.strictEqual(searchBtn.localId, 'el_search');

  // Airport suggestion finder
  const suggestions = [
    { localId: 'sug_1', role: 'option', sanitizedName: 'BOM - Mumbai, India Chhatrapati Shivaji International Airport', state: [] },
    { localId: 'sug_2', role: 'option', sanitizedName: 'DEL - Delhi, India Indira Gandhi International Airport', state: [] }
  ];
  const bom = findAirportSuggestion(suggestions, 'Mumbai', 'BOM');
  assert.ok(bom);
  assert.strictEqual(bom.localId, 'sug_1');

  const del = findAirportSuggestion(suggestions, 'Delhi', 'DEL');
  assert.ok(del);
  assert.strictEqual(del.localId, 'sug_2');
});

test('Coordinator: Drives physical DOM typing and clicking across multi-agent flight comparison tabs', async () => {
  const dispatchedActions = [];
  const borderCalls = [];

  const browser = createFakeBrowserAdapter();
  browser.getActiveTab = async () => ({
    id: 101,
    url: 'https://www.airindia.com/',
    title: 'Air India: Book Domestic and International Flights'
  });

  browser.sendMessageToTab = async (tabId, message) => {
    if (message.type === 'SET_ACTIVE_BORDER') {
      borderCalls.push({ tabId, label: message.label, active: message.active });
      return { success: true };
    }
    if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
      return {
        success: true,
        snapshot: {
          elements: [
            { localId: 'el_from', role: 'input', text: 'FROM Origin', sanitizedName: 'FROM Origin', state: [] },
            { localId: 'el_to', role: 'input', text: 'TO Destination', sanitizedName: 'TO Destination', state: [] },
            { localId: 'el_search', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] },
            { localId: 'el_fare1', role: 'generic', text: 'AI-612 Non-stop 06:20 AM ₹2,799', sanitizedName: 'AI-612 Non-stop 06:20 AM ₹2,799', state: [] }
          ]
        }
      };
    }
    if (message.type === 'EXECUTE_ACTION') {
      dispatchedActions.push({ tabId, proposal: message.proposal });
      return { success: true };
    }
    return { success: true };
  };

  const reasoningHttpClient = {
    async requestReasoningAction() {
      throw new Error('Should not reach single-tab reasoning for swarm');
    },
    async dispatchPlatformTask(payload) {
      return {
        taskId: 'live_flight_swarm_1',
        status: 'completed',
        complianceAudit: { proofId: 'audit_test_proof_123' },
        finalSynthesis: 'Air India lists fares from ₹2,799; IndiGo listings compared.'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });
  const result = await coordinator.startRun('Compare flights from Delhi to Mumbai on IndiGo and Air India');

  assert.ok(result);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');

  // Verify physical typing actions were dispatched to the DOM
  const typedOrigin = dispatchedActions.find(a => a.proposal.kind === 'type' && a.proposal.textToType === 'Delhi');
  const typedDest = dispatchedActions.find(a => a.proposal.kind === 'type' && a.proposal.textToType === 'Mumbai');
  const clickedSearch = dispatchedActions.find(a => a.proposal.kind === 'click' && (a.proposal.targetLocalId === 'el_search' || a.proposal.actionId?.includes('search')));

  assert.ok(typedOrigin, 'Origin input must be typed on screen with "Delhi"');
  assert.strictEqual(typedOrigin.proposal.targetLocalId, 'el_from');

  assert.ok(typedDest, 'Destination input must be typed on screen with "Mumbai"');
  assert.strictEqual(typedDest.proposal.targetLocalId, 'el_to');

  assert.ok(clickedSearch, 'Search button must be clicked on screen');
  assert.strictEqual(clickedSearch.proposal.targetLocalId, 'el_search');

  // Verify active border was set on tabs
  assert.ok(borderCalls.some(b => b.active === true && b.label.includes('AIR INDIA')));
});

test('Coordinator: Automatically clicks autocomplete popup suggestions and reuses open tabs', async () => {
  const dispatchedActions = [];
  const navigatedTabs = [];

  const browser = createFakeBrowserAdapter();
  // Simulate user already having IndiGo in Tab 2 and Air India in Tab 7
  browser.queryTabs = async () => [
    { id: 2, url: 'https://www.goindigo.in/', title: 'IndiGo Airline' },
    { id: 7, url: 'https://www.airindia.com/', title: 'Air India Flights' }
  ];
  browser.navigateTab = async (tabId, url, opts) => {
    navigatedTabs.push({ tabId, url, opts });
    return { tabId: tabId || 8, url };
  };

  browser.sendMessageToTab = async (tabId, message) => {
    if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
      if (message.captureId?.includes('orig_popup')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_del_sugg', role: 'option', text: 'DEL - Delhi, Indira Gandhi Intl', sanitizedName: 'DEL - Delhi', state: [] }
            ]
          }
        };
      }
      if (message.captureId?.includes('dest_popup')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_bom_sugg', role: 'option', text: 'BOM - Mumbai, Chhatrapati Shivaji', sanitizedName: 'BOM - Mumbai', state: [] }
            ]
          }
        };
      }
      return {
        success: true,
        snapshot: {
          elements: [
            { localId: 'el_from', role: 'input', text: 'FROM Origin', sanitizedName: 'FROM Origin', state: [] },
            { localId: 'el_to', role: 'input', text: 'TO Destination', sanitizedName: 'TO Destination', state: [] },
            { localId: 'el_search', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] },
            { localId: 'el_fare1', role: 'generic', text: '6E-2121 Non-stop 06:00 AM ₹2,499', sanitizedName: '6E-2121 Non-stop 06:00 AM ₹2,499', state: [] }
          ]
        }
      };
    }
    if (message.type === 'EXECUTE_ACTION') {
      dispatchedActions.push({ tabId, proposal: message.proposal });
      return { success: true };
    }
    return { success: true };
  };

  const reasoningHttpClient = {
    async requestReasoningAction() { throw new Error('Not for swarm'); },
    async dispatchPlatformTask() {
      return {
        taskId: 'live_flight_swarm_2',
        status: 'completed',
        complianceAudit: { proofId: 'audit_test_proof_popup' },
        finalSynthesis: 'IndiGo 6E-2121 at ₹2,499 compared against Air India.'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });
  const result = await coordinator.startRun('Compare flights from Delhi to Mumbai on IndiGo and Air India');

  assert.ok(result);
  assert.strictEqual(result.success, true);

  // Verify that existing open tabs 2 and 7 were reused without creating unwanted new tabs
  assert.strictEqual(navigatedTabs.length, 0, 'Should reuse existing open tabs without forcing navigateTab');

  // Verify popup suggestions were clicked
  const clickedOrigPopup = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_del_sugg');
  const clickedDestPopup = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_bom_sugg');

  assert.ok(clickedOrigPopup, 'Must click Origin airport autocomplete popup item (DEL - Delhi)');
  assert.ok(clickedDestPopup, 'Must click Destination airport autocomplete popup item (BOM - Mumbai)');
});

test('Coordinator: Ignores Google Search tabs and navigates directly to official airline portals', async () => {
  const navigatedTabs = [];
  const browser = createFakeBrowserAdapter();

  // Simulate user having Google Search open for IndiGo and Air India
  browser.queryTabs = async () => [
    { id: 8, url: 'https://www.google.com/search?q=indigo+flights+delhi+to+mumbai', title: 'indigo flights Delhi to Mumbai - Google Search' },
    { id: 9, url: 'https://www.google.com/search?q=air+india+flights+delhi+to+mumbai', title: 'air india flights Delhi to Mumbai - Google Search' }
  ];
  browser.navigateTab = async (tabId, url, opts) => {
    navigatedTabs.push({ tabId, url, opts });
    return { tabId: tabId || 10, url };
  };

  browser.sendMessageToTab = async (tabId, message) => {
    if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
      return {
        success: true,
        snapshot: {
          elements: [
            { localId: 'el_from', role: 'input', text: 'FROM Origin', sanitizedName: 'FROM Origin', state: [] },
            { localId: 'el_to', role: 'input', text: 'TO Destination', sanitizedName: 'TO Destination', state: [] },
            { localId: 'el_search', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] }
          ]
        }
      };
    }
    return { success: true };
  };

  const reasoningHttpClient = {
    async requestReasoningAction() { throw new Error('Not for swarm'); },
    async dispatchPlatformTask() {
      return { taskId: 'flight_test', status: 'completed' };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });
  const result = await coordinator.startRun('Compare flights from Delhi to Mumbai on IndiGo and Air India');

  assert.ok(result);
  assert.strictEqual(result.success, true);
  // Must NOT reuse Tab 8 or Tab 9 (Google Search tabs) as existing airline tabs
  assert.ok(navigatedTabs.length > 0, 'Must navigate to official portals instead of treating Google Search tabs as airline portals');
  assert.ok(navigatedTabs.some(n => n.url.includes('airindia.com') || n.url.includes('goindigo.in')));
});

test('Coordinator: Automatically dismisses/crosses popups and types into modal inputs for button-based flight booking widgets (Air India style)', async () => {
  const dispatchedActions = [];
  const browser = createFakeBrowserAdapter();

  browser.sendMessageToTab = async (tabId, message) => {
    if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
      // After popup dismissal
      if (message.captureId?.includes('postdismiss')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_orig_btn', role: 'button', text: 'Select origin airport', sanitizedName: 'Select origin airport', state: [] },
              { localId: 'el_dest_btn', role: 'button', text: 'Select destination airport', sanitizedName: 'Select destination airport', state: [] },
              { localId: 'el_search_btn', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] }
            ]
          }
        };
      }
      // Step 1: initial snapshot has a cookie consent popup and button triggers for origin/dest
      if (message.captureId?.includes('sub_snap_indigo_') || message.captureId?.includes('sub_snap_air india_')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_cookie_btn', role: 'button', text: 'Accept all cookies', sanitizedName: 'Accept all cookies', state: [] },
              { localId: 'el_orig_btn', role: 'button', text: 'Select origin airport', sanitizedName: 'Select origin airport', state: [] },
              { localId: 'el_dest_btn', role: 'button', text: 'Select destination airport', sanitizedName: 'Select destination airport', state: [] },
              { localId: 'el_search_btn', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] }
            ]
          }
        };
      }
      // When Origin button is clicked, modal opens with modal input
      if (message.captureId?.includes('orig_modal')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_modal_input_orig', role: 'input', text: 'FROM', placeholder: 'FROM', sanitizedName: 'FROM', state: ['focused'] }
            ]
          }
        };
      }
      // Suggestions for Origin
      if (message.captureId?.includes('orig_popup')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_del_opt', role: 'button', text: 'Delhi, DEL - Indira Gandhi Intl', sanitizedName: 'Delhi DEL', state: [] }
            ]
          }
        };
      }
      // When Destination button is clicked, modal opens with modal input
      if (message.captureId?.includes('dest_modal')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_modal_input_dest', role: 'input', text: 'TO', placeholder: 'TO', sanitizedName: 'TO', state: ['focused'] }
            ]
          }
        };
      }
      // Suggestions for Destination
      if (message.captureId?.includes('dest_popup')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_bom_opt', role: 'button', text: 'Mumbai, BOM - Chhatrapati Shivaji', sanitizedName: 'Mumbai BOM', state: [] }
            ]
          }
        };
      }
      // Post search results
      if (message.captureId?.includes('post_') || message.captureId?.includes('delayed_')) {
        return {
          success: true,
          snapshot: {
            elements: [
              { localId: 'el_card1', role: 'generic', text: 'AI-805 06:00 AM ₹2,999 Non-stop', sanitizedName: 'AI-805 06:00 AM ₹2,999', state: [] }
            ]
          }
        };
      }
      return {
        success: true,
        snapshot: {
          elements: [
            { localId: 'el_orig_btn', role: 'button', text: 'Select origin airport', sanitizedName: 'Select origin airport', state: [] },
            { localId: 'el_dest_btn', role: 'button', text: 'Select destination airport', sanitizedName: 'Select destination airport', state: [] },
            { localId: 'el_search_btn', role: 'button', text: 'SEARCH FLIGHTS', sanitizedName: 'SEARCH FLIGHTS', state: [] }
          ]
        }
      };
    }
    if (message.type === 'EXECUTE_ACTION') {
      dispatchedActions.push({ tabId, proposal: message.proposal });
      return { success: true };
    }
    return { success: true };
  };

  const reasoningHttpClient = {
    async requestReasoningAction() { throw new Error('Not for swarm'); },
    async dispatchPlatformTask() {
      return {
        taskId: 'ai_angular_test',
        status: 'completed',
        finalSynthesis: 'AI-805 available at ₹2,999.'
      };
    }
  };

  const coordinator = new RunCoordinator(browser, reasoningHttpClient, undefined, { defaultMaxSteps: 1 });
  const result = await coordinator.startRun('Compare flights from Delhi to Mumbai on IndiGo and Air India');

  assert.ok(result);
  assert.strictEqual(result.success, true);

  // 1. Verify popup dismissal was clicked
  const dismissedPopup = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_cookie_btn');
  assert.ok(dismissedPopup, 'Must automatically dismiss/cross obstructing cookie banner/popup');

  // 2. Verify Origin trigger was clicked AND typing went into the modal input
  const clickedOrigTrigger = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_orig_btn');
  const typedIntoOrigModal = dispatchedActions.find(a => a.proposal.kind === 'type' && a.proposal.targetLocalId === 'el_modal_input_orig');
  const clickedOrigSuggestion = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_del_opt');

  assert.ok(clickedOrigTrigger, 'Must click Origin button trigger');
  assert.ok(typedIntoOrigModal, 'Must type origin "Delhi" into modal input rather than button');
  assert.ok(clickedOrigSuggestion, 'Must click airport suggestion from list');

  // 3. Verify Destination trigger was clicked AND typing went into modal input
  const typedIntoDestModal = dispatchedActions.find(a => a.proposal.kind === 'type' && a.proposal.targetLocalId === 'el_modal_input_dest');
  const clickedDestSuggestion = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_bom_opt');

  assert.ok(typedIntoDestModal, 'Must type destination "Mumbai" into modal input rather than button');
  assert.ok(clickedDestSuggestion, 'Must click destination airport suggestion');

  // 4. Verify Search Flights button clicked
  const clickedSearch = dispatchedActions.find(a => a.proposal.kind === 'click' && a.proposal.targetLocalId === 'el_search_btn');
  assert.ok(clickedSearch, 'Must click SEARCH FLIGHTS button');

  // 5. Verify live extracted flight fares are present in reply
  assert.ok(result.reply.includes('₹2,999') || result.reply.includes('Live Page Data'), 'Must include live extracted fare in reply');
});


