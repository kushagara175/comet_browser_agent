import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPublicPostContent } from '../packages/pii-rules/dist/surface-classifier.js';
import { scanTextForPII } from '../packages/pii-rules/dist/regex-patterns.js';
import { scrubText } from '../packages/pii-rules/dist/scrubber.js';
import { ElementExtractor } from '../apps/extension/dist/content/element-extractor.js';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { createMockCanvas } from '../packages/test-fixtures/dist/index.js';

const box = { x: 10, y: 20, width: 300, height: 100, left: 10, top: 20, right: 310, bottom: 120 };
function makeNode(text, container = null, attributes = {}) {
  const node = {
    tagName: 'DIV',
    textContent: text, parentElement: container, ownerDocument: null,
    getAttribute: key => attributes[key] ?? null, hasAttribute: key => Boolean(attributes[key]),
    getBoundingClientRect: () => box,
    closest(selector) {
      if (selector.includes('button, input') || selector.includes('.privapilot-')) return null;
      if (attributes['data-testid'] && attributes['data-testid'].toLowerCase().includes('conversation') && selector.includes('conversation')) return node;
      if (attributes['role'] && selector.includes(`[role="${attributes['role']}"]`)) return node;
      if (selector.includes('article') || selector.includes('[role="article"]')) return container;
      if (container && typeof container.closest === 'function') return container.closest(selector);
      return null;
    },
    querySelector: () => null
  };
  return node;
}

test('public post context does not turn its author into the private account shell', () => {
  const post = makeNode('', null, { role: 'article' });
  const author = makeNode('Ada @ada', post, { 'data-testid': 'User-Name' });
  const account = makeNode('Signed in @private', null, { 'aria-label': 'Account menu' });
  account.closest = selector => selector.includes('Account menu') ? account : null;
  assert.equal(isPublicPostContent(author), true);
  assert.equal(isPublicPostContent(account), false);
  assert.equal(scanTextForPII('Ada @ada').some(m => m.category === 'username'), true);
  assert.equal(scanTextForPII('Ada @ada', { publicAuthorHandles: true }).some(m => m.category === 'username'), false);
  assert.equal(scrubText('by @ada contact ada@example.com', { publicAuthorHandles: true }), 'by @ada contact [REDACTED_EMAIL]');
  assert.match(scrubText('Signed in @private'), /REDACTED_USERNAME/);
});

test('visible post summary carries first author and body without controls, with other PII still scrubbed', async () => {
  const post = makeNode('');
  post.closest = selector => selector.includes('article') || selector.includes('[role="article"]') ? post : null;
  const author = makeNode('Ada @ada', post);
  const body = makeNode('Interesting research; contact ada@example.com', post);
  post.querySelector = selector => selector.includes('User-Name') ? author : selector.includes('tweetText') ? body : null;
  const doc = {
    title: 'Bookmarks', location: { href: 'https://x.com/i/bookmarks', pathname: '/i/bookmarks', hostname: 'x.com' },
    defaultView: { innerWidth: 800, innerHeight: 600, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    querySelectorAll: selector => selector === 'article, [role="article"]' ? [post] : [],
    createTreeWalker: node => {
      let read = false;
      return { nextNode: () => read ? null : (read = true, { nodeValue: node.textContent, parentElement: node }) };
    }
  };
  for (const node of [post, author, body]) node.ownerDocument = doc;
  const { snapshot } = new ElementExtractor().extractSnapshot(doc);
  assert.match(snapshot.contentSummaries[0], /Visible post 1 by Ada @ada: Interesting research/);
  const raw = {
    _brand: 'RawCapture_InternalOnly', captureId: 'cap_post', timestamp: Date.now(), rawScreenshotDataUrl: 'data:image/png;base64,AA==', rawDomSummary: {},
    metadata: { viewportWidth: 800, viewportHeight: 600, screenshotWidth: 800, screenshotHeight: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() }
  };
  const sanitized = await SanitizerPipeline.sanitize(raw, snapshot, 'What is the first bookmark?', createMockCanvas(800, 600));
  assert.match(sanitized.pageState.contentSummaries[0], /Visible post 1 by Ada @ada: Interesting research/);
  assert.match(sanitized.pageState.contentSummaries[0], /REDACTED_EMAIL/);
  assert.doesNotMatch(JSON.stringify(sanitized.pageState), /ada@example\.com/);
});

test('chat uses a correlated long-lived port rather than a 45-second one-shot timeout', () => {
  const source = readFileSync(new URL('../apps/extension/src/sidepanel/sidepanel.js', import.meta.url), 'utf8');
  const chat = source.slice(source.indexOf('async function executeGoal('), source.indexOf('// Voice Mode & Orbloom'));
  assert.match(chat, /chrome\.runtime\.connect\(\{ name: 'privapilot-sidepanel' \}\)/);
  assert.match(chat, /message\?\.requestId === runId/);
  assert.doesNotMatch(chat, /timed out after 45 seconds|45000/);
});

test('direct messaging surface redacts participant handles, message snippets, and account identity while preserving safe interactive cues', async () => {
  const accountHeader = makeNode('billosh_york', null, { role: 'button', 'aria-haspopup': 'true' });
  accountHeader.closest = selector => selector.includes('header') || selector.includes('account') ? accountHeader : null;

  const threadItem = makeNode('rustediron04\nrustediron04 sent an attachment • 2h', null, { role: 'button', 'data-testid': 'conversation-row' });
  threadItem.closest = selector => selector.includes('conversation') ? threadItem : null;

  const contactName = makeNode('rustediron04', threadItem);
  const snippet = makeNode('rustediron04 sent an attachment • 2h', threadItem);

  const doc = {
    title: 'Instagram • Messages',
    location: { href: 'https://www.instagram.com/direct/inbox/', pathname: '/direct/inbox/', hostname: 'www.instagram.com' },
    defaultView: { location: { href: 'https://www.instagram.com/direct/inbox/' }, innerWidth: 800, innerHeight: 600, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    querySelectorAll: selector => {
      if (selector.includes('button') || selector.includes('[role="button"]')) {
        return [accountHeader, threadItem];
      }
      return [];
    },
    createTreeWalker: root => {
      const nodes = [accountHeader, contactName, snippet];
      let idx = 0;
      return {
        nextNode: () => idx < nodes.length ? { nodeValue: nodes[idx].textContent, parentElement: nodes[idx++] } : null
      };
    }
  };

  for (const node of [accountHeader, threadItem, contactName, snippet]) node.ownerDocument = doc;

  const { snapshot } = new ElementExtractor().extractSnapshot(doc);
  assert.equal(snapshot.pageZone, 'private_workspace');

  // Verify interactive elements have sanitized structural cues without leaking contact names or snippets
  const threadElement = snapshot.interactiveElements.find(el => el.rawName.includes('Conversation thread'));
  assert.ok(threadElement, 'Should find conversation thread element');
  assert.match(threadElement.rawName, /Conversation thread: \[REDACTED_USER\]/);
  assert.doesNotMatch(threadElement.rawName, /rustediron04/);

  const acctElement = snapshot.interactiveElements.find(el => el.rawName.includes('Switch Account'));
  assert.ok(acctElement, 'Should find sanitized account switcher element');
  assert.doesNotMatch(acctElement.rawName, /billosh_york/);

  // Verify textNodes captured the sensitive contact and snippet for opaque masking
  const contactTextNode = snapshot.textNodes.find(t => t.text === 'rustediron04');
  assert.ok(contactTextNode, 'Should extract contact text node');
  assert.equal(contactTextNode.matchedRanges[0].category, 'username');

  const snippetTextNode = snapshot.textNodes.find(t => t.text.includes('sent an attachment'));
  assert.ok(snippetTextNode, 'Should extract snippet text node');
  assert.equal(snippetTextNode.matchedRanges[0].category, 'uninspectable');

  // Verify SanitizerPipeline produces opaque masks
  const raw = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_dm',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,AA==',
    rawDomSummary: {},
    metadata: { viewportWidth: 800, viewportHeight: 600, screenshotWidth: 800, screenshotHeight: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() }
  };
  const sanitized = await SanitizerPipeline.sanitize(raw, snapshot, 'see my latest message', createMockCanvas(800, 600));
  assert.equal(sanitized.pageState.pageZone, 'private_workspace');
  assert.ok(sanitized.maskCount >= 2, 'Should render at least 2 opaque privacy masks for private DMs');
});

test('Instagram public feed post content preserves author handles, brand avatars, and decorative canvas rings', () => {
  const feedArticle = makeNode('', null, { role: 'article' });
  const authorAvatar = makeNode('', feedArticle, { class: 'x1lliihq avatar', alt: 'warthunder\'s profile picture' });
  const authorHandle = makeNode('warthunder', feedArticle, { 'data-testid': 'post_author' });
  const canvasRing = makeNode('', feedArticle, { class: 'story-ring-canvas' });
  canvasRing.tagName = 'CANVAS';

  const doc = {
    title: 'Instagram',
    location: { href: 'https://www.instagram.com/', pathname: '/', hostname: 'www.instagram.com' },
    defaultView: { location: { href: 'https://www.instagram.com/' }, innerWidth: 1200, innerHeight: 800, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) }
  };
  for (const node of [feedArticle, authorAvatar, authorHandle, canvasRing]) node.ownerDocument = doc;

  assert.equal(isPublicPostContent(feedArticle), true, 'Instagram feed article must be public content');
  assert.equal(isPublicPostContent(authorAvatar), true, 'Feed author avatar must be public post content');
  assert.equal(isPublicPostContent(authorHandle), true, 'Feed author handle must be public post content');
});


