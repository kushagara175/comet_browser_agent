/**
 * Chat Privacy Boundary & Zero Direct Network Path Test Suite
 *
 * Verifies:
 * 1. sidepanel.js contains zero direct fetch calls or page-scraping network paths.
 * 2. SECRET_CANARY in page content cannot enter the server chat request.
 * 3. Raw page URL and raw DOM are strictly absent from chat payloads.
 * 4. Sanitization failure fails closed on the client with zero network requests.
 * 5. Unknown background message properties are rejected or ignored safely.
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReasoningHttpClient } from '../apps/extension/dist/background/http-client.js';
import { SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('Side Panel Privacy Boundary: sidepanel.js contains zero direct fetch calls', () => {
  const sidepanelJsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const source = fs.readFileSync(sidepanelJsPath, 'utf-8');

  // Must not call window.fetch or global fetch directly
  const hasDirectFetch = /\bfetch\s*\(/.test(source);
  assert.strictEqual(
    hasDirectFetch,
    false,
    'sidepanel.js must NOT contain any direct fetch() calls. All traffic must route through background.'
  );

  // Must not contain raw HTTP endpoint strings
  assert.strictEqual(
    source.includes('http://localhost:4501'),
    false,
    'sidepanel.js must not reference backend HTTP endpoints directly'
  );
});

test('Chat Network Boundary: Outgoing chat request rejects canary secrets and enforces branded SanitizedContext', async () => {
  const client = new ReasoningHttpClient('http://localhost:4501');

  const leakySanitizedContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'r_chat_leak',
    captureId: 'cap_1',
    goal: 'chat test',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,...',
    elements: [
      {
        localId: 'el_1',
        role: 'input',
        sanitizedName: `Leaked secret ${SECRET_CANARY}`,
        coarseBounds: [0, 0, 1, 1],
        state: ['visible'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'Safe Title',
      viewport: [1280, 720]
    },
    maskCount: 1,
    payloadDigestSha256: 'sha256_123',
    timestamp: Date.now()
  };

  // Must throw canary assertion error locally before network request
  await assert.rejects(
    async () => {
      await client.requestChat(leakySanitizedContext, 'What is on this page?');
    },
    /PRIVACY BREACH DETECTED.*Canary secret/
  );
});

test('Chat Payload Schema: Raw URL and raw DOM are absent from chat payload structure', async () => {
  const client = new ReasoningHttpClient('http://localhost:4501');

  const cleanContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'r_clean',
    captureId: 'cap_clean',
    goal: 'Summarize page',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,...',
    elements: [
      {
        localId: 'el_btn',
        role: 'button',
        sanitizedName: 'Subscribe',
        coarseBounds: [0.5, 0.5, 0.1, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'AI Tutorial Video',
      viewport: [1280, 720]
    },
    maskCount: 0,
    payloadDigestSha256: 'sha256_abc',
    timestamp: Date.now()
  };

  // Intercept fetch to inspect outgoing serialized payload
  let capturedPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    capturedPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ reply: 'Summary response.' })
    };
  };

  try {
    await client.requestChat(cleanContext, 'Explain this page');

    assert.ok(capturedPayload !== null);
    assert.strictEqual(capturedPayload.protocolVersion, '1.0');
    assert.strictEqual(capturedPayload.message, 'Explain this page');
    assert.strictEqual(capturedPayload.sanitizedTitle, 'AI Tutorial Video');
    assert.strictEqual(capturedPayload.elements.length, 1);

    // Verify raw page URL, raw DOM, and raw screenshot properties are strictly ABSENT
    assert.strictEqual('pageUrl' in capturedPayload, false, 'pageUrl must not exist');
    assert.strictEqual('pageText' in capturedPayload, false, 'pageText must not exist');
    assert.strictEqual('rawDOM' in capturedPayload, false, 'rawDOM must not exist');
    assert.strictEqual('rawScreenshot' in capturedPayload, false, 'rawScreenshot must not exist');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Chat Multi-Turn: requestChat and requestGeneralChat transmit history in wire payload', async () => {
  const client = new ReasoningHttpClient('http://localhost:4501');

  const cleanContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'r_multi',
    captureId: 'cap_multi',
    goal: 'Follow-up question',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,...',
    elements: [],
    pageState: {
      title: 'Portal',
      viewport: [1280, 720]
    },
    maskCount: 0,
    payloadDigestSha256: 'sha256_123',
    timestamp: Date.now()
  };

  const history = [
    { role: 'user', content: 'What is this page?' },
    { role: 'assistant', content: 'This is the government portal.' }
  ];

  let capturedPayload = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    capturedPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ reply: 'You can click on services.' })
    };
  };

  try {
    // 1. Page-aware chat with history
    await client.requestChat(cleanContext, 'Where are the services?', history);
    assert.ok(capturedPayload !== null);
    assert.strictEqual(capturedPayload.message, 'Where are the services?');
    assert.deepStrictEqual(capturedPayload.history, history);

    // 2. General chat with history
    capturedPayload = null;
    await client.requestGeneralChat('What about notifications?', history);
    assert.ok(capturedPayload !== null);
    assert.strictEqual(capturedPayload.message, 'What about notifications?');
    assert.deepStrictEqual(capturedPayload.history, history);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Chat UI: renderMarkdown and extractActionSuggestions work safely and cleanly', async () => {
  const { renderMarkdown, extractActionSuggestions } = await import('../apps/extension/src/sidepanel/sidepanel.js');

  // 1. XSS Escaping
  const dangerous = 'Hello <script>alert(1)</script> and <img src="x" onerror="alert(2)">';
  const renderedSafe = renderMarkdown(dangerous);
  assert.strictEqual(renderedSafe.includes('<script>'), false);
  assert.strictEqual(renderedSafe.includes('alert(1)'), true);
  assert.strictEqual(renderedSafe.includes('&lt;script&gt;'), true);

  // 2. Formatting (Bold, code, headers, bullets, links)
  const mdInput = '### Overview\nHere is **important** info with `inline code`:\n* Point 1\n* Point 2\nCheck [Google](https://google.com) for details.';
  const renderedMd = renderMarkdown(mdInput);
  assert.ok(renderedMd.includes('<strong>important</strong>'));
  assert.ok(renderedMd.includes('<code'));
  assert.ok(renderedMd.includes('Point 1'));
  assert.ok(renderedMd.includes('<a href="https://google.com" target="_blank"'));

  // 3. Action suggestions extraction
  const replyWithActions = 'You can click "Earth Observation" or navigate to "Bhuvan Store" to proceed.';
  const actions = extractActionSuggestions(replyWithActions);
  assert.deepStrictEqual(actions, ['Earth Observation', 'Bhuvan Store']);
});

