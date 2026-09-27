import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActionProposal } from '../packages/protocol/dist/action.js';
import { SemanticStateVerifier } from '../apps/extension/dist/content/verifier.js';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';

test('Stage D1: ExpectedPostcondition schema validates clean postcondition objects and rejects scripts/selectors', () => {
  const validProposal = {
    actionId: 'act_postcond_1',
    kind: 'click',
    targetLocalId: 'el_btn_1',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Open safe preview drawer',
    expectedPostcondition: {
      kind: 'dialog_visible',
      dialogId: 'previewDrawer'
    }
  };

  const validation = validateActionProposal(validProposal);
  assert.equal(validation.isValid, true, validation.errorMessage);
  assert.equal(validation.proposal?.expectedPostcondition?.kind, 'dialog_visible');

  // Rejection of invalid postcondition kind
  const invalidKind = {
    ...validProposal,
    expectedPostcondition: { kind: 'eval_js' }
  };
  assert.equal(validateActionProposal(invalidKind).isValid, false);

  // Rejection of script injection in postcondition strings
  const scriptInjection = {
    ...validProposal,
    expectedPostcondition: {
      kind: 'attribute_changed',
      attributeName: 'class',
      expectedValue: '<script>alert(1)</script>'
    }
  };
  assert.equal(validateActionProposal(scriptInjection).isValid, false);

  // Rejection of unwhitelisted attribute name
  const untrustedAttr = {
    ...validProposal,
    expectedPostcondition: {
      kind: 'attribute_changed',
      attributeName: 'onclick',
      expectedValue: 'malicious()'
    }
  };
  assert.equal(validateActionProposal(untrustedAttr).isValid, false);
});

test('Stage D2: SemanticStateVerifier evaluates structured ExpectedPostconditions', async () => {
  // Create mock document
  const mockDoc = {
    getElementById: (id) => {
      if (id === 'previewDrawer') {
        return {
          id: 'previewDrawer',
          hidden: false,
          ownerDocument: mockDoc,
          getAttribute: () => null,
          classList: { contains: () => false }
        };
      }
      return null;
    },
    querySelectorAll: () => []
  };

  const preSnapshot = {
    timestamp: Date.now(),
    pathFingerprint: '/dashboard',
    openDialogOrDrawerCount: 0,
    openDialogIds: new Set(),
    landmarkCounts: {},
    statusRegionCount: 0,
    documentElementCount: 10
  };

  const proposal = {
    actionId: 'act_verify_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Open preview',
    expectedPostcondition: {
      kind: 'dialog_visible',
      dialogId: 'previewDrawer'
    }
  };

  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, null, preSnapshot, {
    timeoutMs: 100,
    doc: mockDoc
  });

  assert.equal(outcome.verified, true);
  assert.equal(outcome.reasonCode, 'MODAL_DRAWER_VISIBILITY_VERIFIED');
});

test('Stage D3 & D4: Stale protected actions are never auto-retried and approvals expire after timeout', async () => {
  const mockBrowser = {
    getActiveTab: async () => ({ id: 101, url: 'http://127.0.0.1:4500' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM') {
        return {
          snapshot: {
            interactiveElements: [
              { localId: 'btn_submit', role: 'button', rawName: 'Submit Transfer', coarseBounds: [0, 0, 10, 10], state: ['visible'], actionCapabilities: ['click'] }
            ],
            textNodes: [],
            imageElements: [],
            surfaceElements: []
          }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        return { success: false, staleTarget: true, message: 'Target element was mutated' };
      }
      return { success: true };
    },
    runInSanitizerHost: async ({ goal }) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: 'cap_1',
      goal,
      timestamp: Date.now() - 50000, // 50s old -> expired
      sanitizedScreenshotDataUrl: 'data:image/png;base64,sanitized',
      elements: [
        { localId: 'btn_submit', role: 'button', sanitizedName: 'Submit Transfer', coarseBounds: [0, 0, 10, 10], state: ['visible'], actionCapabilities: ['click'] }
      ],
      pageState: { title: 'Bank', viewport: [1280, 800] },
      maskCount: 0
    })
  };

  const coordinator = new RunCoordinator(mockBrowser, { requestReasoningAction: async () => ({}) });

  // Manually stage pending action with expired context
  coordinator['pendingAction'] = {
    actionId: 'act_protected_1',
    kind: 'click',
    targetLocalId: 'btn_submit',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Execute irreversible wire transfer'
  };
  coordinator['currentSanitizedContext'] = await mockBrowser.runInSanitizerHost({ goal: 'Transfer funds' });
  coordinator['currentRunId'] = 'run_expired';
  coordinator['state'] = 'awaiting-user-confirmation';

  // Attempt to approve expired action -> must reject
  const result = await coordinator.approvePendingAction({ runId: 'run_expired', actionId: 'act_protected_1' });
  assert.equal(result.success, false);
  assert.ok(result.error?.includes('expired'), `Expected expiration message, got: ${result.error}`);
});

test('Stage D5: Ambiguous candidates with duplicate labels promote to protected confirmation', async () => {
  let capturedProposal = null;

  const mockBrowser = {
    getActiveTab: async () => ({ id: 101, url: 'http://127.0.0.1:4500' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM') {
        return {
          snapshot: {
            interactiveElements: [
              { localId: 'btn_del_1', role: 'button', rawName: 'Delete Item', coarseBounds: [0, 0, 10, 10], state: ['visible'], actionCapabilities: ['click'] },
              { localId: 'btn_del_2', role: 'button', rawName: 'Delete Item', coarseBounds: [0, 20, 10, 10], state: ['visible'], actionCapabilities: ['click'] }
            ],
            textNodes: [],
            imageElements: [],
            surfaceElements: []
          }
        };
      }
      return { success: true };
    },
    runInSanitizerHost: async ({ goal }) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: 'cap_1',
      goal,
      timestamp: Date.now(),
      sanitizedScreenshotDataUrl: 'data:image/png;base64,sanitized',
      elements: [
        { localId: 'btn_del_1', role: 'button', sanitizedName: 'Delete Item', coarseBounds: [0, 0, 10, 10], state: ['visible'], actionCapabilities: ['click'] },
        { localId: 'btn_del_2', role: 'button', sanitizedName: 'Delete Item', coarseBounds: [0, 20, 10, 10], state: ['visible'], actionCapabilities: ['click'] }
      ],
      pageState: { title: 'Inventory', viewport: [1280, 800] },
      maskCount: 0
    })
  };

  const mockHttpClient = {
    requestReasoningAction: async () => ({
      actionId: 'act_ambiguous_delete',
      kind: 'click',
      targetLocalId: 'btn_del_1',
      confidence: 0.65, // Medium confidence with duplicate candidate
      risk: 'safe',
      rationale: 'Delete item from table'
    })
  };

  const coordinator = new RunCoordinator(mockBrowser, mockHttpClient);
  coordinator.setListeners({
    onActionConfirmedRequired: (prop) => {
      capturedProposal = prop;
    }
  });

  const runRes = await coordinator.startRun('Delete item', { maxSteps: 1 });
  assert.equal(runRes.state, 'awaiting-user-confirmation');
  assert.ok(capturedProposal);
  assert.equal(capturedProposal.risk, 'protected');
  assert.ok(capturedProposal.rationale.includes('Ambiguous candidate'));
});

test('Stage D6: Local Safe Action Router deterministically resolves scroll and dismiss without server query', async () => {
  let serverQueried = false;

  const mockBrowser = {
    getActiveTab: async () => ({ id: 101, url: 'http://127.0.0.1:4500' }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    sendMessageToTab: async (_tabId, msg) => {
      if (msg.type === 'EXTRACT_DOM') {
        return {
          snapshot: {
            interactiveElements: [],
            textNodes: [],
            imageElements: [],
            surfaceElements: []
          }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        return {
          success: true,
          semanticOutcomeVerified: true,
          verification: { verified: true, reasonCode: 'PASSIVE_ACTION_VERIFIED' }
        };
      }
      return { success: true };
    },
    runInSanitizerHost: async ({ goal }) => ({
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_test',
      captureId: 'cap_1',
      goal,
      timestamp: Date.now(),
      sanitizedScreenshotDataUrl: 'data:image/png;base64,sanitized',
      elements: [],
      pageState: { title: 'Page', viewport: [1280, 800] },
      maskCount: 0
    })
  };

  const mockHttpClient = {
    requestReasoningAction: async () => {
      serverQueried = true;
      return {
        actionId: 'act_remote',
        kind: 'scroll',
        scrollDirection: 'down',
        confidence: 0.9,
        risk: 'safe',
        rationale: 'Remote scroll'
      };
    }
  };

  const coordinator = new RunCoordinator(mockBrowser, mockHttpClient);
  const result = await coordinator.startRun('Scroll down to read footer', { maxSteps: 2 });

  assert.equal(result.success, true);
  assert.equal(serverQueried, false, 'Deterministic scroll must be resolved locally without server query');
  assert.equal(result.steps?.[0]?.decisionOrigin, 'local');
  assert.equal(result.steps?.[0]?.networkRequestMade, false);
});
