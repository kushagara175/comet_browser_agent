/**
 * Architecture Gate 1: Strict Tab Lease & Credential Safety Test Suite
 *
 * Verifies that:
 * 1. Active Tab Switch: If input was requested on Tab A (e.g. login form), and user
 *    submits with Tab B active (e.g. chrome://newtab), credentials are NEVER sent to Tab B.
 * 2. Closed Tab: If Tab A was closed while waiting for input, strict lookup returns TAB_CLOSED;
 *    it NEVER silently falls back to whichever tab is now active.
 * 3. One-Time Nonce & Replay Prevention: Resumed input must match the exact one-time inputNonce.
 *    Replayed or mismatched nonces are rejected before any tab interaction.
 * 4. Origin Change: If Tab A navigated to a different origin while input was pending,
 *    submission is rejected with ORIGIN_CHANGED.
 * 5. Pending State Preservation: Bridge or transient communication errors do not prematurely
 *    destroy the pendingInputRequest, allowing safe retry.
 *
 * Execution target: < 100ms total runtime, 0 external network calls.
 */

import test from 'node:test';
import assert from 'node:assert';
import { RunCoordinator } from '../../apps/extension/dist/background/coordinator.js';

function createMockBrowserAdapter(options = {}) {
  const tabs = new Map([
    [101, { id: 101, url: 'https://auth.isro.gov.in/login', title: 'ISRO Auth Portal', windowId: 1, status: 'complete' }],
    [202, { id: 202, url: 'chrome://newtab', title: 'New Tab', windowId: 1, status: 'complete' }],
    ...(options.initialTabs ? options.initialTabs.map(t => [t.id, t]) : [])
  ]);

  let activeTabId = options.initialActiveTabId ?? 101;
  const sentMessages = [];

  return {
    sentMessages,
    setActiveTabId(id) {
      activeTabId = id;
    },
    closeTab(id) {
      tabs.delete(id);
    },
    setTabUrl(id, url) {
      const tab = tabs.get(id);
      if (tab) tab.url = url;
    },
    async getActiveTab(preferredTabId) {
      if (preferredTabId && tabs.has(preferredTabId)) {
        return tabs.get(preferredTabId);
      }
      return tabs.get(activeTabId) || { id: 0, url: '', title: '', status: 'complete' };
    },
    async getStrictTab(tabId) {
      if (!tabs.has(tabId)) {
        return null;
      }
      return tabs.get(tabId);
    },
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async sendMessageToTab(tabId, message) {
      sentMessages.push({ tabId, message });
      if (options.failSendMessage) {
        throw new Error(options.failSendMessage);
      }
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: message.captureId || 'cap_1',
          snapshot: {
            elements: [
              { localId: 'el_user', role: 'input', sanitizedName: 'Username', state: ['visible', 'enabled'], actionCapabilities: ['type'] },
              { localId: 'el_pass', role: 'input', sanitizedName: 'Password', state: ['visible', 'enabled'], actionCapabilities: ['type'] }
            ],
            url: tabs.get(tabId)?.url || ''
          },
          viewport: { viewportWidth: 1280, viewportHeight: 720 }
        };
      }
      if (message.type === 'EXECUTE_ACTION') {
        return {
          success: true,
          actionId: message.proposal.actionId,
          semanticOutcomeVerified: true,
          message: `Executed ${message.proposal.kind}`
        };
      }
      return { success: true };
    },
    async sendMessageToRuntime() {
      return { success: true };
    },
    async getStorage() {
      return null;
    },
    async setStorage() {},
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: req.runId || 'run_mock',
        captureId: req.captureId || 'cap_mock',
        goal: 'Mock goal',
        sanitizedScreenshotDataUrl: req.rawScreenshotDataUrl,
        elements: req.domSnapshot?.elements || [],
        pageState: { title: 'Mock Page', url: req.domSnapshot?.url || '' },
        maskCount: 0,
        payloadDigestSha256: 'mock_digest',
        timestamp: Date.now()
      };
    }
  };
}

function createMockHttpClient() {
  return {
    async requestReasoningAction() {
      return {
        actionId: 'act_mock_1',
        kind: 'type',
        targetLocalId: 'el_user',
        confidence: 0.9,
        risk: 'safe',
        rationale: 'Mock proposal'
      };
    },
    async requestTaskSpecification(goal) {
      return {
        goal,
        objectives: [],
        tasksToDo: [],
        tasksNotToDo: [],
        successCriteria: 'Done'
      };
    },
    async requestChat() {
      return { reply: 'Mock reply', provider: 'mock', modelName: 'mock' };
    },
    async requestGeneralChat() {
      return { reply: 'Mock general reply', provider: 'mock', modelName: 'mock' };
    },
    async searchWeb() {
      return { success: true, results: [] };
    }
  };
}

test('Gate 1.1: Active Tab Switch: Rejects credential write to a different tab and preserves pending state', async () => {
  const browser = createMockBrowserAdapter();
  const httpClient = createMockHttpClient();
  const coordinator = new RunCoordinator(browser, httpClient);

  let capturedInputRequest = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      capturedInputRequest = req;
    }
  });

  // Start run on Tab 101 with a task contract that requires credentials
  const startResult = await coordinator.startRun(
    'fill login for me',
    { tabId: 101 }
  );

  assert.strictEqual(startResult.state, 'awaiting-user-confirmation');
  assert.ok(capturedInputRequest, 'onUserInputRequired should have fired');
  assert.ok(capturedInputRequest.inputNonce, 'inputRequest MUST contain a secure inputNonce');
  assert.strictEqual(capturedInputRequest.leasedTabId, 101, 'inputRequest MUST bind to leasedTabId 101');

  // SIMULATE TAB SWITCH: User switches to Tab 202 (chrome://newtab)
  browser.setActiveTabId(202);

  // Sidepanel attempts to submit user input passing Tab 202 (active tab)
  const submitResult = await coordinator.submitUserInput(
    { username: 'testuser', password: 'secretpassword123' },
    202, // Wrong tab!
    {
      runId: startResult.runId,
      inputNonce: capturedInputRequest.inputNonce
    }
  );

  // 1. Submit must fail safely
  assert.strictEqual(submitResult.success, false, 'Must NOT succeed on wrong tab');
  assert.strictEqual(submitResult.state, 'failed-safe');
  assert.strictEqual(submitResult.reasonCode, 'TAB_SWITCHED');

  // 2. Zero messages (snapshots, keystrokes, actions) must have been sent to Tab 202
  const messagesToTab202 = browser.sentMessages.filter(m => m.tabId === 202);
  assert.strictEqual(messagesToTab202.length, 0, 'ZERO messages must be sent to Tab 202');

  // 3. Coordinator currentTabId must NOT be changed to Tab 202
  assert.strictEqual(coordinator.currentTabId, 101, 'currentTabId must remain bound to leased tab 101');

  // 4. Pending request must be preserved so user can switch back to Tab 101 and retry
  assert.ok(coordinator.pendingInputRequest, 'pendingInputRequest must NOT be destroyed on tab switch rejection');
});

test('Gate 1.2: Closed Tab: Returns typed TAB_CLOSED instead of falling back to active tab', async () => {
  const browser = createMockBrowserAdapter();
  const httpClient = createMockHttpClient();
  const coordinator = new RunCoordinator(browser, httpClient);

  let capturedInputRequest = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      capturedInputRequest = req;
    }
  });

  const startResult = await coordinator.startRun(
    'fill login for me',
    { tabId: 101 }
  );

  assert.ok(capturedInputRequest);

  // Tab 101 is closed while user is looking at the prompt
  browser.closeTab(101);
  browser.setActiveTabId(202); // Tab 202 is now active in browser

  const submitResult = await coordinator.submitUserInput(
    { username: 'testuser', password: 'secretpassword123' },
    101,
    {
      runId: startResult.runId,
      inputNonce: capturedInputRequest.inputNonce
    }
  );

  // Must fail with TAB_CLOSED, NEVER fallback to active Tab 202
  assert.strictEqual(submitResult.success, false);
  assert.strictEqual(submitResult.reasonCode, 'TAB_CLOSED');

  const messagesToTab202 = browser.sentMessages.filter(m => m.tabId === 202);
  assert.strictEqual(messagesToTab202.length, 0, 'Must NOT write to active fallback tab when target tab was closed');
});

test('Gate 1.3: Nonce Protection: Rejects replay or forged nonce without tab interaction', async () => {
  const browser = createMockBrowserAdapter();
  const httpClient = createMockHttpClient();
  const coordinator = new RunCoordinator(browser, httpClient);

  let capturedInputRequest = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      capturedInputRequest = req;
    }
  });

  const startResult = await coordinator.startRun(
    'fill login for me',
    { tabId: 101 }
  );

  assert.ok(capturedInputRequest);

  const messagesBeforeSubmit = browser.sentMessages.length;

  // Attempt submit with wrong / forged nonce
  const submitResult = await coordinator.submitUserInput(
    { username: 'testuser', password: 'secretpassword123' },
    101,
    {
      runId: startResult.runId,
      inputNonce: 'forged_or_replayed_nonce_999'
    }
  );

  assert.strictEqual(submitResult.success, false);
  assert.strictEqual(submitResult.reasonCode, 'NONCE_MISMATCH');
  assert.strictEqual(browser.sentMessages.length, messagesBeforeSubmit, 'Zero messages must be sent during submit when nonce does not match');
});

test('Gate 1.4: Origin Change Protection: Rejects submission if tab navigated to different origin', async () => {
  const browser = createMockBrowserAdapter();
  const httpClient = createMockHttpClient();
  const coordinator = new RunCoordinator(browser, httpClient);

  let capturedInputRequest = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      capturedInputRequest = req;
    }
  });

  const startResult = await coordinator.startRun(
    'fill login for me',
    { tabId: 101 }
  );

  assert.ok(capturedInputRequest);

  // Tab 101 navigates to an untrusted external origin while input was pending
  browser.setTabUrl(101, 'https://attacker.evil.com/phish');

  const submitResult = await coordinator.submitUserInput(
    { username: 'testuser', password: 'secretpassword123' },
    101,
    {
      runId: startResult.runId,
      inputNonce: capturedInputRequest.inputNonce
    }
  );

  assert.strictEqual(submitResult.success, false);
  assert.strictEqual(submitResult.reasonCode, 'ORIGIN_CHANGED');
  // Verify no password was filled
  const executeMessages = browser.sentMessages.filter(m => m.message.type === 'EXECUTE_ACTION');
  assert.strictEqual(executeMessages.length, 0, 'Credentials must NOT be typed into navigated origin');
});

test('Gate 1.5: Bridge Error Preserves Pending Request for Safe Retry', async () => {
  const browser = createMockBrowserAdapter({ failSendMessage: 'Tab temporarily busy / bridge timeout' });
  const httpClient = createMockHttpClient();
  const coordinator = new RunCoordinator(browser, httpClient);

  let capturedInputRequest = null;
  coordinator.setListeners({
    onUserInputRequired: (req) => {
      capturedInputRequest = req;
    }
  });

  const startResult = await coordinator.startRun(
    'fill login for me',
    { tabId: 101 }
  );

  assert.ok(capturedInputRequest);

  const submitResult = await coordinator.submitUserInput(
    { username: 'testuser', password: 'secretpassword123' },
    101,
    {
      runId: startResult.runId,
      inputNonce: capturedInputRequest.inputNonce
    }
  );

  assert.strictEqual(submitResult.success, false);
  // Key invariant: On bridge error, pendingInputRequest must NOT be discarded/nulled out
  assert.ok(coordinator.pendingInputRequest, 'pendingInputRequest must survive transient bridge error for retry');
  assert.strictEqual(coordinator.pendingInputRequest.inputNonce, capturedInputRequest.inputNonce);
});
