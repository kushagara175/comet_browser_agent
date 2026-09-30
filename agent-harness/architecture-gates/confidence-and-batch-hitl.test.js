/**
 * Architecture Gate Test: Confidence Reasoning & Batch HITL Safety
 *
 * Verifies:
 * 1. Batch actions with protected sub-actions (e.g. click Submit) pause and transition
 *    to 'awaiting-user-confirmation' instead of blindly auto-executing.
 * 2. Active actions with confidence below autonomous threshold (0.85) elevate to
 *    'protected' risk and pause for HITL confirmation.
 * 3. Actions with ultra-low confidence (< 0.30) safely fail closed.
 * 4. System prompt mandates confidence evaluation in the thinking monologue.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { RunCoordinator } from '../../apps/extension/dist/background/coordinator.js';
import { VlmReasoningEngine } from '../../apps/server/dist/engines/vlm-engine.js';

function createMockBrowser(options = {}) {
  const messagesSent = [];
  return {
    messagesSent,
    getActiveTab: async (preferredTabId) => ({
      id: preferredTabId || 101,
      url: options.tabUrl || 'https://www.isro.gov.in/registration',
      title: 'ISRO Registration',
      status: 'complete'
    }),
    getStrictTab: async (tabId) => ({
      id: tabId,
      url: options.tabUrl || 'https://www.isro.gov.in/registration',
      title: 'ISRO Registration',
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
              { id: 'el_1', descriptor: { tagName: 'input', type: 'text', name: 'fullname', sanitizedName: 'Full Name' } },
              { id: 'el_2', descriptor: { tagName: 'input', type: 'email', name: 'email', sanitizedName: 'Email' } },
              { id: 'el_3', descriptor: { tagName: 'button', type: 'submit', name: 'submit', sanitizedName: 'Submit Registration' } }
            ],
            interactiveElements: [
              { localId: 'el_1', role: 'input', rawName: 'Full Name' },
              { localId: 'el_2', role: 'input', rawName: 'Email' },
              { localId: 'el_3', role: 'button', rawName: 'Submit Registration' }
            ],
            elements: [
              { localId: 'el_1', role: 'input', sanitizedName: 'Full Name', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
              { localId: 'el_2', role: 'input', sanitizedName: 'Email', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
              { localId: 'el_3', role: 'button', sanitizedName: 'Submit Registration', state: ['visible', 'enabled'], actionCapabilities: ['click'] }
            ],
            url: options.tabUrl || 'https://www.isro.gov.in/registration'
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
        { localId: 'el_1', role: 'input', sanitizedName: 'Full Name', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
        { localId: 'el_2', role: 'input', sanitizedName: 'Email', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
        { localId: 'el_3', role: 'button', sanitizedName: 'Submit Registration', state: ['visible', 'enabled'], actionCapabilities: ['click'] }
      ],
      pageState: { title: 'ISRO Registration', url: options.tabUrl || 'https://www.isro.gov.in/registration' },
      maskCount: 0,
      payloadDigestSha256: 'mock_digest',
      timestamp: Date.now()
    }),
    waitForTabReady: async (tabId) => ({ id: tabId }),
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
        successCriteria: 'Form submitted'
      };
    },
    async requestReasoningAction() {
      return proposal;
    }
  };
}

test('Batch HITL Gate: Form batch pauses before Submit button for user confirmation', async () => {
  const browser = createMockBrowser();
  let confirmationRequiredFired = false;
  let confirmedProposal = null;

  const mockHttp = createMockHttpClient({
    actionId: 'act_batch_1',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Fill registration form and submit',
    batchActions: [
      { actionId: 'act_type_name', kind: 'type', targetLocalId: 'el_1', textToType: 'Alice' },
      { actionId: 'act_click_submit', kind: 'click', targetLocalId: 'el_3', rationale: 'Submit registration' }
    ]
  });

  const coordinator = new RunCoordinator(browser, mockHttp);

  coordinator.setListeners({
    onActionConfirmedRequired: (proposal) => {
      confirmationRequiredFired = true;
      confirmedProposal = proposal;
    }
  });

  const result = await coordinator.startRun('Fill registration form and submit', { tabId: 101, maxSteps: 2 });
  const executeMessages = browser.messagesSent.filter(m => m.msg.type === 'EXECUTE_ACTION');
  assert.equal(executeMessages.length, 1, 'Only the safe type action should have been executed');
  assert.equal(executeMessages[0].msg.proposal.targetLocalId, 'el_1');

  // 2. Batch must pause before clicking Submit
  assert.equal(result.state, 'awaiting-user-confirmation', 'Coordinator must transition to awaiting-user-confirmation');
  assert.equal(confirmationRequiredFired, true, 'onActionConfirmedRequired listener must be triggered');
  assert.equal(confirmedProposal.targetLocalId, 'el_3', 'Protected action must target submit button');
  assert.equal(confirmedProposal.risk, 'protected');
  assert.equal(confirmedProposal.userApproved, false);
});

test('Confidence HITL Gate: Action with confidence 0.72 elevates to protected risk', async () => {
  const browser = createMockBrowser();
  let confirmationRequiredFired = false;
  let confirmedProposal = null;

  const mockHttp = createMockHttpClient({
    actionId: 'act_click_ambiguous',
    kind: 'click',
    targetLocalId: 'el_3',
    confidence: 0.72,
    risk: 'safe',
    rationale: 'Click candidate element'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);

  coordinator.setListeners({
    onActionConfirmedRequired: (proposal) => {
      confirmationRequiredFired = true;
      confirmedProposal = proposal;
    }
  });

  const result = await coordinator.startRun('Click Submit Registration', { tabId: 101, maxSteps: 2 });

  assert.equal(result.state, 'awaiting-user-confirmation');
  assert.equal(confirmationRequiredFired, true);
  assert.equal(confirmedProposal.risk, 'protected');
  assert.ok(confirmedProposal.rationale.includes('below autonomous threshold'), 'Rationale explains confidence threshold check');
});

test('Confidence HITL Gate: Ultra-low confidence (< 0.30) safely fails closed', async () => {
  const browser = createMockBrowser();

  const mockHttp = createMockHttpClient({
    actionId: 'act_click_uncertain',
    kind: 'click',
    targetLocalId: 'el_3',
    confidence: 0.20,
    risk: 'safe',
    rationale: 'Wild guess click'
  });

  const coordinator = new RunCoordinator(browser, mockHttp);

  const result = await coordinator.startRun('Click something', { tabId: 101, maxSteps: 2 });

  assert.equal(result.state, 'failed-safe');
  assert.ok(result.error.includes('below minimal execution threshold'), 'Rejects with minimal threshold error');
});

test('Confidence Monologue: Rule 10 mandates confidence reasoning inside thinking monologue', () => {
  const engine = new VlmReasoningEngine({ provider: 'mock' });
  const prompt = engine.buildSystemPrompt();

  assert.ok(
    prompt.includes('CONFIDENCE REASONING') || prompt.includes('confidence score'),
    'Prompt must contain confidence reasoning directive'
  );
  assert.ok(
    prompt.includes('<think>'),
    'Prompt must mention thinking monologue tags'
  );
});

test('Unified Thinking: collectAllStepReasoning unifies thoughts without Step N: divisions', async () => {
  const { collectAllStepReasoning } = await import('../../apps/extension/src/sidepanel/sidepanel.js');

  const mockRes = {
    steps: [
      { step: 1, proposal: { rationale: 'Observed the registration form and input fields for user details.' } },
      { step: 2, proposal: { rationale: 'The form is fully filled and ready for submission.' } },
      { step: 3, proposal: { rationale: 'Awaiting user confirmation before clicking Submit.' } }
    ]
  };

  const unified = collectAllStepReasoning(mockRes);

  assert.doesNotMatch(unified, /Step \d+:/i, 'Thinking must not contain "Step N:" division prefixes');
  assert.ok(unified.includes('Observed the registration form'));
  assert.ok(unified.includes('Awaiting user confirmation'));
});

test('Approved Form Submission: approvePendingAction completes task without re-looping', async () => {
  const browser = createMockBrowser();
  let loopCallCount = 0;

  const mockHttp = createMockHttpClient({
    actionId: 'act_click_submit',
    kind: 'click',
    targetLocalId: 'el_3',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Submitting registration form',
    userApproved: false
  });

  const coordinator = new RunCoordinator(browser, mockHttp);
  const result = await coordinator.startRun('Fill and submit registration form', { tabId: 101, maxSteps: 5 });

  assert.equal(result.state, 'awaiting-user-confirmation');

  const approvalResult = await coordinator.approvePendingAction({
    runId: result.runId,
    actionId: result.proposal.actionId,
    resumeLoop: true
  });

  assert.equal(approvalResult.success, true);
  assert.equal(approvalResult.state, 'complete', 'Must transition to complete instead of re-looping');
  assert.match(approvalResult.message, /Form submitted successfully/i);
});

