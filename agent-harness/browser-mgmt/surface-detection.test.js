/**
 * @privapilot/extension - Granular Visual Surface Detection & Inspectability Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import { detectHighRiskSurfaces } from '../../apps/extension/dist/sanitizer/surface-detector.js';
import { CoordinateTransformer } from '../../apps/extension/dist/sanitizer/coordinate-transformer.js';
import { ElementExtractor } from '../../apps/extension/dist/content/element-extractor.js';
import { isRestrictedBrowserUrl, RunCoordinator } from '../../apps/extension/dist/background/coordinator.js';

function createStandardViewportMetadata(overrides = {}) {
  return {
    viewportWidth: 1200,
    viewportHeight: 800,
    screenshotWidth: 1200,
    screenshotHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    captureTimestamp: Date.now(),
    ...overrides
  };
}

// ============================================================================
// 1. Same-Origin vs Cross-Origin Iframe Inspectability
// ============================================================================

test('Surfaces: Permitted same-origin iframe is inspected recursively without masking container', () => {
  const extractor = new ElementExtractor();

  // Mock same-origin inner document
  const mockInnerDoc = {
    body: {},
    querySelectorAll(selector) {
      if (selector.includes('button')) {
        return [
          {
            tagName: 'BUTTON',
            getAttribute(attr) { return null; },
            getBoundingClientRect() { return { x: 20, y: 30, width: 100, height: 35 }; },
            innerText: 'Inner Action'
          }
        ];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  // Mock top document containing a same-origin iframe
  const mockTopDoc = {
    title: 'Top Page',
    querySelectorAll(selector) {
      if (selector === 'iframe') {
        return [
          {
            tagName: 'IFRAME',
            contentDocument: mockInnerDoc,
            contentWindow: { document: mockInnerDoc },
            getBoundingClientRect() { return { x: 200, y: 150, width: 400, height: 300 }; }
          }
        ];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  const { snapshot } = extractor.extractSnapshot(mockTopDoc);

  // 1. Same-origin iframe should be recorded with inspectionStatus: 'inspected_same_origin'
  const iframeSurface = snapshot.surfaces.find(s => s.surfaceType === 'iframe');
  assert.ok(iframeSurface);
  assert.strictEqual(iframeSurface.isCrossOriginOrUninspectable, false);
  assert.strictEqual(iframeSurface.inspectionStatus, 'inspected_same_origin');

  // 2. Inner button should be extracted with coordinate offset (200 + 20 = 220, 150 + 30 = 180)
  const innerButton = snapshot.interactiveElements.find(e => e.rawName === 'Inner Action');
  assert.ok(innerButton, 'Inner frame button must be extracted');
  assert.strictEqual(innerButton.boundingBox.x, 220);
  assert.strictEqual(innerButton.boundingBox.y, 180);

  // 3. detectHighRiskSurfaces should NOT mask the same-origin iframe container
  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const surfaceRegions = detectHighRiskSurfaces(snapshot.surfaces, transformer);
  assert.strictEqual(surfaceRegions.length, 0, 'Inspected same-origin iframe must not be masked');
});

test('Surfaces: Cross-origin / inaccessible iframe is masked fail-closed', () => {
  const extractor = new ElementExtractor();

  // Mock cross-origin iframe where contentDocument throws SecurityError or is null
  const mockTopDoc = {
    title: 'Top Page',
    querySelectorAll(selector) {
      if (selector === 'iframe') {
        return [
          {
            tagName: 'IFRAME',
            get contentDocument() {
              throw new Error('SecurityError: Blocked a frame with origin from accessing a cross-origin frame.');
            },
            getBoundingClientRect() { return { x: 100, y: 100, width: 500, height: 350 }; }
          }
        ];
      }
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    }
  };

  const { snapshot } = extractor.extractSnapshot(mockTopDoc);
  const iframeSurface = snapshot.surfaces.find(s => s.surfaceType === 'iframe');
  assert.ok(iframeSurface);
  assert.strictEqual(iframeSurface.isCrossOriginOrUninspectable, true);
  assert.strictEqual(iframeSurface.inspectionStatus, 'uninspectable_cross_origin');

  // Masking check
  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const surfaceRegions = detectHighRiskSurfaces(snapshot.surfaces, transformer);
  assert.strictEqual(surfaceRegions.length, 1);
  assert.strictEqual(surfaceRegions[0].category, 'high_risk_surface');
  assert.strictEqual(surfaceRegions[0].method, 'opaque_mask');
});

// ============================================================================
// 2. Canvas & WebGL Canvas Detection
// ============================================================================

test('Surfaces: 2D Canvas and WebGL Canvas are detected and masked fail-closed', () => {
  const surfaces = [
    {
      id: 'cvs_2d',
      surfaceType: 'canvas',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_canvas',
      boundingClientRect: { x: 50, y: 50, width: 300, height: 200 }
    },
    {
      id: 'cvs_webgl',
      surfaceType: 'webgl_canvas',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_canvas',
      boundingClientRect: { x: 400, y: 50, width: 400, height: 300 }
    }
  ];

  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const regions = detectHighRiskSurfaces(surfaces, transformer);

  assert.strictEqual(regions.length, 2);
  assert.ok(regions.some(r => r.label?.includes('CANVAS')));
  assert.ok(regions.some(r => r.label?.includes('WEBGL_CANVAS')));
});

// ============================================================================
// 3. Video Streams & Embedded PDF Plugin Content
// ============================================================================

test('Surfaces: Video media and Embedded PDF documents are masked fail-closed', () => {
  const surfaces = [
    {
      id: 'vid_1',
      surfaceType: 'video',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_media',
      boundingClientRect: { x: 100, y: 200, width: 640, height: 360 }
    },
    {
      id: 'pdf_1',
      surfaceType: 'pdf',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_plugin',
      boundingClientRect: { x: 750, y: 200, width: 400, height: 500 }
    }
  ];

  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const regions = detectHighRiskSurfaces(surfaces, transformer);

  assert.strictEqual(regions.length, 2);
  const vidRegion = regions.find(r => r.label?.includes('VIDEO'));
  const pdfRegion = regions.find(r => r.label?.includes('PDF'));
  assert.ok(vidRegion);
  assert.ok(pdfRegion);
});

// ============================================================================
// 4. Closed Shadow Roots and Images with Text
// ============================================================================

test('Surfaces: Closed shadow roots and images with text are masked fail-closed', () => {
  const surfaces = [
    {
      id: 'shadow_closed',
      surfaceType: 'shadow_root',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_closed_shadow',
      boundingClientRect: { x: 10, y: 10, width: 200, height: 80 }
    },
    {
      id: 'img_receipt',
      surfaceType: 'image_text',
      isCrossOriginOrUninspectable: true,
      inspectionStatus: 'uninspectable_image_text',
      boundingClientRect: { x: 250, y: 10, width: 300, height: 400 }
    }
  ];

  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const regions = detectHighRiskSurfaces(surfaces, transformer);

  assert.strictEqual(regions.length, 2);
  assert.ok(regions.some(r => r.label?.includes('SHADOW_ROOT')));
  assert.ok(regions.some(r => r.label?.includes('IMAGE_TEXT')));
});

// ============================================================================
// 5. Restricted Browser Pages & Local File URLs
// ============================================================================

test('Coordinator: Blocks privileged browser internal pages and local file URLs before capture', async () => {
  const restrictedUrls = [
    'chrome://settings',
    'chrome://extensions',
    'chrome-extension://abcedfghijklmnop/popup.html',
    'edge://settings',
    'about:config',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
    'file:///Users/admin/sensitive_passwords.txt'
  ];

  for (const url of restrictedUrls) {
    const check = isRestrictedBrowserUrl(url);
    assert.strictEqual(check.isRestricted, true, `URL ${url} must be recognized as restricted`);
  }

  // Permitted web URLs
  const normalUrls = [
    'https://example.com',
    'http://localhost:3000/dashboard',
    'https://subdomain.isro.gov.in/portal'
  ];

  for (const url of normalUrls) {
    const check = isRestrictedBrowserUrl(url);
    assert.strictEqual(check.isRestricted, false, `URL ${url} must be permitted`);
  }

  // Coordinator behavior on restricted URL
  const mockBrowser = {
    async getActiveTab() {
      return { id: 1, url: 'chrome://settings', title: 'Settings' };
    },
    async captureVisibleTab() { throw new Error('Should not capture'); },
    async sendMessageToTab() { throw new Error('Should not send message'); },
    async runInSanitizerHost() { throw new Error('Should not sanitize'); }
  };

  const coordinator = new RunCoordinator(mockBrowser, {});
  const result = await coordinator.startRun('Inspect settings');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.state, 'blocked-local-only');
  assert.ok(result.error?.includes('Capture blocked'));
});

// ============================================================================
// 6. Unknown Surface Types Fail Closed
// ============================================================================

test('Surfaces: Unknown surface types fail closed and are masked', () => {
  const surfaces = [
    {
      id: 'unknown_embed_1',
      surfaceType: 'unknown',
      isCrossOriginOrUninspectable: true,
      boundingClientRect: { x: 50, y: 50, width: 200, height: 100 }
    }
  ];

  const transformer = new CoordinateTransformer(createStandardViewportMetadata());
  const regions = detectHighRiskSurfaces(surfaces, transformer);

  assert.strictEqual(regions.length, 1);
  assert.strictEqual(regions[0].category, 'high_risk_surface');
  assert.strictEqual(regions[0].method, 'opaque_mask');
});
