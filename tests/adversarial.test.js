/**
 * Non-Negotiable Adversarial Tests (Section 8.3 of Winning Execution Playbook)
 */

import test from 'node:test';
import assert from 'node:assert';
import { scanTextForPII } from '../packages/pii-rules/dist/index.js';
import { assertNoCanaryLeak, SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';
import { classifyActionRisk } from '../packages/protocol/dist/index.js';

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
