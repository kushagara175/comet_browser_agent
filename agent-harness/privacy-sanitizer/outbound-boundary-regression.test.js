/**
 * Outbound Privacy Boundary & URL Scrubber Regression Test Suite
 *
 * Verifies that:
 * 1. URL paths containing email addresses (plain & encoded) are redacted to [REDACTED_EMAIL].
 * 2. URL query parameters containing tokens, keys, credentials, and emails are redacted while safe params are preserved.
 * 3. Userinfo credentials (user:pass@) in URLs are stripped completely.
 * 4. Sensitive URL fragments (tokens, queries, emails) are redacted.
 * 5. Safe domain and navigation context (paths, safe query parameters) are preserved for tasks/playbooks.
 * 6. Optional text fields (history, customPrompt, postconditionSummary, observedOutcome, taskSpec) are scrubbed.
 * 7. The actual serialized outbound HTTP requests over the wire (/api/v1/reason, /api/v1/chat, /api/v1/agent/spec, /api/v1/agent/dispatch, /api/v1/search) never leak unredacted PII or tokens.
 * 8. The cloud model prompt produced by VlmReasoningEngine never leaks unredacted PII or tokens while preserving navigation grounding.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  sanitizeOutboundUrl,
  sanitizeUrlsInText,
  scrubOptionalText,
  scrubHistory,
  sanitizeOutboundPayload
} from '../../packages/pii-rules/dist/index.js';
import { ReasoningHttpClient } from '../../apps/extension/dist/background/http-client.js';
import { VlmReasoningEngine } from '../../apps/server/dist/engines/vlm-engine.js';

test('URL Sanitizer: Redacts email addresses embedded in URL paths', () => {
  // Plain email in path
  const url1 = 'https://portal.example.com/users/alice@example.com/profile';
  const sanitized1 = sanitizeOutboundUrl(url1);
  assert.strictEqual(sanitized1, 'https://portal.example.com/users/[REDACTED_EMAIL]/profile');
  assert.strictEqual(sanitized1.includes('alice@example.com'), false);

  // URL-encoded email in path
  const url2 = 'https://portal.example.com/accounts/bob%40company.org/settings';
  const sanitized2 = sanitizeOutboundUrl(url2);
  assert.strictEqual(sanitized2, 'https://portal.example.com/accounts/[REDACTED_EMAIL]/settings');
  assert.strictEqual(sanitized2.includes('bob'), false);

  // Deeply nested email in path
  const url3 = 'https://workspace.io/team/org_123/members/john.doe+filter@domain.co.uk/activity';
  const sanitized3 = sanitizeOutboundUrl(url3);
  assert.strictEqual(sanitized3.includes('john.doe'), false);
  assert.strictEqual(sanitized3.includes('[REDACTED_EMAIL]'), true);
});

test('URL Sanitizer: Redacts token-like query parameters and parameter values', () => {
  // Sensitive parameter names
  const url1 = 'https://api.service.com/v1/resource?token=secret12345678&apiKey=ghp_1234567890abcdef1234567890abcdef&page=2&sort=asc';
  const sanitized1 = sanitizeOutboundUrl(url1);
  assert.strictEqual(sanitized1.includes('secret12345678'), false);
  assert.strictEqual(sanitized1.includes('ghp_1234567890abcdef'), false);
  // Preserves safe query params
  assert.strictEqual(sanitized1.includes('page=2'), true);
  assert.strictEqual(sanitized1.includes('sort=asc'), true);
  assert.strictEqual(sanitized1.includes('token=[REDACTED_TOKEN]'), true);
  assert.strictEqual(sanitized1.includes('apiKey=[REDACTED_TOKEN]'), true);

  // Email in query parameter
  const url2 = 'https://auth.example.com/callback?email=user%40test.com&state=active';
  const sanitized2 = sanitizeOutboundUrl(url2);
  assert.strictEqual(sanitized2.includes('user@test.com'), false);
  assert.strictEqual(sanitized2.includes('user%40test.com'), false);
  assert.strictEqual(sanitized2.includes('email=[REDACTED_EMAIL]'), true);
  assert.strictEqual(sanitized2.includes('state=active'), true);

  // High entropy session token
  const url3 = 'https://app.com/dashboard?session=a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const sanitized3 = sanitizeOutboundUrl(url3);
  assert.strictEqual(sanitized3.includes('a1b2c3d4e5f60718293a4b5c6d7e8f90'), false);
  assert.strictEqual(sanitized3.includes('session=[REDACTED_TOKEN]'), true);
});

test('URL Sanitizer: Strips userinfo credentials and sanitizes fragments', () => {
  // Credentials in authority
  const url1 = 'https://admin_user:super_secret_password@internal.corp.net/tools';
  const sanitized1 = sanitizeOutboundUrl(url1);
  assert.strictEqual(sanitized1.includes('admin_user'), false);
  assert.strictEqual(sanitized1.includes('super_secret_password'), false);
  assert.strictEqual(sanitized1, 'https://internal.corp.net/tools');

  // Fragment containing OAuth token and user email
  const url2 = 'https://auth.service.com/redirect#access_token=eyJhbGciOiJIUzI1NiJ9.test&user=alice@example.com';
  const sanitized2 = sanitizeOutboundUrl(url2);
  assert.strictEqual(sanitized2.includes('eyJhbGciOiJIUzI1NiJ9'), false);
  assert.strictEqual(sanitized2.includes('alice@example.com'), false);
  assert.strictEqual(sanitized2.includes('#access_token=[REDACTED_TOKEN]&user=[REDACTED_EMAIL]'), true);

  // Route-like fragment with email
  const url3 = 'https://spa-app.com/#/profile/alice@example.com';
  const sanitized3 = sanitizeOutboundUrl(url3);
  assert.strictEqual(sanitized3.includes('alice@example.com'), false);
  assert.strictEqual(sanitized3, 'https://spa-app.com/#/profile/[REDACTED_EMAIL]');
});

test('URL Sanitizer: Preserves safe domain and navigation context for autonomous tasks', () => {
  // ISRO Spacecraft Missions route
  const url1 = 'https://www.isro.gov.in/SpacecraftMissions.html';
  assert.strictEqual(sanitizeOutboundUrl(url1), 'https://www.isro.gov.in/SpacecraftMissions.html');

  // Wikipedia article
  const url2 = 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope';
  assert.strictEqual(sanitizeOutboundUrl(url2), 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope');

  // X Bookmarks
  const url3 = 'https://x.com/i/bookmarks';
  assert.strictEqual(sanitizeOutboundUrl(url3), 'https://x.com/i/bookmarks');

  // Multi-segment public route with search term
  const url4 = 'https://example.com/missions/chandrayaan-3/overview?view=table&category=lunar';
  const sanitized4 = sanitizeOutboundUrl(url4);
  assert.strictEqual(sanitized4, 'https://example.com/missions/chandrayaan-3/overview?view=table&category=lunar');
});

test('Text Scrubber: Sanitizes URLs and tokens embedded in optional text fields', () => {
  const text = 'User visited https://portal.com/user/alice@domain.com/edit?token=sec_12345678 and authorization Bearer sk_live_abcdef1234567890.';
  const scrubbed = scrubOptionalText(text);

  assert.strictEqual(scrubbed.includes('alice@domain.com'), false);
  assert.strictEqual(scrubbed.includes('sec_12345678'), false);
  assert.strictEqual(scrubbed.includes('sk_live_abcdef1234567890'), false);
  assert.strictEqual(scrubbed.includes('[REDACTED_EMAIL]'), true);
  assert.strictEqual(scrubbed.includes('[REDACTED_TOKEN]'), true);
});

test('Wire Serialization: Verifies actual serialized HTTP request for /api/v1/reason', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = '';
  let interceptedInit = null;
  let interceptedBody = null;

  globalThis.fetch = async (url, init) => {
    interceptedUrl = String(url);
    interceptedInit = init;
    if (init && init.body) {
      interceptedBody = JSON.parse(String(init.body));
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        actionId: 'act_test_1',
        kind: 'click',
        targetLocalId: 'el_1',
        confidence: 0.95,
        risk: 'safe',
        rationale: 'Verified safe action'
      })
    };
  };

  try {
    const client = new ReasoningHttpClient('http://localhost:4501');

    const rawPayload = {
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_boundary_test_01',
      captureId: 'cap_01',
      goal: 'Navigate to user profile',
      sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      elements: [
        {
          localId: 'el_1',
          role: 'button',
          sanitizedName: 'View Profile',
          coarseBounds: [0.1, 0.1, 0.2, 0.05],
          state: ['visible', 'enabled'],
          actionCapabilities: ['click']
        }
      ],
      pageState: {
        title: 'User Management - alice@corp.net',
        viewport: [1280, 800],
        url: 'https://admin.portal.com/users/alice@corp.net/settings?token=secret_tok_99887766&apiKey=ghp_myPersonalSecretToken123456&role=admin',
        postconditionSummary: 'Navigated to https://admin.portal.com/users/alice@corp.net/settings?token=secret_tok_99887766 for user alice@corp.net',
        stateDelta: {
          previousAction: {
            kind: 'click',
            targetName: 'Edit alice@corp.net',
            targetLocalId: 'el_edit',
            textToType: 'update alice@corp.net',
            expectedState: 'Token sk_live_1234567890abcdef renewed'
          },
          urlChanged: true,
          previousUrl: 'https://admin.portal.com/login?redirect=/users/alice@corp.net',
          currentUrl: 'https://admin.portal.com/users/alice@corp.net/settings?token=secret_tok_99887766',
          elementsAddedCount: 3,
          elementsRemovedCount: 1,
          scrollDeltaY: 0,
          observedOutcome: 'Opened settings for alice@corp.net with session 9f8e7d6c5b4a3210fedcba98',
          verificationPassed: true
        }
      },
      maskCount: 2,
      payloadDigestSha256: 'sha256_mock_hash_for_test',
      timestamp: Date.now(),
      history: [
        { role: 'user', content: 'Open account for alice@corp.net at https://portal.com/users/alice@corp.net?token=topsecret' },
        { role: 'assistant', content: 'Opening settings at https://portal.com/users/alice@corp.net?token=topsecret' }
      ],
      customPrompt: 'Assistant operating for alice@corp.net with authorization Bearer secret_bearer_token_123456',
      observedOutcome: 'Verified profile for alice@corp.net',
      searchResults: [
        {
          title: 'Profile for alice@corp.net',
          url: 'https://search.com/profile/alice@corp.net?apiKey=secret_search_key_123',
          content: 'Details for alice@corp.net with token tok_search_secret_1234'
        }
      ]
    };

    const action = await client.requestReasoningAction(rawPayload);
    assert.strictEqual(action.kind, 'click');

    // VERIFY THE ACTUAL SERIALIZED WIRE REQUEST:
    assert.strictEqual(interceptedUrl, 'http://localhost:4501/api/v1/reason');
    assert.ok(interceptedBody, 'Outbound HTTP body must be present');

    const serializedWireString = JSON.stringify(interceptedBody);

    // 1. Prohibit raw unredacted emails anywhere on the wire
    assert.strictEqual(serializedWireString.includes('alice@corp.net'), false, 'Wire payload must NOT contain raw email alice@corp.net');

    // 2. Prohibit raw unredacted secret tokens anywhere on the wire
    assert.strictEqual(serializedWireString.includes('secret_tok_99887766'), false, 'Wire payload must NOT contain secret_tok_99887766');
    assert.strictEqual(serializedWireString.includes('ghp_myPersonalSecretToken123456'), false, 'Wire payload must NOT contain ghp token');
    assert.strictEqual(serializedWireString.includes('sk_live_1234567890abcdef'), false, 'Wire payload must NOT contain sk_live key');
    assert.strictEqual(serializedWireString.includes('secret_bearer_token_123456'), false, 'Wire payload must NOT contain Bearer token');
    assert.strictEqual(serializedWireString.includes('topsecret'), false, 'Wire payload must NOT contain query token topsecret');
    assert.strictEqual(serializedWireString.includes('9f8e7d6c5b4a3210fedcba98'), false, 'Wire payload must NOT contain session hex token');
    assert.strictEqual(serializedWireString.includes('secret_search_key_123'), false, 'Wire payload must NOT contain search api key');

    // 3. Verify safe domain and navigation context is preserved
    assert.strictEqual(interceptedBody.pageState.url.includes('https://admin.portal.com/users/[REDACTED_EMAIL]/settings'), true);
    assert.strictEqual(interceptedBody.pageState.url.includes('role=admin'), true, 'Safe query parameter role=admin must be preserved');
    assert.strictEqual(interceptedBody.pageState.url.includes('token=[REDACTED_TOKEN]'), true);
    assert.strictEqual(interceptedBody.pageState.stateDelta.currentUrl.includes('https://admin.portal.com/users/[REDACTED_EMAIL]/settings'), true);

    // 4. Verify optional text fields were sanitized
    assert.strictEqual(interceptedBody.pageState.postconditionSummary.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.pageState.stateDelta.observedOutcome.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.pageState.stateDelta.previousAction.targetName.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.customPrompt.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.customPrompt.includes('[REDACTED_TOKEN]'), true);
    assert.strictEqual(interceptedBody.history[0].content.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.searchResults[0].url.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.searchResults[0].url.includes('apiKey=[REDACTED_TOKEN]'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wire Serialization: Verifies actual serialized HTTP request for /api/v1/chat', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = '';
  let interceptedBody = null;

  globalThis.fetch = async (url, init) => {
    interceptedUrl = String(url);
    if (init && init.body) {
      interceptedBody = JSON.parse(String(init.body));
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        reply: 'Safe chat response',
        provider: 'mock',
        modelName: 'offline-reasoner',
        modelConnected: true
      })
    };
  };

  try {
    const client = new ReasoningHttpClient('http://localhost:4501');

    const sanitizedContext = {
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: 'run_chat_test_01',
      captureId: 'cap_chat_01',
      goal: 'Inquire about account',
      sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      elements: [
        {
          localId: 'el_1',
          role: 'heading',
          sanitizedName: 'Account Settings for [REDACTED_EMAIL]',
          coarseBounds: [0.1, 0.1, 0.8, 0.1],
          state: ['visible'],
          actionCapabilities: []
        }
      ],
      pageState: {
        title: 'Account - confidential@work.com',
        viewport: [1280, 800]
      },
      maskCount: 1,
      payloadDigestSha256: 'sha256_mock_hash_for_test',
      timestamp: Date.now()
    };

    const message = 'Can you help user alice@secret-org.com with token sk_live_9876543210fedcba at https://app.com/reset?token=tok_reset_12345?';
    const history = [
      { role: 'user', content: 'My email is bob@private.com and my api key is ghp_11223344556677889900' }
    ];
    const customPrompt = 'Strict agent for admin@company.com with key secret_token_xyz_9988';

    await client.requestChat(sanitizedContext, message, history, customPrompt);

    assert.strictEqual(interceptedUrl, 'http://localhost:4501/api/v1/chat');
    assert.ok(interceptedBody, 'Chat HTTP body must be present');

    const serializedChatString = JSON.stringify(interceptedBody);

    // Verify zero PII or token leakage in chat request
    assert.strictEqual(serializedChatString.includes('confidential@work.com'), false);
    assert.strictEqual(serializedChatString.includes('alice@secret-org.com'), false);
    assert.strictEqual(serializedChatString.includes('sk_live_9876543210fedcba'), false);
    assert.strictEqual(serializedChatString.includes('tok_reset_12345'), false);
    assert.strictEqual(serializedChatString.includes('bob@private.com'), false);
    assert.strictEqual(serializedChatString.includes('ghp_11223344556677889900'), false);
    assert.strictEqual(serializedChatString.includes('admin@company.com'), false);
    assert.strictEqual(serializedChatString.includes('secret_token_xyz_9988'), false);

    // Verify sanitized placeholders are present
    assert.strictEqual(interceptedBody.message.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.message.includes('[REDACTED_TOKEN]'), true);
    assert.strictEqual(interceptedBody.history[0].content.includes('[REDACTED_EMAIL]'), true);
    assert.strictEqual(interceptedBody.customPrompt.includes('[REDACTED_EMAIL]'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wire Serialization: Verifies actual serialized HTTP request for /api/v1/agent/spec and /dispatch', async () => {
  const originalFetch = globalThis.fetch;
  const interceptedCalls = [];

  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    const bodyObj = init?.body ? JSON.parse(String(init.body)) : null;
    interceptedCalls.push({ url: urlStr, body: bodyObj });

    if (urlStr.includes('/api/v1/agent/spec') || urlStr.includes('/api/v1/task-spec')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          goal: 'Clean goal',
          objectives: [],
          tasksToDo: [],
          tasksNotToDo: [],
          successCriteria: 'Done'
        })
      };
    }

    if (urlStr.includes('/api/v1/agent/dispatch')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({
          taskId: 'task_mock_1',
          status: 'completed',
          complianceAudit: {},
          startedAt: Date.now(),
          durationMs: 50
        })
      };
    }

    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    const client = new ReasoningHttpClient('http://localhost:4501');

    // 1. Task Spec Request
    await client.requestTaskSpecification(
      'Inspect account for alice@internal.com',
      'https://corp.com/users/alice@internal.com/edit?token=sec_spec_12345678',
      'Directive for alice@internal.com with token secret_spec_token_abc'
    );

    const specCall = interceptedCalls.find(c => c.url.includes('/api/v1/agent/spec') || c.url.includes('/api/v1/task-spec'));
    assert.ok(specCall, 'Spec endpoint was called');
    const specStr = JSON.stringify(specCall.body);
    assert.strictEqual(specStr.includes('alice@internal.com'), false);
    assert.strictEqual(specStr.includes('sec_spec_12345678'), false);
    assert.strictEqual(specStr.includes('secret_spec_token_abc'), false);
    assert.strictEqual(specCall.body.contextUrl.includes('https://corp.com/users/[REDACTED_EMAIL]/edit?token=[REDACTED_TOKEN]'), true);

    // 2. Dispatch Request
    await client.dispatchPlatformTask({
      protocolVersion: '1.0',
      goal: 'Compare prices for user bob@vendor.org with key secret_dispatch_key_99',
      contextUrl: 'https://shop.com/user/bob@vendor.org?session=abc1234567890abcdef1234'
    });

    const dispatchCall = interceptedCalls.find(c => c.url.includes('/api/v1/agent/dispatch'));
    assert.ok(dispatchCall, 'Dispatch endpoint was called');
    const dispatchStr = JSON.stringify(dispatchCall.body);
    assert.strictEqual(dispatchStr.includes('bob@vendor.org'), false);
    assert.strictEqual(dispatchStr.includes('secret_dispatch_key_99'), false);
    assert.strictEqual(dispatchStr.includes('abc1234567890abcdef1234'), false);
    assert.strictEqual(dispatchCall.body.contextUrl.includes('https://shop.com/user/[REDACTED_EMAIL]?session=[REDACTED_TOKEN]'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloud Model Prompt: VlmReasoningEngine.buildUserPrompt redacts URLs, tokens, and PII while preserving navigation grounding', async () => {
  const engine = new VlmReasoningEngine({
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-api-key',
    modelName: 'gpt-4o'
  });

  const payload = {
    protocolVersion: '1.0',
    runId: 'r_cloud_prompt_test',
    goal: 'Find lunar mission details for user alice@isro-portal.gov.in with auth token secret_tok_cloud_12345',
    screenshot: 'data:image/png;base64,iVBORw0KGgo...',
    elements: [
      {
        localId: 'el_1',
        role: 'link',
        sanitizedName: 'Spacecraft Missions',
        coarseBounds: [0.1, 0.2, 0.3, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'ISRO Official Portal - alice@isro-portal.gov.in',
      viewport: [1280, 800],
      domain: 'www.isro.gov.in',
      routeFingerprint: '/SpacecraftMissions.html',
      url: 'https://www.isro.gov.in/user/alice@isro-portal.gov.in/missions?token=secret_cloud_query_token_9999&category=lunar',
      postconditionSummary: 'Navigated from login for alice@isro-portal.gov.in with token secret_postcondition_tok_8888',
      stateDelta: {
        previousAction: {
          kind: 'type',
          targetName: 'Search input for alice@isro-portal.gov.in',
          targetLocalId: 'el_search',
          textToType: 'Chandrayaan-3 alice@isro-portal.gov.in',
          expectedState: 'Results with token secret_delta_state_7777'
        },
        urlChanged: true,
        previousUrl: 'https://www.isro.gov.in/login?email=alice@isro-portal.gov.in&token=secret_prev_url_tok',
        currentUrl: 'https://www.isro.gov.in/user/alice@isro-portal.gov.in/missions?token=secret_cloud_query_token_9999&category=lunar',
        elementsAddedCount: 10,
        elementsRemovedCount: 2,
        scrollDeltaY: 50,
        observedOutcome: 'Results loaded for alice@isro-portal.gov.in (Auth: Bearer secret_bearer_token_observed)',
        verificationPassed: true
      }
    },
    history: [
      { role: 'user', content: 'Lookup lunar payloads for alice@isro-portal.gov.in at https://isro.gov.in/account/alice@isro-portal.gov.in?key=secret_hist_key' },
      { role: 'assistant', content: 'Navigating for alice@isro-portal.gov.in' }
    ],
    customPrompt: 'Specialized ISRO navigator for alice@isro-portal.gov.in with secret key sk_live_999999999999999999',
    searchResults: [
      {
        title: 'Chandrayaan-3 Profile for alice@isro-portal.gov.in',
        url: 'https://isro.gov.in/missions/alice@isro-portal.gov.in?auth=secret_search_auth_tok',
        content: 'Official specifications for alice@isro-portal.gov.in with token secret_search_content_tok'
      }
    ]
  };

  // Inspect user prompt generated for cloud model
  const userPrompt = engine.buildUserPrompt(payload);

  // 1. Prohibit raw email anywhere in prompt
  assert.strictEqual(
    userPrompt.includes('alice@isro-portal.gov.in'),
    false,
    'Cloud model user prompt must NOT contain raw email alice@isro-portal.gov.in'
  );

  // 2. Prohibit raw secret tokens anywhere in prompt
  assert.strictEqual(userPrompt.includes('secret_tok_cloud_12345'), false);
  assert.strictEqual(userPrompt.includes('secret_cloud_query_token_9999'), false);
  assert.strictEqual(userPrompt.includes('secret_postcondition_tok_8888'), false);
  assert.strictEqual(userPrompt.includes('secret_delta_state_7777'), false);
  assert.strictEqual(userPrompt.includes('secret_prev_url_tok'), false);
  assert.strictEqual(userPrompt.includes('secret_bearer_token_observed'), false);
  assert.strictEqual(userPrompt.includes('secret_hist_key'), false);
  assert.strictEqual(userPrompt.includes('sk_live_999999999999999999'), false);
  assert.strictEqual(userPrompt.includes('secret_search_auth_tok'), false);
  assert.strictEqual(userPrompt.includes('secret_search_content_tok'), false);

  // 3. Verify safe domain and navigation context IS preserved
  assert.strictEqual(userPrompt.includes('[Domain: www.isro.gov.in]'), true, 'Safe domain must be preserved in prompt');
  assert.strictEqual(userPrompt.includes('[Route: /SpacecraftMissions.html]'), true, 'Safe route must be preserved in prompt');
  assert.strictEqual(
    userPrompt.includes('[URL: https://www.isro.gov.in/user/[REDACTED_EMAIL]/missions?token=[REDACTED_TOKEN]&category=lunar]'),
    true,
    'Sanitized URL with safe domain and safe category param must be present in prompt'
  );
  assert.strictEqual(
    userPrompt.includes('CHANGED from "https://www.isro.gov.in/login?email=[REDACTED_EMAIL]&token=[REDACTED_TOKEN]" to "https://www.isro.gov.in/user/[REDACTED_EMAIL]/missions?token=[REDACTED_TOKEN]&category=lunar"'),
    true,
    'State delta URL transition must be sanitized while preserving navigation diff'
  );

  // 4. Verify system prompt also redacts customPrompt
  const systemPrompt = engine.buildSystemPrompt(payload.customPrompt);
  assert.strictEqual(systemPrompt.includes('alice@isro-portal.gov.in'), false);
  assert.strictEqual(systemPrompt.includes('sk_live_999999999999999999'), false);
  assert.strictEqual(systemPrompt.includes('[REDACTED_EMAIL]'), true);
  assert.strictEqual(systemPrompt.includes('[REDACTED_TOKEN]'), true);
});
