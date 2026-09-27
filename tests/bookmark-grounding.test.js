import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';
import { ActionExecutor } from '../apps/extension/dist/content/action-executor.js';
import { MaskRenderer } from '../apps/extension/dist/sanitizer/mask-renderer.js';

function browserAt(initialUrl, getPosts) {
  let url = initialUrl;
  let searches = 0;
  const browser = {
    async getActiveTab() { return { id: 12, url, title: 'X' }; },
    async captureVisibleTab() { return 'data:image/png;base64,AA=='; },
    async navigateTab(_id, target) { url = target; return { tabId: 12, url }; },
    async sendMessageToTab(_id, message) {
      if (message.type === 'EXTRACT_DOM_SNAPSHOT') return { success: true, snapshot: { interactiveElements: [], textNodes: [{ text: 'Bookmarks loaded' }], pageTitle: 'Bookmarks', scrollMetrics: { scrollTop: 0, maxScrollTop: 0, scrollableBelow: false } } };
      return { success: true };
    },
    async runInSanitizerHost(request) {
      return { _brand: 'SanitizedContext_Verified', protocolVersion: '1.0', runId: 'test', captureId: request.rawCapture.captureId,
        goal: request.goal, sanitizedScreenshotDataUrl: 'data:image/png;base64,AA==', elements: [],
        pageState: { title: 'Bookmarks', viewport: [800, 600], contentSummaries: getPosts(url) },
        maskCount: 0, payloadDigestSha256: 'test', timestamp: Date.now() };
    }
  };
  const http = {
    async searchWeb() { searches++; return { success: true, results: [{ title: 'Unrelated post' }] }; },
    async requestReasoningAction() { return { kind: 'answer', actionId: 'answer', risk: 'safe', confidence: 1, reply: 'Unsupported: unrelated authors', rationale: 'Answering user' }; }
  };
  return { browser, http, get searches() { return searches; }, get url() { return url; } };
}

test('X bookmark answers require a fresh Bookmarks capture and use only visible posts', async () => {
  const setup = browserAt('https://x.com/i/history', url => url.endsWith('/i/bookmarks') ? ['Visible post 1 by Ada @ada: A research update'] : ['Visible post 1 by Wrong: History entry']);
  const result = await new RunCoordinator(setup.browser, setup.http).startRun('What are my X bookmarks?', { maxSteps: 3 });
  assert.equal(setup.url, 'https://x.com/i/bookmarks');
  assert.equal(setup.searches, 0);
  assert.equal(result.success, true);
  assert.match(result.message, /Ada @ada: A research update/);
  assert.doesNotMatch(result.message, /Wrong|Unsupported|Unrelated/);
});

test('X bookmark answer fails closed if the current Bookmarks page contains no grounded posts', async () => {
  const setup = browserAt('https://x.com/i/bookmarks', () => []);
  const result = await new RunCoordinator(setup.browser, setup.http).startRun('What are my X bookmarks?', { maxSteps: 2 });
  assert.equal(result.success, false);
  assert.match(result.error, /No visible bookmark post/);
  assert.equal(setup.searches, 0);
});

test('short exploratory scrolls do not move an entire viewport or reverse on unchanged smooth scroll position', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const moves = [];
  let fallbackMoves = 0;
  globalThis.window = { innerHeight: 1000, scrollY: 0, scrollBy: options => moves.push(options) };
  globalThis.document = { documentElement: { scrollTop: 0 }, body: { scrollTop: 0 }, querySelector: () => ({ scrollBy: () => fallbackMoves++ }) };
  try {
    await ActionExecutor.execute({ kind: 'scroll', actionId: 'scroll', scrollDirection: 'down' });
    assert.equal(moves.length, 1);
    assert.ok(moves[0].top > 0 && moves[0].top <= 400);
    assert.equal(fallbackMoves, 0);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('semantic mask labels disclose only allowlisted categories, including private account usernames', () => {
  assert.equal(MaskRenderer.getSemanticCategoryLabel('username', 150), '[ACCOUNT USERNAME]');
  assert.equal(MaskRenderer.getSemanticCategoryLabel('date_of_birth', 150), '[DATE OF BIRTH]');
  assert.equal(MaskRenderer.getSemanticCategoryLabel('secret-private-value', 150), '[REDACTED]');
});

test('sidepanel displays actual phase progress before model rationale arrives', () => {
  const source = readFileSync(new URL('../apps/extension/src/sidepanel/sidepanel.js', import.meta.url), 'utf8');
  assert.match(source, /message\.type === 'COORDINATOR_STATE_CHANGED'[\s\S]*?updateLiveProgress\(/);
  assert.match(source, /message\.type === 'COORDINATOR_STEP_PROGRESS'[\s\S]*?updateLiveProgress\(/);
  assert.match(source, /thinking-phase1/);
});
