/**
 * Architecture Gate: Safe Navigation Non-Blocking HITL, Resilient Confirmation & Pure Thinking Typography
 *
 * Verifies:
 * 1. Safe navigation/browsing links (e.g. clicking "STUDENTS", "CAREERS", tabs) are not gated behind HITL confirmation.
 * 2. approvePendingAction and denyPendingAction gracefully handle replayed clicks without "Confirmation no longer matches".
 * 3. URLs with query parameters like online=true and long SPA URLs (> 2048 chars) pass validation without 400 errors.
 * 4. Thinking accordion omits [Builder] agent tags from headers and renders uniform naked typography without boxed confidence cards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { RunCoordinator } from '../../apps/extension/dist/background/coordinator.js';
import { VlmReasoningEngine } from '../../apps/server/dist/engines/vlm-engine.js';
import { validateSanitizedPayload } from '../../apps/server/dist/schemas/payload-validator.js';
import { sanitizeOutboundUrl } from '../../packages/pii-rules/dist/url-scrubber.js';
import {
  renderThinkingAccordion,
  formatReasoningIntoLinesHtml
} from '../../apps/extension/src/sidepanel/sidepanel.js';

function createMockBrowser(options = {}) {
  const messagesSent = [];
  return {
    messagesSent,
    getActiveTab: async (preferredTabId) => ({
      id: preferredTabId || 101,
      url: options.tabUrl || 'https://www.isro.gov.in',
      title: 'ISRO Portal',
      status: 'complete'
    }),
    getStrictTab: async (tabId) => ({
      id: tabId,
      url: options.tabUrl || 'https://www.isro.gov.in',
      title: 'ISRO Portal',
      status: 'complete'
    }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (tabId, msg) => {
      messagesSent.push({ tabId, msg });
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: {
            domElements: [
              { id: 'el_nav_students', descriptor: { tagName: 'a', role: 'link', name: 'STUDENTS', sanitizedName: 'STUDENTS' } },
              { id: 'el_input_captcha', descriptor: { tagName: 'input', type: 'text', name: 'captcha', sanitizedName: 'Captcha' } },
              { id: 'el_btn_submit', descriptor: { tagName: 'button', type: 'submit', name: 'submit', sanitizedName: 'Submit Application' } }
            ],
            interactiveElements: [
              { localId: 'el_nav_students', role: 'link', rawName: 'STUDENTS' },
              { localId: 'el_input_captcha', role: 'input', rawName: 'Captcha' },
              { localId: 'el_btn_submit', role: 'button', rawName: 'Submit Application' },
              { localId: 'el_nav_careers', role: 'link', rawName: 'CAREERS' }
            ],
            elements: [
              { localId: 'el_nav_students', role: 'link', sanitizedName: 'STUDENTS', state: ['visible', 'enabled'], actionCapabilities: ['click'] },
              { localId: 'el_input_captcha', role: 'input', sanitizedName: 'Captcha', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
              { localId: 'el_btn_submit', role: 'button', sanitizedName: 'Submit Application', state: ['visible', 'enabled'], actionCapabilities: ['click'] },
              { localId: 'el_nav_careers', role: 'link', sanitizedName: 'CAREERS', state: ['visible', 'enabled'], actionCapabilities: ['click'] }
            ],
            textNodes: [
              { text: 'Indian Space Research Organisation Official Recruitment and Student Internship Portal' }
            ],
            url: options.tabUrl || 'https://www.isro.gov.in'
          }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        return {
          success: true,
          semanticOutcomeVerified: true,
          actionId: msg.proposal?.actionId,
          message: `Executed ${msg.proposal?.kind}`
        };
      }
      return { success: true };
    },
    runInSanitizerHost: async (req) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: req.runId || 'run_mock',
      captureId: req.captureId || 'cap_mock',
      goal: req.goal || 'Mock goal',
      sanitizedScreenshotDataUrl: req.rawScreenshotDataUrl,
      elements: [
        { localId: 'el_nav_students', role: 'link', sanitizedName: 'STUDENTS', state: ['visible', 'enabled'], actionCapabilities: ['click'] },
        { localId: 'el_input_captcha', role: 'input', sanitizedName: 'Captcha', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
        { localId: 'el_btn_submit', role: 'button', sanitizedName: 'Submit Application', state: ['visible', 'enabled'], actionCapabilities: ['click'] }
      ],
      pageState: { title: 'ISRO Portal', url: options.tabUrl || 'https://www.isro.gov.in' },
      maskCount: 0,
      payloadDigestSha256: 'mock_digest',
      timestamp: Date.now()
    }),
    waitForTabReady: async (tabId) => ({
      id: tabId,
      url: options.tabUrl || 'https://www.isro.gov.in',
      title: 'ISRO Portal',
      status: 'complete'
    }),
    ensureContentScript: async () => true
  };
}

function createMockHttpClient(proposal) {
  return {
    async requestTaskSpecification(goal) {
      return {
        goal,
        objectives: [],
        tasksToDo: [],
        tasksNotToDo: [],
        successCriteria: 'Done',
        requiresSubAgents: false,
        subAgentTasks: []
      };
    },
    async requestReasoningAction(payload) {
      return proposal;
    },
    async requestReasoningActionStream(payload, options) {
      options?.onThoughtDelta?.('Exploring ISRO students section.');
      return proposal;
    },
    async reportExecutionFailure() {},
    async reportExecutionSuccess() {}
  };
}

test('Navigation Gate: Clicking STUDENTS link auto-executes without requiring HITL confirmation', async () => {
  const browser = createMockBrowser();
  let confirmationRequiredFired = false;

  const mockHttp = createMockHttpClient({
    actionId: 'act_click_students',
    kind: 'click',
    targetLocalId: 'el_nav_students',
    confidence: 0.75, // Below 0.85, but is a safe navigation link
    risk: 'safe',
    rationale: 'Navigate to students portal to inspect opportunities'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  coordinator.setListeners({
    onActionConfirmedRequired: () => {
      confirmationRequiredFired = true;
    }
  });

  const result = await coordinator.startRun('Open ISRO and see any internship programs', { tabId: 101, maxSteps: 1 });

  assert.equal(confirmationRequiredFired, false, 'Safe navigation link must NOT trigger HITL confirmation');
  assert.notEqual(result.state, 'awaiting-user-confirmation', 'State must not be awaiting-user-confirmation');
  const executeMessages = browser.messagesSent.filter(m => m.msg.type === 'EXECUTE_ACTION');
  assert.equal(executeMessages.length, 1, 'Click on STUDENTS should have executed automatically');
  assert.equal(executeMessages[0].msg.proposal.targetLocalId, 'el_nav_students');
});

test('Resilient Approval: approvePendingAction handles idempotent replayed approvals gracefully', async () => {
  const browser = createMockBrowser();
  const mockHttp = createMockHttpClient({
    actionId: 'act_submit_app',
    kind: 'click',
    targetLocalId: 'el_btn_submit',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Submitting final registration'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  const initialResult = await coordinator.startRun('Submit registration form', { tabId: 101, maxSteps: 2 });

  assert.equal(initialResult.state, 'awaiting-user-confirmation');

  // First approval
  const approveRes1 = await coordinator.approvePendingAction({
    runId: coordinator.getCurrentRunId(),
    actionId: 'act_submit_app',
    resumeLoop: false
  });
  assert.equal(approveRes1.success, true, 'First approval must succeed');

  // Replayed / second approval (e.g. double click or stale modal button)
  const approveRes2 = await coordinator.approvePendingAction({
    runId: coordinator.getCurrentRunId(),
    actionId: 'act_submit_app',
    resumeLoop: false
  });
  assert.equal(approveRes2.success, true, 'Replayed approval should return success instead of crashing');
});

test('URL Schema Resilience: URLs with online=true and long query strings do not cause 400 error', () => {
  // 1. URL with "online=" parameter
  const validUrlWithOnline = 'https://example.com/search?online=true&category=all';
  const payload1 = {
    protocolVersion: '1.0',
    runId: 'run_test_url_1',
    goal: 'Search for courses',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [],
    pageState: {
      title: 'Search Page',
      viewport: [1280, 800],
      url: validUrlWithOnline
    }
  };

  const validation1 = validateSanitizedPayload(payload1);
  assert.equal(validation1.isValid, true, `Payload with online= parameter should be valid, got error: ${validation1.errorMessage}`);

  // 2. Extremely long URL (> 2048 characters)
  const longUrl = 'https://app.example.com/workspace?' + 'filter='.repeat(400);
  const sanitizedLong = sanitizeOutboundUrl(longUrl);
  assert.ok(sanitizedLong.length <= 2048, 'Sanitizer must clamp URL to <= 2048 characters');

  const payload2 = {
    protocolVersion: '1.0',
    runId: 'run_test_url_2',
    goal: 'Navigate long URL',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [],
    pageState: {
      title: 'Workspace Page',
      viewport: [1280, 800],
      url: longUrl
    }
  };

  const validation2 = validateSanitizedPayload(payload2);
  assert.equal(validation2.isValid, true, `Extremely long URL must be clamped and valid, got error: ${validation2.errorMessage}`);
});

test('Pure Thinking Typography: Monologue does not render custom agent badge and renders naked prose', () => {
  // 1. renderThinkingAccordion does not render [Builder] badge
  const accordionHtml = renderThinkingAccordion(
    'ISRO Careers page after clicking link. The visible viewport shows recruitment notices. The confidence is high.',
    12,
    { agentName: 'Builder', isExecuting: false }
  );

  assert.ok(!accordionHtml.includes('thought-agent-badge'), 'Monologue header must not include thought-agent-badge');
  assert.ok(!accordionHtml.includes('Builder'), 'Monologue header must not display [Builder] tag');
  assert.ok(accordionHtml.includes('Thought for 12s'), 'Header should cleanly show Thought for 12s');

  // 2. formatReasoningIntoLinesHtml does not wrap confidence in a dark boxed card
  const linesHtml = formatReasoningIntoLinesHtml(
    'ISRO Careers page after clicking link. The visible viewport shows notices.\n\nThe confidence is high because scrolling is a safe action.'
  );

  assert.ok(!linesHtml.includes('thought-confidence-tag'), 'Paragraphs containing confidence must not be wrapped in boxed thought-confidence-tag cards');
  assert.ok(!linesHtml.includes('ui-monospace'), 'Reasoning prose should not be forced into monospace box');
  assert.ok(linesHtml.includes('thought-paragraph'), 'Paragraphs must be rendered with clean thought-paragraph class');
});

test('Two-State Thinking Lifecycle: State 1 is pure shimmering text without chevron or drawer before tokens arrive', () => {
  // Before any tokens arrive from the LLM, renderThinkingAccordion must return State 1:
  // Pure shimmering text, NO chevron SVG, NO button, NO drawer
  const state1Html = renderThinkingAccordion('', 3, { isExecuting: true });

  assert.ok(state1Html.includes('thinking-phase1'), 'State 1 must have thinking-phase1 container');
  assert.ok(state1Html.includes('thinking-shimmer-text'), 'State 1 must have shimmering text');
  assert.ok(state1Html.includes('Thinking (3s)...'), 'State 1 must render elapsed seconds');
  assert.ok(!state1Html.includes('monologue-chevron'), 'State 1 must NOT render chevron dropdown arrow');
  assert.ok(!state1Html.includes('monologue-toggle-btn'), 'State 1 must NOT be an expandable button');
  assert.ok(!state1Html.includes('monologue-drawer'), 'State 1 must NOT render a drawer');
  assert.ok(!state1Html.includes('monologue-initial-placeholder'), 'State 1 must NOT render placeholder text');
});

test('Two-State Thinking Lifecycle: State 2 becomes expandable with chevron and drawer when tokens arrive', () => {
  // When live tokens arrive, renderThinkingAccordion must transition to State 2:
  // Interactive expandable accordion with chevron, open drawer, and live-thought-stream
  const liveReasoning = 'I observe the ISRO portal with 4 main navigation links. Proceeding to inspect.';
  const state2Html = renderThinkingAccordion(liveReasoning, 4, { isExecuting: true, open: true });

  assert.ok(state2Html.includes('monologue-block'), 'State 2 must render monologue-block accordion');
  assert.ok(state2Html.includes('monologue-chevron'), 'State 2 must render dropdown chevron arrow');
  assert.ok(state2Html.includes('rotate-90'), 'State 2 chevron must be rotated open by default while streaming');
  assert.ok(state2Html.includes('monologue-drawer'), 'State 2 must render monologue-drawer');
  assert.ok(state2Html.includes('display: block'), 'State 2 drawer must be open and visible while streaming');
  assert.ok(state2Html.includes('live-thought-stream'), 'State 2 must render live-thought-stream span');
  assert.ok(state2Html.includes('I observe the ISRO portal'), 'State 2 must display the streamed tokens');
});

test('Two-State Thinking Lifecycle: Immediate conversion to State 2 on 1st token delta with exact duration lock', () => {
  // 1. First token delta arriving (even leading newline or single word) with forceState2 immediately transitions to State 2
  const firstTokenHtml = renderThinkingAccordion('\n', 5, { isExecuting: true, open: true, forceState2: true });
  assert.ok(firstTokenHtml.includes('monologue-block'), '1st token must immediately render monologue-block');
  assert.ok(firstTokenHtml.includes('rotate-90'), '1st token must have expanded chevron');
  assert.ok(firstTokenHtml.includes('display: block'), '1st token must have open drawer');
  assert.ok(firstTokenHtml.includes('Thinking (5s)'), '1st token must render exact live elapsed seconds');

  // 2. Completed thought preserves exact live elapsed duration (zero time mismatch)
  const completedHtml = renderThinkingAccordion('Reasoned about ISRO forms.', 5, { open: true });
  assert.ok(completedHtml.includes('Thought for 5s'), 'Completed thought must display exact live elapsed seconds (Thought for 5s)');
  assert.ok(!completedHtml.includes('Thought for 2s'), 'Completed thought must not drop to 2s synthetic fallback');
});

test('Batch HITL Gate: Form batch pauses on request_user_input without failing with unsupported action kind', async () => {
  const browser = createMockBrowser();
  let userInputRequiredFired = false;

  const mockHttp = createMockHttpClient({
    actionId: 'act_batch_with_captcha',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Filling form fields and requesting user input for CAPTCHA',
    batchActions: [
      { actionId: 'sub_1', kind: 'type', targetLocalId: 'el_nav_students', textToType: 'Student Query' },
      { actionId: 'sub_2', kind: 'request_user_input', targetLocalId: 'el_btn_submit', userInputPrompt: 'Please enter CAPTCHA characters' }
    ]
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      userInputRequiredFired = true;
      assert.equal(req.prompt, 'Please enter CAPTCHA characters');
    }
  });

  const result = await coordinator.startRun('Fill feedback form and submit', { tabId: 101, maxSteps: 2 });

  assert.equal(result.state, 'awaiting-user-input', 'State must be awaiting-user-input when batch reaches request_user_input');
  assert.equal(userInputRequiredFired, true, 'onUserInputRequired must fire');
  assert.notEqual(result.error, "Unsupported action kind 'request_user_input'", 'Must NOT fail with unsupported action kind');
});

test('HITL Input Resume Gate: Resuming after submitUserInput continues loop and records filled input', async () => {
  const browser = createMockBrowser();
  let lastActionProposal = null;

  const mockHttp = {
    async requestTaskSpecification(goal) {
      return { goal, objectives: [], tasksToDo: [], tasksNotToDo: [], successCriteria: 'Done', requiresSubAgents: false, subAgentTasks: [] };
    },
    async requestReasoningAction(payload) {
      if (!lastActionProposal) {
        lastActionProposal = {
          actionId: 'act_step1',
          kind: 'request_user_input',
          targetLocalId: 'el_input_captcha',
          userInputPrompt: 'Please enter CAPTCHA',
          confidence: 0.8,
          risk: 'safe',
          rationale: 'Need CAPTCHA from user'
        };
        return lastActionProposal;
      }
      return {
        actionId: 'act_step2',
        kind: 'click',
        targetLocalId: 'el_btn_submit',
        confidence: 0.98,
        risk: 'safe',
        rationale: 'Submitting completed form'
      };
    },
    async requestReasoningActionStream(payload, options) {
      options?.onThoughtDelta?.('Proceeding to submit the form.');
      return this.requestReasoningAction(payload);
    },
    async reportExecutionFailure() {},
    async reportExecutionSuccess() {}
  };

  const coordinator = new RunCoordinator(browser, mockHttp);
  let pendingReq = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      pendingReq = req;
    }
  });

  const initRes = await coordinator.startRun('Fill feedback form and submit', { tabId: 101, maxSteps: 3 });
  assert.equal(initRes.state, 'awaiting-user-input', `Init failed with error: ${initRes.error || initRes.message}`);
  assert.ok(pendingReq);

  let thoughtStreamed = false;
  const submitRes = await coordinator.submitUserInput(
    { customText: 'UAIWU8' },
    101,
    {
      resumeLoop: true,
      targetLocalId: pendingReq.targetLocalId,
      inputNonce: pendingReq.inputNonce,
      runId: pendingReq.runId,
      streamingOptions: {
        onThoughtDelta: (delta) => {
          thoughtStreamed = true;
        }
      }
    }
  );

  assert.equal(submitRes.state, 'awaiting-user-confirmation', `Resume must advance to submit confirmation: ${submitRes.error || submitRes.message}`);
  assert.ok(thoughtStreamed, 'Streaming thought delta must fire on resumed execution');
});

test('VLM Engine Gate: Form submission guard advances request_user_input to click Submit if target element is already filled', () => {
  const engine = new VlmReasoningEngine({ provider: 'mock' });
  const payload = {
    goal: 'Fill feedback form',
    elements: [
      { localId: 'el_captcha', role: 'input', sanitizedName: 'Captcha', state: ['visible', 'filled'], actionCapabilities: ['type'] },
      { localId: 'el_submit', role: 'button', sanitizedName: 'Submit Form', state: ['visible', 'enabled'], actionCapabilities: ['click'] }
    ]
  };

  // Simulate model returning request_user_input on a field that is already filled
  const rawModelOutput = JSON.stringify({
    actionId: 'act_dup_input',
    kind: 'request_user_input',
    targetLocalId: 'el_captcha',
    userInputPrompt: 'Please enter captcha',
    confidence: 0.9
  });

  const parsed = engine.parseActionProposal(rawModelOutput, payload);
  assert.equal(parsed.kind, 'click', 'Must advance from request_user_input to click on submit button');
  assert.equal(parsed.targetLocalId, 'el_submit', 'Must target submit button');
});

test('Per-Action Inline Confidence Gate: System prompt mandates per-action inline evaluation without trailing formula blocks', () => {
  const engine = new VlmReasoningEngine({ provider: 'mock' });
  const prompt = engine.buildSystemPrompt();

  assert.ok(prompt.includes('PER-ACTION CONFIDENCE REASONING'), 'Prompt must specify PER-ACTION confidence reasoning');
  assert.ok(prompt.includes('NEVER append a unified summary block'), 'Prompt must explicitly forbid unified summary blocks');
});

test('HITL Recovery Gate: Blocked actions on sensitive inputs convert gracefully to awaiting-user-input instead of hard failing', async () => {
  const browser = createMockBrowser();
  let inputRequested = false;

  // Simulate model proposing an action that is flagged as blocked or targets a CAPTCHA field
  const mockHttp = createMockHttpClient({
    actionId: 'act_blocked_captcha',
    kind: 'type',
    targetLocalId: 'el_input_captcha',
    textToType: 'ABC12',
    confidence: 0.8,
    risk: 'blocked',
    rationale: 'The feedback form requires manual CAPTCHA entry to proceed.'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      inputRequested = true;
    }
  });

  const result = await coordinator.startRun('Fill feedback form');
  assert.equal(result.state, 'awaiting-user-input', 'Must transition to awaiting-user-input instead of failed-safe');
  assert.ok(inputRequested, 'Must trigger onUserInputRequired listener');
});

test('Resilient Confirmation Gate: approvePendingAction handles runId and actionId drift without lock-in error', async () => {
  const browser = createMockBrowser();
  const mockHttp = createMockHttpClient({
    actionId: 'act_protected_submit_456',
    kind: 'click',
    targetLocalId: 'el_btn_submit',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Submitting feedback form'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  const initialResult = await coordinator.startRun('Submit feedback form', { tabId: 101, maxSteps: 2 });
  assert.equal(initialResult.state, 'awaiting-user-confirmation');

  // Approval with drifted runId from sidepanel client
  const approveRes = await coordinator.approvePendingAction({
    runId: 'run_sidepanel_regenerated_789',
    actionId: 'act_1', // model generic actionId vs internal actionId
    resumeLoop: false
  });

  assert.equal(approveRes.success, true, 'Approval must succeed despite client runId or actionId drift');
  assert.equal(approveRes.state, 'complete', 'Action must execute and complete');
});

test('Clean Text Actions and Calm Left-to-Right Shimmer CSS Gate', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync('apps/extension/src/sidepanel/sidepanel.css', 'utf-8');

  // 1. Shimmer calm left-to-right animation exists and runs from -200% to 200%
  assert.ok(css.includes('@keyframes shimmer-calm-ltr'), 'shimmer-calm-ltr keyframe must exist');
  assert.ok(css.includes('background-position: -200% 0;'), 'shimmer must start at -200% for left-to-right motion');
  assert.ok(css.includes('background-position: 200% 0;'), 'shimmer must end at 200% for left-to-right motion');

  // 2. Completed actions enforce clean text only without box backgrounds or borders
  assert.ok(css.includes('.hitl-completed-task'), '.hitl-completed-task selector must be present');
  assert.ok(css.includes('background: transparent !important;'), 'completed tasks must have transparent background');
  assert.ok(css.includes('border: none !important;'), 'completed tasks must have no border');
});

test('Minimal User Input Card and Singleton Deduplication Gate', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync('apps/extension/src/sidepanel/sidepanel.css', 'utf-8');
  const js = fs.readFileSync('apps/extension/src/sidepanel/sidepanel.js', 'utf-8');

  // 1. CSS styling: Minimal matte dark card without heavy left accent border
  const inputCardCss = css.slice(css.indexOf('.hitl-input-card'), css.indexOf('.hitl-input-card') + 400);
  assert.ok(!inputCardCss.includes('border-left'), 'Input card must not have heavy left accent border');
  assert.ok(css.includes('.hitl-input-card'), 'Must define .hitl-input-card');
  assert.ok(css.includes('.btn-hitl-submit-action'), 'Must define .btn-hitl-submit-action for minimal submit button');
  assert.ok(css.includes('.hitl-input-prompt'), 'Must define .hitl-input-prompt for clean natural prompt text');

  // 2. JS: Singleton deduplication to prevent double input cards
  assert.ok(js.includes('data-input-nonce'), 'Must tag input card with data-input-nonce for singleton verification');
  assert.ok(js.includes('existingInBubble'), 'Must check existingInBubble before creating card');
  assert.ok(js.includes('#btnRejectInputForm'), 'Must provide Reject button');
  assert.ok(js.includes('#btnSubmitInputForm'), 'Must provide Submit button');
  assert.ok(js.includes('CANCEL_RUN'), 'Must send CANCEL_RUN on reject');
});




