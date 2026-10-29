/**
 * @privapilot/tests - Hardware-Level Input Dispatcher (CDP) Test Suite
 *
 * Verifies Chrome DevTools Protocol session management, mouse click sequencing,
 * keyboard typing events, and fail-safe graceful degradation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpInputDispatcher } from '../../apps/extension/dist/browser/cdp-dispatcher.js';

// Setup Mock chrome.debugger environment
class MockChromeDebugger {
  constructor() {
    this.commands = [];
    this.attachedTargets = new Set();
    this.listeners = new Set();
  }

  attach(target, version, callback) {
    this.attachedTargets.add(target.tabId);
    callback();
  }

  detach(target, callback) {
    this.attachedTargets.delete(target.tabId);
    if (callback) callback();
  }

  sendCommand(target, method, params, callback) {
    this.commands.push({ tabId: target.tabId, method, params });
    callback({ result: 'ok' });
  }

  onDetach = {
    addListener: (fn) => this.listeners.add(fn),
    removeListener: (fn) => this.listeners.delete(fn),
    hasListener: (fn) => this.listeners.has(fn)
  };
}

test('CDP Dispatcher: Attaches and detaches cleanly on target tab', async () => {
  const mockDebugger = new MockChromeDebugger();
  globalThis.chrome = {
    debugger: mockDebugger,
    runtime: { lastError: null }
  };

  const attached = await CdpInputDispatcher.attach(101);
  assert.equal(attached, true, 'Debugger should attach to tab 101');
  assert.equal(CdpInputDispatcher.isAttached(101), true);

  await CdpInputDispatcher.detach(101);
  assert.equal(CdpInputDispatcher.isAttached(101), false);
  assert.equal(mockDebugger.attachedTargets.has(101), false);
});

test('CDP Dispatcher: Dispatches mouseMoved -> mousePressed -> mouseReleased for click', async () => {
  const mockDebugger = new MockChromeDebugger();
  globalThis.chrome = {
    debugger: mockDebugger,
    runtime: { lastError: null }
  };

  const success = await CdpInputDispatcher.dispatchClick(202, 450, 320, { button: 'left' });
  assert.equal(success, true);

  const methods = mockDebugger.commands.map((c) => c.method);
  assert.equal(methods.length, 3);
  assert.equal(methods[0], 'Input.dispatchMouseEvent');
  assert.equal(methods[1], 'Input.dispatchMouseEvent');
  assert.equal(methods[2], 'Input.dispatchMouseEvent');

  assert.equal(mockDebugger.commands[0].params.type, 'mouseMoved');
  assert.equal(mockDebugger.commands[0].params.x, 450);
  assert.equal(mockDebugger.commands[0].params.y, 320);

  assert.equal(mockDebugger.commands[1].params.type, 'mousePressed');
  assert.equal(mockDebugger.commands[1].params.button, 'left');

  assert.equal(mockDebugger.commands[2].params.type, 'mouseReleased');
  assert.equal(mockDebugger.commands[2].params.button, 'left');

  await CdpInputDispatcher.detach(202);
});

test('CDP Dispatcher: Dispatches hardware keystrokes and Enter key correctly', async () => {
  const mockDebugger = new MockChromeDebugger();
  globalThis.chrome = {
    debugger: mockDebugger,
    runtime: { lastError: null }
  };

  const success = await CdpInputDispatcher.dispatchType(303, 'A\n', { delayMs: 0 });
  assert.equal(success, true);

  // 'A' generates keyDown + keyUp; '\n' generates rawKeyDown + keyUp
  assert.equal(mockDebugger.commands.length, 4);

  // 'A'
  assert.equal(mockDebugger.commands[0].params.type, 'keyDown');
  assert.equal(mockDebugger.commands[0].params.text, 'A');
  assert.equal(mockDebugger.commands[1].params.type, 'keyUp');

  // '\n'
  assert.equal(mockDebugger.commands[2].params.type, 'rawKeyDown');
  assert.equal(mockDebugger.commands[2].params.key, 'Enter');
  assert.equal(mockDebugger.commands[2].params.windowsVirtualKeyCode, 13);
  assert.equal(mockDebugger.commands[3].params.type, 'keyUp');

  await CdpInputDispatcher.detach(303);
});

test('CDP Dispatcher: Degrades gracefully to false when debugger is unavailable', async () => {
  // Clear mock chrome.debugger
  globalThis.chrome = {};

  const isAvail = CdpInputDispatcher.isAvailable();
  assert.equal(isAvail, false);

  const success = await CdpInputDispatcher.dispatchClick(404, 100, 100);
  assert.equal(success, false, 'Should return false without crashing when debugger API is absent');
});

test('CDP Dispatcher: Dispatches continuous interpolated mouse movements for drag-and-drop', async () => {
  const mockDebugger = new MockChromeDebugger();
  globalThis.chrome = {
    debugger: mockDebugger,
    runtime: { lastError: null }
  };

  const success = await CdpInputDispatcher.dispatchDragAndDrop(
    505,
    { x: 100, y: 100 },
    { x: 300, y: 300 },
    5
  );

  assert.equal(success, true);
  const types = mockDebugger.commands.map((c) => c.params.type);

  // 1 move to origin + 1 mousePressed + 5 intermediate moves + 1 mouseReleased = 8 commands
  assert.equal(types[0], 'mouseMoved');
  assert.equal(types[1], 'mousePressed');
  assert.equal(mockDebugger.commands[1].params.buttons, 1);

  assert.equal(types[types.length - 1], 'mouseReleased');
  assert.equal(mockDebugger.commands[types.length - 1].params.x, 300);
  assert.equal(mockDebugger.commands[types.length - 1].params.y, 300);

  await CdpInputDispatcher.detach(505);
});

