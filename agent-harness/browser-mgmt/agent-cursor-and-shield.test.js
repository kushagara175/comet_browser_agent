/**
 * @privapilot/extension - Animated AI Ghost Cursor & Execution Safety Shield Unit Tests
 *
 * Tests the visual agent cursor and execution safety shield:
 * 1. Ghost cursor DOM initialization and styling
 * 2. Gliding trajectory calculation and badge labeling (click, type, select, hover, scroll)
 * 3. Click ripple and typing badge visual cues
 * 4. Cursor auto-dismissal and manual parking
 * 5. Execution Safety Shield event interception (click, mousedown, keydown blocking)
 * 6. Emergency Escape key release and pause event dispatch
 * 7. Overlay cleanup and state isolation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { OverlayRenderer } from '../../apps/extension/dist/content/overlay-renderer.js';

// Mock DOM environment
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this._classes = new Set();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this._innerHTML = '';
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    this.setAttribute('id', val);
  }

  get classList() {
    return {
      add: (...classes) => classes.forEach((c) => this._classes.add(c)),
      remove: (...classes) => classes.forEach((c) => this._classes.delete(c)),
      contains: (cls) => this._classes.has(cls)
    };
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(val) {
    this._classes.clear();
    String(val).split(/\s+/).filter(Boolean).forEach((c) => this._classes.add(c));
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) || null;
  }

  setAttribute(name, value) {
    this.attributes.set(name.toLowerCase(), String(value));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(child) {
    if (!child) return false;
    if (child === this) return true;
    return this.children.some((c) => c === child || (c.contains && c.contains(child)));
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      for (const c of this.children) {
        if (c.classList.contains(cls)) return c;
        if (c.querySelector) {
          const res = c.querySelector(selector);
          if (res) return res;
        }
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      for (const c of this.children) {
        if (c.classList.contains(cls)) results.push(c);
        if (c.querySelectorAll) {
          results.push(...c.querySelectorAll(selector));
        }
      }
    }
    return results;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    // Mock parser for child elements
    if (html.includes('privapilot-cursor-ripple')) {
      const ripple = new MockElement('div');
      ripple.classList.add('privapilot-cursor-ripple');
      this.appendChild(ripple);
    }
    if (html.includes('privapilot-cursor-badge')) {
      const badge = new MockElement('div');
      badge.classList.add('privapilot-cursor-badge');
      const icon = new MockElement('span');
      icon.classList.add('privapilot-cursor-badge-icon');
      const text = new MockElement('span');
      text.classList.add('privapilot-cursor-badge-text');
      badge.appendChild(icon);
      badge.appendChild(text);
      this.appendChild(badge);
    }
    if (html.includes('privapilot-shield-hud')) {
      const hud = new MockElement('div');
      hud.classList.add('privapilot-shield-hud');
      const text = new MockElement('span');
      text.classList.add('privapilot-shield-text');
      hud.appendChild(text);
      this.appendChild(hud);
    }
  }

  getBoundingClientRect() {
    return {
      top: 100,
      left: 200,
      width: 120,
      height: 40,
      right: 320,
      bottom: 140
    };
  }
}

function setupMockDocument() {
  const body = new MockElement('body');
  const head = new MockElement('head');
  const doc = {
    body,
    head,
    documentElement: body,
    getElementById(id) {
      if (id === 'privapilot-glow-styles') return null;
      for (const c of body.children) {
        if (c.getAttribute('id') === id) return c;
      }
      return null;
    },
    createElement(tag) {
      return new MockElement(tag);
    },
    createElementNS(ns, tag) {
      return new MockElement(tag);
    }
  };

  const listeners = new Map();
  const dispatchedEvents = [];

  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(event, handler, options) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push({ handler, options });
    },
    removeEventListener(event, handler) {
      if (!listeners.has(event)) return;
      const list = listeners.get(event);
      const idx = list.findIndex((item) => item.handler === handler);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      const list = listeners.get(event.type) || [];
      for (const item of [...list]) {
        item.handler(event);
      }
      return true;
    }
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  return { doc, body, win, listeners, dispatchedEvents };
}

test('Agent Cursor: ensureCursor() lazily instantiates cursor DOM with isolation attributes', () => {
  const { body } = setupMockDocument();
  const renderer = new OverlayRenderer();

  const cursor = renderer.ensureCursor();
  assert.ok(cursor, 'Cursor element should be created');
  assert.equal(cursor.getAttribute('id'), 'privapilot-agent-cursor');
  assert.equal(cursor.getAttribute('data-privapilot-ignore'), 'true');
  assert.equal(cursor.getAttribute('aria-hidden'), 'true');
  assert.ok(body.contains(cursor), 'Cursor should be appended to body');

  // Idempotency: second call returns same instance
  const cursor2 = renderer.ensureCursor();
  assert.strictEqual(cursor, cursor2, 'ensureCursor should return existing instance');
});

test('Agent Cursor: glideCursorTo() calculates target coordinates and updates action badge', async () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  const targetEl = new MockElement('button');
  targetEl.getBoundingClientRect = () => ({
    top: 150,
    left: 250,
    width: 100,
    height: 40,
    right: 350,
    bottom: 190
  });

  await renderer.glideCursorTo(targetEl, 'CLICK', undefined, 10);

  const cursor = renderer.ensureCursor();
  assert.equal(cursor.style.opacity, '1', 'Cursor should be visible');
  assert.ok(cursor.style.transform.includes('translate3d'), 'Cursor should have 3D transform set');

  const icon = cursor.querySelector('.privapilot-cursor-badge-icon');
  const text = cursor.querySelector('.privapilot-cursor-badge-text');
  assert.ok(icon?.innerHTML?.includes('<svg'), 'Icon should be clean vector SVG');
  assert.equal(text?.textContent, 'Click');
});

test('Agent Cursor: glideCursorTo() formats type action with snippet text', async () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  const inputEl = new MockElement('input');
  inputEl.getBoundingClientRect = () => ({
    top: 200,
    left: 100,
    width: 300,
    height: 35,
    right: 400,
    bottom: 235
  });

  await renderer.glideCursorTo(inputEl, 'TYPE', 'Smart India Hackathon', 10);

  const cursor = renderer.ensureCursor();
  const icon = cursor.querySelector('.privapilot-cursor-badge-icon');
  const text = cursor.querySelector('.privapilot-cursor-badge-text');
  assert.ok(icon?.innerHTML?.includes('<svg'), 'Icon should be clean vector SVG');
  assert.ok(text?.textContent?.includes('Smart India Hack'), 'Should truncate and format typed snippet');
});

test('Agent Cursor: setCursorPointerType() switches between arrow, hand, and caret', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();
  renderer.ensureCursor();
  assert.doesNotThrow(() => {
    renderer.setCursorPointerType('hand');
    renderer.setCursorPointerType('caret');
    renderer.setCursorPointerType('arrow');
  });
});

test('Agent Cursor: animateClickPress() simulates physical mouse press and release', async () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();
  renderer.ensureCursor();
  await assert.doesNotReject(async () => {
    await renderer.animateClickPress();
  });
});

test('Agent Cursor: triggerClickRipple() and triggerTypingBadge() operate safely', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();
  renderer.ensureCursor();

  assert.doesNotThrow(() => {
    renderer.triggerClickRipple();
  }, 'Click ripple should trigger without exception');

  assert.doesNotThrow(() => {
    renderer.triggerTypingBadge();
  }, 'Typing badge should trigger without exception');
});

test('Agent Cursor: hideCursor() fades out cursor opacity', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();
  const cursor = renderer.ensureCursor();

  renderer.hideCursor(0);
  assert.equal(cursor.style.opacity, '0', 'Cursor should be hidden immediately when delay is 0');
});

test('Execution Safety Shield: enableSafetyShield() locks external events in capture phase', () => {
  const { body, listeners } = setupMockDocument();
  const renderer = new OverlayRenderer();

  assert.equal(renderer.isExternalInputLocked(), false);
  renderer.enableSafetyShield('Automating form');
  assert.equal(renderer.isExternalInputLocked(), true);

  // Verify capturing event listeners attached
  const clickListeners = listeners.get('click') || [];
  assert.ok(clickListeners.length > 0, 'Should attach click listener');
  assert.equal(clickListeners[0].options?.capture, true, 'Should use capture phase');

  // Verify shield DOM element
  const shield = body.children.find((c) => c.getAttribute('id') === 'privapilot-execution-shield');
  assert.ok(shield, 'Execution shield element should be created');
  assert.equal(shield.getAttribute('data-privapilot-ignore'), 'true');
});

test('Execution Safety Shield: blocks user click events', () => {
  const { listeners } = setupMockDocument();
  const renderer = new OverlayRenderer();
  renderer.enableSafetyShield('Testing Shield');

  let stoppedPropagation = false;
  let preventedDefault = false;

  const mockClickEvent = {
    type: 'click',
    cancelable: true,
    stopPropagation() { stoppedPropagation = true; },
    stopImmediatePropagation() { stoppedPropagation = true; },
    preventDefault() { preventedDefault = true; }
  };

  const handler = listeners.get('click')[0].handler;
  handler(mockClickEvent);

  assert.ok(stoppedPropagation, 'Shield should stop event propagation');
  assert.ok(preventedDefault, 'Shield should prevent default action');
});

test('Execution Safety Shield: Escape key triggers emergency release and pause event', () => {
  const { listeners, dispatchedEvents } = setupMockDocument();
  const renderer = new OverlayRenderer();
  renderer.enableSafetyShield('Testing Shield');
  assert.equal(renderer.isExternalInputLocked(), true);

  const mockEscapeEvent = {
    type: 'keydown',
    key: 'Escape',
    cancelable: true,
    stopPropagation() {},
    stopImmediatePropagation() {},
    preventDefault() {}
  };

  const handler = listeners.get('keydown')[0].handler;
  handler(mockEscapeEvent);

  assert.equal(renderer.isExternalInputLocked(), false, 'Escape should immediately unlock shield');
  assert.ok(dispatchedEvents.some((e) => e.type === 'privapilot-emergency-pause'), 'Should dispatch emergency pause');
});

test('Execution Safety Shield: disableSafetyShield() restores user control', () => {
  const { listeners } = setupMockDocument();
  const renderer = new OverlayRenderer();

  renderer.enableSafetyShield();
  assert.equal(renderer.isExternalInputLocked(), true);

  renderer.disableSafetyShield();
  assert.equal(renderer.isExternalInputLocked(), false);
  assert.equal(listeners.get('click')?.length || 0, 0, 'Listeners should be unbound');
});

test('OverlayRenderer: clear() cleans all target boxes, cursor, and safety shield', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  renderer.enableSafetyShield('Active task');
  renderer.ensureCursor();
  assert.equal(renderer.isExternalInputLocked(), true);

  renderer.clear();
  assert.equal(renderer.isExternalInputLocked(), false);
  const cursor = renderer.ensureCursor();
  assert.equal(cursor.style.opacity, '0');
});

test('Agent Cursor: computeTargetPoint() pinpoints button center with pointer hand offset', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  const buttonEl = new MockElement('button');
  buttonEl.getBoundingClientRect = () => ({
    top: 200,
    left: 400,
    width: 160,
    height: 50,
    right: 560,
    bottom: 250
  });

  const pt = renderer.computeTargetPoint(buttonEl, 'hand');
  // True center of button: left 400 + 80 = 480, top 200 + 25 = 225
  assert.equal(pt.targetX, 480, 'Button targetX should be exactly at horizontal center');
  assert.equal(pt.targetY, 225, 'Button targetY should be exactly at vertical center');
  // Hand index finger tip offset: x - 7.1, y - 2.1
  assert.equal(pt.containerX, 473, 'containerX compensates for hand index finger tip');
  assert.equal(pt.containerY, 223, 'containerY compensates for hand index finger tip');
});

test('Agent Cursor: computeTargetPoint() calculates text input insertion point with caret offset', () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  const inputEl = new MockElement('input');
  inputEl.setAttribute('type', 'text');
  inputEl.getBoundingClientRect = () => ({
    top: 100,
    left: 150,
    width: 320,
    height: 40,
    right: 470,
    bottom: 140
  });

  const pt = renderer.computeTargetPoint(inputEl, 'caret');
  // Text input indentation: left 150 + min(max(320*0.08, 12), 40) = 150 + 25.6 = 176
  assert.equal(pt.targetX, 176, 'Input targetX should be inside typing field');
  assert.equal(pt.targetY, 120, 'Input targetY should be centered vertically');
  // Caret I-beam center offset: x - 7.5, y - 8.25 -> 176 - 7.5 = 168.5 -> rounded 169
  assert.equal(pt.containerX, 169, 'containerX compensates for I-beam center');
  assert.equal(pt.containerY, 112, 'containerY compensates for I-beam center');
});

test('Agent Cursor: glideCursorTo() dynamically tracks moving element during animation', async () => {
  setupMockDocument();
  const renderer = new OverlayRenderer();

  let topPos = 300;
  const dynamicEl = new MockElement('button');
  dynamicEl.getBoundingClientRect = () => ({
    top: topPos,
    left: 500,
    width: 100,
    height: 40,
    right: 600,
    bottom: topPos + 40
  });

  // Start glide with RAF duration
  const glidePromise = renderer.glideCursorTo(dynamicEl, 'CLICK', undefined, 40);
  // Element shifts position during execution (e.g. scroll or reflow)
  topPos = 180;
  await glidePromise;

  const cursor = renderer.ensureCursor();
  // Target center at end: left 550, top 180 + 20 = 200. Container: 550 - 7 = 543, 200 - 2 = 198
  assert.ok(cursor.style.transform.includes('198px'), 'Cursor lands on live updated element coordinate');
});

