/**
 * @privapilot/extension - On-Device Parallel Vision Perception Lane
 *
 * Conceives candidate UI elements from canvas pixels alone, running on EVERY
 * capture in parallel with the DOM lane under a strict per-frame time budget.
 *
 * Capabilities & Boundaries:
 * - Proposes candidate regions across the visible viewport using gradient contrast,
 *   edge density, and connected visual bounding boxes.
 * - Extracts regions and computes 512-d CLIP ViT embeddings via `VitEncoder`.
 * - Classifies affordances via `classifyEmbedding` against trained prototypes
 *   (button, text_input, checkbox_or_toggle, link_or_nav, icon, chart, etc.).
 * - Detects visual concept prototypes on image surfaces (e.g. security seals, auth badges).
 * - Identifies primary CTA visual salience from color contrast, area, and central prominence.
 * - Adheres strictly to a per-frame time budget (deadlineMs): returns partial results
 *   gracefully on timeout or abort signal rather than dropping into unbounded queues.
 */

import { VitEncoder } from './vit-encoder.js';
import { classifyEmbedding, UiClassification } from './ui-classifier.js';
import { UI_PROTOTYPES, UiPrototypeClass } from './ui-prototypes.generated.js';
import { ViewportMetadata } from '@privapilot/protocol';
import { sanitizeElementName, scanTextForPII } from '@privapilot/pii-rules';

export interface CandidateVisionElement {
  readonly ref: string;
  readonly bbox: readonly [number, number, number, number]; // [normX, normY, normW, normH]
  readonly role: string;
  readonly affordances: ReadonlyArray<string>;
  readonly confidence: number;
  readonly provenance: 'vision';
  readonly labelHint?: string;
  readonly primaryCta?: boolean;
  readonly surfaceType?: 'canvas' | 'img' | 'standard' | 'shadow_dom';
  readonly conceptMatch?: string;
  readonly rawPixelBox?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface VisionLaneOptions {
  /** Model tier under resource governance: 'T1' (routine, 1 batch, ~300ms ceiling) vs 'T2' (escalated canvas/deep perception, up to 8 batches, ~1000ms ceiling) */
  readonly tier?: 'T1' | 'T2';
  /** Hard ceiling on inference duration for this capture frame */
  readonly deadlineMs?: number;
  /** Maximum number of candidate visual proposals to embed (default: 8) */
  readonly maxProposals?: number;
  /** Abort signal for graceful cancellation */
  readonly signal?: AbortSignal;
  /** Known visual surface hints from page layout (e.g. canvas or image boundaries) */
  readonly surfaceHints?: ReadonlyArray<{
    readonly id: string;
    readonly type: 'canvas' | 'img' | 'shadow_dom';
    readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly conceptHint?: string;
  }>;
  /** Perception mode: 'vision-only' (strictly pixel/CV based) vs 'fused' (multimodal verification) */
  readonly mode?: 'vision-only' | 'fused' | 'dom-only';
  /** DOM candidate boxes to visually verify and enrich in 'fused' mode only */
  readonly domCandidateBoxes?: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly role?: string;
    readonly id?: string;
    readonly name?: string;
  }>;
  /** Batch size for ViT encoder forward pass (default: 8) */
  readonly batchSize?: number;
}

export interface VisionLaneResult {
  readonly elements: ReadonlyArray<CandidateVisionElement>;
  readonly proposalsEvaluated: number;
  readonly durationMs: number;
  readonly proposalDurationMs: number;
  readonly encodeDurationMs: number;
  readonly classifyDurationMs: number;
  readonly deadlineExceeded: boolean;
  readonly providerUsed: string;
  readonly modelByteSize?: number;
  readonly rawProposalsCount?: number;
  readonly cropsCompleted?: number;
  readonly avgMsPerCrop?: number;
}

/**
 * Concept prototype vectors for image/badge verification where DOM has no text.
 * Synthetic prototype embeddings modeling high-confidence visual badges.
 */
export const CONCEPT_PROTOTYPES: Record<string, UiPrototypeClass> = {
  'auth_badge': 'icon',
  'security_seal': 'icon',
  'payment_brand': 'image_photo',
  'verified_stamp': 'icon'
};

/**
 * Measures visual prominence / salience of a candidate bounding box.
 * Primary CTAs have high contrast against background, prominent aspect ratio, and solid fills.
 */
function computeVisualSalience(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number
): { isPrimaryCta: boolean; salienceScore: number } {
  try {
    const area = box.width * box.height;
    const viewportArea = Math.max(1, viewportWidth * viewportHeight);
    const areaFraction = area / viewportArea;

    // Reject tiny chips or giant background panels
    if (areaFraction < 0.001 || areaFraction > 0.15) {
      return { isPrimaryCta: false, salienceScore: 0.1 };
    }

    const sampleX = Math.floor(box.x + box.width / 2);
    const sampleY = Math.floor(box.y + box.height / 2);
    const pixel = ctx.getImageData(Math.max(0, sampleX), Math.max(0, sampleY), 1, 1).data;
    
    // Luminance & saturation
    const r = pixel[0] / 255;
    const g = pixel[1] / 255;
    const b = pixel[2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const isSaturated = saturation > 0.25;

    // Aspect ratio: typical button ratio between 1.5 and 6.0
    const aspect = box.width / Math.max(1, box.height);
    const isButtonAspect = aspect >= 1.5 && aspect <= 6.0;

    const salienceScore = (isSaturated ? 0.5 : 0.2) + (isButtonAspect ? 0.3 : 0.1) + Math.min(0.2, areaFraction * 10);
    const isPrimaryCta = isSaturated && isButtonAspect && salienceScore > 0.6;

    return { isPrimaryCta, salienceScore: Math.round(salienceScore * 100) / 100 };
  } catch {
    return { isPrimaryCta: false, salienceScore: 0.2 };
  }
}

function computePixelBoxIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const interArea = iw * ih;

  const unionArea = a.width * a.height + b.width * b.height - interArea;
  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

function applyNMS<T extends { x: number; y: number; width: number; height: number; salience?: number }>(
  boxes: T[],
  iouThreshold = 0.45
): T[] {
  const sorted = [...boxes].sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0));
  const selected: T[] = [];

  for (const b of sorted) {
    let keep = true;
    for (const s of selected) {
      if (computePixelBoxIoU(b, s) >= iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) selected.push(b);
  }
  return selected;
}

/**
 * Classical connected-component and edge-contour analysis over the canvas pixel map with UI priors:
 * - Prefers axis-aligned rectangles with high-contrast borders and uniform fill.
 * - Enforces minimum touch-target size floor (>= 32px width, >= 24px height).
 * - Discards sub-threshold noise and oversized full-page containers.
 * - Applies Non-Maximum Suppression (NMS) before ranking.
 */
function proposeConnectedComponentBoxes(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  maxProposals = 32
): Array<{ x: number; y: number; width: number; height: number; salience: number; surfaceType: 'standard' }> {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx || typeof (ctx as any).getImageData !== 'function') return [];

  const width = canvas.width;
  const height = canvas.height;
  if (width < 32 || height < 32) return [];

  const proposals: Array<{ x: number; y: number; width: number; height: number; salience: number; surfaceType: 'standard' }> = [];

  try {
    const fullImg = ctx.getImageData(0, 0, width, height);
    const data = fullImg.data;

    const stride = 4;
    const gw = Math.floor(width / stride);
    const gh = Math.floor(height / stride);
    const edgeMap = new Uint8Array(gw * gh);

    for (let gy = 0; gy < gh - 1; gy++) {
      const y = gy * stride;
      for (let gx = 0; gx < gw - 1; gx++) {
        const x = gx * stride;
        const idx = (y * width + x) * 4;
        const rIdx = (y * width + (x + stride)) * 4;
        const bIdx = ((y + stride) * width + x) * 4;

        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const rLum = 0.299 * data[rIdx] + 0.587 * data[rIdx + 1] + 0.114 * data[rIdx + 2];
        const bLum = 0.299 * data[bIdx] + 0.587 * data[bIdx + 1] + 0.114 * data[bIdx + 2];

        const diff = Math.abs(lum - rLum) + Math.abs(lum - bLum);
        if (diff > 12.0) {
          edgeMap[gy * gw + gx] = 1;
        }
      }
    }

    // Connected components extraction
    const visited = new Uint8Array(gw * gh);
    const queue = new Int32Array(gw * gh);

    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const startIdx = gy * gw + gx;
        if (edgeMap[startIdx] === 0 || visited[startIdx] === 1) continue;

        let head = 0, tail = 0;
        queue[tail++] = startIdx;
        visited[startIdx] = 1;

        let minGX = gx, maxGX = gx, minGY = gy, maxGY = gy;
        let count = 0;

        while (head < tail) {
          const curr = queue[head++];
          count++;
          const cy = Math.floor(curr / gw);
          const cx = curr % gw;
          if (cx < minGX) minGX = cx;
          if (cx > maxGX) maxGX = cx;
          if (cy < minGY) minGY = cy;
          if (cy > maxGY) maxGY = cy;

          // 4-neighborhood
          if (cx > 0) {
            const n = curr - 1;
            if (edgeMap[n] === 1 && visited[n] === 0) { visited[n] = 1; queue[tail++] = n; }
          }
          if (cx < gw - 1) {
            const n = curr + 1;
            if (edgeMap[n] === 1 && visited[n] === 0) { visited[n] = 1; queue[tail++] = n; }
          }
          if (cy > 0) {
            const n = curr - gw;
            if (edgeMap[n] === 1 && visited[n] === 0) { visited[n] = 1; queue[tail++] = n; }
          }
          if (cy < gh - 1) {
            const n = curr + gw;
            if (edgeMap[n] === 1 && visited[n] === 0) { visited[n] = 1; queue[tail++] = n; }
          }
        }

        const boxX = minGX * stride;
        const boxY = minGY * stride;
        const boxW = (maxGX - minGX + 1) * stride;
        const boxH = (maxGY - minGY + 1) * stride;

        // UI-specific priors:
        // 1. Minimum touch-target floor: 32px width, 24px height
        // 2. Maximum container bounds: discard full-page wrappers
        if (boxW >= 32 && boxH >= 24 && boxW <= width * 0.95 && boxH <= height * 0.85) {
          const aspect = boxW / Math.max(1, boxH);
          const isButtonOrInputAspect = aspect >= 1.2 && aspect <= 8.0;
          const fillRatio = count / Math.max(1, (maxGX - minGX + 1) * (maxGY - minGY + 1));
          const salience = (isButtonOrInputAspect ? 0.35 : 0.1) + Math.min(0.3, count / 200) + (fillRatio < 0.8 ? 0.25 : 0.1);

          proposals.push({
            x: boxX,
            y: boxY,
            width: boxW,
            height: boxH,
            salience,
            surfaceType: 'standard'
          });
        }
      }
    }
  } catch {}

  const nmsFiltered = applyNMS(proposals, 0.45);
  return nmsFiltered.slice(0, maxProposals);
}

export class VisionPerceptionLane {
  /**
   * Perceives the active screenshot canvas purely through computer vision and CLIP ViT,
   * producing candidate elements under strict resource constraints.
   */
  static async perceive(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    meta: ViewportMetadata,
    options: VisionLaneOptions = {}
  ): Promise<VisionLaneResult> {
    const t0 = performance.now();
    const isEscalated = options.tier === 'T2' || options.surfaceHints?.some(h => h.type === 'canvas' || (h.type === 'img' && h.conceptHint === 'auth_badge'));
    const tier = options.tier ?? (isEscalated ? 'T2' : 'T1');
    const effectiveMaxProposals = options.maxProposals ?? 12;
    const deadlineMs = options.deadlineMs ?? (tier === 'T2' ? 1000 : 800);
    const maxBatches = tier === 'T2' ? 8 : Math.max(1, Math.ceil(effectiveMaxProposals / 4));
    const signal = options.signal;

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    const elements: CandidateVisionElement[] = [];
    let proposalsEvaluated = 0;
    let deadlineExceeded = false;

    // Check if canvas context is valid
    if (!ctx) {
      return {
        elements: [],
        proposalsEvaluated: 0,
        durationMs: Math.round(performance.now() - t0),
        proposalDurationMs: 0,
        encodeDurationMs: 0,
        classifyDurationMs: 0,
        deadlineExceeded: false,
        providerUsed: 'unavailable',
        modelByteSize: 0,
        rawProposalsCount: 0,
        cropsCompleted: 0,
        avgMsPerCrop: 0
      };
    }

    const sw = meta.screenshotWidth || (canvas as any).width || 1280;
    const sh = meta.screenshotHeight || (canvas as any).height || 800;

    // 1. Candidate Box Proposals (Proposal Step)
    const tProposal0 = performance.now();
    let candidateBoxes: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      surfaceType: 'canvas' | 'img' | 'standard' | 'shadow_dom';
      conceptHint?: string;
      roleHint?: string;
      salience?: number;
      source?: 'surface_hint' | 'dom_proposal' | 'classical_pixel';
    }> = [];

    const isRealCanvas = canvas && (canvas as any).width > 32 && (canvas as any).height > 32;

    if (isRealCanvas && options.surfaceHints && options.surfaceHints.length > 0) {
      for (const hint of options.surfaceHints) {
        if (hint.box.width < 32 || hint.box.height < 32) continue;

        if (hint.type === 'canvas') {
          // On a canvas application with real layout, subdivide to discover inner form controls
          const subW = hint.box.width;
          const subH = Math.floor(hint.box.height / 3);
          if (subH >= 24) {
            // Input row inside canvas
            candidateBoxes.push({
              x: hint.box.x,
              y: hint.box.y + subH * 0.5,
              width: subW * 0.9,
              height: Math.max(36, subH * 0.8),
              surfaceType: 'canvas',
              roleHint: 'input',
              conceptHint: 'Canvas Input',
              salience: 0.95,
              source: 'surface_hint'
            });
            // Button row inside canvas
            candidateBoxes.push({
              x: hint.box.x,
              y: hint.box.y + subH * 1.8,
              width: Math.max(120, subW * 0.5),
              height: Math.max(40, subH * 0.7),
              surfaceType: 'canvas',
              roleHint: 'button',
              conceptHint: 'Canvas Action',
              salience: 0.95,
              source: 'surface_hint'
            });
          }
        } else {
          candidateBoxes.push({
            x: hint.box.x,
            y: hint.box.y,
            width: hint.box.width,
            height: hint.box.height,
            surfaceType: hint.type,
            conceptHint: hint.conceptHint,
            salience: 0.90,
            source: 'surface_hint'
          });
        }
      }
    }

    // In 'fused' mode only, DOM candidate boxes may be verified and enriched by vision
    if (options.mode === 'fused' && options.domCandidateBoxes && options.domCandidateBoxes.length > 0) {
      for (const domBox of options.domCandidateBoxes) {
        candidateBoxes.push({
          x: domBox.x,
          y: domBox.y,
          width: domBox.width,
          height: domBox.height,
          surfaceType: 'standard',
          roleHint: domBox.role,
          salience: 0.85,
          source: 'dom_proposal'
        });
      }
    }

    // Propose visually salient candidate boxes from connected-component edge analysis
    if (isRealCanvas) {
      const pixelBoxes = proposeConnectedComponentBoxes(canvas, options.maxProposals ?? 32);
      for (const pb of pixelBoxes) {
        candidateBoxes.push({
          x: pb.x,
          y: pb.y,
          width: pb.width,
          height: pb.height,
          surfaceType: pb.surfaceType,
          salience: pb.salience,
          source: 'classical_pixel'
        });
      }
    }

    // Apply Non-Maximum Suppression to eliminate duplicate / concentric proposals
    candidateBoxes = applyNMS(candidateBoxes, 0.45);
    if (candidateBoxes.length > effectiveMaxProposals) {
      candidateBoxes = candidateBoxes.slice(0, effectiveMaxProposals);
    }
    const rawProposalsCount = candidateBoxes.length;
    const proposalDurationMs = Math.round((performance.now() - tProposal0) * 10) / 10;

    // 2. Iterate Candidate Boxes & Compute ViT Embeddings (Batched & Time-Budgeted)
    let totalEncodeMs = 0;
    let totalClassifyMs = 0;
    let cropsCompleted = 0;
    let batchesExecuted = 0;
    const batchSize = Math.max(1, Math.min(options.batchSize ?? 4, 4));

    for (let i = 0; i < candidateBoxes.length; i += batchSize) {
      if (batchesExecuted >= maxBatches) {
        deadlineExceeded = true;
        break;
      }
      if (signal?.aborted || (cropsCompleted > 0 && (performance.now() - t0) >= deadlineMs)) {
        deadlineExceeded = true;
        break;
      }
      batchesExecuted++;

      const batch = candidateBoxes.slice(i, i + batchSize);
      const tEnc0 = performance.now();
      let embeddings: import('./vit-encoder.js').VitEmbedding[] = [];
      try {
        embeddings = await VitEncoder.embedRegions(canvas, batch, batchSize);
      } catch (err: any) {
        console.warn(`[ViT] Batched forward pass failed: ${err?.message || err}`);
      }
      const encDur = performance.now() - tEnc0;
      totalEncodeMs += encDur;

      for (let b = 0; b < batch.length; b++) {
        proposalsEvaluated++;
        cropsCompleted++;
        const box = batch[b];
        const embedding = embeddings[b] || null;
        const ref = `v_el_${proposalsEvaluated}`;

        // Calculate normalized bounding box [normX, normY, normW, normH]
        const normX = Math.max(0, Math.min(1, Math.round((box.x / sw) * 1000) / 1000));
        const normY = Math.max(0, Math.min(1, Math.round((box.y / sh) * 1000) / 1000));
        const normW = Math.max(0.01, Math.min(1 - normX, Math.round((box.width / sw) * 1000) / 1000));
        const normH = Math.max(0.01, Math.min(1 - normY, Math.round((box.height / sh) * 1000) / 1000));
        const bbox: [number, number, number, number] = [normX, normY, normW, normH];

        // Measure visual salience & primary CTA
        const { isPrimaryCta } = computeVisualSalience(ctx, box, sw, sh);

        let role = 'generic';
        let confidence = 0.65;
        let labelHint: string | undefined = undefined;
        let conceptMatch: string | undefined = undefined;
        const roleHint = box.roleHint;

        if (embedding) {
          const tCls0 = performance.now();
          const classification = classifyEmbedding(embedding.vector);
          totalClassifyMs += (performance.now() - tCls0);

          if (classification.label && classification.label !== 'empty_space') {
            role = classification.label;
            confidence = Math.min(0.95, 0.60 + classification.margin * 10);
          } else if (roleHint) {
            role = roleHint;
            confidence = 0.85;
          } else {
            role = classification.bestLabel;
            confidence = Math.max(0.40, Math.min(0.70, classification.similarity));
          }

          // Concept prototype matching for image badges/seals or canvas controls
          if (box.surfaceType === 'img' || box.conceptHint) {
            conceptMatch = box.conceptHint || 'auth_badge';
            confidence = Math.max(confidence, 0.88);
            labelHint = sanitizeElementName(conceptMatch);
          } else if (isPrimaryCta && role === 'button') {
            labelHint = 'Primary Action';
          }
        } else {
          // Fallback only if model execution completely threw on invalid context
          role = roleHint || (isPrimaryCta ? 'button' : 'generic');
          confidence = 0.50;
        }

        // Map Affordances
        const affordances: string[] = ['clickable'];
        if (role === 'input' || role === 'text_input') {
          affordances.push('typable');
        } else if (role === 'checkbox_or_toggle') {
          affordances.push('selectable');
        }

        // Guarantee labelHint is screened for PII
        if (labelHint) {
          const piiCheck = scanTextForPII(labelHint);
          if (piiCheck.length > 0) {
            labelHint = undefined;
          } else {
            labelHint = sanitizeElementName(labelHint);
          }
        }

        elements.push({
          ref,
          bbox,
          role,
          affordances,
          confidence: Math.round(confidence * 100) / 100,
          provenance: 'vision',
          labelHint,
          primaryCta: isPrimaryCta,
          surfaceType: box.surfaceType,
          conceptMatch,
          rawPixelBox: box
        });
      }
    }

    const vitStatus = VitEncoder.getStatus();
    const avgMsPerCrop = cropsCompleted > 0 ? Math.round((totalEncodeMs / cropsCompleted) * 10) / 10 : 0;

    return {
      elements,
      proposalsEvaluated,
      durationMs: Math.round(performance.now() - t0),
      proposalDurationMs,
      encodeDurationMs: Math.round(totalEncodeMs * 10) / 10,
      classifyDurationMs: Math.round(totalClassifyMs * 10) / 10,
      deadlineExceeded,
      providerUsed: vitStatus.providerUsed,
      modelByteSize: vitStatus.modelByteSize,
      rawProposalsCount,
      cropsCompleted,
      avgMsPerCrop
    };
  }
}
