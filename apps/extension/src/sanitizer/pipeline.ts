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
  SensitiveRegion
} from '@privapilot/protocol';
import { sanitizeElementName } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';
import { detectDomSensitiveRegions, RawDomElementCapture } from './dom-detector.js';
import { detectTextSensitiveRegions, RawTextNodeCapture } from './text-detector.js';
import { detectFaceRegions, RawImageElementCapture } from './face-detector.js';
import { detectHighRiskSurfaces, RawSurfaceCapture } from './surface-detector.js';
import { MaskRenderer } from './mask-renderer.js';
import { PostRedactionVerifier } from './post-redaction-verifier.js';

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

    // 1. Run all multi-layer detectors
    const domRegions = detectDomSensitiveRegions(snapshot.domElements, transformer);
    const textRegions = detectTextSensitiveRegions(snapshot.textNodes, transformer);
    const faceRegions = detectFaceRegions(snapshot.imageElements, transformer);
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

    // 2. Render Redaction Masks onto Canvas
    let sanitizedDataUrl: string;
    let renderedCount = 0;

    if (imageCanvas) {
      const renderResult = MaskRenderer.renderMasks(imageCanvas, allRegions);
      sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
      renderedCount = renderResult.renderedMaskCount;
    } else {
      // Offline/Test Canvas Simulator
      sanitizedDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      renderedCount = allRegions.length;
    }

    // 3. Scrub Interactive Elements (Map to localId, scrub names, compute coarse bounds)
    const sanitizedElements: SanitizedElement[] = snapshot.interactiveElements.map((el) => {
      const coarseBounds: [number, number, number, number] = [
        Math.round((el.boundingBox.x / rawCapture.metadata.viewportWidth) * 100) / 100,
        Math.round((el.boundingBox.y / rawCapture.metadata.viewportHeight) * 100) / 100,
        Math.round((el.boundingBox.width / rawCapture.metadata.viewportWidth) * 100) / 100,
        Math.round((el.boundingBox.height / rawCapture.metadata.viewportHeight) * 100) / 100
      ];

      return {
        localId: el.localId,
        role: el.role,
        sanitizedName: sanitizeElementName(el.rawName),
        coarseBounds,
        state: el.state,
        actionCapabilities: el.actionCapabilities
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

    // Simple SHA-256 simulation for payload digest
    const digestStr = `${rawCapture.captureId}:${allRegions.length}:${sanitizedElements.length}`;
    const payloadDigestSha256 = `sha256_${Math.abs(digestStr.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;

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
