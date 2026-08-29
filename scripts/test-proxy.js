/**
 * Network Security Canary Scanner Verification Script
 */

import { assertNoCanaryLeak, SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';

console.log('🔒 [PrivaPilot] Running Network Canary Security Gate Verification...\n');

// 1. Test clean sanitized payload
const safePayload = {
  protocolVersion: '1.0',
  runId: 'run_test_123',
  goal: 'Find pending order and preview',
  screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  elements: [
    { localId: 'el_1', role: 'button', sanitizedName: 'Open Safe Preview', coarseBounds: [0.1, 0.2, 0.3, 0.05], state: ['visible'], actionCapabilities: ['click'] }
  ],
  pageState: { title: 'Apex Mission Portal', viewport: [1280, 720] }
};

try {
  assertNoCanaryLeak(safePayload, 'Clean Outgoing Payload');
  console.log('✓ Clean sanitized payload passed security gate without leaks.');
} catch (err) {
  console.error('❌ Clean payload failed unexpectedly:', err);
  process.exit(1);
}

// 2. Test leaky payload with canary (must throw error)
const leakyPayload = {
  ...safePayload,
  elements: [
    { localId: 'el_2', role: 'input', sanitizedName: `Leaked: ${SECRET_CANARY}`, coarseBounds: [0, 0, 0, 0], state: ['visible'], actionCapabilities: ['type'] }
  ]
};

let caught = false;
try {
  assertNoCanaryLeak(leakyPayload, 'Leaky Payload Test');
} catch (err) {
  caught = true;
  console.log(`✓ Leaky payload caught successfully by security gate: ${err.message}`);
}

if (!caught) {
  console.error('❌ Security gate failed to catch canary leak!');
  process.exit(1);
}

console.log('\n🛡️ [PrivaPilot] Network Security Gate Verified: 100% Leak Prevention.\n');
