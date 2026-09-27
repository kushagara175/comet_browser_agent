import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MaskRenderer } from '../apps/extension/dist/sanitizer/mask-renderer.js';
import { detectFaceRegions } from '../apps/extension/dist/sanitizer/face-detector.js';
import { CoordinateTransformer } from '../apps/extension/dist/sanitizer/coordinate-transformer.js';
import { createMockCanvas } from '../packages/test-fixtures/dist/index.js';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';
import { toSanitizedNetworkPayload } from '../packages/protocol/dist/payload.js';

const rect = (x, y, width, height) => ({ x, y, width, height });
const viewportBox = (x, y, width, height) => ({ space: 'viewportCssPixel', x, y, width, height });
const screenshotBox = (x, y, width, height) => ({ space: 'screenshotPixel', x, y, width, height });
const metadata = { viewportWidth: 200, viewportHeight: 120, screenshotWidth: 200, screenshotHeight: 120, devicePixelRatio: 1, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() };

// Capture exports in order, so this test checks real ordering rather than mock-canvas PNG pixels.
test('Inspector exports masked image before SOM while the model image retains action IDs', () => {
  const canvas = createMockCanvas(200, 120);
  let badges = 0;
  const ctx = canvas.getContext('2d');
  const originalText = ctx.fillText;
  ctx.fillText = (text, ...args) => { if (text === '7') badges++; originalText(text, ...args); };
  canvas.getContext = () => ctx;
  const exports = [];
  canvas.toDataURL = () => { exports.push(badges); return 'data:image/png;base64,AA=='; };
  const result = MaskRenderer.renderMasks(canvas, [{
    id: 'private', category: 'password', method: 'opaque_mask', detectorSource: 'dom_semantic',
    viewportBox: viewportBox(20, 20, 45, 18), screenshotBox: screenshotBox(20, 20, 45, 18)
  }], [{ localId: 'el_7', boundingBox: rect(100, 70, 25, 20) }], { width: 200, height: 120 });
  assert.equal(result.renderedMaskCount, 1);
  assert.deepEqual(exports, [0, 1]);
  assert.equal(result.regionRecords[0].clampedBox.x, 20);
  const panel = readFileSync(new URL('../apps/extension/src/background/background-main.ts', import.meta.url), 'utf8');
  assert.match(panel, /sanitizedScreenshot: sanitized\.inspectorScreenshotDataUrl \|\| sanitized\.sanitizedScreenshotDataUrl/);
  assert.match(panel, /networkPayload: toSanitizedNetworkPayload\(sanitized\)/);
  const wire = toSanitizedNetworkPayload({ _brand: 'SanitizedContext_Verified', protocolVersion: '1.0', runId: 'one', captureId: 'one', goal: 'inspect', sanitizedScreenshotDataUrl: 'model-with-ids', inspectorScreenshotDataUrl: 'clean-preview', elements: [{ localId: 'el_7' }], pageState: { title: 'Page', viewport: [200, 120] }, maskCount: 1, payloadDigestSha256: 'digest', timestamp: Date.now() });
  assert.equal(wire.screenshot, 'model-with-ids');
  assert.equal(JSON.stringify(wire).includes('clean-preview'), false);
  assert.equal(wire.elements[0].localId, 'el_7');
});

test('face blur padding stays aligned near canvas edges', () => {
  const result = MaskRenderer.renderMasks(createMockCanvas(100, 80), [{
    id: 'avatar', category: 'face', method: 'gaussian_blur', detectorSource: 'face_model',
    viewportBox: viewportBox(92, 70, 6, 8), screenshotBox: screenshotBox(92, 70, 6, 8)
  }]);
  assert.deepEqual(result.regionRecords[0].clampedBox, { x: 84, y: 62, width: 16, height: 18 });
});

test('public post avatar is preserved but the private account avatar remains masked', () => {
  const face = (id, x) => ({ id, confidence: 0.99, viewportBox: viewportBox(x, 10, 22, 22), screenshotBox: screenshotBox(x, 10, 22, 22) });
  const images = [
    { id: 'public', isProfilePhotoOrAvatar: false, isPublicPostImage: true, boundingClientRect: rect(8, 8, 28, 28) },
    { id: 'account', isProfilePhotoOrAvatar: true, boundingClientRect: rect(70, 8, 28, 28) }
  ];
  const regions = detectFaceRegions(images, new CoordinateTransformer(metadata), [face('public_face', 10), face('account_face', 72)]);
  assert.equal(regions.some(r => r.id === 'public_face'), false);
  assert.equal(regions.some(r => r.id === 'account_face'), true);
  assert.equal(regions.some(r => r.id === 'face_dom_account'), true);
});

test('clarification stays on the same run and never types into an arbitrary input', async () => {
  const calls = [];
  const browser = {
    async getActiveTab() { return { id: 12, url: 'https://example.com', title: 'Example' }; },
    async captureVisibleTab() { return 'data:image/png;base64,AA=='; },
    async sendMessageToTab(_id, message) {
      calls.push(message);
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') return { success: true, captureId: message.captureId, viewport: { viewportWidth: 200, viewportHeight: 120 }, snapshot: { interactiveElements: [{ localId: 'el_input', role: 'input', rawName: 'Search', boundingBox: rect(10, 10, 60, 20), state: ['visible'], actionCapabilities: ['type'] }], textNodes: [], pageTitle: 'Example' } };
      return { success: true };
    },
    async runInSanitizerHost(request) { return { _brand: 'SanitizedContext_Verified', protocolVersion: '1.0', runId: 'test', captureId: request.rawCapture.captureId, goal: request.goal, sanitizedScreenshotDataUrl: 'data:image/png;base64,AA==', elements: [{ localId: 'el_input', role: 'input', sanitizedName: 'Search', coarseBounds: [.05, .08, .3, .17], state: ['visible'], actionCapabilities: ['type'] }], pageState: { title: 'Example', viewport: [200, 120] }, maskCount: 0, payloadDigestSha256: 'test', timestamp: Date.now() }; }
  };
  let reasoningCalls = 0;
  const http = { async requestReasoningAction() {
    reasoningCalls++;
    return reasoningCalls === 1
      ? { actionId: 'missing', kind: 'click', targetName: 'Unknown control', confidence: .8, risk: 'safe', rationale: 'Need target clarification' }
      : { actionId: 'done', kind: 'answer', confidence: 1, risk: 'safe', reply: 'Clarification received', rationale: 'Clarification received' };
  } };
  const coordinator = new RunCoordinator(browser, http);
  const pending = await coordinator.startRun('Inspect this page', { maxSteps: 3 });
  assert.equal(pending.state, 'awaiting-user-input', pending.error || pending.message);
  assert.equal(pending.inputRequest?.kind, 'clarification');
  assert.equal(pending.inputRequest?.targetLocalId, undefined);
  const stale = await coordinator.submitUserInput({ customText: 'Use the first result' }, 12, { runId: 'old_run', resumeLoop: true });
  assert.equal(stale.success, false);
  assert.equal(coordinator.getState(), 'awaiting-user-input');
  const result = await coordinator.submitUserInput({ customText: 'Use the first result' }, 12, { runId: pending.runId, resumeLoop: true });
  assert.equal(result.runId, pending.runId);
  assert.equal(result.success, true);
  assert.equal(reasoningCalls, 2);
  assert.equal(calls.some(message => message.type === 'EXECUTE_ACTION'), false);
});

function protectedRun() {
  const calls = [];
  const browser = {
    async getActiveTab() { return { id: 11, url: 'https://example.com', title: 'Example' }; },
    async captureVisibleTab() { return 'data:image/png;base64,AA=='; },
    async sendMessageToTab(_id, message) {
      calls.push(message);
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') return { success: true, captureId: message.captureId, viewport: { viewportWidth: 200, viewportHeight: 120 }, snapshot: { interactiveElements: [{ localId: 'el_1', role: 'button', rawName: 'Submit', boundingBox: rect(30, 30, 50, 20), state: ['visible'], actionCapabilities: ['click'] }], textNodes: [], pageTitle: 'Example' } };
      return { success: true, semanticOutcomeVerified: true };
    },
    async runInSanitizerHost(request) { return { _brand: 'SanitizedContext_Verified', protocolVersion: '1.0', runId: 'test', captureId: request.rawCapture.captureId, goal: request.goal, sanitizedScreenshotDataUrl: 'data:image/png;base64,AA==', elements: [{ localId: 'el_1', role: 'button', sanitizedName: 'Submit', coarseBounds: [.15, .25, .25, .17], state: ['visible'], actionCapabilities: ['click'] }], pageState: { title: 'Example', viewport: [200, 120] }, maskCount: 0, payloadDigestSha256: 'test', timestamp: Date.now() }; }
  };
  const http = { async requestReasoningAction() { return { actionId: 'protected', kind: 'click', targetLocalId: 'el_1', confidence: 0.7, risk: 'protected', rationale: 'Submit form' }; } };
  return { coordinator: new RunCoordinator(browser, http), calls };
}

test('stale approval cannot execute; correlated denial cancels only its own run', async () => {
  const { coordinator, calls } = protectedRun();
  const pending = await coordinator.startRun('Click Submit', { maxSteps: 2 });
  assert.equal(pending.state, 'awaiting-user-confirmation', pending.error || pending.message);
  const rejected = await coordinator.approvePendingAction({ runId: 'old_run', actionId: pending.proposal.actionId, resumeLoop: true });
  assert.equal(rejected.success, false);
  assert.equal(coordinator.getState(), 'awaiting-user-confirmation');
  assert.equal(calls.filter(x => x.type === 'EXECUTE_ACTION').length, 0);
  const wrongAction = coordinator.denyPendingAction({ runId: pending.runId, actionId: 'old_action' });
  assert.equal(wrongAction.success, false);
  assert.equal(coordinator.getState(), 'awaiting-user-confirmation');
  const denied = coordinator.denyPendingAction({ runId: pending.runId, actionId: pending.proposal.actionId });
  assert.equal(denied.state, 'idle');
  assert.equal(calls.filter(x => x.type === 'EXECUTE_ACTION').length, 0);
});

test('chat approval resumes the pending run only with the matching run ID', async () => {
  const { coordinator, calls } = protectedRun();
  const pending = await coordinator.startRun('Click Submit', { runId: 'same_run', maxSteps: 2 });
  assert.equal(pending.state, 'awaiting-user-confirmation');
  const result = await coordinator.startRun('yes', { runId: pending.runId });
  assert.equal(result.runId, pending.runId);
  assert.equal(calls.filter(x => x.type === 'EXECUTE_ACTION').length, 1);
});

test('new task invalidates the prior pending approval', async () => {
  const { coordinator, calls } = protectedRun();
  const pending = await coordinator.startRun('Click Submit', { runId: 'old_task', maxSteps: 2 });
  assert.equal(pending.state, 'awaiting-user-confirmation');
  await coordinator.startRun('Inspect the page', { runId: 'new_task', maxSteps: 1 });
  const stale = await coordinator.approvePendingAction({ runId: pending.runId, actionId: pending.proposal.actionId });
  assert.equal(stale.success, false);
  assert.equal(calls.filter(x => x.type === 'EXECUTE_ACTION').length, 0);
});

test('matched approval executes pending action and continues the original run', async () => {
  const { coordinator, calls } = protectedRun();
  const pending = await coordinator.startRun('Click Submit', { maxSteps: 2 });
  assert.equal(pending.state, 'awaiting-user-confirmation', pending.error || pending.message);
  const result = await coordinator.approvePendingAction({ runId: pending.runId, actionId: pending.proposal.actionId, resumeLoop: false });
  assert.equal(result.success, true);
  assert.equal(result.runId, pending.runId);
  assert.equal(calls.filter(x => x.type === 'EXECUTE_ACTION').length, 1);
});
