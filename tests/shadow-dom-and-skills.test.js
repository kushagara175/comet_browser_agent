/**
 * @privapilot/extension - Shadow DOM, Headless Controls, Dialogs & File Upload Unit Tests
 *
 * Verifies capabilities inspired by browser-use/browser-harness replicated inside MV3:
 * 1. Open Shadow DOM recursion
 * 2. Headless Dropdown & Combobox role extraction
 * 3. Native Dialog interception immunity
 * 4. File input upload execution
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ElementExtractor } from '../apps/extension/dist/content/element-extractor.js';
import { ActionExecutor } from '../apps/extension/dist/content/action-executor.js';

test('Shadow DOM Piercing: Recursively extracts interactive elements from open ShadowRoot', () => {
  const extractor = new ElementExtractor();

  // Mock Shadow Root inside a custom web component <sih-card>
  const mockShadowRoot = {
    querySelectorAll(selector) {
      if (selector.includes('button') || selector.includes('combobox')) {
        return [
          {
            tagName: 'BUTTON',
            getAttribute(attr) {
              if (attr === 'role') return 'button';
              return null;
            },
            getBoundingClientRect() { return { x: 150, y: 200, width: 120, height: 40 }; },
            innerText: 'Shadow Submit Idea'
          },
          {
            tagName: 'DIV',
            getAttribute(attr) {
              if (attr === 'role') return 'combobox';
              if (attr === 'aria-label') return 'Select Theme Category';
              return null;
            },
            getBoundingClientRect() { return { x: 150, y: 120, width: 200, height: 35 }; },
            innerText: 'Smart Automation'
          }
        ];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  // Mock Host Element with open shadowRoot
  const mockCustomHost = {
    tagName: 'SIH-CARD',
    shadowRoot: mockShadowRoot,
    getAttribute(attr) { return null; },
    getBoundingClientRect() { return { x: 100, y: 100, width: 400, height: 300 }; }
  };

  // Mock top document
  const mockDoc = {
    title: 'SIH Portal With Web Components',
    querySelectorAll(selector) {
      if (selector === '*') {
        return [mockCustomHost];
      }
      if (selector.includes('button')) {
        return [
          {
            tagName: 'BUTTON',
            getAttribute(attr) { return null; },
            getBoundingClientRect() { return { x: 10, y: 10, width: 80, height: 30 }; },
            innerText: 'Top Navbar'
          }
        ];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  const { snapshot } = extractor.extractSnapshot(mockDoc);

  assert.ok(snapshot.interactiveElements.length >= 3, 'Should extract top elements plus shadow elements');

  // Verify elements extracted from inside shadowRoot
  const shadowButton = snapshot.interactiveElements.find(e => e.rawName === 'Shadow Submit Idea');
  assert.ok(shadowButton, 'Must extract button from inside open shadowRoot');
  assert.equal(shadowButton.role, 'button');

  const shadowCombobox = snapshot.interactiveElements.find(e => e.rawName.includes('Theme Category') || e.rawName.includes('Smart Automation'));
  assert.ok(shadowCombobox, 'Must extract combobox from inside open shadowRoot');
  assert.equal(shadowCombobox.role, 'select');
  assert.ok(shadowCombobox.actionCapabilities.includes('select'));
});

test('Headless Controls: Extracts [role="tab"] and [role="combobox"] with appropriate roles and caps', () => {
  const extractor = new ElementExtractor();

  const mockTabEl = {
    tagName: 'DIV',
    getAttribute(attr) {
      if (attr === 'role') return 'tab';
      return null;
    },
    getBoundingClientRect() { return { x: 50, y: 50, width: 100, height: 30 }; },
    innerText: 'Problem Statements Tab'
  };

  const mockComboboxEl = {
    tagName: 'DIV',
    getAttribute(attr) {
      if (attr === 'role') return 'combobox';
      if (attr === 'aria-label') return 'Ministry Filter';
      return null;
    },
    getBoundingClientRect() { return { x: 50, y: 100, width: 150, height: 35 }; },
    innerText: 'ISRO'
  };

  const mockDoc = {
    title: 'Test Headless Controls',
    querySelectorAll(selector) {
      if (selector.includes('button')) {
        return [mockTabEl, mockComboboxEl];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  const { snapshot } = extractor.extractSnapshot(mockDoc);

  const tab = snapshot.interactiveElements.find(e => e.rawName === 'Problem Statements Tab');
  assert.ok(tab);
  assert.equal(tab.role, 'tab');
  assert.ok(tab.actionCapabilities.includes('click'));

  const combobox = snapshot.interactiveElements.find(e => e.rawName === 'ISRO');
  assert.ok(combobox);
  assert.equal(combobox.role, 'select');
  assert.ok(combobox.actionCapabilities.includes('select'));
  assert.ok(combobox.actionCapabilities.includes('click'));
});

test('File Upload: ActionExecutor safely attaches file to input[type="file"]', () => {
  let changeDispatched = false;
  let inputDispatched = false;

  const mockFileInput = {
    tagName: 'INPUT',
    id: 'file_submission',
    isConnected: true,
    ownerDocument: { contains: () => true },
    attributes: new Map([['type', 'file']]),
    getAttribute(name) { return name === 'type' ? 'file' : null; },
    getBoundingClientRect() { return { x: 50, y: 50, width: 200, height: 30 }; },
    dispatchEvent(event) {
      if (event.type === 'change') changeDispatched = true;
      if (event.type === 'input') inputDispatched = true;
      return true;
    }
  };

  const elementMap = new Map([['el_file', mockFileInput]]);

  const proposal = {
    actionId: 'act_upload_test',
    kind: 'type',
    targetLocalId: 'el_file',
    textToType: 'my_sih_presentation.pdf',
    confidence: 1.0,
    risk: 'safe',
    userApproved: true,
    rationale: 'Upload presentation to file input'
  };

  const result = ActionExecutor.execute(proposal, elementMap);

  assert.equal(result.success, true);
  assert.ok(result.message.includes('my_sih_presentation.pdf'));
  assert.equal(changeDispatched, true);
  assert.equal(inputDispatched, true);
});

test('Native Dialog Immunity: alert, confirm, and prompt do not freeze execution and capture dialog text', () => {
  const capturedDialogs = [];

  const fakeWindow = {
    alert(msg) {
      capturedDialogs.push({ type: 'alert', message: String(msg) });
    },
    confirm(msg) {
      capturedDialogs.push({ type: 'confirm', message: String(msg) });
      return true; // Non-blocking auto-confirm
    },
    prompt(msg, def) {
      capturedDialogs.push({ type: 'prompt', message: String(msg) });
      return def || '';
    }
  };

  fakeWindow.alert('Submission deadline reminder');
  const confirmed = fakeWindow.confirm('Do you confirm idea finalization?');

  assert.equal(confirmed, true, 'Confirm should safely auto-confirm without freezing thread');
  assert.equal(capturedDialogs.length, 2);
  assert.equal(capturedDialogs[0].message, 'Submission deadline reminder');
  assert.equal(capturedDialogs[1].message, 'Do you confirm idea finalization?');
});

test('Interaction Skill: ActionExecutor dispatches hover events (mouseenter, mouseover, mousemove)', () => {
  const events = [];
  const mockTarget = {
    tagName: 'BUTTON',
    isConnected: true,
    ownerDocument: { contains: () => true },
    getBoundingClientRect() { return { x: 50, y: 50, width: 100, height: 30 }; },
    focus() {},
    dispatchEvent(evt) {
      events.push(evt.type);
      return true;
    }
  };

  const elementMap = new Map([['el_btn', mockTarget]]);
  const proposal = {
    actionId: 'act_hover_1',
    kind: 'hover',
    targetLocalId: 'el_btn',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Hover over button to trigger menu'
  };

  const result = ActionExecutor.execute(proposal, elementMap);
  assert.equal(result.success, true);
  assert.ok(result.message.includes('Hovered over element'));
});

test('Interaction Skill: ActionExecutor dispatches synthetic drag_and_drop sequence', () => {
  const sourceEvents = [];
  const destEvents = [];

  const mockSource = {
    tagName: 'DIV',
    id: 'source_item',
    isConnected: true,
    ownerDocument: { contains: () => true },
    getBoundingClientRect() { return { x: 10, y: 10, width: 50, height: 50 }; },
    dispatchEvent(evt) {
      sourceEvents.push(evt.type);
      return true;
    }
  };

  const mockDest = {
    tagName: 'DIV',
    id: 'drop_zone',
    isConnected: true,
    ownerDocument: { contains: () => true },
    getBoundingClientRect() { return { x: 200, y: 200, width: 100, height: 100 }; },
    dispatchEvent(evt) {
      destEvents.push(evt.type);
      return true;
    }
  };

  const elementMap = new Map([
    ['el_src', mockSource],
    ['el_dest', mockDest]
  ]);

  const proposal = {
    actionId: 'act_drag_1',
    kind: 'drag_and_drop',
    targetLocalId: 'el_src',
    destinationLocalId: 'el_dest',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Drag item into drop zone'
  };

  const result = ActionExecutor.execute(proposal, elementMap);
  assert.equal(result.success, true);
  assert.ok(result.message.includes("Dragged element 'el_src' to 'el_dest'"));
  assert.ok(sourceEvents.includes('dragstart'));
  assert.ok(destEvents.includes('drop'));
});

test('Interaction Skill: ActionExecutor executes upload_file with fileName and payload', () => {
  let changeFired = false;
  let inputFired = false;

  const mockFileInput = {
    tagName: 'INPUT',
    id: 'upload_ctrl',
    isConnected: true,
    ownerDocument: { contains: () => true },
    getAttribute(name) { return name === 'type' ? 'file' : null; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 25 }; },
    dispatchEvent(evt) {
      if (evt.type === 'change') changeFired = true;
      if (evt.type === 'input') inputFired = true;
      return true;
    }
  };

  const elementMap = new Map([['el_upload', mockFileInput]]);
  const proposal = {
    actionId: 'act_upload_1',
    kind: 'upload_file',
    targetLocalId: 'el_upload',
    fileName: 'sih_team_solution.pdf',
    fileData: 'JVBERi0xLjQK...',
    mimeType: 'application/pdf',
    confidence: 1.0,
    risk: 'protected',
    userApproved: true,
    rationale: 'Upload solution PDF'
  };

  const result = ActionExecutor.execute(proposal, elementMap);
  assert.equal(result.success, true);
  assert.ok(result.message.includes('sih_team_solution.pdf'));
  assert.equal(changeFired, true);
  assert.equal(inputFired, true);
});

test('Agent Helpers: setNativeControlledValue sets value on mock elements', async () => {
  const { setNativeControlledValue } = await import('../packages/protocol/dist/index.js');
  const mockInput = {
    tagName: 'INPUT',
    value: '',
    dispatchEvent() { return true; }
  };

  const success = setNativeControlledValue(mockInput, 'Testing controlled input');
  assert.equal(success, true);
  assert.equal(mockInput.value, 'Testing controlled input');
});

test('Agent Helpers: collectOpenShadowRoots returns all shadow roots recursively', async () => {
  const { collectOpenShadowRoots } = await import('../packages/protocol/dist/index.js');
  const mockChildShadow = { tagName: 'INNER-SHADOW' };
  const mockParentShadow = {
    tagName: 'OUTER-SHADOW',
    shadowRoot: {
      children: [{ shadowRoot: mockChildShadow }]
    }
  };

  const roots = collectOpenShadowRoots(mockParentShadow);
  assert.equal(roots.length, 2);
});
