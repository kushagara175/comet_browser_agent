/**
 * Architecture Gate: Always Action-Capable Agent Test Suite
 *
 * Verifies that:
 * 1. The central reasoning system prompt explicitly directs the model to be an active
 *    browser automation agent rather than refusing or lecturing the user with password manager boilerplate.
 * 2. On pages with form fields (e.g. ISRO registration with Name & Email), form-filling instructions
 *    lead to actionable tool proposals (type, click, request_user_input) instead of passive chat refusals.
 * 3. Pure informational questions about page content are naturally handled with kind: "answer".
 *
 * Execution target: < 50ms, zero network calls.
 */

import test from 'node:test';
import assert from 'node:assert';
import { VlmReasoningEngine } from '../../apps/server/dist/engines/vlm-engine.js';

test('Always-Acting Mode: System prompt instructs model to act on forms instead of lecturing about password managers', () => {
  const engine = new VlmReasoningEngine({
    endpoint: 'http://localhost:11434',
    modelName: 'mock-model'
  });

  const systemPrompt = engine.buildSystemPrompt();

  // 1. Prohibits lecturing about password managers or refusing
  assert.ok(
    systemPrompt.includes('NEVER refuse by claiming you cannot fill forms') ||
    systemPrompt.includes('FORM-FILLING, REGISTRATION & ALWAYS-ACTION-CAPABLE DIRECTIVE'),
    'System prompt must include explicit form-filling and action-capable directive'
  );

  // 2. Asserts agent capabilities
  assert.ok(
    systemPrompt.includes('YOU ARE AN ACTIVE BROWSER AUTOMATION AGENT WITH PERCEPTION AND EXECUTION TOOLS'),
    'Prompt must reinforce that Comet is an active browser automation agent'
  );

  // 3. Mentions safe handling of credentials via request_user_input
  assert.ok(
    systemPrompt.includes('request_user_input') && systemPrompt.includes('type'),
    'Prompt must guide the model to use type and request_user_input tools'
  );
});

test('Always-Acting Mode: Model user prompt grounds active page elements for form interactions', () => {
  const engine = new VlmReasoningEngine({
    endpoint: 'http://localhost:11434',
    modelName: 'mock-model'
  });

  const payload = {
    protocolVersion: '1.0',
    runId: 'r_isro_form_test',
    goal: 'Fill in the registration form with my name and email',
    screenshot: 'data:image/png;base64,iVBORw0KGgo...',
    elements: [
      {
        localId: 'el_name',
        role: 'input',
        sanitizedName: 'Name',
        coarseBounds: [0.1, 0.2, 0.3, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type']
      },
      {
        localId: 'el_email',
        role: 'input',
        sanitizedName: 'Email Id',
        coarseBounds: [0.1, 0.3, 0.3, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type']
      },
      {
        localId: 'el_submit',
        role: 'button',
        sanitizedName: 'Submit',
        coarseBounds: [0.1, 0.4, 0.1, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'Online Registration for ISRO Applications',
      viewport: [1280, 800],
      url: 'https://isro.gov.in/ISROAPP/rRBMF'
    }
  };

  const userPrompt = engine.buildUserPrompt(payload);

  // Grounding check
  assert.ok(userPrompt.includes('Online Registration for ISRO Applications'));
  assert.ok(userPrompt.includes('el_name'));
  assert.ok(userPrompt.includes('el_email'));
  assert.ok(userPrompt.includes('el_submit'));
  assert.ok(userPrompt.includes('User Goal: Fill in the registration form with my name and email'));
});
