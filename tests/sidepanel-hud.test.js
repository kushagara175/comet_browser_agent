import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  buildMinimizedWirePayload,
  computeMaskBreakdown,
  mapAgentStateToStatusInfo,
  mapVisionProviderToBadge,
  isBrowserActionRequest
} from '../apps/extension/src/sidepanel/sidepanel.js';
import {
  toSanitizedNetworkPayload,
  isPureNavigationGoal,
  stripNavigationPrefixFromGoal
} from '../packages/protocol/dist/index.js';

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

test('HUD Routing: natural imperative requests enter the browser agent loop', () => {
  const actionRequests = [
    'Please scroll down',
    'fill the search field with telemetry',
    'Please click the Continue button',
    'Can you fill this input with launch data?',
    'Could you please select Pending?',
    'I want you to open the preview',
    'Go ahead and press Submit',
    'Hey PrivaPilot, please scroll down',
    'open gmail.com',
    'and click in the snoozed',
    'then click compose',
    'now scroll down',
    'also click submit',
    'and then type hello',
    'open gmail.com and click in the snoozed',
    'help me in chekinup my bookmarks',
    'check my bookmarks'
  ];

  for (const request of actionRequests) {
    assert.equal(isBrowserActionRequest(request), true, `Expected action routing for: ${request}`);
  }

  const chatRequests = [
    'Why is the sky blue?',
    'Can you explain this page?',
    'What would you do here?',
    'Tell me how to fill this form'
  ];

  for (const request of chatRequests) {
    assert.equal(isBrowserActionRequest(request), false, `Expected chat routing for: ${request}`);
  }
});

test('Navigation Contract: isPureNavigationGoal differentiates pure navigation from compound directives', () => {
  assert.equal(isPureNavigationGoal('open gmail.com'), true);
  assert.equal(isPureNavigationGoal('go to isro.gov.in'), true);
  assert.equal(isPureNavigationGoal('https://sih.gov.in'), true);
  assert.equal(isPureNavigationGoal('open https://www.google.com'), true);
  assert.equal(isPureNavigationGoal('please open youtube'), true);

  // Compound goals are not pure navigation
  assert.equal(isPureNavigationGoal('open gmail.com and click in the snoozed'), false);
  assert.equal(isPureNavigationGoal('go to sih.gov.in and search isro'), false);
  assert.equal(isPureNavigationGoal('open github.com then click repositories'), false);
  assert.equal(isPureNavigationGoal('open isro and download the brochure for Yuvika programme'), false);

  // In-page interactions are not pure navigation
  assert.equal(isPureNavigationGoal('and click in the snoozed'), false);
  assert.equal(isPureNavigationGoal('navigate to SIH26003'), false);
  assert.equal(isPureNavigationGoal('scroll down'), false);

  // Subgoal extraction
  assert.equal(stripNavigationPrefixFromGoal('open gmail.com and click in the snoozed'), 'click in the snoozed');
  assert.equal(stripNavigationPrefixFromGoal('go to sih.gov.in and search isro'), 'search isro');
  assert.equal(stripNavigationPrefixFromGoal('open github.com then click repositories'), 'click repositories');
  assert.equal(stripNavigationPrefixFromGoal('open gmail.com'), 'open gmail.com');
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
  assert.ok(payload.screenshot.includes('Screenshot base64 omitted from display'), 'Screenshot bytes omitted for display');
  assert.equal('maskCount' in payload, false, 'maskCount must not be in wire payload projection');
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
  assert.deepEqual(mapVisionProviderToBadge('qwen_live'), { text: 'Vision: Qwen (Live)', cssClass: 'provider-qwen-live' });
  assert.deepEqual(mapVisionProviderToBadge('vlm-cloud'), { text: 'Vision: Qwen (Live)', cssClass: 'provider-qwen-live' });
  assert.deepEqual(mapVisionProviderToBadge('lm-studio'), { text: 'Vision: Qwen (Live)', cssClass: 'provider-qwen-live' });
  assert.deepEqual(mapVisionProviderToBadge('mock'), { text: 'Vision: Offline Reasoner', cssClass: 'provider-text-only' });
  assert.deepEqual(mapVisionProviderToBadge('offline-reasoner'), { text: 'Vision: Offline Reasoner', cssClass: 'provider-text-only' });
  assert.deepEqual(mapVisionProviderToBadge('text_only'), { text: 'Vision: Text-Only', cssClass: 'provider-text-only' });
  assert.deepEqual(mapVisionProviderToBadge('degraded_masking'), { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' });
  assert.deepEqual(mapVisionProviderToBadge('heuristic_fallback'), { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' });
  assert.deepEqual(mapVisionProviderToBadge('not_run'), { text: 'Vision: Not Run', cssClass: 'provider-not-run' });
  assert.deepEqual(mapVisionProviderToBadge('unavailable'), { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' });
  assert.deepEqual(mapVisionProviderToBadge('unknown'), { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' });
});

test('HUD Wire Equivalence: displayed projection and transmitted wire payload agree 1-to-1', () => {
  const context = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'run_judge_audit_77',
    captureId: 'cap_internal_never_transmit',
    goal: 'Approve synthetic transfer request',
    sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      {
        localId: 'el_button_approve',
        role: 'button',
        sanitizedName: 'Approve Request',
        coarseBounds: [0.4, 0.6, 0.2, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'Transfer Approval Modal',
      viewport: [1920, 1080],
      visibleDialogCount: 1
    },
    maskCount: 3,
    payloadDigestSha256: 'sha256_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: 1725700000000,
    redactionManifest: {
      manifestVersion: '1.0',
      totalRegions: 3,
      categoryCounts: { piiText: 2, domInput: 1, face: 0, surface: 0 },
      methodCounts: { opaqueBox: 3, spatialBlur: 0 },
      placeholderConvention: '[REDACTED]',
      geometrySemantics: 'clamped_css_pixels',
      pixelVerificationPerformed: true,
      pixelVerificationPassed: true,
      uninspectableSurfacePolicy: 'fail_closed',
      visionAttempted: false,
      visionSucceeded: false,
      visionProvider: 'None'
    }
  };

  const transmitted = toSanitizedNetworkPayload(context);
  const displayed = buildMinimizedWirePayload(context);

  // Field structure must agree exactly
  const transmittedKeys = Object.keys(transmitted).sort();
  const displayedKeys = Object.keys(displayed).sort();
  assert.deepEqual(displayedKeys, transmittedKeys, 'Displayed and transmitted wire field keys must match identically');

  // Value equivalence for non-screenshot fields
  assert.equal(displayed.protocolVersion, transmitted.protocolVersion);
  assert.equal(displayed.runId, transmitted.runId);
  assert.equal(displayed.goal, transmitted.goal);
  assert.deepEqual(displayed.elements, transmitted.elements);
  assert.deepEqual(displayed.pageState, transmitted.pageState);
  assert.deepEqual(displayed.redactionManifest, transmitted.redactionManifest);

  // Screenshot field in displayed must be an explicit omission marker with byte count and digest, never raw bytes
  assert.ok(displayed.screenshot.startsWith('[Screenshot base64 omitted from display:'));
  assert.ok(displayed.screenshot.includes('sha256_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
  assert.equal(displayed.screenshot.includes('data:image/png'), false, 'Raw screenshot data must never be displayed');
});

test('HUD Fallback Prevention: missing or empty fields display Not available and never synthesize fake IDs', () => {
  const emptyContext = {};
  const displayed = buildMinimizedWirePayload(emptyContext);

  assert.equal(displayed.runId, 'Not available', 'Never synthesize run_local_0 or fake run ID');
  assert.equal(displayed.goal, 'Not available', 'Never synthesize User goal');
  assert.equal(displayed.screenshot, 'Not available', 'Missing screenshot displays Not available');
  assert.equal(displayed.pageState, 'Not available', 'Missing pageState displays Not available');
});
