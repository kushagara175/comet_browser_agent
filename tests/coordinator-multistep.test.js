/**
 * @privapilot/extension - Bounded Multi-Step Agent Loop Integration Tests
 *
 * Scenarios tested:
 * 1. Successful three-step workflow (type -> filter -> finish)
 * 2. Protected submit approval with multi-step resumption
 * 3. Denial of protected action stops loop
 * 4. Immediate finish action
 * 5. Stale target recovery within retry budget
 * 6. Repeated identical action detection
 * 7. Step budget exhaustion
 * 8. Sanitizer failure stops loop locally
 * 9. Semantic verification failure stops loop
 * 10. Invalid server action schema or hallucinated element stops loop
 */

import test from 'node:test';
import assert from 'node:assert';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';

function createSampleElements() {
  return [
    {
      localId: 'el_search_input',
      role: 'input',
      sanitizedName: 'Search Queries Field',
      coarseBounds: [0.1, 0.1, 0.3, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type', 'click']
    },
    {
      localId: 'el_filter_btn',
      role: 'button',
      sanitizedName: 'Apply Filter Button',
      coarseBounds: [0.4, 0.1, 0.15, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_submit_btn',
      role: 'button',
      sanitizedName: 'Submit Final Approval',
      coarseBounds: [0.6, 0.1, 0.2, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];
}

function createFakeBrowserAdapter(options = {}) {
  const elements = options.elements || createSampleElements();
  const sentMessages = [];
  let captureIndex = 0;
  let executedCount = 0;

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
        captureIndex++;
        if (options.domSnapshotError) {
          return { success: false, error: options.domSnapshotError };
        }
        return {
          success: true,
          captureId: message.captureId || `cap_cycle_${captureIndex}`,
          snapshot: { elements, url: 'http://localhost:4500' },
          viewport: { viewportWidth: 1280, viewportHeight: 720 }
        };
      }

      if (message.type === 'EXECUTE_ACTION') {
        executedCount++;
        if (options.executeHandler) {
          return options.executeHandler(message.proposal, sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION').length);
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
    async runInSanitizerHost(request) {
      if (options.sanitizerError) {
        throw new Error(options.sanitizerError);
      }
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_multistep_test',
        captureId: request.rawCapture.captureId,
        goal: request.goal,
        sanitizedScreenshotDataUrl: request.rawCapture.rawScreenshotDataUrl,
        elements,
        pageState: {
          title: 'Test Portal',
          viewport: [1280, 720],
          visibleDialogCount: executedCount > 0 ? 1 : 0,
          dialogTitles: executedCount > 0 ? ['Safe Preview Drawer'] : [],
          statusSummaries: executedCount > 0 ? ['Status: Approved'] : []
        },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  return adapter;
}

function createSequenceHttpClient(proposals) {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async requestReasoningAction(sanitized) {
      const idx = callCount;
      callCount++;
      if (typeof proposals === 'function') {
        return proposals(idx, sanitized);
      }
      if (Array.isArray(proposals)) {
        return proposals[idx] || proposals[proposals.length - 1];
      }
      return proposals;
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
// Multi-Step Agent Loop Test Suite
// ============================================================================

test('MultiStepCoordinator: polite scroll command executes once locally and completes', async () => {
  const browser = createFakeBrowserAdapter();
  const httpClient = createSequenceHttpClient(() => {
    throw new Error('Polite scroll command must not call the reasoning server');
  });
  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 4 });

  const result = await coordinator.startRun('Please scroll down');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(result.stepCount, 1);
  assert.strictEqual(httpClient.callCount, 0);

  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 1);
  assert.strictEqual(execMessages[0].message.proposal.kind, 'scroll');
  assert.strictEqual(execMessages[0].message.proposal.scrollDirection, 'down');
});

test('MultiStepCoordinator: Hey PrivaPilot polite scroll command executes once locally and completes', async () => {
  const browser = createFakeBrowserAdapter();
  const httpClient = createSequenceHttpClient(() => {
    throw new Error('Polite scroll command must not call the reasoning server');
  });
  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 4 });

  const result = await coordinator.startRun('Hey PrivaPilot, please scroll down');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(result.stepCount, 1);
  assert.strictEqual(httpClient.callCount, 0);

  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 1);
  assert.strictEqual(execMessages[0].message.proposal.kind, 'scroll');
  assert.strictEqual(execMessages[0].message.proposal.scrollDirection, 'down');
});

test('MultiStepCoordinator: Scenario 1 - Successful three-step workflow (type -> filter -> finish)', async () => {
  const browser = createFakeBrowserAdapter();

  const step1Type = {
    actionId: 'act_1_type',
    kind: 'type',
    targetLocalId: 'el_search_input',
    confidence: 0.95,
    risk: 'safe',
    textToType: 'Subsystem telemetry',
    rationale: 'Enter search keywords into search field'
  };

  const step2Filter = {
    actionId: 'act_2_filter',
    kind: 'click',
    targetLocalId: 'el_filter_btn',
    confidence: 0.94,
    risk: 'safe',
    rationale: 'Click filter button to update results table',
    expectedState: 'Results table updated'
  };

  const step3Finish = {
    actionId: 'act_3_finish',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Search and filter workflow complete'
  };

  const httpClient = createSequenceHttpClient([step1Type, step2Filter, step3Finish]);
  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 10 });

  const progressUpdates = [];
  coordinator.setListeners({
    onStepProgress(step, maxSteps, msg) {
      progressUpdates.push({ step, maxSteps, msg });
    }
  });

  const result = await coordinator.startRun('Find telemetry logs');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(httpClient.callCount, 3);
  assert.strictEqual(progressUpdates.length, 2); // Steps 1 and 2 emitted progress before step 3 finished

  // Telemetry assertions
  assert.ok(result.telemetry);
  assert.strictEqual(result.telemetry.stepsCompleted, 3);
  assert.ok(result.telemetry.totalLatencyMs >= 0);
  assert.ok(result.telemetry.clientLatencyMs >= 0);
  assert.ok(result.telemetry.serverLatencyMs >= 0);

  // Ensure DOM actions dispatched strictly 2 execution messages (type, click), and 0 for finish
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 2);
  assert.strictEqual(execMessages[0].message.proposal.kind, 'type');
  assert.strictEqual(execMessages[1].message.proposal.kind, 'click');

  // Verify fresh captureId was generated per cycle
  const captureMessages = browser.sentMessages.filter(m => m.message.type === 'EXTRACT_DOM_SNAPSHOT');
  const captureIds = captureMessages.map(m => m.message.captureId);
  const uniqueCaptureIds = new Set(captureIds);
  assert.strictEqual(uniqueCaptureIds.size, 3, 'Each execution perception cycle must use a fresh ephemeral captureId; bounded hydration polls may reuse it');
});

test('MultiStepCoordinator: Scenario 2 - Protected submit approval pauses and resumes loop', async () => {
  const browser = createFakeBrowserAdapter();

  const step1Fill = {
    actionId: 'act_1_fill',
    kind: 'type',
    targetLocalId: 'el_search_input',
    confidence: 0.95,
    risk: 'safe',
    textToType: 'Approved payload',
    rationale: 'Fill authorization form'
  };

  const step2ProtectedSubmit = {
    actionId: 'act_2_submit',
    kind: 'click',
    targetLocalId: 'el_submit_btn',
    confidence: 0.98,
    risk: 'protected',
    rationale: 'Submit final approval request',
    expectedState: 'Approval request submitted'
  };

  const step3Finish = {
    actionId: 'act_3_done',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Task complete after approval'
  };

  const httpClient = createSequenceHttpClient([step1Fill, step2ProtectedSubmit, step3Finish]);
  const coordinator = new RunCoordinator(browser, httpClient);

  // Start run -> should pause at step 2 awaiting user confirmation
  const initialResult = await coordinator.startRun('Authorize release');

  assert.strictEqual(initialResult.success, false);
  assert.strictEqual(initialResult.state, 'awaiting-user-confirmation');
  assert.strictEqual(coordinator.getState(), 'awaiting-user-confirmation');
  assert.strictEqual(httpClient.callCount, 2);

  // User clicks Approve and resumes multi-step loop
  const finalResult = await coordinator.approvePendingAction({ resumeLoop: true, runId: initialResult.runId, actionId: initialResult.proposal.actionId });

  assert.strictEqual(finalResult.success, true);
  assert.strictEqual(finalResult.state, 'complete');
  assert.strictEqual(coordinator.getState(), 'complete');
  assert.strictEqual(httpClient.callCount, 3);
});

test('MultiStepCoordinator: Scenario 3 - Denial of protected action stops loop and leaves state idle', async () => {
  const browser = createFakeBrowserAdapter();

  const step1Protected = {
    actionId: 'act_protected_1',
    kind: 'click',
    targetLocalId: 'el_submit_btn',
    confidence: 0.98,
    risk: 'protected',
    rationale: 'Submit order'
  };

  const httpClient = createSequenceHttpClient([step1Protected]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const pending = await coordinator.startRun('Submit order');
  assert.strictEqual(coordinator.getState(), 'awaiting-user-confirmation');

  // User clicks Deny
  const denyResult = coordinator.denyPendingAction({ runId: pending.runId, actionId: pending.proposal.actionId });

  assert.strictEqual(denyResult.success, false);
  assert.strictEqual(denyResult.state, 'idle');
  assert.strictEqual(coordinator.getState(), 'idle');
  assert.strictEqual(httpClient.callCount, 1);

  // No DOM execution messages should have been dispatched for the protected action
  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('MultiStepCoordinator: Scenario 4 - Immediate finish action completes in single step', async () => {
  const browser = createFakeBrowserAdapter();

  const finishProposal = {
    actionId: 'act_immediate_finish',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Goal already accomplished'
  };

  const httpClient = createSequenceHttpClient([finishProposal]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Observe status');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(result.telemetry?.stepsCompleted, 1);
  assert.strictEqual(httpClient.callCount, 1);

  const execMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(execMessages.length, 0);
});

test('MultiStepCoordinator: Scenario 5 - Stale target recovery within retry budget', async () => {
  let executeCall = 0;
  const browser = createFakeBrowserAdapter({
    executeHandler(proposal) {
      executeCall++;
      if (executeCall === 1) {
        // First attempt returns stale target
        return {
          success: false,
          staleTarget: true,
          actionId: proposal.actionId,
          semanticOutcomeVerified: false,
          message: 'Stale target: element map is from previous capture'
        };
      }
      // Recovered attempt succeeds
      return {
        success: true,
        actionId: proposal.actionId,
        semanticOutcomeVerified: true,
        message: 'Click executed successfully'
      };
    }
  });

  const staleProposal = {
    actionId: 'act_stale_1',
    kind: 'click',
    targetLocalId: 'el_filter_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Filter results'
  };

  const finishProposal = {
    actionId: 'act_fin',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Done'
  };

  // Model receives request for stale attempt, retry re-perception attempt, and then finish
  const httpClient = createSequenceHttpClient([staleProposal, staleProposal, finishProposal]);
  const coordinator = new RunCoordinator(browser, httpClient, undefined, { maxStaleRetries: 2 });

  const result = await coordinator.startRun('Filter results');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(executeCall, 2, 'Should have retried execution after stale target re-perception');
});

test('MultiStepCoordinator: Scenario 6 - Repeated action detection prevents infinite loop', async () => {
  const browser = createFakeBrowserAdapter();

  const identicalClick = {
    actionId: 'act_loop_click',
    kind: 'click',
    targetLocalId: 'el_filter_btn',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Repeatedly clicking same filter'
  };

  // Model returns identical action proposal 3 times in a row
  const httpClient = createSequenceHttpClient([identicalClick, identicalClick, identicalClick, identicalClick]);
  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 10 });

  const result = await coordinator.startRun('Click filter repeatedly');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Repeated action loop detected'));
});

test('MultiStepCoordinator: Scenario 7 - Step budget exhaustion stops safely', async () => {
  const browser = createFakeBrowserAdapter();

  // Model returns varying distinct click actions without finishing
  const httpClient = createSequenceHttpClient((step) => ({
    actionId: `act_distinct_${step}`,
    kind: 'click',
    targetLocalId: step % 2 === 0 ? 'el_filter_btn' : 'el_search_input',
    confidence: 0.9,
    risk: 'safe',
    rationale: `Step action ${step}`
  }));

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 4 });

  const result = await coordinator.startRun('Endless navigation');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Step budget exhausted'));
  assert.strictEqual(result.stepCount, 4);
});

test('MultiStepCoordinator: Scenario 8 - Local sanitizer failure fails closed and server is never called', async () => {
  const browser = createFakeBrowserAdapter({
    sanitizerError: 'Canvas security origin taint in offscreen document'
  });

  const httpClient = createSequenceHttpClient({
    actionId: 'act_never_called',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Unreachable'
  });

  const coordinator = new RunCoordinator(browser, httpClient);
  const result = await coordinator.startRun('Sanitize sensitive page');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'blocked-local-only');
  assert.strictEqual(httpClient.callCount, 0, 'Reasoning server must NEVER be contacted when client sanitization fails');
});

test('MultiStepCoordinator: Scenario 9 - Semantic verification failure stops loop', async () => {
  const browser = createFakeBrowserAdapter({
    executeResponse: {
      success: true, // synthetic DOM dispatch succeeded
      actionId: 'act_verif_fail',
      semanticOutcomeVerified: false, // but expected state was NOT observed
      message: 'Semantic verification failed: expected panel was not observed'
    }
  });

  const clickProposal = {
    actionId: 'act_verif_fail',
    kind: 'click',
    targetLocalId: 'el_filter_btn',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open details drawer',
    expectedState: 'Details drawer is visible'
  };

  const httpClient = createSequenceHttpClient([clickProposal]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Open details');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Semantic verification failed'));
  assert.ok(result.telemetry, 'Telemetry must be retained even on verification failure');
});

test('MultiStepCoordinator: Scenario 10 - Invalid server action rejected and loop stops', async () => {
  const browser = createFakeBrowserAdapter();

  // Model hallucinates an unknown localId not present in sanitized context
  const hallucinatedProposal = {
    actionId: 'act_hallucinated',
    kind: 'click',
    targetLocalId: 'el_non_existent_404',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Click imaginary element'
  };

  const httpClient = createSequenceHttpClient([hallucinatedProposal]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('Click imaginary element');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'failed-safe');
  assert.ok(result.error?.includes('Action rejected'));
});

test('MultiStepCoordinator: Scenario 11 - Perception-Execution Bridge: Clarification query auto-advances to navigation target', async () => {
  const elements = [
    {
      localId: 'el_ps_link',
      role: 'link',
      sanitizedName: 'Problem Statements',
      coarseBounds: [0.1, 0.1, 0.2, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const browser = createFakeBrowserAdapter({ elements });

  const step1ClarificationProposal = {
    actionId: 'act_clarify',
    kind: 'answer',
    reply: 'Which platform is problem 171 from? For example, is it from Codeforces or LeetCode?',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Asking clarification question'
  };

  const step2FinishProposal = {
    actionId: 'act_finish',
    kind: 'finish',
    reply: 'Problem statement 171 has 12 verified submissions.',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Problem statement 171 has 12 verified submissions.'
  };

  const httpClient = createSequenceHttpClient([step1ClarificationProposal, step2FinishProposal]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun('see how many submissions are done in problem statement 171', { maxSteps: 3 });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.ok(httpClient.callCount >= 2, 'Reasoning engine must be called again after navigating to Problem Statements');
  assert.ok(result.message?.includes('12 verified submissions'));
});

test('MultiStepCoordinator: Scenario 12 - Multi-step search & question answering survives transient action failure and finishes with answer', async () => {
  const elements = [
    {
      localId: 'el_search_input',
      role: 'input',
      sanitizedName: 'Search Wikipedia',
      coarseBounds: [0.1, 0.1, 0.3, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type', 'click']
    },
    {
      localId: 'el_hidden_suggestion',
      role: 'button',
      sanitizedName: 'Smart India Hackathon suggestion',
      coarseBounds: [0.1, 0.2, 0.3, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  let execStep = 0;
  const browser = createFakeBrowserAdapter({
    elements
  });

  const origSendMessage = browser.sendMessageToTab.bind(browser);
  browser.sendMessageToTab = async (tabId, message) => {
    if (message.type === 'EXECUTE_ACTION') {
      execStep++;
      if (execStep === 1) {
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: 'Typed Smart India Hackathon'
        };
      }
      if (execStep === 2) {
        return {
          success: false,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: "Target element 'el_hidden_suggestion' is hidden or invisible"
        };
      }
      return {
        success: true,
        actionId: message.proposal.actionId,
        semanticOutcomeVerified: true,
        message: 'Action succeeded'
      };
    }
    return origSendMessage(tabId, message);
  };

  const step1Type = {
    actionId: 'act_type_search',
    kind: 'type',
    targetLocalId: 'el_search_input',
    textToType: 'Smart India Hackathon',
    pressEnter: true,
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Type Smart India Hackathon'
  };

  const step2StaleClick = {
    actionId: 'act_stale_click',
    kind: 'click',
    targetLocalId: 'el_hidden_suggestion',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Click suggestion'
  };

  const step3FinishAnswer = {
    actionId: 'act_finish_answer',
    kind: 'finish',
    reply: 'Smart India Hackathon was launched in 2017 and is organized by the Ministry of Education and AICTE.',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Smart India Hackathon was launched in 2017 and is organized by the Ministry of Education and AICTE.'
  };

  const httpClient = createSequenceHttpClient([step1Type, step2StaleClick, step3FinishAnswer]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun(
    "Go to wikipedia.org, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it",
    { maxSteps: 5 }
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.ok(result.message?.includes('2017'));
  assert.ok(result.message?.includes('Ministry of Education'));
});

test('Coordinator Multi-Step: Scenario 13 - Starts on chrome://newtab, navigates to Wikipedia, types search with pressEnter, and finishes with retrieval answer', async () => {
  let currentUrl = 'chrome://newtab';
  const navigatedUrls = [];

  const browser = createFakeBrowserAdapter({
    elements: [
      {
        localId: 'el_wiki_search',
        role: 'input',
        sanitizedName: 'Search Wikipedia',
        coarseBounds: [0.3, 0.4, 0.4, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type', 'click']
      }
    ]
  });

  browser.getActiveTab = async () => ({
    id: 1,
    url: currentUrl,
    title: currentUrl === 'chrome://newtab' ? 'New Tab' : 'Wikipedia',
    status: 'complete'
  });

  browser.navigateTab = async (tabId, url) => {
    navigatedUrls.push(url);
    currentUrl = url;
    return { tabId, url };
  };

  browser.waitForTabReady = async (tabId, timeoutMs, expectedUrl) => ({
    id: tabId,
    url: currentUrl,
    title: 'Wikipedia',
    status: 'complete'
  });

  browser.ensureContentScript = async (tabId) => true;

  const step1Type = {
    actionId: 'act_type_search',
    kind: 'type',
    targetLocalId: 'el_wiki_search',
    textToType: 'Smart India Hackathon',
    pressEnter: true,
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Type Smart India Hackathon into Wikipedia search box and submit'
  };

  const step2FinishAnswer = {
    actionId: 'act_finish_retrieval',
    kind: 'finish',
    reply: 'The Smart India Hackathon was first launched in 2017 and is organized by the Ministry of Education (Government of India) along with AICTE.',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Extracted launch year (2017) and organizers (Ministry of Education, AICTE) from Wikipedia search results'
  };

  const httpClient = createSequenceHttpClient([step1Type, step2FinishAnswer]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun(
    "Go to wikipedia.org, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it",
    { maxSteps: 5 }
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.deepStrictEqual(navigatedUrls, ['https://www.wikipedia.org']);
  assert.ok(result.message?.includes('2017'));
  assert.ok(result.message?.includes('Ministry of Education'));
});

test('Coordinator Multi-Step: Scenario 14 - Starts on existing website (Wikipedia), opens new tab for SIH, searches for 171, and finishes with retrieval answer', async () => {
  const navigatedCalls = [];
  let currentUrl = 'https://en.wikipedia.org/wiki/Special:Search?search=Smart+India+Hackathon';
  let currentTabId = 101;

  const browser = createFakeBrowserAdapter({
    elements: [
      {
        localId: 'el_sih_search',
        role: 'input',
        sanitizedName: 'Search Problem Statement',
        coarseBounds: [0.3, 0.4, 0.4, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type', 'click']
      }
    ]
  });

  browser.getActiveTab = async (preferredId) => ({
    id: preferredId || currentTabId,
    url: currentUrl,
    title: currentUrl.includes('sih') ? 'Smart India Hackathon Portal' : 'Wikipedia Search Results',
    status: 'complete'
  });

  browser.navigateTab = async (tabId, url, options) => {
    navigatedCalls.push({ tabId, url, options });
    if (options?.createNewTab) {
      currentTabId = 202; // New tab ID
    }
    currentUrl = url;
    return { tabId: currentTabId, url };
  };

  browser.waitForTabReady = async (tabId, timeoutMs, expectedUrl) => ({
    id: tabId,
    url: currentUrl,
    title: 'Smart India Hackathon Portal',
    status: 'complete'
  });

  browser.ensureContentScript = async (tabId) => true;

  const step1TypeSih = {
    actionId: 'act_type_sih',
    kind: 'type',
    targetLocalId: 'el_sih_search',
    textToType: '171',
    pressEnter: true,
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Type 171 into SIH search box'
  };

  const step2FinishAnswer = {
    actionId: 'act_finish_retrieval',
    kind: 'finish',
    reply: 'Problem Statement 171: Smart Water Management, Ministry of Jal Shakti, Software Category.',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Extracted PS details from SIH table'
  };

  const httpClient = createSequenceHttpClient([step1TypeSih, step2FinishAnswer]);
  const coordinator = new RunCoordinator(browser, httpClient);

  const result = await coordinator.startRun(
    'Go to https://sih.gov.in/sih2024PS, search for "171", and tell me its title, organization, and category',
    { maxSteps: 5 }
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, 'complete');
  assert.strictEqual(navigatedCalls.length, 1);
  assert.strictEqual(navigatedCalls[0].url, 'https://sih.gov.in/sih2024PS');
  assert.strictEqual(navigatedCalls[0].options?.createNewTab, true);
  assert.ok(result.message?.includes('Problem Statement 171'));
  assert.ok(result.message?.includes('Ministry of Jal Shakti'));
});

test('Coordinator Multi-Step: Scenario 15 - "do again" / retry resolves to previous goal and executes agent tools seamlessly', async () => {
  const browser = createFakeBrowserAdapter({
    elements: [
      {
        localId: 'el_sih_search',
        role: 'input',
        sanitizedName: 'Search Problem Statement',
        coarseBounds: [0.3, 0.4, 0.4, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type', 'click']
      }
    ]
  });

  browser.getActiveTab = async () => ({
    id: 1,
    url: 'https://sih.gov.in/sih2026PS',
    title: 'Smart India Hackathon Portal',
    status: 'complete'
  });

  const step1 = {
    actionId: 'act_1',
    kind: 'finish',
    reply: 'Found initial PS details',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Done'
  };

  const step2RetryAction = {
    actionId: 'act_retry_type',
    kind: 'type',
    targetLocalId: 'el_sih_search',
    textToType: '171',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Retry search for 171'
  };

  const step3Finish = {
    actionId: 'act_retry_finish',
    kind: 'finish',
    reply: 'Problem Statement 171: Smart Water Management',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Extracted details'
  };

  const httpClient = createSequenceHttpClient([step1, step2RetryAction, step3Finish]);
  const coordinator = new RunCoordinator(browser, httpClient);

  // Run 1: Initial task
  await coordinator.startRun(
    'search for "171", and tell me its title, organization, and category',
    { maxSteps: 3 }
  );

  // Run 2: User follow-up "do again"
  const retryResult = await coordinator.startRun('do again', { maxSteps: 3 });

  assert.strictEqual(retryResult.success, true);
  assert.strictEqual(retryResult.state, 'complete');
  assert.ok(retryResult.message?.includes('Problem Statement 171'));
});





