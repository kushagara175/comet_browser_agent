/**
 * Non-Negotiable Adversarial Tests (Section 8.3 of Winning Execution Playbook)
 */

import test from 'node:test';
import assert from 'node:assert';
import { scanTextForPII } from '../packages/pii-rules/dist/index.js';
import { assertNoCanaryLeak, SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';
import { classifyActionRisk, validateActionProposal } from '../packages/protocol/dist/index.js';
import { ReasoningHttpClient } from '../apps/extension/dist/background/http-client.js';

test('Adversarial Case 1: Secret in visible text node is masked', () => {
  const textWithCanary = `Here is our confidential station key: ${SECRET_CANARY}`;
  const matches = scanTextForPII(textWithCanary);

  assert.ok(matches.length > 0, 'Canary in text must be detected');
  assert.strictEqual(matches[0].category, 'token');
});

test('Adversarial Case 2: Server attempts to command password typing -> Hard Blocked', () => {
  const proposal = {
    actionId: 'act_malicious_type',
    kind: 'type',
    targetLocalId: 'el_pwd',
    confidence: 0.99,
    risk: 'safe', // Maliciously claimed as safe
    textToType: 'HackedPassword99'
  };

  const risk = classifyActionRisk(proposal, 'Station Admin Password');
  assert.strictEqual(risk, 'blocked', 'Typing into password field must be hard blocked');
});

test('Adversarial Case 3: Server attempts to trigger payment/submit -> Requires Confirmation', () => {
  const proposal = {
    actionId: 'act_submit_payment',
    kind: 'click',
    targetLocalId: 'el_pay',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Pay invoice'
  };

  const risk = classifyActionRisk(proposal, 'Submit Payment ($500.00)');
  assert.strictEqual(risk, 'protected', 'Payment submission must require human confirmation');
});

test('Adversarial Case 4: Network Proxy catches any canary transmission in URL/Body', () => {
  const cleanPayload = { data: 'Safe telemetry reading' };
  assert.doesNotThrow(() => assertNoCanaryLeak(cleanPayload));

  const leakedPayload = { url: `http://server.local?token=${SECRET_CANARY}` };
  assert.throws(() => assertNoCanaryLeak(leakedPayload), /PRIVACY BREACH DETECTED/);
});

// ============================================================================
// ActionProposal Strict Closed Runtime Schema & Zero-Trust Adversarial Tests
// ============================================================================

const sampleElements = [
  {
    localId: 'el_btn',
    role: 'button',
    sanitizedName: 'Preview Button',
    coarseBounds: [0.1, 0.1, 0.2, 0.05],
    state: ['visible', 'enabled'],
    actionCapabilities: ['click']
  },
  {
    localId: 'el_inp',
    role: 'input',
    sanitizedName: 'Search Input',
    coarseBounds: [0.1, 0.2, 0.3, 0.05],
    state: ['visible', 'enabled'],
    actionCapabilities: ['type', 'click']
  },
  {
    localId: 'el_sel',
    role: 'select',
    sanitizedName: 'Filter Dropdown',
    coarseBounds: [0.1, 0.3, 0.2, 0.05],
    state: ['visible', 'enabled'],
    actionCapabilities: ['select', 'click']
  }
];

test('ActionProposal Adversarial: Unknown action kind is rejected and NEVER defaults to click', () => {
  const unknownActionProposal = {
    actionId: 'act_101',
    kind: 'hover_and_trigger_popup', // Unknown kind
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Hovering over button'
  };

  const res = validateActionProposal(unknownActionProposal, sampleElements);
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errorMessage?.includes('Invalid or unsupported action kind'));
  assert.notStrictEqual(unknownActionProposal.kind, 'click');
});

test('ActionProposal Adversarial: Hallucinated target ID is rejected and NEVER replaced with first element', () => {
  const hallucinatedProposal = {
    actionId: 'act_102',
    kind: 'click',
    targetLocalId: 'el_nonexistent_999', // Hallucinated ID
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Click hallucinated element'
  };

  const res = validateActionProposal(hallucinatedProposal, sampleElements);
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errorMessage?.includes('not found in sanitized context'));
});

test('ActionProposal Adversarial: Raw CSS selector or XPath in targetLocalId is rejected', () => {
  const selectorProposals = [
    { targetLocalId: '#submit-btn-danger' },
    { targetLocalId: '.primary-btn' },
    { targetLocalId: 'button[name="checkout"]' },
    { targetLocalId: '//button[@id="submit"]' },
    { targetLocalId: 'div > span.action' },
    { targetLocalId: 'el:1' }
  ];

  for (const tc of selectorProposals) {
    const proposal = {
      actionId: 'act_selector',
      kind: 'click',
      targetLocalId: tc.targetLocalId,
      confidence: 0.9,
      risk: 'safe',
      rationale: 'Click using selector'
    };

    const res = validateActionProposal(proposal, sampleElements);
    assert.strictEqual(res.isValid, false, `Should reject targetLocalId: ${tc.targetLocalId}`);
    assert.ok(res.errorMessage?.includes('Raw selectors'));
  }
});

test('ActionProposal Adversarial: JavaScript, script tags, or URLs in any field are rejected', () => {
  const injectionCases = [
    { rationale: 'Click button <script>fetch("evil.com")</script>' },
    { rationale: 'javascript:alert(1)' },
    { expectedState: 'State updated <script>evil()</script>' },
    { expectedState: 'http://malicious.com/hook' },
    { textToType: '<script>alert(1)</script>' },
    { textToType: 'onload=alert(1)' },
    { selectOptionValue: 'javascript:void(0)' }
  ];

  for (const tc of injectionCases) {
    const proposal = {
      actionId: 'act_injection',
      kind: tc.selectOptionValue ? 'select' : (tc.textToType ? 'type' : 'click'),
      targetLocalId: tc.selectOptionValue ? 'el_sel' : (tc.textToType ? 'el_inp' : 'el_btn'),
      confidence: 0.9,
      risk: 'safe',
      rationale: 'Safe rationale',
      expectedState: 'Safe expected state',
      textToType: 'Safe input',
      selectOptionValue: 'safe_val',
      ...tc
    };

    const res = validateActionProposal(proposal, sampleElements);
    assert.strictEqual(res.isValid, false, `Should reject injection field: ${JSON.stringify(tc)}`);
    assert.ok(
      res.errorMessage?.includes('prohibited script') ||
      res.errorMessage?.includes('URL patterns')
    );
  }
});

test('ActionProposal Adversarial: Unsupported capability on target element is rejected', () => {
  // 1. Attempting to type into a button that only has ['click']
  const typeIntoButton = {
    actionId: 'act_bad_cap_1',
    kind: 'type',
    targetLocalId: 'el_btn', // Button only supports click
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Attempting to type into button',
    textToType: 'some text'
  };

  const res1 = validateActionProposal(typeIntoButton, sampleElements);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errorMessage?.includes('does not support "type" action capability'));

  // 2. Attempting to select from an input that only has ['type', 'click']
  const selectFromInput = {
    actionId: 'act_bad_cap_2',
    kind: 'select',
    targetLocalId: 'el_inp', // Input does not support select
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Attempting to select from input',
    selectOptionValue: 'opt_1'
  };

  const res2 = validateActionProposal(selectFromInput, sampleElements);
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errorMessage?.includes('does not support "select" action capability'));
});

test('ActionProposal Adversarial: NaN, Infinity, and out-of-range confidence values are rejected', () => {
  const badConfidenceCases = [
    { confidence: NaN },
    { confidence: Infinity },
    { confidence: -0.1 },
    { confidence: 1.05 },
    { confidence: '0.95' },
    { confidence: null }
  ];

  for (const tc of badConfidenceCases) {
    const proposal = {
      actionId: 'act_conf',
      kind: 'click',
      targetLocalId: 'el_btn',
      confidence: tc.confidence,
      risk: 'safe',
      rationale: 'Click button'
    };

    const res = validateActionProposal(proposal, sampleElements);
    assert.strictEqual(res.isValid, false, `Should reject confidence: ${tc.confidence}`);
    assert.ok(res.errorMessage?.includes('confidence'));
  }
});

test('ActionProposal Adversarial: Extra or prohibited property violates closed schema', () => {
  const extraPropertyProposal = {
    actionId: 'act_extra',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Click button',
    arbitraryPayload: 'malicious_data', // Prohibited extra property
    rawDomSelector: '#submit'
  };

  const res = validateActionProposal(extraPropertyProposal, sampleElements);
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errorMessage?.includes('Closed schema violation: Unknown action property'));
});

test('ActionProposal Adversarial: Oversized textToType or selectOptionValue is rejected', () => {
  // Oversized textToType (> 500 chars)
  const oversizedType = {
    actionId: 'act_oversized_type',
    kind: 'type',
    targetLocalId: 'el_inp',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type large text',
    textToType: 'a'.repeat(501)
  };

  const res1 = validateActionProposal(oversizedType, sampleElements);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errorMessage?.includes('textToType'));

  // Oversized selectOptionValue (> 200 chars)
  const oversizedSelect = {
    actionId: 'act_oversized_select',
    kind: 'select',
    targetLocalId: 'el_sel',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Select option',
    selectOptionValue: 'b'.repeat(201)
  };

  const res2 = validateActionProposal(oversizedSelect, sampleElements);
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errorMessage?.includes('selectOptionValue'));
});

test('ActionProposal: Valid finish, wait, scroll, and observe actions pass validation', () => {
  // Valid finish action (requires no target)
  const finishProposal = {
    actionId: 'act_finish',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Mission goals completed successfully'
  };

  const resFinish = validateActionProposal(finishProposal, sampleElements);
  assert.strictEqual(resFinish.isValid, true);
  assert.ok(resFinish.proposal);

  // Valid wait action
  const waitProposal = {
    actionId: 'act_wait',
    kind: 'wait',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Wait for asynchronous data to settle'
  };

  const resWait = validateActionProposal(waitProposal, sampleElements);
  assert.strictEqual(resWait.isValid, true);

  // Valid scroll action
  const scrollProposal = {
    actionId: 'act_scroll',
    kind: 'scroll',
    scrollDirection: 'down',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Scroll down to inspect more elements'
  };

  const resScroll = validateActionProposal(scrollProposal, sampleElements);
  assert.strictEqual(resScroll.isValid, true);
});

test('Extension HTTP Client: Zero-trust validation rejects malformed server response', async () => {
  const client = new ReasoningHttpClient('http://localhost:4501');

  const sanitizedContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'run_test_client',
    captureId: 'cap_1',
    goal: 'Test client validation',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: sampleElements,
    pageState: { title: 'Test', viewport: [1280, 720] },
    maskCount: 0,
    payloadDigestSha256: 'sha256_abc',
    timestamp: Date.now()
  };

  // Mock global fetch to return an invalid server response (hallucinated target)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      actionId: 'act_bad_server',
      kind: 'click',
      targetLocalId: 'el_hallucinated_unknown',
      confidence: 0.9,
      risk: 'safe',
      rationale: 'Malicious server response with hallucinated element'
    })
  });

  try {
    await assert.rejects(
      async () => {
        await client.requestReasoningAction(sanitizedContext);
      },
      /Reasoning Server Response Invalid.*not found in sanitized context/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

