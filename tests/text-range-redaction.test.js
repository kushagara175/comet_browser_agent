/**
 * @privapilot/extension - Text Range Redaction & Geometry Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import { detectTextSensitiveRegions } from '../apps/extension/dist/sanitizer/text-detector.js';
import { CoordinateTransformer } from '../apps/extension/dist/sanitizer/coordinate-transformer.js';
import { measureTextRangeRects } from '../apps/extension/dist/content/element-extractor.js';

function createStandardViewportMetadata(overrides = {}) {
  return {
    viewportWidth: 1000,
    viewportHeight: 800,
    screenshotWidth: 1000,
    screenshotHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now(),
    ...overrides
  };
}

// ============================================================================
// Test 1: Multiple PII values in one paragraph
// ============================================================================

test('Text Range: Multiple PII values in one paragraph produce precise range boxes without masking whole paragraph', () => {
  const meta = createStandardViewportMetadata();
  const transformer = new CoordinateTransformer(meta);

  // Paragraph at (50, 100, width: 600, height: 40)
  // Text: "User email is alice@example.com and phone is +91 98765 43210."
  const node = {
    id: 'txt_multi_pii',
    text: 'User email is alice@example.com and phone is +91 98765 43210.',
    boundingClientRect: { x: 50, y: 100, width: 600, height: 40 },
    matchedRanges: [
      {
        category: 'email',
        startIndex: 14,
        endIndex: 31,
        rects: [{ x: 120, y: 105, width: 130, height: 18 }] // Exact email box
      },
      {
        category: 'phone',
        startIndex: 45,
        endIndex: 60,
        rects: [{ x: 350, y: 105, width: 120, height: 18 }] // Exact phone box
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);

  assert.strictEqual(regions.length, 2, 'Should create exactly 2 sensitive regions');

  // Verify email region
  const emailRegion = regions.find(r => r.category === 'email');
  assert.ok(emailRegion);
  assert.ok(Math.abs(emailRegion.viewportBox.x - 120) <= 2, 'Email X coordinate must be close to exact range box');
  assert.ok(Math.abs(emailRegion.viewportBox.width - 130) <= 4, 'Email width must match range box with safety padding');
  assert.notStrictEqual(emailRegion.viewportBox.width, 600, 'Must NOT mask full parent paragraph width');

  // Verify phone region
  const phoneRegion = regions.find(r => r.category === 'phone');
  assert.ok(phoneRegion);
  assert.ok(Math.abs(phoneRegion.viewportBox.x - 350) <= 2, 'Phone X coordinate must be close to exact range box');
  assert.ok(Math.abs(phoneRegion.viewportBox.width - 120) <= 4, 'Phone width must match range box with safety padding');
});

// ============================================================================
// Test 2: Wrapped email spanning multiple lines
// ============================================================================

test('Text Range: Wrapped email spanning across lines generates distinct line-box rectangles', () => {
  const meta = createStandardViewportMetadata();
  const transformer = new CoordinateTransformer(meta);

  // Email wrapped across 2 lines
  const node = {
    id: 'txt_wrapped',
    text: 'Please contact verylongemailaddress@subdomain.organization.gov.in immediately',
    boundingClientRect: { x: 50, y: 100, width: 400, height: 50 },
    matchedRanges: [
      {
        category: 'email',
        startIndex: 15,
        endIndex: 65,
        rects: [
          { x: 300, y: 100, width: 150, height: 18 }, // Line 1: verylongemailaddress@
          { x: 50, y: 122, width: 180, height: 18 }   // Line 2: subdomain.organization.gov.in
        ]
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);

  assert.strictEqual(regions.length, 2, 'Should generate 2 line-box rectangles for wrapped text');
  const yValues = regions.map(r => r.viewportBox.y).sort((a, b) => a - b);
  assert.ok(Math.abs(yValues[0] - 100) <= 2, 'Line 1 Y must match line 1 position');
  assert.ok(Math.abs(yValues[1] - 122) <= 2, 'Line 2 Y must match line 2 position');
});

// ============================================================================
// Test 3: HiDPI display (devicePixelRatio = 2)
// ============================================================================

test('Text Range: HiDPI (devicePixelRatio = 2) scales CSS coordinates accurately to screenshot pixel buffer', () => {
  const meta = createStandardViewportMetadata({
    viewportWidth: 800,
    viewportHeight: 600,
    screenshotWidth: 1600,
    screenshotHeight: 1200,
    devicePixelRatio: 2
  });
  const transformer = new CoordinateTransformer(meta);

  const node = {
    id: 'txt_hidpi',
    text: 'Card: 4532-8901-2345-6789',
    boundingClientRect: { x: 100, y: 50, width: 300, height: 30 },
    matchedRanges: [
      {
        category: 'credit_card',
        startIndex: 6,
        endIndex: 25,
        rects: [{ x: 150, y: 55, width: 140, height: 16 }]
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);
  assert.strictEqual(regions.length, 1);

  const reg = regions[0];
  // 150 CSS px * 2 = 300 - 2 (safety padding) = 298
  assert.strictEqual(reg.screenshotBox.x, 298);
  // 55 CSS px * 2 = 110 - 2 = 108
  assert.strictEqual(reg.screenshotBox.y, 108);
  // 140 CSS px * 2 = 280 + 4 = 284
  assert.strictEqual(reg.screenshotBox.width, 284);
  // 16 CSS px * 2 = 32 + 4 = 36
  assert.strictEqual(reg.screenshotBox.height, 36);
});

// ============================================================================
// Test 4: Zoomed page (2.5x browser zoom)
// ============================================================================

test('Text Range: Zoomed viewport (2.5x scaling) converts accurately using typed coordinate utilities', () => {
  const meta = createStandardViewportMetadata({
    viewportWidth: 1000,
    viewportHeight: 500,
    screenshotWidth: 2500,
    screenshotHeight: 1250,
    devicePixelRatio: 2.5
  });
  const transformer = new CoordinateTransformer(meta);

  const node = {
    id: 'txt_zoom',
    text: 'Aadhaar: 4532 8901 2342',
    boundingClientRect: { x: 40, y: 20, width: 200, height: 20 },
    matchedRanges: [
      {
        category: 'national_id',
        startIndex: 9,
        endIndex: 23,
        rects: [{ x: 80, y: 22, width: 100, height: 14 }]
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);
  assert.strictEqual(regions.length, 1);

  const reg = regions[0];
  // 80 * 2.5 = 200 - 2 = 198
  assert.strictEqual(reg.screenshotBox.x, 198);
  // 22 * 2.5 = 55 - 2 = 53
  assert.strictEqual(reg.screenshotBox.y, 53);
  // 100 * 2.5 = 250 + 4 = 254
  assert.strictEqual(reg.screenshotBox.width, 254);
});

// ============================================================================
// Test 5: Partially offscreen text clipping
// ============================================================================

test('Text Range: Partially offscreen rectangles are clipped to visible viewport bounds', () => {
  const meta = createStandardViewportMetadata({
    viewportWidth: 800,
    viewportHeight: 600,
    screenshotWidth: 800,
    screenshotHeight: 600
  });
  const transformer = new CoordinateTransformer(meta);

  const node = {
    id: 'txt_clipped',
    text: 'Secret token: sk_live_1234567890abcdef1234',
    boundingClientRect: { x: -30, y: 580, width: 300, height: 30 },
    matchedRanges: [
      {
        category: 'token',
        startIndex: 14,
        endIndex: 43,
        rects: [
          // Starts negative (-20), extends past left viewport
          { x: 0, y: 575, width: 120, height: 18 }
        ]
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);
  assert.strictEqual(regions.length, 1);
  assert.ok(regions[0].screenshotBox.x >= 0, 'X coordinate must be clamped >= 0');
  assert.ok(regions[0].screenshotBox.y >= 0, 'Y coordinate must be clamped >= 0');
  assert.ok(regions[0].screenshotBox.y + regions[0].screenshotBox.height <= 600, 'Y + height must not exceed screenshot bounds');
});

// ============================================================================
// Test 6: Nested inline markup range extraction
// ============================================================================

test('Text Range: Nested inline markup correctly calculates range across descendant text nodes', () => {
  // Mock DOM tree: <p>Contact <span>alice</span>@<span>example.com</span></p>
  const text1 = { nodeType: 3, nodeValue: 'Contact ' };
  const text2 = { nodeType: 3, nodeValue: 'alice' };
  const text3 = { nodeType: 3, nodeValue: '@' };
  const text4 = { nodeType: 3, nodeValue: 'example.com' };

  const allChildren = [text1, text2, text3, text4];

  const mockDoc = {
    createTreeWalker(root, filter) {
      let idx = 0;
      return {
        nextNode() {
          if (idx < allChildren.length) {
            return allChildren[idx++];
          }
          return null;
        }
      };
    },
    createRange() {
      let sNode, sOff, eNode, eOff;
      return {
        setStart(n, o) { sNode = n; sOff = o; },
        setEnd(n, o) { eNode = n; eOff = o; },
        getClientRects() {
          return [
            { x: 100, y: 50, width: 130, height: 16, left: 100, top: 50, right: 230, bottom: 66 }
          ];
        }
      };
    }
  };

  const container = { nodeType: 1 };
  // Text is "Contact alice@example.com". Email is at startIndex: 8, endIndex: 25
  const rects = measureTextRangeRects(mockDoc, container, 8, 25, 1000, 800);

  assert.strictEqual(rects.length, 1);
  assert.strictEqual(rects[0].x, 100);
  assert.strictEqual(rects[0].width, 130);
});

// ============================================================================
// Test 7: Geometry failure fallback (conservatively masks parent bounding box)
// ============================================================================

test('Text Range: Geometry failure fallback masks parent bounding box rather than skipping', () => {
  const meta = createStandardViewportMetadata();
  const transformer = new CoordinateTransformer(meta);

  // Node where range calculation failed (rects is empty)
  const node = {
    id: 'txt_geom_failure',
    text: 'Your confidential pin is 9876',
    boundingClientRect: { x: 50, y: 150, width: 250, height: 30 },
    matchedRanges: [
      {
        category: 'uninspectable',
        startIndex: 25,
        endIndex: 29,
        rects: [], // Empty rects -> Range failed or detached
        fallbackParentRect: { x: 50, y: 150, width: 250, height: 30 }
      }
    ]
  };

  const regions = detectTextSensitiveRegions([node], transformer);

  assert.strictEqual(regions.length, 1, 'Must NOT skip sensitive match when geometry fails');
  assert.strictEqual(regions[0].id, 'text_pii_txt_geom_failure_0_fallback');
  assert.strictEqual(regions[0].viewportBox.x, 50);
  assert.strictEqual(regions[0].viewportBox.width, 250);
});
