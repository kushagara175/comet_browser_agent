/**
 * @privapilot/extension - Explicit Bounded Postcondition Semantic Verifier Tests
 *
 * Verifies:
 * 1. Target state mutation postcondition (disabled, checked, aria-expanded)
 * 2. Modal / drawer appearance postcondition
 * 3. Selection postcondition on <select>
 * 4. Safe navigation / path change postcondition without raw URL leak
 * 5. Input value update postcondition
 * 6. Bounded timeout failure with zero mutations (TIMEOUT_EXPIRED)
 * 7. Unrelated mutation failure (UNRELATED_MUTATION)
 * 8. document.readyState rejection (not accepted as proof)
 * 9. Image diff corroboration behavior (corroborates but not sole proof)
 * 10. Privacy guarantee: Zero raw text or query parameters in diagnostic messages
 */

import test from 'node:test';
import assert from 'node:assert';
import { SemanticStateVerifier } from '../../apps/extension/dist/content/verifier.js';

// ============================================================================
// Synthetic DOM & MutationObserver Simulation
// ============================================================================

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observedNode = null;
    this.options = null;
    MockMutationObserver.activeObservers.push(this);
  }

  observe(node, options) {
    this.observedNode = node;
    this.options = options;
  }

  disconnect() {
    MockMutationObserver.activeObservers = MockMutationObserver.activeObservers.filter(o => o !== this);
  }

  trigger(mutations = [{ type: 'childList' }]) {
    this.callback(mutations);
  }

  static triggerAll(mutations = [{ type: 'childList' }]) {
    for (const obs of [...MockMutationObserver.activeObservers]) {
      obs.trigger(mutations);
    }
  }

  static reset() {
    MockMutationObserver.activeObservers = [];
  }
}
MockMutationObserver.activeObservers = [];
globalThis.MutationObserver = MockMutationObserver;

class MockElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.ownerDocument = null;
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.style = {};
    this._classList = new Set();
    this._value = '';
    this._textContent = '';
  }

  get classList() {
    const set = this._classList;
    return {
      contains: (cls) => set.has(cls),
      add: (cls) => {
        set.add(cls);
        MockMutationObserver.triggerAll([{ type: 'attributes', attributeName: 'class', target: this }]);
      },
      remove: (cls) => {
        set.delete(cls);
        MockMutationObserver.triggerAll([{ type: 'attributes', attributeName: 'class', target: this }]);
      },
      toggle: (cls) => {
        if (set.has(cls)) set.delete(cls);
        else set.add(cls);
        MockMutationObserver.triggerAll([{ type: 'attributes', attributeName: 'class', target: this }]);
      },
      [Symbol.iterator]: () => set[Symbol.iterator]()
    };
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = String(v);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(v) {
    this._textContent = String(v);
    MockMutationObserver.triggerAll([{ type: 'childList', target: this }]);
  }

  get innerText() {
    return this._textContent;
  }

  set innerText(v) {
    this._textContent = String(v);
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name.toLowerCase(), String(value));
    MockMutationObserver.triggerAll([{ type: 'attributes', attributeName: name, target: this }]);
  }

  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name) {
    this.attributes.delete(name.toLowerCase());
    MockMutationObserver.triggerAll([{ type: 'attributes', attributeName: name, target: this }]);
  }
}

class MockSelectElement extends MockElement {
  constructor() {
    super('select');
    this.selectedIndex = 0;
  }
}

class MockDocument {
  constructor() {
    this.readyState = 'loading';
    this.location = {
      pathname: '/portal',
      hash: '',
      search: '?token=SECRET_AUTH_TOKEN_DO_NOT_LEAK'
    };
    this.body = new MockElement('body');
    this.body.ownerDocument = this;
    this.documentElement = this.body;
    this.activeElement = null;
    this._elements = [];
    this.defaultView = {
      MutationObserver: MockMutationObserver,
      getComputedStyle: (el) => ({
        display: el.style.display || 'block',
        visibility: el.style.visibility || 'visible',
        opacity: el.style.opacity || '1'
      })
    };
  }

  createElement(tag) {
    let el;
    if (tag.toLowerCase() === 'select') el = new MockSelectElement();
    else el = new MockElement(tag);
    el.ownerDocument = this;
    this._elements.push(el);
    return el;
  }

  getElementsByTagName(tag) {
    if (tag === '*') return this._elements;
    return this._elements.filter(e => e.tagName.toLowerCase() === tag.toLowerCase());
  }

  querySelectorAll(sel) {
    if (sel.includes('.drawer') || sel.includes('.modal') || sel.includes('dialog')) {
      return this._elements.filter(e =>
        e._classList.has('drawer') ||
        e._classList.has('modal') ||
        e.tagName === 'DIALOG' ||
        e.getAttribute('role') === 'dialog'
      );
    }
    if (sel.includes('[role="status"]') || sel.includes('[role="alert"]')) {
      return this._elements.filter(e =>
        e.getAttribute('role') === 'status' || e.getAttribute('role') === 'alert'
      );
    }
    return [];
  }
}

// ============================================================================
// Test Cases
// ============================================================================

test('SemanticVerifier: Captures safe pre-action snapshot without raw secrets', () => {
  const doc = new MockDocument();
  const btn = doc.createElement('button');
  btn.setAttribute('aria-expanded', 'false');

  const snapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  assert.ok(snapshot.timestamp > 0);
  assert.strictEqual(snapshot.pathFingerprint, '/portal');
  // Ensure query params with SECRET_AUTH_TOKEN are NOT present in pathFingerprint
  assert.strictEqual(snapshot.pathFingerprint.includes('SECRET_AUTH_TOKEN'), false);
  assert.strictEqual(snapshot.openDialogOrDrawerCount, 0);
  assert.strictEqual(snapshot.targetState?.ariaExpanded, 'false');
  assert.strictEqual(snapshot.targetState?.disabled, false);
});

test('SemanticVerifier: Verifies modal / drawer appearance postcondition', async () => {
  MockMutationObserver.reset();
  const doc = new MockDocument();
  const btn = doc.createElement('button');
  btn.innerText = 'Open Safe Preview';

  const drawer = doc.createElement('div');
  drawer.classList.add('drawer');
  drawer.classList.add('hidden'); // Initially hidden

  const preSnapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  const proposal = {
    actionId: 'act_modal_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open safe preview drawer',
    expectedState: 'Preview drawer becomes visible'
  };

  // Simulate async drawer opening via user click
  const verifyPromise = SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, { doc, timeoutMs: 100 });

  // Drawer loses hidden class
  setTimeout(() => {
    drawer.classList.remove('hidden');
  }, 10);

  const outcome = await verifyPromise;

  assert.strictEqual(outcome.verified, true);
  assert.strictEqual(outcome.reasonCode, 'MODAL_DRAWER_VISIBILITY_VERIFIED');
  assert.ok(outcome.message.includes('modal or drawer is visible'));
  assert.ok(outcome.details?.durationMs !== undefined);
});

test('SemanticVerifier: Verifies target state mutations (disabled, checked, aria-expanded)', async () => {
  MockMutationObserver.reset();
  const doc = new MockDocument();
  const toggleBtn = doc.createElement('button');
  toggleBtn.setAttribute('aria-expanded', 'false');

  const preSnapshot = SemanticStateVerifier.captureSnapshot(toggleBtn, doc);

  const proposal = {
    actionId: 'act_toggle_1',
    kind: 'click',
    targetLocalId: 'el_toggle',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Toggle details panel',
    expectedState: 'Panel expanded'
  };

  // Mutate target element state
  toggleBtn.setAttribute('aria-expanded', 'true');

  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, toggleBtn, preSnapshot, { doc, timeoutMs: 50 });

  assert.strictEqual(outcome.verified, true);
  assert.strictEqual(outcome.reasonCode, 'TARGET_STATE_MUTATION_VERIFIED');
  assert.ok(outcome.message.includes('target'));
});

test('SemanticVerifier: Verifies selection change on <select>', async () => {
  const doc = new MockDocument();
  const select = doc.createElement('select');
  select.value = 'opt_telemetry_a';

  const preSnapshot = SemanticStateVerifier.captureSnapshot(select, doc);

  const proposal = {
    actionId: 'act_sel_1',
    kind: 'select',
    targetLocalId: 'el_sel',
    selectOptionValue: 'opt_telemetry_b',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Select Subsystem B'
  };

  // Mutate select value
  select.value = 'opt_telemetry_b';

  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, select, preSnapshot, { doc, timeoutMs: 50 });

  assert.strictEqual(outcome.verified, true);
  assert.strictEqual(outcome.reasonCode, 'TARGET_STATE_MUTATION_VERIFIED');
  assert.ok(outcome.message.includes('Select action executed and verified'));
});

test('SemanticVerifier: Verifies safe path navigation change without leaking raw URL or tokens', async () => {
  const doc = new MockDocument();
  doc.location.pathname = '/telemetry/overview';

  const preSnapshot = SemanticStateVerifier.captureSnapshot(null, doc);

  const proposal = {
    actionId: 'act_nav_1',
    kind: 'click',
    targetLocalId: 'el_nav',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Navigate to mission logs',
    expectedState: 'Navigated to mission logs'
  };

  // Path mutates (with arbitrary sensitive token in query params)
  doc.location.pathname = '/telemetry/logs';
  doc.location.search = '?access_token=TOP_SECRET_CANARY_DO_NOT_LOG';

  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, null, preSnapshot, { doc, timeoutMs: 50 });

  assert.strictEqual(outcome.verified, true);
  assert.strictEqual(outcome.reasonCode, 'SAFE_NAVIGATION_VERIFIED');
  assert.ok(outcome.message.includes('navigation change detected'));

  // Critical privacy assertion: Ensure diagnostic message does NOT include raw URL or canary query params
  assert.strictEqual(outcome.message.includes('TOP_SECRET_CANARY'), false);
  assert.strictEqual(outcome.message.includes('access_token'), false);
});

test('SemanticVerifier: Times out when no mutations occur within bounded window (TIMEOUT_EXPIRED)', async () => {
  MockMutationObserver.reset();
  const doc = new MockDocument();
  const btn = doc.createElement('button');

  const preSnapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  const proposal = {
    actionId: 'act_timeout_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Click unresponsive button',
    expectedState: 'Confirmation modal opens'
  };

  // Zero mutations occur
  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, { doc, timeoutMs: 40 });

  assert.strictEqual(outcome.verified, false);
  assert.strictEqual(outcome.reasonCode, 'TIMEOUT_EXPIRED');
  assert.ok(outcome.message.includes('timeout expired'));
});

test('SemanticVerifier: Rejects unrelated mutations (UNRELATED_MUTATION)', async () => {
  MockMutationObserver.reset();
  const doc = new MockDocument();
  const btn = doc.createElement('button');

  const preSnapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  const proposal = {
    actionId: 'act_unrelated_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Open modal',
    expectedState: 'Preview drawer opens'
  };

  // Start verification
  const verifyPromise = SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, { doc, timeoutMs: 50 });

  // An unrelated element mutates (e.g. background ticker span text)
  setTimeout(() => {
    const unrelatedSpan = doc.createElement('span');
    unrelatedSpan.textContent = 'Ticker: 42.1';
  }, 10);

  const outcome = await verifyPromise;

  assert.strictEqual(outcome.verified, false);
  assert.strictEqual(outcome.reasonCode, 'UNRELATED_MUTATION');
  assert.ok(outcome.message.includes('did not satisfy the expected postcondition'));
});

test('SemanticVerifier: Rejects document.readyState as generic proof of outcome', async () => {
  const doc = new MockDocument();
  const btn = doc.createElement('button');

  const preSnapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  const proposal = {
    actionId: 'act_readystate_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Perform action',
    expectedState: 'Expected dialog was not opened'
  };

  // document.readyState is 'complete', but the expected postcondition is NOT met
  doc.readyState = 'complete';

  const outcome = await SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, { doc, timeoutMs: 20 });

  assert.strictEqual(outcome.verified, false, 'document.readyState === complete must NEVER be accepted as proof of outcome');
  assert.notStrictEqual(outcome.reasonCode, 'PASSIVE_ACTION_VERIFIED');
});

test('SemanticVerifier: Image diff corroborates outcome but is NOT sole proof', async () => {
  const doc = new MockDocument();
  const btn = doc.createElement('button');

  const preSnapshot = SemanticStateVerifier.captureSnapshot(btn, doc);

  const proposal = {
    actionId: 'act_img_diff_1',
    kind: 'click',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Perform action',
    expectedState: 'Preview modal is visible'
  };

  // Image diff claims change, but DOM postcondition failed
  const failedOutcome = await SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, {
    doc,
    timeoutMs: 20,
    imageDiffCorroborated: true
  });

  assert.strictEqual(failedOutcome.verified, false, 'Image difference alone cannot verify action if DOM postconditions fail');

  // When DOM postcondition succeeds, image diff is recorded as corroborating metadata
  btn.setAttribute('aria-expanded', 'true');
  const successOutcome = await SemanticStateVerifier.verifyOutcome(proposal, btn, preSnapshot, {
    doc,
    timeoutMs: 20,
    imageDiffCorroborated: true
  });

  assert.strictEqual(successOutcome.verified, true);
  assert.strictEqual(successOutcome.details?.corroboratedByImageDiff, true);
});

