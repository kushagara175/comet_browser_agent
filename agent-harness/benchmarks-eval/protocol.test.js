/**
 * Protocol and Coordinate System Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  viewportToScreenshotBox,
  mergeBoundingBoxes,
  classifyActionRisk,
  resolveTaskContract
} from '../../packages/protocol/dist/index.js';

test('Coordinate Transformation - Handles DPR 2x Scaling and Clamping', () => {
  const meta = {
    viewportWidth: 1000,
    viewportHeight: 500,
    screenshotWidth: 2000,
    screenshotHeight: 1000,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now()
  };

  const viewportBox = {
    space: 'viewportCssPixel',
    x: 100,
    y: 50,
    width: 200,
    height: 40
  };

  const screenshotBox = viewportToScreenshotBox(viewportBox, meta, 4);

  // Scaled coordinates with 4px padding
  assert.strictEqual(screenshotBox.space, 'screenshotPixel');
  assert.strictEqual(screenshotBox.x, 196); // (100 * 2) - 4
  assert.strictEqual(screenshotBox.y, 96);  // (50 * 2) - 4
  assert.strictEqual(screenshotBox.width, 408); // (200 * 2) + 8
  assert.strictEqual(screenshotBox.height, 88); // (40 * 2) + 8
});

test('Bounding Box Fusion - Merges Overlapping Rectangles', () => {
  const boxes = [
    { space: 'screenshotPixel', x: 10, y: 10, width: 50, height: 20 },
    { space: 'screenshotPixel', x: 40, y: 15, width: 60, height: 30 },
    { space: 'screenshotPixel', x: 200, y: 200, width: 50, height: 50 }
  ];

  const merged = mergeBoundingBoxes(boxes);

  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].x, 10);
  assert.strictEqual(merged[0].y, 10);
  assert.strictEqual(merged[0].width, 90); // 10 to 100
  assert.strictEqual(merged[0].height, 35); // 10 to 45
  assert.strictEqual(merged[1].x, 200);
});

test('Task Contracts - polite fill commands remain executable browser tasks', () => {
  const commands = [
    'fill the search field with telemetry',
    'Please fill the search field with telemetry',
    'Can you fill the search field with telemetry?',
    'I want you to enter telemetry in the search input'
  ];

  for (const command of commands) {
    const contract = resolveTaskContract(command);
    assert.strictEqual(contract.supported, true, `Expected supported contract for: ${command}`);
    assert.strictEqual(contract.goalPattern, 'search_filter');
    assert.strictEqual(contract.expectedTerminal.kind, 'value_present');
  }
});

test('Task Contracts - polite scroll commands resolve scroll_changed contract', () => {
  const commands = [
    'scroll down',
    'Please scroll down',
    'Could you please scroll down?',
    'Hey PrivaPilot, please scroll down',
    'I want you to scroll down',
    'Can you scroll up?'
  ];

  for (const command of commands) {
    const contract = resolveTaskContract(command);
    assert.strictEqual(contract.supported, true, `Expected supported contract for: ${command}`);
    assert.strictEqual(contract.goalPattern, 'scroll');
    assert.strictEqual(contract.expectedTerminal.kind, 'scroll_changed');
  }
});

test('Task Contracts - polite click and select commands resolve contracts', () => {
  const clickContract = resolveTaskContract('Please click the Problem Statements link');
  assert.strictEqual(clickContract.supported, true);

  const selectContract = resolveTaskContract('Could you please select Pending?');
  assert.strictEqual(selectContract.supported, true);
  assert.strictEqual(selectContract.expectedTerminal.kind, 'select_changed');
});

test('Action Policy - Correctly Classifies Safe vs Protected vs Blocked Actions', () => {
  // 1. Safe Action: Open preview
  const safeProposal = {
    actionId: 'act_1',
    kind: 'click',
    targetLocalId: 'el_4',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Open safe preview drawer'
  };
  assert.strictEqual(classifyActionRisk(safeProposal, 'Open Safe Preview'), 'safe');

  // 2. Protected Action: Submit payment
  const protectedProposal = {
    actionId: 'act_2',
    kind: 'click',
    targetLocalId: 'el_7',
    confidence: 0.98,
    risk: 'protected',
    rationale: 'Submit final approval'
  };
  assert.strictEqual(classifyActionRisk(protectedProposal, 'Submit Final Approval'), 'protected');

  // 3. Blocked Action: Password entry or OTP
  const blockedProposal = {
    actionId: 'act_3',
    kind: 'type',
    targetLocalId: 'el_9',
    confidence: 0.90,
    risk: 'safe',
    rationale: 'Enter password'
  };
  assert.strictEqual(classifyActionRisk(blockedProposal, 'Station Password Field'), 'blocked');

  // 4. Hover Action: safe
  const hoverProposal = {
    actionId: 'act_4',
    kind: 'hover',
    targetLocalId: 'el_10',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Hover over menu'
  };
  assert.strictEqual(classifyActionRisk(hoverProposal), 'safe');

  // 5. Upload File: protected by default, safe if userApproved
  const uploadProposal = {
    actionId: 'act_5',
    kind: 'upload_file',
    targetLocalId: 'el_11',
    fileName: 'doc.pdf',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Upload document'
  };
  assert.strictEqual(classifyActionRisk(uploadProposal), 'protected');
  assert.strictEqual(classifyActionRisk({ ...uploadProposal, userApproved: true }), 'safe');
});

test('Task Contracts - hover, drag_and_drop, and upload_file commands resolve contracts', async () => {
  const { resolveTaskContract } = await import('../../packages/protocol/dist/index.js');

  const hoverC = resolveTaskContract('hover over the problem statements button');
  assert.strictEqual(hoverC.supported, true);
  assert.strictEqual(hoverC.goalPattern, 'hover_control');
  assert.strictEqual(hoverC.structuredIntent.intent, 'hover');

  const dragC = resolveTaskContract('drag task 1 into completed column');
  assert.strictEqual(dragC.supported, true);
  assert.strictEqual(dragC.goalPattern, 'drag_and_drop');
  assert.strictEqual(dragC.structuredIntent.intent, 'drag_and_drop');

  const uploadC = resolveTaskContract('upload resume.pdf to file input');
  assert.strictEqual(uploadC.supported, true);
  assert.strictEqual(uploadC.goalPattern, 'upload_file');
  assert.strictEqual(uploadC.structuredIntent.intent, 'upload_file');
});

test('Action Schema Validation - Validates hover, drag_and_drop, upload_file, and closed schema properties', async () => {
  const { validateActionProposal } = await import('../../packages/protocol/dist/index.js');

  // Valid hover
  const validHover = {
    actionId: 'act_h1',
    kind: 'hover',
    targetLocalId: 'el_1',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Hover to open menu'
  };
  assert.strictEqual(validateActionProposal(validHover).isValid, true);

  // Valid drag_and_drop
  const validDrag = {
    actionId: 'act_d1',
    kind: 'drag_and_drop',
    targetLocalId: 'el_1',
    destinationLocalId: 'el_2',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Drag item to destination'
  };
  assert.strictEqual(validateActionProposal(validDrag).isValid, true);

  // Missing destinationLocalId on drag_and_drop
  const invalidDrag = {
    actionId: 'act_d2',
    kind: 'drag_and_drop',
    targetLocalId: 'el_1',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Missing destination'
  };
  assert.strictEqual(validateActionProposal(invalidDrag).isValid, false);

  // Valid upload_file
  const validUpload = {
    actionId: 'act_u1',
    kind: 'upload_file',
    targetLocalId: 'el_1',
    fileName: 'resume.pdf',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Upload resume'
  };
  assert.strictEqual(validateActionProposal(validUpload).isValid, true);

  // Prohibited path traversal in fileName
  const traversalUpload = {
    actionId: 'act_u2',
    kind: 'upload_file',
    targetLocalId: 'el_1',
    fileName: '../../etc/passwd',
    confidence: 0.95,
    risk: 'protected',
    rationale: 'Attempt directory traversal'
  };
  assert.strictEqual(validateActionProposal(traversalUpload).isValid, false);

  // Invalid tabId (negative)
  const invalidTab = {
    actionId: 'act_t1',
    kind: 'observe',
    confidence: 0.9,
    risk: 'safe',
    rationale: 'Observe with negative tabId',
    tabId: -1
  };
  assert.strictEqual(validateActionProposal(invalidTab).isValid, false);
});

test('Protocol: Multi-Action Batch and Interactive Slot-Filling schema validation', async () => {
  const { validateActionProposal, classifyActionRisk } = await import('../../packages/protocol/dist/index.js');

  const contextElements = [
    { localId: 'el_1', role: 'input', sanitizedName: 'First Name', coarseBounds: [0, 0, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['type'] },
    { localId: 'el_2', role: 'button', sanitizedName: 'Next Step', coarseBounds: [0, 0.1, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] },
    { localId: 'el_3', role: 'input', sanitizedName: 'Email Address', coarseBounds: [0, 0.2, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['type'] },
    { localId: 'el_pay', role: 'button', sanitizedName: 'Submit Payment', coarseBounds: [0, 0.3, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] }
  ];

  // 1. Valid Batch Action
  const validBatch = {
    actionId: 'act_batch_1',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Fill name and click Next',
    batchActions: [
      { actionId: 'act_sub_1', kind: 'type', targetLocalId: 'el_1', textToType: 'Kushagra' },
      { actionId: 'act_sub_2', kind: 'click', targetLocalId: 'el_2' }
    ]
  };
  const batchRes = validateActionProposal(validBatch, contextElements);
  assert.strictEqual(batchRes.isValid, true, 'Valid batch proposal must pass validation');
  assert.strictEqual(classifyActionRisk(validBatch), 'safe');

  // 2. Batch with Unknown Sub-action Property (Closed Schema)
  const invalidPropBatch = {
    actionId: 'act_batch_2',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Batch with unknown key',
    batchActions: [
      { actionId: 'act_sub_1', kind: 'click', targetLocalId: 'el_2', unknownProp: 'injected' }
    ]
  };
  assert.strictEqual(validateActionProposal(invalidPropBatch, contextElements).isValid, false);

  // 3. Batch with Target Missing from Context Elements
  const missingTargetBatch = {
    actionId: 'act_batch_3',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Batch with missing target',
    batchActions: [
      { actionId: 'act_sub_1', kind: 'click', targetLocalId: 'el_nonexistent' }
    ]
  };
  assert.strictEqual(validateActionProposal(missingTargetBatch, contextElements).isValid, false);

  // 4. Batch Risk Classification: Escalates to Protected if sub-action is protected
  const protectedBatch = {
    actionId: 'act_batch_4',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Fill and submit payment',
    batchActions: [
      { actionId: 'act_sub_1', kind: 'type', targetLocalId: 'el_1', textToType: 'User' },
      { actionId: 'act_sub_2', kind: 'click', targetLocalId: 'el_pay', rationale: 'Submit payment' }
    ]
  };
  assert.strictEqual(classifyActionRisk(protectedBatch), 'protected');

  // 5. Batch Risk Classification: Escalates to Blocked if sub-action targets password/token
  const blockedBatch = {
    actionId: 'act_batch_5',
    kind: 'batch',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Attempt password fill in batch',
    batchActions: [
      { actionId: 'act_sub_1', kind: 'type', targetLocalId: 'password_field', textToType: 'Secret123' }
    ]
  };
  assert.strictEqual(classifyActionRisk(blockedBatch), 'blocked');

  // 6. Valid Interactive Slot-Filling (request_user_input)
  const validSlotFill = {
    actionId: 'act_slot_1',
    kind: 'request_user_input',
    targetLocalId: 'el_3',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'Please provide your GitHub URL',
    userInputPrompt: 'Please enter your GitHub profile URL to proceed with registration.',
    inputKey: 'github_profile'
  };
  const slotRes = validateActionProposal(validSlotFill, contextElements);
  assert.strictEqual(slotRes.isValid, true);
  assert.strictEqual(classifyActionRisk(validSlotFill), 'safe');

  // 7. Slot-Filling with Prohibited Script Injection
  const scriptSlotFill = {
    actionId: 'act_slot_2',
    kind: 'request_user_input',
    targetLocalId: 'el_3',
    confidence: 1.0,
    risk: 'safe',
    rationale: 'XSS attempt',
    userInputPrompt: '<script>alert("hack")</script>'
  };
  assert.strictEqual(validateActionProposal(scriptSlotFill, contextElements).isValid, false);
});
