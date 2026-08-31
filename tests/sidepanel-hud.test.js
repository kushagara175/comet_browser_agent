import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  buildMinimizedWirePayload,
  computeMaskBreakdown,
  mapAgentStateToStatusInfo,
  mapVisionProviderToBadge
} from '../apps/extension/src/sidepanel/sidepanel.js';

test('HUD Security: escapeHtml neutralizes injection-shaped strings and scripts', () => {
  const injections = [
    { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;' },
    { input: '<img src=x onerror=alert(1)>', expected: '&lt;img src=x onerror=alert(1)&gt;' },
    { input: '"><svg onload=alert(document.domain)>', expected: '&quot;&gt;&lt;svg onload=alert(document.domain)&gt;' },
    { input: 'Click & Submit "Now" \'Fast\'', expected: 'Click &amp; Submit &quot;Now&quot; &#039;Fast&#039;' },
    { input: null, expected: '' },
    { input: undefined, expected: '' }
  ];

  for (const item of injections) {
    const escaped = escapeHtml(item.input);
    assert.equal(escaped, item.expected);
    assert.equal(escaped.includes('<script>'), false);
    assert.equal(escaped.includes('<img'), false);
  }
});

test('HUD Payload: buildMinimizedWirePayload excludes internal-only and sensitive data', () => {
  const mockSanitized = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'run_12345',
    captureId: 'cap_999',
    goal: 'Log into portal',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawScreenshotDataUrl: 'data:image/png;base64,SECRET_RAW_PIXELS',
    rawDomSummary: { sensitiveNodes: ['password123'] },
    elements: [
      {
        localId: 'el_1',
        role: 'input',
        sanitizedName: '[PASSWORD FIELD]',
        coarseBounds: [0.1, 0.2, 0.3, 0.05],
        state: ['enabled', 'visible'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'Sign In',
      viewport: [1280, 800]
    },
    maskCount: 2,
    payloadDigestSha256: 'sha256_abcdef123456'
  };

  const payload = buildMinimizedWirePayload(mockSanitized, 'Log into portal');

  // Verify outgoing fields are present
  assert.equal(payload.protocolVersion, '1.0');
  assert.equal(payload.runId, 'run_12345');
  assert.equal(payload.goal, 'Log into portal');
  assert.equal(payload.maskCount, 2);
  assert.equal(payload.elements.length, 1);
  assert.equal(payload.elements[0].localId, 'el_1');
  assert.equal(payload.elements[0].sanitizedName, '[PASSWORD FIELD]');

  // Verify internal-only fields are NOT present
  assert.equal('_brand' in payload, false, '_brand must not leak to network payload');
  assert.equal('rawScreenshotDataUrl' in payload, false, 'rawScreenshotDataUrl must not leak to network payload');
  assert.equal('rawDomSummary' in payload, false, 'rawDomSummary must not leak to network payload');
  assert.equal('captureId' in payload, false, 'internal captureId must not leak to network payload');

  const jsonStr = JSON.stringify(payload);
  assert.equal(jsonStr.includes('SECRET_RAW_PIXELS'), false);
  assert.equal(jsonStr.includes('password123'), false);
});

test('HUD Breakdown: computeMaskBreakdown aggregates categories without sensitive values', () => {
  const elements = [
    { sanitizedName: '[PASSWORD FIELD]', role: 'input' },
    { sanitizedName: '[EMAIL FIELD]', role: 'input' },
    { sanitizedName: '[PAYMENT FIELD]', role: 'input' },
    { sanitizedName: '[NATIONAL ID FIELD]', role: 'input' },
    { sanitizedName: '[TOKEN/KEY FIELD]', role: 'input' },
    { sanitizedName: 'Submit Button', role: 'button' }
  ];

  const breakdown = computeMaskBreakdown(elements, 7); // 5 elements + 2 faces = 7 total masks

  assert.equal(breakdown.password, 1);
  assert.equal(breakdown.email, 1);
  assert.equal(breakdown.payment, 1);
  assert.equal(breakdown.national_id, 1);
  assert.equal(breakdown.token, 1);
  assert.equal(breakdown.face, 2);

  // Total matches 7
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  assert.equal(total, 7);
});

test('HUD State Transitions: mapAgentStateToStatusInfo distinguishes all lifecycle phases', () => {
  const states = [
    { state: 'idle', label: 'IDLE', css: 'status-idle' },
    { state: 'capturing', label: 'PERCEIVING', css: 'status-running' },
    { state: 'detecting-sensitive-content', label: 'PERCEIVING', css: 'status-running' },
    { state: 'sanitizing', label: 'PERCEIVING', css: 'status-running' },
    { state: 'sending-sanitized-context', label: 'REASONING', css: 'status-running' },
    { state: 'awaiting-reasoning', label: 'REASONING', css: 'status-running' },
    { state: 'awaiting-user-confirmation', label: 'PENDING CONFIRMATION', css: 'status-protected' },
    { state: 'executing', label: 'EXECUTING', css: 'status-running' },
    { state: 'verifying', label: 'VERIFYING', css: 'status-running' },
    { state: 'complete', label: 'VERIFIED COMPLETE', css: 'status-verified' },
    { state: 'blocked-local-only', label: 'BLOCKED LOCALLY', css: 'status-blocked' },
    { state: 'failed-safe', label: 'FAILED', css: 'status-failed' }
  ];

  for (const { state, label, css } of states) {
    const info = mapAgentStateToStatusInfo(state);
    assert.equal(info.label, label, `State '${state}' should have label '${label}'`);
    assert.equal(info.cssClass, css, `State '${state}' should have CSS class '${css}'`);
  }
});

test('HUD Vision Provider: mapVisionProviderToBadge formats WebGPU, WASM, and degraded fallbacks', () => {
  assert.deepEqual(mapVisionProviderToBadge('webgpu'), { text: 'Vision: WebGPU', cssClass: 'provider-webgpu' });
  assert.deepEqual(mapVisionProviderToBadge('wasm'), { text: 'Vision: WASM', cssClass: 'provider-wasm' });
  assert.deepEqual(mapVisionProviderToBadge('degraded_masking'), { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' });
  assert.deepEqual(mapVisionProviderToBadge('heuristic_fallback'), { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' });
  assert.deepEqual(mapVisionProviderToBadge('unavailable'), { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' });
  assert.deepEqual(mapVisionProviderToBadge('unknown'), { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' });
});
