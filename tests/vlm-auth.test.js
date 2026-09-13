import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderAuthHeaders, extractThinking, stripThinkingTags } from '../apps/server/dist/engines/vlm-engine.js';
import { validateActionProposal } from '../packages/protocol/dist/index.js';

test('VLM auth uses api-key for Azure OpenAI endpoints', () => {
  assert.deepEqual(
    buildProviderAuthHeaders(
      'https://example.openai.azure.com/openai/deployments/chat/chat/completions?api-version=2024-10-21',
      'secret'
    ),
    { 'api-key': 'secret' }
  );
});

test('VLM auth uses api-key for Azure AI Foundry endpoints', () => {
  assert.deepEqual(
    buildProviderAuthHeaders('https://example.services.ai.azure.com/models/chat/completions', 'secret'),
    { 'api-key': 'secret' }
  );
});

test('VLM auth preserves Bearer tokens for other OpenAI-compatible providers', () => {
  assert.deepEqual(
    buildProviderAuthHeaders('https://openrouter.ai/api/v1/chat/completions', 'secret'),
    { Authorization: 'Bearer secret' }
  );
});

test('VLM auth omits credentials when no API key is configured', () => {
  assert.deepEqual(buildProviderAuthHeaders('https://example.openai.azure.com/openai/deployments/chat', undefined), {});
});

test('extractThinking extracts thinking tokens from <think> and <thought> tags', () => {
  const modelOutputWithThink = '<think>I need to find the submit button and click it.</think>Click the submit button';
  assert.equal(extractThinking(modelOutputWithThink), 'I need to find the submit button and click it.');
  assert.equal(stripThinkingTags(modelOutputWithThink), 'Click the submit button');

  const modelOutputWithThought = '<thought>Navigating to profile tab.</thought>Here is the profile.';
  assert.equal(extractThinking(modelOutputWithThought), 'Navigating to profile tab.');
  assert.equal(stripThinkingTags(modelOutputWithThought), 'Here is the profile.');

  const plainOutput = 'Regular answer without thinking';
  assert.equal(extractThinking(plainOutput), '');
  assert.equal(stripThinkingTags(plainOutput), 'Regular answer without thinking');
});

test('validateActionProposal accepts valid reasoning property', () => {
  const proposal = {
    actionId: 'act_101',
    kind: 'click',
    targetLocalId: 'el_1',
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Clicking submit button to finalize submission',
    reasoning: 'First I analyzed the DOM landmarks, identified el_1 as the primary submit button, and confirmed no passwords were exposed.'
  };

  const validation = validateActionProposal(proposal);
  assert.equal(validation.isValid, true);
  assert.equal(validation.proposal?.reasoning, proposal.reasoning);
});

test('sanitizeProhibitedText replaces prohibited URL and script patterns safely', async () => {
  const { sanitizeProhibitedText } = await import('../apps/server/dist/engines/vlm-engine.js');
  const dirtyRationale = 'The user wants to navigate to https://typeform.com/to/xyz with <script>alert(1)</script> and javascript:void(0)';
  const clean = sanitizeProhibitedText(dirtyRationale);
  assert.equal(clean.includes('https://'), false);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('javascript:'), false);

  // When used in a proposal, validateActionProposal should succeed
  const proposal = {
    actionId: 'act_safe_1',
    kind: 'finish',
    confidence: 1.0,
    risk: 'safe',
    rationale: clean
  };
  const validation = validateActionProposal(proposal);
  assert.equal(validation.isValid, true);
});

