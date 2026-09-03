import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderAuthHeaders } from '../apps/server/dist/engines/vlm-engine.js';

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
