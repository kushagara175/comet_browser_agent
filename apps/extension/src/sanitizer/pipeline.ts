/**
 * @privapilot/extension - On-Device Fail-Closed Sanitizer Pipeline
 *
 * Enforces the core privacy boundary:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 */

import {
  RawCapture,
  DetectionReport,
  SanitizedContext,
  SanitizedElement,
  SensitiveRegion,
  SensitiveCategory
} from '@privapilot/protocol';
import { sanitizeElementName } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';
import { detectDomSensitiveRegions, RawDomElementCapture } from './dom-detector.js';
import { detectTextSensitiveRegions, RawTextNodeCapture } from './text-detector.js';
import { detectFaceRegions, RawImageElementCapture } from './face-detector.js';
import { detectHighRiskSurfaces, RawSurfaceCapture } from './surface-detector.js';
import { MaskRenderer } from './mask-renderer.js';
import { PostRedactionVerifier } from './post-redaction-verifier.js';
import { UltraFaceModelRunner, DetectedFace } from '../vision/face-model.js';
import { computePayloadDigestSha256 } from '../security/digest.js';

export interface LocalDomSnapshot {
  readonly domElements: ReadonlyArray<RawDomElementCapture>;
  readonly textNodes: ReadonlyArray<RawTextNodeCapture>;
  readonly imageElements: ReadonlyArray<RawImageElementCapture>;
  readonly surfaces: ReadonlyArray<RawSurfaceCapture>;
  readonly interactiveElements: ReadonlyArray<{
    readonly localId: string;
    readonly role: any;
    readonly rawName: string;
    readonly boundingBox: { x: number; y: number; width: number; height: number };
    readonly state: ReadonlyArray<any>;
    readonly actionCapabilities: ReadonlyArray<any>;
  }>;
  readonly pageTitle: string;
}

export class SanitizerPipeline {
  /**
   * Transforms raw capture into sanitized context or fails closed.
   */
  static async sanitize(
    rawCapture: RawCapture,
    snapshot: LocalDomSnapshot,
    goal: string,
    imageCanvas?: HTMLCanvasElement | OffscreenCanvas
  ): Promise<SanitizedContext> {
    const transformer = new CoordinateTransformer(rawCapture.metadata);

    // 0. Run on-device ONNX vision model inference on screenshot canvas if available
    let modelFaces: ReadonlyArray<DetectedFace> = [];
    if (imageCanvas) {
      try {
        const visionResult = await UltraFaceModelRunner.detectFaces(imageCanvas, transformer);
        modelFaces = visionResult.faces;
      } catch {
        // Fall back to DOM avatar heuristics on model initialization/inference failure
      }
    }

    // 1. Run all multi-layer detectors
    const domRegions = detectDomSensitiveRegions(snapshot.domElements, transformer);
    const textRegions = detectTextSensitiveRegions(snapshot.textNodes, transformer);
    const faceRegions = detectFaceRegions(snapshot.imageElements, transformer, modelFaces);
    const surfaceRegions = detectHighRiskSurfaces(snapshot.surfaces, transformer);

    // Fusion: Union of all detected sensitive regions
    const allRegions: SensitiveRegion[] = [
      ...domRegions,
      ...textRegions,
      ...faceRegions,
      ...surfaceRegions
    ];

    const detectionReport: DetectionReport = {
      captureId: rawCapture.captureId,
      timestamp: Date.now(),
      regions: allRegions,
      uninspectableSurfacesFound: surfaceRegions.length > 0,
      requiresFailClosedBlock: false
    };

    // 2. Render Redaction Masks onto Canvas (Strictly Fail-Closed: Zero 1x1 or permissive fallbacks)
    let sanitizedDataUrl: string;
    let renderedCount = 0;

    if (imageCanvas) {
      const renderResult = MaskRenderer.renderMasks(imageCanvas, allRegions);
      sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
      renderedCount = renderResult.renderedMaskCount;
    } else if (typeof document !== 'undefined' && rawCapture.rawScreenshotDataUrl && rawCapture.rawScreenshotDataUrl.startsWith('data:image')) {
      const canvas = document.createElement('canvas');
      canvas.width = rawCapture.metadata.screenshotWidth;
      canvas.height = rawCapture.metadata.screenshotHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Sanitization Blocked: Canvas 2D context unavailable in host document');
      }

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Sanitization Blocked: Failed to decode raw screenshot image'));
        img.src = rawCapture.rawScreenshotDataUrl;
      });

      ctx.drawImage(img, 0, 0);
      const renderResult = MaskRenderer.renderMasks(canvas, allRegions);
      sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
      renderedCount = renderResult.renderedMaskCount;
    } else {
      throw new Error('Sanitization Blocked: No canvas host available. Rendering must execute in an offscreen document with DOM access.');
    }

    // Map of localId -> sensitive category from DOM detector
    const sensitiveDomElementsMap = new Map<string, SensitiveCategory>();
    for (const region of domRegions) {
      if (region.id.startsWith('dom_sens_')) {
        const localId = region.id.replace('dom_sens_', '');
        sensitiveDomElementsMap.set(localId, region.category);
      }
    }

    // 3. Scrub Interactive Elements (Map to localId, scrub names, compute coarse bounds)
    const sanitizedElements: SanitizedElement[] = snapshot.interactiveElements.map((el) => {
      const coarseBounds: [number, number, number, number] = [
        Math.max(0, Math.min(1, Math.round((el.boundingBox.x / rawCapture.metadata.viewportWidth) * 100) / 100)),
        Math.max(0, Math.min(1, Math.round((el.boundingBox.y / rawCapture.metadata.viewportHeight) * 100) / 100)),
        Math.max(0, Math.min(1, Math.round((el.boundingBox.width / rawCapture.metadata.viewportWidth) * 100) / 100)),
        Math.max(0, Math.min(1, Math.round((el.boundingBox.height / rawCapture.metadata.viewportHeight) * 100) / 100))
      ];

      const sensitiveCategory = sensitiveDomElementsMap.get(el.localId);
      let sanitizedName: string;
      let actionCapabilities = [...el.actionCapabilities];

      if (sensitiveCategory) {
        // Category-safe label for sensitive controls (Requirement 5)
        switch (sensitiveCategory) {
          case 'password':
            sanitizedName = '[PASSWORD FIELD]';
            break;
          case 'auth_code':
            sanitizedName = '[OTP FIELD]';
            break;
          case 'credit_card':
          case 'cvv':
          case 'bank_account':
            sanitizedName = '[PAYMENT FIELD]';
            break;
          case 'national_id':
            sanitizedName = '[NATIONAL ID FIELD]';
            break;
          case 'email':
            sanitizedName = '[EMAIL FIELD]';
            break;
          case 'phone':
            sanitizedName = '[PHONE FIELD]';
            break;
          case 'token':
            sanitizedName = '[TOKEN/KEY FIELD]';
            break;
          default:
            sanitizedName = '[SENSITIVE FIELD]';
            break;
        }

        // Restrict unsafe action capabilities for sensitive controls (Requirement 6)
        // Remote server must NOT type into password, OTP, payment, token, or sensitive fields
        actionCapabilities = actionCapabilities.filter((cap) => cap !== 'type');
      } else {
        sanitizedName = sanitizeElementName(el.rawName);
      }

      return {
        localId: el.localId,
        role: el.role,
        sanitizedName,
        coarseBounds,
        state: el.state,
        actionCapabilities
      };
    });

    const sanitizedTitle = sanitizeElementName(snapshot.pageTitle);

    // 4. Post-Redaction Fail-Closed Verification
    const verification = PostRedactionVerifier.verify(
      allRegions,
      renderedCount,
      sanitizedElements,
      sanitizedTitle
    );

    if (!verification.isValid) {
      throw new Error(`Sanitization Blocked: ${verification.reason}`);
    }

    const safeCanonicalData = {
      captureId: rawCapture.captureId,
      goal: sanitizeElementName(goal),
      maskCount: allRegions.length,
      pageState: {
        title: sanitizedTitle,
        viewport: [rawCapture.metadata.viewportWidth, rawCapture.metadata.viewportHeight]
      },
      elements: sanitizedElements
    };
    const payloadDigestSha256 = await computePayloadDigestSha256(safeCanonicalData);

    return {
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: `run_${Date.now()}`,
      captureId: rawCapture.captureId,
      goal: sanitizeElementName(goal),
      sanitizedScreenshotDataUrl: sanitizedDataUrl,
      elements: sanitizedElements,
      pageState: {
        title: sanitizedTitle,
        viewport: [rawCapture.metadata.viewportWidth, rawCapture.metadata.viewportHeight]
      },
      maskCount: allRegions.length,
      payloadDigestSha256,
      timestamp: Date.now()
    };
  }
}
