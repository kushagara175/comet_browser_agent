/**
 * Server Strict Privacy Boundary & Validation Test Suite
 *
 * Tests:
 * 1. Canary in every allowed string field
 * 2. Unknown root property in chat payload
 * 3. Unknown nested element property in chat & reasoning payloads
 * 4. pageUrl rejection
 * 5. raw pageText rejection
 * 6. oversized body (413 Payload Too Large)
 * 7. invalid screenshot format
 * 8. too many elements (> 100 in chat, > 200 in reason)
 * 9. malformed bounds
 * 10. valid minimized chat request
 */

import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { validateSanitizedPayload, validateSanitizedChatPayload } from '../apps/server/dist/schemas/payload-validator.js';
import { CanaryScannerProxy } from '../apps/server/dist/proxy/canary-scanner.js';
import { createServer } from '../apps/server/dist/index.js';
import { SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';

test('Canary Scanner - Catches canary in every allowed string field', () => {
  // 1. Canary in chat message
  const chatMsgCanary = { protocolVersion: '1.0', message: `Hello ${SECRET_CANARY}` };
  assert.strictEqual(CanaryScannerProxy.inspect(chatMsgCanary, '/api/v1/chat').passed, false);

  // 2. Canary in chat sanitizedTitle
  const chatTitleCanary = { protocolVersion: '1.0', message: 'Hi', sanitizedTitle: `Title with ${SECRET_CANARY}` };
  assert.strictEqual(CanaryScannerProxy.inspect(chatTitleCanary, '/api/v1/chat').passed, false);

  // 3. Canary in chat element sanitizedName
  const chatElCanary = {
    protocolVersion: '1.0',
    message: 'Hi',
    elements: [{ localId: 'el_1', role: 'button', sanitizedName: `Button ${SECRET_CANARY}` }]
  };
  assert.strictEqual(CanaryScannerProxy.inspect(chatElCanary, '/api/v1/chat').passed, false);

  // 4. Canary in reasoning goal
  const reasonGoalCanary = {
    protocolVersion: '1.0',
    runId: 'r1',
    goal: `Goal with ${SECRET_CANARY}`,
    screenshot: 'data:image/png;base64,iVBORw==',
    elements: [],
    pageState: { title: 'Safe', viewport: [1280, 720] }
  };
  assert.strictEqual(CanaryScannerProxy.inspect(reasonGoalCanary, '/api/v1/reason').passed, false);

  // 5. Canary in reasoning pageState title
  const reasonTitleCanary = {
    protocolVersion: '1.0',
    runId: 'r1',
    goal: 'Safe goal',
    screenshot: 'data:image/png;base64,iVBORw==',
    elements: [],
    pageState: { title: `Leaked ${SECRET_CANARY}`, viewport: [1280, 720] }
  };
  assert.strictEqual(CanaryScannerProxy.inspect(reasonTitleCanary, '/api/v1/reason').passed, false);
});

test('Chat Payload Validator - Rejects unknown root property, pageUrl, and raw pageText', () => {
  // 1. Unknown root property
  const unknownProp = { protocolVersion: '1.0', message: 'test', cookies: 'session_token=123' };
  const res1 = validateSanitizedChatPayload(unknownProp);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errorMessage?.includes('Closed schema violation'));

  // 2. pageUrl rejection
  const pageUrlProp = { protocolVersion: '1.0', message: 'test', pageUrl: 'https://bank.example.com/account' };
  const res2 = validateSanitizedChatPayload(pageUrlProp);
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errorMessage?.includes('Closed schema violation'));

  // 3. raw pageText rejection
  const pageTextProp = { protocolVersion: '1.0', message: 'test', pageText: 'Raw sensitive DOM text content' };
  const res3 = validateSanitizedChatPayload(pageTextProp);
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errorMessage?.includes('Closed schema violation'));
});

test('Chat & Reasoning Payload Validators - Reject unknown nested element properties', () => {
  // Chat nested element violation
  const chatNestedInvalid = {
    protocolVersion: '1.0',
    message: 'Hello',
    elements: [
      {
        localId: 'el_1',
        role: 'button',
        sanitizedName: 'Click Me',
        rawDomAttributes: { type: 'submit' } // Forbidden nested property
      }
    ]
  };
  const chatRes = validateSanitizedChatPayload(chatNestedInvalid);
  assert.strictEqual(chatRes.isValid, false);
  assert.ok(chatRes.errorMessage?.includes('Closed schema violation: Unknown nested element property'));

  // Reasoning nested element violation
  const reasonNestedInvalid = {
    protocolVersion: '1.0',
    runId: 'r1',
    goal: 'Click',
    screenshot: 'data:image/png;base64,iVBORw==',
    elements: [
      {
        localId: 'el_1',
        role: 'input',
        sanitizedName: 'Username',
        rawInputValue: 'super_secret' // Forbidden nested property
      }
    ],
    pageState: { title: 'Login', viewport: [1000, 800] }
  };
  const reasonRes = validateSanitizedPayload(reasonNestedInvalid);
  assert.strictEqual(reasonRes.isValid, false);
  assert.ok(reasonRes.errorMessage?.includes('Closed schema violation: Unknown nested element property'));
});

test('Payload Validators - Reject invalid screenshots, element counts, and malformed bounds', () => {
  // Invalid screenshot format (not data URL)
  const badScreenshot = {
    protocolVersion: '1.0',
    runId: 'r1',
    goal: 'Goal',
    screenshot: 'http://evil.com/leak.png',
    elements: [],
    pageState: { title: 'Test', viewport: [800, 600] }
  };
  const res1 = validateSanitizedPayload(badScreenshot);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.errorMessage?.includes('valid base64 data URL'));

  // Too many elements in chat (> 100)
  const tooManyElementsChat = {
    protocolVersion: '1.0',
    message: 'Analyze',
    elements: Array.from({ length: 101 }, (_, i) => ({
      localId: `el_${i}`,
      role: 'generic'
    }))
  };
  const res2 = validateSanitizedChatPayload(tooManyElementsChat);
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.errorMessage?.includes('exceeds maximum allowed count'));

  // Malformed coarseBounds (out of 0..1 range)
  const badBounds = {
    protocolVersion: '1.0',
    message: 'Analyze',
    elements: [
      {
        localId: 'el_1',
        role: 'button',
        coarseBounds: [1.5, 0, 0.2, 0.1] // 1.5 is > 1
      }
    ]
  };
  const res3 = validateSanitizedChatPayload(badBounds);
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.errorMessage?.includes('between 0 and 1'));
});

test('Server HTTP Integration - Valid Minimized Request & 413 Oversized Body Handling', async () => {
  const server = createServer();
  const testPort = 4599;

  await new Promise((resolve) => server.listen(testPort, resolve));

  try {
    // 1. Valid Minimized Chat Request -> 200 OK
    const validChatBody = JSON.stringify({
      protocolVersion: '1.0',
      message: 'What actions can I take here?',
      sanitizedTitle: 'Dashboard - Overview',
      maskCount: 2,
      elements: [
        { localId: 'el_1', role: 'button', sanitizedName: 'Export Report', coarseBounds: [0.1, 0.1, 0.2, 0.05] }
      ]
    });

    const res1 = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: testPort,
          path: '/api/v1/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.write(validChatBody);
      req.end();
    });

    assert.strictEqual(res1.status, 200);
    assert.ok(res1.body.reply);

    // 2. Oversized Chat Request (> 512KB) -> 413 Payload Too Large
    const largeMessage = 'x'.repeat(600 * 1024);
    const oversizedBody = JSON.stringify({
      protocolVersion: '1.0',
      message: largeMessage
    });

    const res2 = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: testPort,
          path: '/api/v1/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
        }
      );
      req.on('error', reject);
      req.write(oversizedBody);
      req.end();
    });

    assert.strictEqual(res2.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
