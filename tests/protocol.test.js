/**
 * Protocol and Coordinate System Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  viewportToScreenshotBox,
  mergeBoundingBoxes,
  classifyActionRisk
} from '../packages/protocol/dist/index.js';

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
});
