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
  SensitiveCategory,
  RedactionManifest,
  RedactionCategorySummary,
  sensitiveElementPlaceholder,
  redactionImageLabel,
  FACE_IMAGE_LABEL,
  REDACTION_FILL_COLOR,
  ModelTier,
  SceneGraph
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
import { VitEncoder, VIT_MODEL_FAMILY } from '../vision/vit-encoder.js';
import { proposeRegions } from '../vision/region-proposer.js';
import { classifyEmbedding } from '../vision/ui-classifier.js';
import { VisionPerceptionLane } from '../vision/vision-lane.js';
import { FusionPolicy, PerceptionMode, DomCandidateElement } from '../vision/fusion-policy.js';
import { PerceptionCache, computeCanvasDHash } from './perception-cache.js';

export interface SanitizeOptions {
  readonly activeTier?: ModelTier;
  readonly domHash?: string;
  readonly viewportHash?: string;
  readonly perceptionMode?: PerceptionMode;
  readonly deadlineMs?: number;
  readonly regionBudget?: number;
}

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
    imageCanvas?: HTMLCanvasElement | OffscreenCanvas,
    options?: SanitizeOptions
  ): Promise<SanitizedContext> {
    const activeTier = options?.activeTier || 'T1';

    // 0a. Check sound composite perception cache: (domHash, viewportHash, 32x32 dHash)
    let canvasDHash = '';
    if (imageCanvas) {
      canvasDHash = computeCanvasDHash(imageCanvas);
    }
    const cacheKey = (options?.domHash && options?.viewportHash && canvasDHash)
      ? PerceptionCache.buildKey(options.domHash, options.viewportHash, canvasDHash)
      : null;

    if (cacheKey) {
      const cached = PerceptionCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          captureId: rawCapture.captureId,
          timestamp: Date.now()
        };
      }
    }

    const transformer = new CoordinateTransformer(rawCapture.metadata);

    // 0b. Run on-device ONNX face model inference on screenshot canvas (skipped in T0)
    let modelFaces: ReadonlyArray<DetectedFace> = [];
    if (activeTier !== 'T0' && imageCanvas) {
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

    // 2. Resolve the host canvas.
    //
    // Split from mask rendering so the vision pass below can read the screen BEFORE
    // masks are painted over it. Reading the masked canvas means reading solid
    // blackout rectangles - the first version did exactly that and the ViT was
    // dutifully classifying the redaction overlay.
    let hostCanvas: HTMLCanvasElement | OffscreenCanvas;

    if (imageCanvas) {
      hostCanvas = imageCanvas;
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
      hostCanvas = canvas;
    } else {
      throw new Error('Sanitization Blocked: No canvas host available. Rendering must execute in an offscreen document with DOM access.');
    }

    // 3. Parallel Vision Lane: Runs on EVERY capture (in parallel with DOM lane)
    // under an enforced frame deadline, producing candidate elements from pixels alone.
    const surfaceHints = surfaceRegions.map((s) => ({
      id: s.id,
      type: (s.id.includes('canvas') ? 'canvas' : (s.id.includes('img') ? 'img' : 'shadow_dom')) as 'canvas' | 'img' | 'shadow_dom',
      box: s.screenshotBox,
      conceptHint: s.label
    }));

    let visionElements: ReadonlyArray<import('../vision/vision-lane.js').CandidateVisionElement> = [];
    let regionsProposed = 0;
    let regionsEmbedded = 0;
    let visionInferenceMs = 0;
    let visionProviderUsed = 'none';
    let visionError: string | undefined;

    if (activeTier !== 'T0') {
      try {
        const laneResult = await VisionPerceptionLane.perceive(hostCanvas, rawCapture.metadata, {
          deadlineMs: options?.deadlineMs ?? 800,
          maxProposals: options?.regionBudget ?? 12,
          surfaceHints
        });
        visionElements = laneResult.elements;
        regionsProposed = laneResult.proposalsEvaluated;
        regionsEmbedded = laneResult.elements.length;
        visionInferenceMs = laneResult.durationMs;
        visionProviderUsed = laneResult.providerUsed;
      } catch (err: any) {
        visionError = String(err?.message || err);
      }
    }

    const visionObservations: Array<{
      surfaceId: string; regionId: string; label: string | null;
      bestLabel: string; margin: number; confident: boolean;
      box: readonly [number, number, number, number];
    }> = visionElements.map((el) => ({
      surfaceId: el.surfaceType || 'viewport',
      regionId: el.ref,
      label: el.role,
      bestLabel: el.role,
      margin: el.confidence,
      confident: el.confidence >= 0.70,
      box: [
        Math.round(el.bbox[0] * rawCapture.metadata.screenshotWidth),
        Math.round(el.bbox[1] * rawCapture.metadata.screenshotHeight),
        Math.round(el.bbox[2] * rawCapture.metadata.screenshotWidth),
        Math.round(el.bbox[3] * rawCapture.metadata.screenshotHeight)
      ] as const
    }));

    const visionTelemetry = {
      modelFamily: activeTier === 'T0' ? 'DOM Heuristics (T0, models skipped)' : VIT_MODEL_FAMILY,
      providerUsed: activeTier === 'T0' ? 'none' : (visionProviderUsed || VitEncoder.getStatus().providerUsed),
      regionsProposed,
      regionsEmbedded,
      totalInferenceMs: visionInferenceMs,
      available: activeTier === 'T0' ? true : VitEncoder.getStatus().available,
      ...(visionError ? { error: visionError } : {})
    };

    // 4. Render Redaction Masks onto Canvas (Strictly Fail-Closed: Zero 1x1 or permissive fallbacks)
    const preMaskDetail = PostRedactionVerifier.measurePreMaskDetail(hostCanvas, allRegions);
    const renderResult = MaskRenderer.renderMasks(hostCanvas, allRegions);
    const sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
    const renderedCount = renderResult.renderedMaskCount;
    const maskedCanvas: HTMLCanvasElement | OffscreenCanvas = hostCanvas;

    // Map of localId -> sensitive category from DOM detector
    const sensitiveDomElementsMap = new Map<string, SensitiveCategory>();
    for (const region of domRegions) {
      if (region.id.startsWith('dom_sens_')) {
        const localId = region.id.replace('dom_sens_', '');
        sensitiveDomElementsMap.set(localId, region.category);
      }
    }

    // 5. Multimodal SceneGraph Fusion on Every Capture
    const perceptionMode = options?.perceptionMode ?? 'fused';

    const domCandidates: DomCandidateElement[] = snapshot.interactiveElements.map((el) => {
      const domMatch = snapshot.domElements.find((d) => d.id === el.localId);
      const sensitiveCategory = sensitiveDomElementsMap.get(el.localId);
      const safeName = sensitiveCategory
        ? sensitiveElementPlaceholder(sensitiveCategory)
        : sanitizeElementName(el.rawName);
      return {
        id: el.localId,
        role: el.role,
        name: safeName,
        boundingBox: el.boundingBox,
        disabled: el.state.includes('disabled'),
        inputType: domMatch?.descriptor?.type,
        ariaRole: domMatch?.descriptor?.ariaLabel,
        confidence: 0.90
      };
    });

    const sceneGraph = FusionPolicy.fuse(
      domCandidates,
      visionElements,
      rawCapture.metadata,
      { mode: perceptionMode }
    );

    const sanitizedElements: SanitizedElement[] = sceneGraph.elements.map((sgEl: any) => {
      const sensitiveCategory = sensitiveDomElementsMap.get(sgEl.ref);
      let sanitizedName: string;
      let actionCapabilities: import('@privapilot/protocol').ActionCapability[] = [];
      for (const a of sgEl.affordances) {
        if (a === 'clickable') actionCapabilities.push('click');
        if (a === 'typable') actionCapabilities.push('type');
        if (a === 'selectable') actionCapabilities.push('select');
        if (a === 'scrollable') actionCapabilities.push('scroll');
      }
      if (actionCapabilities.length === 0) actionCapabilities.push('click');

      if (sensitiveCategory) {
        sanitizedName = sensitiveElementPlaceholder(sensitiveCategory);
        actionCapabilities = actionCapabilities.filter((cap) => cap !== 'type');
      } else {
        sanitizedName = sanitizeElementName(sgEl.labelHint || sgEl.role);
      }

      let role: import('@privapilot/protocol').ElementRole = 'generic';
      const r = sgEl.role.toLowerCase();
      if (r === 'button') role = 'button';
      else if (r === 'link') role = 'link';
      else if (r === 'input' || r === 'text_input') role = 'input';
      else if (r === 'select') role = 'select';
      else if (r === 'textarea') role = 'textarea';
      else if (r === 'checkbox' || r === 'checkbox_or_toggle') role = 'checkbox';
      else if (r === 'radio') role = 'radio';

      return {
        localId: sgEl.ref,
        role,
        sanitizedName,
        coarseBounds: sgEl.bbox,
        state: ['visible', 'enabled'],
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

    // 4b. Pixel-true coverage. The count check above passes even when a mask is
    // drawn at the wrong coordinates - the mask exists, the count matches, and the
    // secret is still readable. This reads the output pixels and fails closed.
    if (maskedCanvas) {
      const pixelVerification = PostRedactionVerifier.verifyPixelCoverage(
        maskedCanvas,
        allRegions,
        preMaskDetail
      );
      if (!pixelVerification.isValid) {
        throw new Error(`Sanitization Blocked: ${pixelVerification.reason}`);
      }
    }

    // 5. Redaction manifest - what was removed, and by what convention.
    //
    // Counts and conventions only. A manifest that carried labels, values or
    // coordinates would re-identify exactly what the redaction removed, which would
    // defeat the point of transmitting it.
    const byCategory = new Map<SensitiveCategory, RedactionCategorySummary>();
    for (const region of allRegions) {
      const existing = byCategory.get(region.category);
      if (existing) {
        byCategory.set(region.category, { ...existing, count: existing.count + 1 });
      } else {
        byCategory.set(region.category, { category: region.category, count: 1, method: region.method });
      }
    }

    const placeholdersUsed = Array.from(
      new Set(
        Array.from(sensitiveDomElementsMap.values()).map((c) => sensitiveElementPlaceholder(c))
      )
    ).sort();

    const assessableRegions = allRegions.filter((r) => preMaskDetail.has(r.id));
    const redactionManifest: RedactionManifest = {
      schemeVersion: '1.0',
      categories: Array.from(byCategory.values()).sort((a, b) => a.category.localeCompare(b.category)),
      totalRegions: allRegions.length,
      masksRendered: renderedCount,
      conventions: {
        opaqueFillColor: REDACTION_FILL_COLOR,
        imageLabelFormat: redactionImageLabel('password').replace('PASSWORD', 'CATEGORY'),
        faceImageLabel: FACE_IMAGE_LABEL,
        elementPlaceholders: placeholdersUsed
      },
      coverage: {
        pixelVerified: maskedCanvas !== null,
        regionsAssessed: assessableRegions.length,
        regionsUnassessable: allRegions.length - assessableRegions.length
      },
      withheldCapabilities: sensitiveDomElementsMap.size > 0 ? ['type'] : []
    };

    // Simple SHA-256 simulation for payload digest
    const digestStr = `${rawCapture.captureId}:${allRegions.length}:${sanitizedElements.length}`;
    const payloadDigestSha256 = `sha256_${Math.abs(digestStr.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;

    const sanitized: SanitizedContext = {
      _brand: 'SanitizedContext_Verified',
      protocolVersion: '1.0',
      runId: `run_${Date.now()}`,
      captureId: rawCapture.captureId,
      goal: sanitizeElementName(goal),
      sanitizedScreenshotDataUrl: sanitizedDataUrl,
      elements: sanitizedElements,
      sceneGraph,
      pageState: {
        title: sanitizedTitle,
        viewport: [rawCapture.metadata.viewportWidth, rawCapture.metadata.viewportHeight]
      },
      maskCount: allRegions.length,
      visionObservations,
      visionTelemetry,
      redactionManifest,
      payloadDigestSha256,
      timestamp: Date.now()
    };

    if (cacheKey) {
      PerceptionCache.set(cacheKey, sanitized);
    }

    return sanitized;
  }
}
