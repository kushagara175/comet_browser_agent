/**
 * Server Closed Request Schema Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';

test('Server Payload Validator - Accepts Valid Sanitized Closed Payload', () => {
  const validPayload = {
    protocolVersion: '1.0',
    runId: 'run_valid_123',
    goal: 'Open safe preview for pending order',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      { localId: 'el_1', role: 'button', sanitizedName: 'Open Safe Preview', coarseBounds: [0.1, 0.2, 0.3, 0.05], state: ['visible'], actionCapabilities: ['click'] }
    ],
    pageState: { title: 'Apex Mission Portal', viewport: [1280, 720] }
  };

  const res = validateSanitizedPayload(validPayload);
  assert.strictEqual(res.isValid, true);
  assert.ok(res.payload);
});

test('Server Payload Validator - Rejects Unknown Properties (Closed Schema Violation)', () => {
  const invalidPayload = {
    protocolVersion: '1.0',
    runId: 'run_123',
    goal: 'Test',
    screenshot: 'data:image/png;base64,xyz',
    elements: [],
    pageState: { title: 'Test', viewport: [100, 100] },
    rawDomHtml: '<p>Secret DOM Data</p>' // Prohibited property
  };

  const res = validateSanitizedPayload(invalidPayload);
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errorMessage?.includes('Closed schema violation'));
});

test('Server Payload Validator - Rejects Raw CSS Selectors in LocalId', () => {
  const selectorPayload = {
    protocolVersion: '1.0',
    runId: 'run_123',
    goal: 'Test',
    screenshot: 'data:image/png;base64,xyz',
    elements: [
      { localId: '#submit-btn-danger', role: 'button', sanitizedName: 'Submit', coarseBounds: [0, 0, 0, 0], state: [], actionCapabilities: [] }
    ],
    pageState: { title: 'Test', viewport: [100, 100] }
  };

  const res = validateSanitizedPayload(selectorPayload);
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errorMessage?.includes('Raw selectors prohibited'));
});
