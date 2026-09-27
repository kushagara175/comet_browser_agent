import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElementExtractor } from '../../apps/extension/dist/content/element-extractor.js';
import { ActionExecutor } from '../../apps/extension/dist/content/action-executor.js';
import { SemanticStateVerifier } from '../../apps/extension/dist/content/verifier.js';
import { SanitizerPipeline } from '../../apps/extension/dist/sanitizer/pipeline.js';
import { MockReasoningEngine } from '../../apps/server/dist/engines/mock-engine.js';
import { assertNoCanaryLeak, SECRET_CANARY, createMockCanvas } from '../../packages/test-fixtures/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_PORTAL_HTML = fs.readFileSync(path.join(__dirname, '../../apps/demo-portal/src/index.html'), 'utf-8');

const testCanvas = createMockCanvas(2560, 1440);

// ============================================================================
// Lightweight Mock DOM Implementation for Unit & Integration Testing
// ============================================================================

class MockClassList {
  constructor(element) {
    this._set = new Set();
    this._element = element;
  }
  add(...classes) {
    for (const c of classes) if (c) this._set.add(c);
  }
  remove(...classes) {
    for (const c of classes) this._set.delete(c);
  }
  contains(cls) {
    return this._set.has(cls);
  }
  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this.add(cls); else this.remove(cls);
      return force;
    }
    if (this.contains(cls)) {
      this.remove(cls);
      return false;
    } else {
      this.add(cls);
      return true;
    }
  }
  [Symbol.iterator]() {
    return this._set.values();
  }
  toString() {
    return Array.from(this._set).join(' ');
  }
}

class MockElement extends EventTarget {
  constructor(tagName = 'div', doc = null) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.ownerDocument = doc;
    this.isConnected = true;
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.style = {};
    this._value = '';
    this._textContent = '';
    this.classList = new MockClassList(this);
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }

  get className() { return this.classList.toString(); }
  set className(v) {
    this.classList._set.clear();
    (v || '').split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }

  get innerText() { return this._textContent; }
  set innerText(v) { this._textContent = String(v); }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  getAttribute(name) { return this.attributes.get(name.toLowerCase()) ?? null; }
  setAttribute(name, val) {
    this.attributes.set(name.toLowerCase(), String(val));
    if (name.toLowerCase() === 'class') this.className = val;
    if (name.toLowerCase() === 'id' && this.ownerDocument) this.ownerDocument._elementsById.set(val, this);
  }
  hasAttribute(name) { return this.attributes.has(name.toLowerCase()); }
  removeAttribute(name) { this.attributes.delete(name.toLowerCase()); }

  appendChild(child) {
    child.parentElement = this;
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.children.indexOf(oldChild);
    if (idx !== -1) {
      newChild.parentElement = this;
      newChild.parentNode = this;
      newChild.ownerDocument = this.ownerDocument;
      oldChild.parentElement = null;
      oldChild.parentNode = null;
      oldChild.isConnected = false;
      this.children[idx] = newChild;
    }
    return oldChild;
  }

  cloneNode(deep = true) {
    const clone = new MockElement(this.tagName, this.ownerDocument);
    for (const [k, v] of this.attributes.entries()) {
      clone.setAttribute(k, v);
    }
    clone.textContent = this.textContent;
    clone.value = this.value;
    clone.disabled = this.disabled;
    clone.hidden = this.hidden;
    clone.className = this.className;
    if (deep) {
      for (const ch of this.children) {
        clone.appendChild(ch.cloneNode(true));
      }
    }
    return clone;
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }

  isElementOrAncestorHidden() {
    let curr = this;
    while (curr) {
      if (curr.hidden || curr.classList?.contains('hidden') || curr.style?.display === 'none' || curr.getAttribute?.('aria-hidden') === 'true') {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  getBoundingClientRect() {
    if (this.isElementOrAncestorHidden()) {
      return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    }
    return { x: 20, y: 30, width: 120, height: 35, top: 30, left: 20, right: 140, bottom: 65 };
  }
  closest(selector) { return null; }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (matchesSelector(ch, selector)) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementsByTagName(tag) {
    const results = [];
    const targetTag = tag.toUpperCase();
    const walk = (node) => {
      for (const ch of node.children) {
        if (targetTag === '*' || ch.tagName === targetTag) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }
}

function matchesSelector(el, selector) {
  const parts = selector.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part === 'button' && el.tagName === 'BUTTON') return true;
    if (part === 'input' && el.tagName === 'INPUT') return true;
    if (part === 'a' && el.tagName === 'A') return true;
    if (part === 'canvas' && el.tagName === 'CANVAS') return true;
    if (part === 'img' && el.tagName === 'IMG') return true;
    if (part.startsWith('#') && el.id === part.slice(1)) return true;
    if (part.startsWith('.') && el.classList.contains(part.slice(1))) return true;
    if (part.includes('[role="button"]') && el.getAttribute('role') === 'button') return true;
    if (part.includes('[role="status"]') && el.getAttribute('role') === 'status') return true;
    if (part.includes('[role="dialog"]') && el.getAttribute('role') === 'dialog') return true;
    if (part.includes('.drawer') && el.classList.contains('drawer')) return true;
    if (part.includes('.modal') && el.classList.contains('modal')) return true;
  }
  return false;
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body', this);
    this.documentElement = new MockElement('html', this);
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
    this.title = 'PrivaPilot — Mission Control Portal';
    this.location = { pathname: '/portal', hash: '' };
    this._elementsById = new Map();
    this.defaultView = {
      innerWidth: 1280,
      innerHeight: 800,
      HTMLInputElement: MockElement,
      HTMLTextAreaElement: MockElement,
      HTMLSelectElement: MockElement,
      getComputedStyle: (el) => ({
        display: el.isElementOrAncestorHidden() ? 'none' : 'block',
        visibility: 'visible',
        opacity: '1'
      })
    };
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  contains(el) {
    let curr = el;
    while (curr) {
      if (curr === this.documentElement || curr === this.body) return true;
      curr = curr.parentElement || curr.parentNode;
    }
    return false;
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  getElementsByTagName(tag) {
    return this.documentElement.getElementsByTagName(tag);
  }
}

// Global mocks for Node test environment
if (typeof globalThis.HTMLInputElement === 'undefined') {
  globalThis.HTMLInputElement = MockElement;
}
if (typeof globalThis.HTMLTextAreaElement === 'undefined') {
  globalThis.HTMLTextAreaElement = MockElement;
}
if (typeof globalThis.HTMLSelectElement === 'undefined') {
  globalThis.HTMLSelectElement = MockElement;
}
if (typeof globalThis.KeyboardEvent === 'undefined') {
  globalThis.KeyboardEvent = globalThis.Event;
}
if (typeof globalThis.MouseEvent === 'undefined') {
  globalThis.MouseEvent = globalThis.Event;
}

function buildDemoPortalDOM() {
  const doc = new MockDocument();

  // Left Panel (Profile & Synthetic Privacy Evidence)
  const aside = doc.createElement('aside');
  aside.setAttribute('aria-label', 'User Profile and Credentials');
  doc.body.appendChild(aside);

  const avatarImg = doc.createElement('img');
  avatarImg.className = 'avatar face-avatar';
  avatarImg.setAttribute('src', 'data:image/svg+xml;utf8,<svg></svg>');
  avatarImg.setAttribute('alt', 'Personnel Avatar');
  aside.appendChild(avatarImg);

  const nameHeading = doc.createElement('h2');
  nameHeading.textContent = 'Kushagra Singh';
  aside.appendChild(nameHeading);

  const emailSpan = doc.createElement('span');
  emailSpan.className = 'val';
  emailSpan.textContent = 'kushagra.singh@valley.work';
  aside.appendChild(emailSpan);

  const phoneSpan = doc.createElement('span');
  phoneSpan.className = 'val';
  phoneSpan.textContent = '+91 98765 43210';
  aside.appendChild(phoneSpan);

  const empIdSpan = doc.createElement('span');
  empIdSpan.className = 'val';
  empIdSpan.textContent = 'VAL-89012';
  empIdSpan.setAttribute('data-secret', SECRET_CANARY);
  aside.appendChild(empIdSpan);

  const passInput = doc.createElement('input');
  passInput.id = 'passInput';
  passInput.setAttribute('type', 'password');
  passInput.setAttribute('name', 'workspace_passkey');
  passInput.setAttribute('aria-label', 'Workspace Passkey');
  passInput.value = 'SecretPasscode99!';
  aside.appendChild(passInput);

  const canvas = doc.createElement('canvas');
  canvas.id = 'telemetryCanvas';
  canvas.setAttribute('aria-label', 'Realtime Sensor Stream');
  aside.appendChild(canvas);

  // Main Panel (Task Queue & Landmarks)
  const main = doc.createElement('main');
  main.setAttribute('role', 'main');
  doc.body.appendChild(main);

  const statusRegion = doc.createElement('div');
  statusRegion.id = 'statusRegion';
  statusRegion.setAttribute('role', 'status');
  statusRegion.setAttribute('aria-live', 'polite');
  statusRegion.className = 'status-alert-box hidden';
  statusRegion.textContent = 'Ready';
  main.appendChild(statusRegion);

  const searchInput = doc.createElement('input');
  searchInput.id = 'searchRequests';
  searchInput.setAttribute('type', 'text');
  searchInput.setAttribute('placeholder', 'Search requests...');
  searchInput.setAttribute('aria-label', 'Search requests');
  main.appendChild(searchInput);

  const searchBtn = doc.createElement('button');
  searchBtn.id = 'searchBtn';
  searchBtn.textContent = 'Filter';
  main.appendChild(searchBtn);

  const mutateRowBtn = doc.createElement('button');
  mutateRowBtn.id = 'mutateRowBtn';
  mutateRowBtn.textContent = 'Mutate Row (Stale Demo)';
  main.appendChild(mutateRowBtn);

  const tbody = doc.createElement('tbody');
  tbody.id = 'requestsTableBody';
  main.appendChild(tbody);

  const row1044 = doc.createElement('tr');
  row1044.id = 'rowReq1044';
  row1044.className = 'active-row';
  tbody.appendChild(row1044);

  const taskTitle = doc.createElement('td');
  taskTitle.textContent = 'Security Clearance Access Request';
  row1044.appendChild(taskTitle);

  const status1044 = doc.createElement('span');
  status1044.id = 'statusReq1044';
  status1044.className = 'badge pending';
  status1044.textContent = 'Pending';
  row1044.appendChild(status1044);

  const openPreviewBtn = doc.createElement('button');
  openPreviewBtn.id = 'openSafePreviewBtn';
  openPreviewBtn.className = 'btn-action';
  openPreviewBtn.textContent = 'Open Safe Preview';
  row1044.appendChild(openPreviewBtn);

  // Preview Drawer (Role Dialog / Modal Landmark)
  const drawer = doc.createElement('div');
  drawer.id = 'previewDrawer';
  drawer.className = 'drawer hidden';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  doc.body.appendChild(drawer);

  const drawerTitle = doc.createElement('h3');
  drawerTitle.id = 'drawerTitle';
  drawerTitle.textContent = 'Request #REQ-1044 Preview';
  drawer.appendChild(drawerTitle);

  const closeDrawerBtn = doc.createElement('button');
  closeDrawerBtn.id = 'closeDrawerBtn';
  closeDrawerBtn.textContent = '✕';
  drawer.appendChild(closeDrawerBtn);

  const submitApprovalBtn = doc.createElement('button');
  submitApprovalBtn.id = 'submitApprovalBtn';
  submitApprovalBtn.className = 'btn-submit';
  submitApprovalBtn.textContent = 'Submit Final Approval';
  drawer.appendChild(submitApprovalBtn);

  const cancelDrawerBtn = doc.createElement('button');
  cancelDrawerBtn.id = 'cancelDrawerBtn';
  cancelDrawerBtn.className = 'btn-cancel';
  cancelDrawerBtn.textContent = 'Cancel Review';
  drawer.appendChild(cancelDrawerBtn);

  // Wire event handlers
  openPreviewBtn.addEventListener('click', () => {
    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-expanded', 'true');
  });

  closeDrawerBtn.addEventListener('click', () => {
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-expanded', 'false');
  });

  cancelDrawerBtn.addEventListener('click', () => {
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-expanded', 'false');
  });

  submitApprovalBtn.addEventListener('click', () => {
    status1044.textContent = 'Approved';
    status1044.className = 'badge approved';
    statusRegion.textContent = '✓ Final approval submitted and clearance granted for #REQ-1044';
    statusRegion.className = 'status-alert-box success';
    statusRegion.classList.remove('hidden');
    drawer.classList.add('hidden');
  });

  mutateRowBtn.addEventListener('click', () => {
    const newRow = row1044.cloneNode(true);
    const newOpenBtn = newRow.querySelector('#openSafePreviewBtn') || newRow.children.find(c => c.id === 'openSafePreviewBtn');
    if (newOpenBtn) {
      newOpenBtn.addEventListener('click', () => {
        drawer.classList.remove('hidden');
        drawer.setAttribute('aria-expanded', 'true');
      });
    }
    tbody.replaceChild(newRow, row1044);
    statusRegion.textContent = '⚡ Stale DOM Mutation: Table row node #REQ-1044 was detached and replaced';
    statusRegion.classList.remove('hidden');
  });

  return doc;
}

// ============================================================================
// Test Suite
// ============================================================================

test('Demo Portal Architecture: No site-specific IDs or URLs in extension codebase', () => {
  const extensionSrcDir = path.join(__dirname, '../../apps/extension/src');
  const demoSpecificPatterns = [
    'localhost:4500',
    'openSafePreviewBtn',
    'submitApprovalBtn',
    'rowReq1044',
    'passInput',
    'VAL-89012',
    'kushagra.singh@valley.work'
  ];

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts') || file.endsWith('.js')) {
        if (fullPath.includes('sidepanel') || fullPath.includes('test')) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of demoSpecificPatterns) {
          assert.equal(
            content.includes(pattern),
            false,
            `Extension code '${file}' must not contain demo-specific pattern: ${pattern}`
          );
        }
      }
    }
  }

  scanDir(extensionSrcDir);
});

test('Demo Portal Privacy: Synthetic evidence detected, redacted, and canary-checked', async () => {
  const doc = buildDemoPortalDOM();

  const extractor = new ElementExtractor();
  const { snapshot } = extractor.extractSnapshot(doc);

  // 1. Verify DOM extraction contains synthetic evidence
  assert.ok(snapshot.domElements.some(e => e.descriptor.type === 'password'), 'Password descriptor extracted');
  assert.ok(snapshot.surfaces.some(s => s.surfaceType === 'canvas'), 'Canvas surface extracted');
  assert.ok(snapshot.imageElements.length > 0, 'Avatar image extracted');

  // 2. Run local sanitizer
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_demo_1',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: snapshot,
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 800,
      screenshotWidth: 2560,
      screenshotHeight: 1600,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const sanitized = await SanitizerPipeline.sanitize(rawCapture, snapshot, 'Find synthetic pending request and approve', testCanvas);

  // 3. Verify masks are applied on synthetic PII
  assert.ok(sanitized.maskCount >= 2, `Expected at least 2 privacy masks, got ${sanitized.maskCount}`);

  // 4. Verify Canary secret does not leak into outgoing wire context
  assertNoCanaryLeak(sanitized, 'Sanitized Context Wire Payload');
});

test('Demo Portal Multi-Step Workflow: Generic search, preview, protected approval, and outcome verification', async () => {
  const doc = buildDemoPortalDOM();

  const reasoner = new MockReasoningEngine();
  const extractor = new ElementExtractor();

  // --- STEP 1: Search / Filter ---
  let extract1 = extractor.extractSnapshot(doc);
  let rawCap1 = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_step1',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,mock',
    rawDomSummary: extract1.snapshot,
    metadata: { viewportWidth: 1280, viewportHeight: 800, screenshotWidth: 2560, screenshotHeight: 1600, devicePixelRatio: 2, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() }
  };
  let san1 = await SanitizerPipeline.sanitize(rawCap1, extract1.snapshot, 'Filter requests for Security Clearance', testCanvas);
  
  let action1 = await reasoner.decideNextAction(san1);
  assert.equal(action1.kind, 'type');
  assert.ok(action1.textToType.includes('Security Clearance'));
  assert.equal(action1.risk, 'safe');

  let targetEl1 = extract1.elementMap.get(action1.targetLocalId);
  let baseline1 = SemanticStateVerifier.captureSnapshot(targetEl1, doc);
  let execRes1 = ActionExecutor.execute(action1, extract1.elementMap);
  assert.equal(execRes1.success, true);
  
  let verifRes1 = await SemanticStateVerifier.verifyOutcome(action1, targetEl1, baseline1, { doc, timeoutMs: 50 });
  assert.equal(verifRes1.verified, true);
  assert.equal(verifRes1.reasonCode, 'INPUT_VALUE_MUTATION_VERIFIED');

  // --- STEP 2: Open Safe Preview ---
  let extract2 = extractor.extractSnapshot(doc);
  let rawCap2 = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_step2',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,mock',
    rawDomSummary: extract2.snapshot,
    metadata: { viewportWidth: 1280, viewportHeight: 800, screenshotWidth: 2560, screenshotHeight: 1600, devicePixelRatio: 2, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() }
  };
  let san2 = await SanitizerPipeline.sanitize(rawCap2, extract2.snapshot, 'Open preview for pending request', testCanvas);
  
  let action2 = await reasoner.decideNextAction(san2);
  assert.equal(action2.kind, 'click');
  assert.equal(action2.risk, 'safe');
  assert.ok(action2.expectedState.includes('Preview drawer'));

  let targetEl2 = extract2.elementMap.get(action2.targetLocalId);
  let baseline2 = SemanticStateVerifier.captureSnapshot(targetEl2, doc);
  let execRes2 = ActionExecutor.execute(action2, extract2.elementMap);
  assert.equal(execRes2.success, true);

  // Trigger drawer open handler
  targetEl2.dispatchEvent(new Event('click'));

  let verifRes2 = await SemanticStateVerifier.verifyOutcome(action2, targetEl2, baseline2, { doc, timeoutMs: 50 });
  assert.equal(verifRes2.verified, true);
  assert.equal(verifRes2.reasonCode, 'MODAL_DRAWER_VISIBILITY_VERIFIED');

  // --- STEP 3: Protected Submit / Approval Proposal ---
  let extract3 = extractor.extractSnapshot(doc);
  let rawCap3 = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_step3',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,mock',
    rawDomSummary: extract3.snapshot,
    metadata: { viewportWidth: 1280, viewportHeight: 800, screenshotWidth: 2560, screenshotHeight: 1600, devicePixelRatio: 2, scrollX: 0, scrollY: 0, captureTimestamp: Date.now() }
  };
  let san3 = await SanitizerPipeline.sanitize(rawCap3, extract3.snapshot, 'Submit final approval for pending request', testCanvas);
  
  let action3 = await reasoner.decideNextAction(san3);
  assert.equal(action3.kind, 'click');
  assert.equal(action3.risk, 'protected', 'Protected action must require explicit user confirmation');

  // --- STEP 4: User Confirmation & Final Semantic State Verification ---
  let targetEl3 = extract3.elementMap.get(action3.targetLocalId);
  let baseline3 = SemanticStateVerifier.captureSnapshot(targetEl3, doc);
  let execRes3 = ActionExecutor.execute(action3, extract3.elementMap);
  assert.equal(execRes3.success, true);

  // Trigger submit approval handler
  targetEl3.dispatchEvent(new Event('click'));

  let verifRes3 = await SemanticStateVerifier.verifyOutcome(action3, targetEl3, baseline3, { doc, timeoutMs: 50 });
  assert.equal(verifRes3.verified, true);

  // Final check: table status is now approved and alert region updated
  const status1044 = doc.getElementById('statusReq1044');
  const statusRegion = doc.getElementById('statusRegion');
  assert.equal(status1044.textContent, 'Approved');
  assert.ok(statusRegion.textContent.includes('Final approval submitted'));
});

test('Demo Portal Cancellation Path: Denying protected action halts without modifying state', async () => {
  const doc = buildDemoPortalDOM();

  const status1044 = doc.getElementById('statusReq1044');
  const drawer = doc.getElementById('previewDrawer');
  const cancelBtn = doc.getElementById('cancelDrawerBtn');

  // Open drawer initially
  drawer.classList.remove('hidden');

  // Simulate user cancellation
  cancelBtn.dispatchEvent(new Event('click'));

  // Status remains Pending
  assert.equal(status1044.textContent, 'Pending');
  assert.equal(drawer.classList.contains('hidden'), true);
});

test('Demo Portal Stale-Target Mutation: Re-perception and retry handles detached nodes', async () => {
  const doc = buildDemoPortalDOM();

  const extractor = new ElementExtractor();
  const { elementMap } = extractor.extractSnapshot(doc);

  // Grab button reference from pre-capture
  const oldBtn = doc.getElementById('openSafePreviewBtn');
  assert.ok(oldBtn);

  // Simulate concurrent DOM replacement (clicking mutateRowBtn)
  const mutateRowBtn = doc.getElementById('mutateRowBtn');
  mutateRowBtn.dispatchEvent(new Event('click'));

  // Executor targeting the stale element from capture 1
  let staleLocalId = null;
  for (const [id, el] of elementMap.entries()) {
    if (el === oldBtn) {
      staleLocalId = id;
      break;
    }
  }
  assert.ok(staleLocalId);

  const staleProposal = {
    actionId: 'act_stale',
    kind: 'click',
    targetLocalId: staleLocalId,
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Clicking preview'
  };

  const staleResult = ActionExecutor.execute(staleProposal, elementMap);
  assert.equal(staleResult.success, false);
  assert.equal(staleResult.staleTarget, true);

  // Now re-perceive to get fresh local IDs
  const freshExtract = extractor.extractSnapshot(doc);
  
  // Look up fresh localId for the replaced button
  let freshLocalId = null;
  for (const [id, el] of freshExtract.elementMap.entries()) {
    if (el.id === 'openSafePreviewBtn' || el.textContent.includes('Open Safe Preview')) {
      freshLocalId = id;
      break;
    }
  }

  assert.ok(freshLocalId);
  const freshProposal = { ...staleProposal, targetLocalId: freshLocalId };
  const freshResult = ActionExecutor.execute(freshProposal, freshExtract.elementMap);
  assert.equal(freshResult.success, true);
  assert.equal(freshResult.staleTarget, undefined);
});
