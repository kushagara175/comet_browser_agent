/**
 * SceneGraph & Network Boundary Privacy Invariants Test Suite
 *
 * Verifies:
 * 1. SceneGraphConflict is client-internal only: strictly stripped before crossing network boundary.
 * 2. labelHint is screened for PII before inclusion in SceneGraph elements.
 * 3. All element refs are strictly opaque identifiers (e.g., "el_1", "v_el_1").
 * 4. Server schema validator strictly rejects any payload containing 'conflicts'.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  sanitizeContextForNetwork
} from '../packages/protocol/dist/index.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';
import { SanitizerPipeline } from '../apps/extension/dist/sanitizer/pipeline.js';
import { SECRET_CANARY } from '../packages/test-fixtures/dist/index.js';

test('Boundary Invariant 1: SceneGraphConflict is client-internal only and excluded from network payload', () => {
  const mockConflict = {
    ref: 'el_42',
    domClaim: {
      role: 'input',
      inputType: 'password',
      ariaRole: 'textbox',
      disabled: false
    },
    visionClaim: {
      role: 'text_input',
      confidence: 0.88,
      visuallyOccluded: false
    },
    resolvedTo: 'dom',
    reason: 'DOM semantic priority'
  };

  const sceneGraph = {
    elements: [
      {
        ref: 'el_42',
        bbox: [0.1, 0.2, 0.8, 0.05],
        role: 'input',
        affordances: ['clickable', 'typable'],
        confidence: 0.95,
        provenance: 'fused',
        labelHint: 'Username Field'
      }
    ],
    conflicts: [mockConflict]
  };

  const internalContext = {
    _brand: 'SanitizedContext_Verified',
    protocolVersion: '1.0',
    runId: 'run_boundary_test_1',
    captureId: 'cap_boundary_test_1',
    goal: 'Test boundary',
    timestamp: Date.now(),
    sanitizedScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 1280,
      screenshotHeight: 720,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    },
    elements: [
      {
        localId: 'el_42',
        role: 'input',
        sanitizedName: 'Username Field',
        coarseBounds: [0.1, 0.2, 0.8, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type']
      }
    ],
    pageState: { title: 'Test Portal', viewport: [1280, 720] },
    maskCount: 0,
    visionObservations: [],
    visionTelemetry: {
      modelFamily: 'vit-b32',
      providerUsed: 'local',
      regionsProposed: 0,
      regionsEmbedded: 0,
      totalInferenceMs: 0,
      available: true
    },
    redactionManifest: {
      policy: 'balanced',
      surfacesMasked: 0,
      textPiiMasked: 0,
      domSensitiveMasked: 0,
      facesBlurred: 0,
      totalMaskedRegions: 0,
      categoriesMasked: []
    },
    payloadDigestSha256: 'mock_digest',
    sceneGraph
  };

  // Convert to network payload
  const networkPayload = sanitizeContextForNetwork(internalContext);

  // 1. Must include sceneGraphElements
  assert.ok(networkPayload.sceneGraphElements, 'Payload must contain sceneGraphElements');
  assert.strictEqual(networkPayload.sceneGraphElements.length, 1);
  assert.strictEqual(networkPayload.sceneGraphElements[0].ref, 'el_42');

  // 2. Must NEVER contain conflicts on network payload or its elements
  assert.strictEqual(networkPayload.conflicts, undefined);
  assert.strictEqual(networkPayload.sceneGraph?.conflicts, undefined);
  assert.strictEqual(networkPayload.sceneGraphElements[0].conflicts, undefined);

  // 3. Serialized JSON check: confirm no trace of domClaim or visionClaim on the wire
  const wireJson = JSON.stringify(networkPayload);
  assert.strictEqual(wireJson.includes('domClaim'), false, 'Network wire must not contain domClaim');
  assert.strictEqual(wireJson.includes('visionClaim'), false, 'Network wire must not contain visionClaim');
  assert.strictEqual(wireJson.includes('DOM semantic priority'), false, 'Audit reasoning must not leak across wire');
});

test('Boundary Invariant 2: Server schema validator rejects any payload attempting to transmit conflicts', () => {
  const invalidPayload = {
    protocolVersion: '1.0',
    runId: 'run_bad_actor_1',
    goal: 'Exfiltrate internal claims',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [],
    pageState: {
      title: 'Portal',
      viewport: [1280, 720]
    },
    redactionManifest: {
      policy: 'balanced',
      surfacesMasked: 0,
      textPiiMasked: 0,
      domSensitiveMasked: 0,
      facesBlurred: 0,
      totalMaskedRegions: 0,
      categoriesMasked: []
    },
    sceneGraphElements: [
      {
        ref: 'el_1',
        bbox: [0.1, 0.1, 0.2, 0.1],
        role: 'button',
        affordances: ['clickable'],
        confidence: 0.9,
        provenance: 'fused'
      }
    ],
    // Illegitimate field attempting to leak client internal lane claims
    conflicts: [
      {
        ref: 'el_1',
        domClaim: { rawSecretData: 'leak' },
        resolvedTo: 'dom',
        reason: 'disallowed'
      }
    ]
  };

  const validation = validateSanitizedPayload(invalidPayload);
  assert.strictEqual(validation.isValid, false, 'Server must reject payload with conflicts');
  assert.ok(
    validation.errorMessage?.includes('conflicts') || validation.errorMessage?.includes('Closed schema violation'),
    'Server validation error must flag disallowed conflicts property'
  );
});

test('Boundary Invariant 3: Synthetic PII and canary tokens are strictly screened from labelHint', async () => {
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_pii_screen_1',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: {},
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 1280,
      screenshotHeight: 720,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const snapshot = {
    domElements: [
      {
        id: 'el_email',
        descriptor: { tagName: 'input', type: 'text', name: 'user_contact', value: 'admin@isro.gov.in' },
        boundingClientRect: { x: 50, y: 100, width: 200, height: 30 }
      },
      {
        id: 'el_canary',
        descriptor: { tagName: 'input', type: 'text', name: SECRET_CANARY, value: SECRET_CANARY },
        boundingClientRect: { x: 50, y: 150, width: 200, height: 30 }
      }
    ],
    textNodes: [],
    imageElements: [],
    surfaces: [],
    interactiveElements: [
      {
        localId: 'el_email',
        role: 'input',
        rawName: 'admin@isro.gov.in',
        boundingBox: { x: 50, y: 100, width: 200, height: 30 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['type']
      },
      {
        localId: 'el_canary',
        role: 'input',
        rawName: SECRET_CANARY,
        boundingBox: { x: 50, y: 150, width: 200, height: 30 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['type']
      }
    ],
    pageTitle: 'Test Page'
  };

  const testCanvas = {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {}
    }),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sanitized = await SanitizerPipeline.sanitize(rawCapture, snapshot, 'Screen PII', testCanvas);
  assert.ok(sanitized.sceneGraph, 'SceneGraph must be produced');

  for (const element of sanitized.sceneGraph.elements) {
    if (element.labelHint) {
      assert.strictEqual(
        element.labelHint.includes('admin@isro.gov.in'),
        false,
        'labelHint must not contain raw email address'
      );
      assert.strictEqual(
        element.labelHint.includes(SECRET_CANARY),
        false,
        'labelHint must not contain raw secret canary'
      );
    }
  }

  // Check network payload
  const netPayload = sanitizeContextForNetwork(sanitized);
  for (const element of netPayload.sceneGraphElements || []) {
    if (element.labelHint) {
      assert.strictEqual(element.labelHint.includes('@'), false, 'Network element must not contain email');
      assert.strictEqual(element.labelHint.includes(SECRET_CANARY), false, 'Network element must not contain canary');
    }
  }
});

test('Boundary Invariant 4: All SceneGraph element refs are opaque identifiers', async () => {
  const rawCapture = {
    _brand: 'RawCapture_InternalOnly',
    captureId: 'cap_ref_opaque_1',
    timestamp: Date.now(),
    rawScreenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    rawDomSummary: {},
    metadata: {
      viewportWidth: 1280,
      viewportHeight: 720,
      screenshotWidth: 1280,
      screenshotHeight: 720,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      captureTimestamp: Date.now()
    }
  };

  const snapshot = {
    domElements: [],
    textNodes: [],
    imageElements: [],
    surfaces: [],
    interactiveElements: [
      {
        localId: 'el_submit_btn',
        role: 'button',
        rawName: 'Submit Form',
        boundingBox: { x: 100, y: 200, width: 120, height: 40 },
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageTitle: 'Test Portal'
  };

  const testCanvas = {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {}
    }),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sanitized = await SanitizerPipeline.sanitize(rawCapture, snapshot, 'Verify refs', testCanvas);
  const elements = sanitized.sceneGraph?.elements || [];
  assert.ok(elements.length > 0);

  for (const el of elements) {
    // Opaque ref format requirement: alphanumeric identifier e.g. "el_1", "v_el_1", "el_submit_btn"
    assert.match(el.ref, /^[a-zA-Z0-9_-]+$/, 'Element ref must be an opaque identifier');
    // Must never contain DOM path separators or JavaScript object notation
    assert.strictEqual(el.ref.includes('/'), false);
    assert.strictEqual(el.ref.includes('>'), false);
    assert.strictEqual(el.ref.includes('.'), false);
  }
});
