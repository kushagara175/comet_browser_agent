/**
 * @privapilot/extension - ActionExecutor & Controlled Input Typing Unit Tests
 *
 * Tests typing into:
 * 1. Normal HTMLInputElement
 * 2. HTMLTextAreaElement
 * 3. Controlled React Input with native setter tracking & event bubbling
 * 4. Disabled and Read-only inputs (rejection)
 * 5. Stale and Detached targets (rejection)
 * 6. Hidden targets (rejection)
 * 7. Semantically changed targets (rejection)
 * 8. Sensitive form fields (password, OTP, payment card, CVV, token) (safety policy rejection)
 * 9. Focus preservation and standard bubbling behavior
 */

import test from 'node:test';
import assert from 'node:assert';
import { ActionExecutor } from '../apps/extension/dist/content/action-executor.js';

// ============================================================================
// Synthetic DOM Simulation Environment
// ============================================================================

class MockNode extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.ownerDocument = null;
    this.parentNode = null;
    this.isConnected = true;
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.style = {};
    this._focused = false;
    this._scrolledIntoView = false;
    this._textContent = '';
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  get innerText() {
    return this._textContent;
  }

  set innerText(val) {
    this._textContent = String(val);
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name.toLowerCase(), String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name) {
    this.attributes.delete(name.toLowerCase());
  }

  focus() {
    this._focused = true;
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  blur() {
    this._focused = false;
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  scrollIntoView() {
    this._scrolledIntoView = true;
  }

  getBoundingClientRect() {
    return { x: 10, y: 10, width: 100, height: 30, top: 10, left: 10, right: 110, bottom: 40 };
  }

  dispatchEvent(event) {
    const result = super.dispatchEvent(event);
    if (event.bubbles && this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
      this.parentNode.dispatchEvent(event);
    }
    return result;
  }
}

class MockInputElement extends MockNode {
  constructor() {
    super('input');
    this._value = '';
    this.setAttribute('type', 'text');
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val);
  }
}

class MockTextAreaElement extends MockNode {
  constructor() {
    super('textarea');
    this._value = '';
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val);
  }
}

class MockSelectElement extends MockNode {
  constructor() {
    super('select');
    this._value = '';
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val);
  }
}

class MockDocument {
  constructor() {
    this.activeElement = null;
    this._elementsById = new Map();
    this.defaultView = {
      HTMLInputElement: MockInputElement,
      HTMLTextAreaElement: MockTextAreaElement,
      HTMLSelectElement: MockSelectElement,
      HTMLElement: MockNode,
      KeyboardEvent: globalThis.KeyboardEvent || Event,
      Event: globalThis.Event,
      InputEvent: globalThis.InputEvent || Event,
      MouseEvent: globalThis.MouseEvent || Event,
      getComputedStyle: (el) => ({
        display: el.style.display || 'block',
        visibility: el.style.visibility || 'visible',
        opacity: el.style.opacity || '1'
      })
    };
  }

  createElement(tag) {
    let el;
    const lower = tag.toLowerCase();
    if (lower === 'input') {
      el = new MockInputElement();
    } else if (lower === 'textarea') {
      el = new MockTextAreaElement();
    } else if (lower === 'select') {
      el = new MockSelectElement();
    } else {
      el = new MockNode(tag);
    }
    el.ownerDocument = this;
    return el;
  }

  contains(el) {
    return el.isConnected;
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  registerElement(id, el) {
    el.id = id;
    el.setAttribute('id', id);
    this._elementsById.set(id, el);
  }

  querySelector(selector) {
    if (selector.startsWith('label[for="')) {
      const targetId = selector.slice(11, -2);
      return this._elementsById.get(`label_${targetId}`) || null;
    }
    return null;
  }
}

// Global prototype setup for environments where HTMLInputElement/HTMLTextAreaElement are expected
if (typeof globalThis.HTMLInputElement === 'undefined') {
  globalThis.HTMLInputElement = MockInputElement;
}
if (typeof globalThis.HTMLTextAreaElement === 'undefined') {
  globalThis.HTMLTextAreaElement = MockTextAreaElement;
}
if (typeof globalThis.HTMLSelectElement === 'undefined') {
  globalThis.HTMLSelectElement = MockSelectElement;
}
if (typeof globalThis.KeyboardEvent === 'undefined') {
  globalThis.KeyboardEvent = globalThis.Event;
}
if (typeof globalThis.MouseEvent === 'undefined') {
  globalThis.MouseEvent = globalThis.Event;
}

// ============================================================================
// Test Cases
// ============================================================================

test('ActionExecutor: Types into normal HTMLInputElement with native setter and bubbles events', () => {
  const doc = new MockDocument();
  const input = doc.createElement('input');
  doc.registerElement('search-input', input);

  const parentForm = new MockNode('form');
  input.parentNode = parentForm;

  const elementMap = new Map([['el_1', input]]);
  const dispatchedEvents = [];

  input.addEventListener('input', (e) => dispatchedEvents.push({ type: 'input', bubbles: e.bubbles, value: input.value }));
  input.addEventListener('change', (e) => dispatchedEvents.push({ type: 'change', bubbles: e.bubbles, value: input.value }));
  parentForm.addEventListener('input', (e) => dispatchedEvents.push({ type: 'parent_input', bubbles: e.bubbles }));

  const proposal = {
    actionId: 'act_type_1',
    kind: 'type',
    targetLocalId: 'el_1',
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Search for ISRO mission tickets',
    textToType: 'Chandrayaan-3 telemetry'
  };

  const result = ActionExecutor.execute(proposal, elementMap);

  assert.strictEqual(result.success, true, 'Execution should succeed');
  assert.strictEqual(result.semanticOutcomeVerified, true);
  assert.strictEqual(input.value, 'Chandrayaan-3 telemetry', 'Native value setter should set input value');
  assert.strictEqual(input._focused, true, 'Target input must be focused');
  assert.strictEqual(doc.activeElement, input, 'Document activeElement must be the target input');

  // Verify events dispatched in order
  const inputEvents = dispatchedEvents.filter(e => e.type === 'input');
  const changeEvents = dispatchedEvents.filter(e => e.type === 'change');
  const parentInputEvents = dispatchedEvents.filter(e => e.type === 'parent_input');

  assert.strictEqual(inputEvents.length, 1, 'Should dispatch 1 input event');
  assert.strictEqual(inputEvents[0].bubbles, true, 'Input event must bubble');
  assert.strictEqual(inputEvents[0].value, 'Chandrayaan-3 telemetry');

  assert.strictEqual(changeEvents.length, 1, 'Should dispatch 1 change event');
  assert.strictEqual(changeEvents[0].bubbles, true, 'Change event must bubble');

  assert.strictEqual(parentInputEvents.length, 1, 'Input event must bubble to parent elements');
});

test('ActionExecutor: Types into HTMLTextAreaElement with native prototype setter', () => {
  const doc = new MockDocument();
  const textarea = doc.createElement('textarea');
  textarea.setAttribute('name', 'feedback_comments');
  doc.registerElement('feedback-area', textarea);

  const elementMap = new Map([['el_textarea', textarea]]);
  const dispatchedEvents = [];

  textarea.addEventListener('input', (e) => dispatchedEvents.push({ type: 'input', bubbles: e.bubbles, val: textarea.value }));
  textarea.addEventListener('change', (e) => dispatchedEvents.push({ type: 'change', bubbles: e.bubbles }));

  const proposal = {
    actionId: 'act_type_textarea',
    kind: 'type',
    targetLocalId: 'el_textarea',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Enter mission debrief notes',
    textToType: 'All telemetry packets validated.'
  };

  const result = ActionExecutor.execute(proposal, elementMap);

  assert.strictEqual(result.success, true);
  assert.strictEqual(textarea.value, 'All telemetry packets validated.');
  assert.strictEqual(textarea._focused, true, 'Textarea must preserve focus');
  assert.strictEqual(dispatchedEvents.some(e => e.type === 'input' && e.bubbles), true);
  assert.strictEqual(dispatchedEvents.some(e => e.type === 'change' && e.bubbles), true);
});

test('ActionExecutor: Types into Controlled React Input using prototype descriptor and synchronizes state', () => {
  const doc = new MockDocument();
  const input = doc.createElement('input');
  input.setAttribute('name', 'search_query');
  doc.registerElement('controlled-react-input', input);

  // Simulate React controlled component state & value tracker
  let reactState = 'initial';
  let reactOnChangeCalled = false;
  let reactReceivedValue = null;

  // React's internal _valueTracker
  const valueTracker = {
    _value: 'initial',
    getValue() {
      return this._value;
    },
    setValue(v) {
      this._value = v;
    }
  };
  input._valueTracker = valueTracker;

  // React overrides instance value property descriptor to track controlled mutations
  Object.defineProperty(input, 'value', {
    get() {
      return reactState;
    },
    set(val) {
      // In controlled component, assigning value directly without native setter would only update local state
      reactState = val;
    },
    configurable: true,
    enumerable: true
  });

  // React synthetic event handler on root / input
  input.addEventListener('input', () => {
    // React compares the underlying prototype value against tracker
    const nativeProtoVal = Object.getOwnPropertyDescriptor(MockInputElement.prototype, 'value').get.call(input);
    const lastTrackedVal = input._valueTracker.getValue();

    if (nativeProtoVal !== lastTrackedVal) {
      reactOnChangeCalled = true;
      reactReceivedValue = nativeProtoVal;
      reactState = nativeProtoVal; // React updates controlled state
      input._valueTracker.setValue(nativeProtoVal); // React updates tracker
    }
  });

  const elementMap = new Map([['el_react_input', input]]);

  const proposal = {
    actionId: 'act_type_react',
    kind: 'type',
    targetLocalId: 'el_react_input',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Search controlled component',
    textToType: 'Aditya-L1 solar wind data'
  };

  const result = ActionExecutor.execute(proposal, elementMap);

  assert.strictEqual(result.success, true);
  assert.strictEqual(reactOnChangeCalled, true, 'React onChange handler must be triggered by native prototype setter & input event');
  assert.strictEqual(reactReceivedValue, 'Aditya-L1 solar wind data', 'React component must receive the typed value');
  assert.strictEqual(input.value, 'Aditya-L1 solar wind data', 'Controlled state must be synchronized');
  assert.strictEqual(input._focused, true, 'Focus must be preserved on controlled input');
});

test('ActionExecutor: Rejects typing into disabled and read-only inputs', () => {
  const doc = new MockDocument();

  // 1. Disabled via property
  const disabledInput = doc.createElement('input');
  disabledInput.disabled = true;
  const elementMap1 = new Map([['el_dis_1', disabledInput]]);

  const res1 = ActionExecutor.execute({
    actionId: 'act_dis_1',
    kind: 'type',
    targetLocalId: 'el_dis_1',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type into disabled',
    textToType: 'hello'
  }, elementMap1);

  assert.strictEqual(res1.success, false);
  assert.ok(res1.message?.includes('disabled'), 'Must reject disabled input');

  // 2. Disabled via attribute
  const disabledAttrInput = doc.createElement('input');
  disabledAttrInput.setAttribute('disabled', '');
  const elementMap2 = new Map([['el_dis_2', disabledAttrInput]]);

  const res2 = ActionExecutor.execute({
    actionId: 'act_dis_2',
    kind: 'type',
    targetLocalId: 'el_dis_2',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type into disabled attr',
    textToType: 'hello'
  }, elementMap2);

  assert.strictEqual(res2.success, false);
  assert.ok(res2.message?.includes('disabled'));

  // 3. Readonly input
  const readOnlyInput = doc.createElement('input');
  readOnlyInput.readOnly = true;
  const elementMap3 = new Map([['el_ro', readOnlyInput]]);

  const res3 = ActionExecutor.execute({
    actionId: 'act_ro',
    kind: 'type',
    targetLocalId: 'el_ro',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type into read-only',
    textToType: 'hello'
  }, elementMap3);

  assert.strictEqual(res3.success, false);
  assert.ok(res3.message?.includes('read-only'), 'Must reject read-only input');
});

test('ActionExecutor: Rejects stale, missing, or detached targets', () => {
  const doc = new MockDocument();
  const validElement = doc.createElement('input');
  const elementMap = new Map([['el_valid', validElement]]);

  // 1. Missing targetLocalId
  const resMissing = ActionExecutor.execute({
    actionId: 'act_no_target',
    kind: 'type',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'No target',
    textToType: 'text'
  }, elementMap);
  assert.strictEqual(resMissing.success, false);
  assert.ok(resMissing.message?.includes('Missing targetLocalId'));

  // 2. Target not found in map (stale ID)
  const resStale = ActionExecutor.execute({
    actionId: 'act_stale',
    kind: 'type',
    targetLocalId: 'el_non_existent',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Stale target',
    textToType: 'text'
  }, elementMap);
  assert.strictEqual(resStale.success, false);
  assert.ok(resStale.message?.includes('stale or not found'));

  // 3. Detached from DOM (isConnected: false)
  const detachedElement = doc.createElement('input');
  detachedElement.isConnected = false;
  const elementMapDetached = new Map([['el_detached', detachedElement]]);

  const resDetached = ActionExecutor.execute({
    actionId: 'act_detached',
    kind: 'type',
    targetLocalId: 'el_detached',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Detached target',
    textToType: 'text'
  }, elementMapDetached);
  assert.strictEqual(resDetached.success, false);
  assert.ok(resDetached.message?.includes('detached from the DOM'));
});

test('ActionExecutor: Rejects hidden or invisible targets', () => {
  const doc = new MockDocument();

  // 1. Hidden attribute
  const hiddenInput = doc.createElement('input');
  hiddenInput.hidden = true;
  const resHidden = ActionExecutor.execute({
    actionId: 'act_hidden',
    kind: 'type',
    targetLocalId: 'el_hid',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type hidden',
    textToType: 'text'
  }, new Map([['el_hid', hiddenInput]]));
  assert.strictEqual(resHidden.success, false);
  assert.strictEqual(resHidden.staleTarget, true);
  assert.ok(resHidden.message?.includes('hidden or invisible'));

  // 2. aria-hidden="true"
  const ariaHiddenInput = doc.createElement('input');
  ariaHiddenInput.setAttribute('aria-hidden', 'true');
  const resAriaHidden = ActionExecutor.execute({
    actionId: 'act_aria_hidden',
    kind: 'type',
    targetLocalId: 'el_aria_hid',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type aria hidden',
    textToType: 'text'
  }, new Map([['el_aria_hid', ariaHiddenInput]]));
  assert.strictEqual(resAriaHidden.success, false);
  assert.strictEqual(resAriaHidden.staleTarget, true);
  assert.ok(resAriaHidden.message?.includes('hidden or invisible'));

  // 3. Computed style display: none
  const styledHiddenInput = doc.createElement('input');
  styledHiddenInput.style.display = 'none';
  const resStyled = ActionExecutor.execute({
    actionId: 'act_styled_hid',
    kind: 'type',
    targetLocalId: 'el_styled_hid',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Type display none',
    textToType: 'text'
  }, new Map([['el_styled_hid', styledHiddenInput]]));
  assert.strictEqual(resStyled.success, false);
  assert.strictEqual(resStyled.staleTarget, true);
  assert.ok(resStyled.message?.includes('hidden or invisible'));
});

test('ActionExecutor: Rejects semantically changed non-editable targets', () => {
  const doc = new MockDocument();

  // 1. Target is a button
  const button = doc.createElement('button');
  const resButton = ActionExecutor.execute({
    actionId: 'act_type_btn',
    kind: 'type',
    targetLocalId: 'el_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Attempt typing into button',
    textToType: 'text'
  }, new Map([['el_btn', button]]));
  assert.strictEqual(resButton.success, false);
  assert.ok(resButton.message?.includes('semantically changed and does not support typing'));

  // 2. Target is a non-editable div
  const div = doc.createElement('div');
  const resDiv = ActionExecutor.execute({
    actionId: 'act_type_div',
    kind: 'type',
    targetLocalId: 'el_div',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Attempt typing into div',
    textToType: 'text'
  }, new Map([['el_div', div]]));
  assert.strictEqual(resDiv.success, false);
  assert.ok(resDiv.message?.includes('semantically changed and does not support typing'));

  // 3. Target is an input of type="button"
  const inputButton = doc.createElement('input');
  inputButton.setAttribute('type', 'button');
  const resInputBtn = ActionExecutor.execute({
    actionId: 'act_type_inp_btn',
    kind: 'type',
    targetLocalId: 'el_inp_btn',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Attempt typing into input button',
    textToType: 'text'
  }, new Map([['el_inp_btn', inputButton]]));
  assert.strictEqual(resInputBtn.success, false);
  assert.ok(resInputBtn.message?.includes('does not support text input'));
});

test('ActionExecutor: Rejects typing into sensitive inputs (password, OTP, card, CVV, token, sensitive keywords)', () => {
  const doc = new MockDocument();

  // 1. Password input type
  const passwordInput = doc.createElement('input');
  passwordInput.setAttribute('type', 'password');
  passwordInput.setAttribute('name', 'user_password');
  const resPwd = ActionExecutor.execute({
    actionId: 'act_pwd',
    kind: 'type',
    targetLocalId: 'el_pwd',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Type password',
    textToType: 'Secret123!'
  }, new Map([['el_pwd', passwordInput]]));
  assert.strictEqual(resPwd.success, false);
  assert.ok(resPwd.message?.includes('Action blocked: Typing into sensitive field'));

  // 2. OTP input with autocomplete
  const otpInput = doc.createElement('input');
  otpInput.setAttribute('type', 'text');
  otpInput.setAttribute('autocomplete', 'one-time-code');
  otpInput.setAttribute('name', 'mfa_token');
  const resOtp = ActionExecutor.execute({
    actionId: 'act_otp',
    kind: 'type',
    targetLocalId: 'el_otp',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Type OTP',
    textToType: '123456'
  }, new Map([['el_otp', otpInput]]));
  assert.strictEqual(resOtp.success, false);
  assert.ok(resOtp.message?.includes('Action blocked: Typing into sensitive field'));

  // 3. Payment credit card input
  const cardInput = doc.createElement('input');
  cardInput.setAttribute('type', 'text');
  cardInput.setAttribute('autocomplete', 'cc-number');
  cardInput.setAttribute('name', 'card_number');
  const resCard = ActionExecutor.execute({
    actionId: 'act_card',
    kind: 'type',
    targetLocalId: 'el_card',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Type credit card number',
    textToType: '4532015012345671'
  }, new Map([['el_card', cardInput]]));
  assert.strictEqual(resCard.success, false);
  assert.ok(resCard.message?.includes('Action blocked: Typing into sensitive field'));

  // 4. CVV code input
  const cvvInput = doc.createElement('input');
  cvvInput.setAttribute('type', 'text');
  cvvInput.setAttribute('name', 'cvv_code');
  cvvInput.setAttribute('placeholder', 'Enter CVV');
  const resCvv = ActionExecutor.execute({
    actionId: 'act_cvv',
    kind: 'type',
    targetLocalId: 'el_cvv',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Type CVV code',
    textToType: '892'
  }, new Map([['el_cvv', cvvInput]]));
  assert.strictEqual(resCvv.success, false);
  assert.ok(resCvv.message?.includes('Action blocked: Typing into sensitive field'));

  // 5. Sensitive token / canary input
  const tokenInput = doc.createElement('input');
  tokenInput.setAttribute('type', 'text');
  tokenInput.setAttribute('name', 'api_secret_key');
  const resToken = ActionExecutor.execute({
    actionId: 'act_token',
    kind: 'type',
    targetLocalId: 'el_token',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Type API key',
    textToType: 'secret_token_value'
  }, new Map([['el_token', tokenInput]]));
  assert.strictEqual(resToken.success, false);
  assert.ok(resToken.message?.includes('Action blocked: Typing into sensitive field'));

  // 6. Blocked risk proposal
  const normalInput = doc.createElement('input');
  const resBlockedRisk = ActionExecutor.execute({
    actionId: 'act_blocked_risk',
    kind: 'type',
    targetLocalId: 'el_norm',
    confidence: 0.99,
    risk: 'blocked',
    rationale: 'Blocked by policy',
    textToType: 'text'
  }, new Map([['el_norm', normalInput]]));
  assert.strictEqual(resBlockedRisk.success, false);
  assert.ok(resBlockedRisk.message?.includes('Action blocked by client safety policy'));
});

test('ActionExecutor: Executes smooth reading scroll down and up realistically', () => {
  let scrollByCalled = false;
  let scrollByOptions = null;
  const originalWindow = global.window;
  global.window = {
    innerHeight: 900,
    scrollY: 0,
    scrollBy: (opts) => {
      scrollByCalled = true;
      scrollByOptions = opts;
    },
    scrollTo: () => {}
  };

  try {
    const res = ActionExecutor.execute({
      actionId: 'act_scroll_1',
      kind: 'scroll',
      scrollDirection: 'down',
      confidence: 0.95,
      risk: 'safe',
      rationale: 'Scroll down article'
    }, new Map());

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.message, 'Scrolled down');
    assert.strictEqual(scrollByCalled, true);
    assert.strictEqual(scrollByOptions?.behavior, 'smooth');
    assert.ok(scrollByOptions?.top > 400, 'Reading delta should be proportional to viewport height');
  } finally {
    global.window = originalWindow;
  }
});

test('ActionExecutor: Scrolls target element into view smoothly when targetLocalId is provided', () => {
  let scrollIntoViewCalled = false;
  let scrollIntoViewOptions = null;

  const targetHeading = {
    scrollIntoView: (opts) => {
      scrollIntoViewCalled = true;
      scrollIntoViewOptions = opts;
    }
  };

  const res = ActionExecutor.execute({
    actionId: 'act_scroll_target',
    kind: 'scroll',
    targetLocalId: 'el_heading_instruments',
    scrollDirection: 'down',
    confidence: 0.98,
    risk: 'safe',
    rationale: 'Scroll to instruments heading'
  }, new Map([['el_heading_instruments', targetHeading]]));

  assert.strictEqual(res.success, true);
  assert.strictEqual(scrollIntoViewCalled, true);
  assert.strictEqual(scrollIntoViewOptions?.behavior, 'smooth');
  assert.strictEqual(scrollIntoViewOptions?.block, 'center');
});

