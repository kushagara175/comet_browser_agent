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
import { UiPrototypeClass } from './ui-prototypes.generated.js';
import { ViewportMetadata } from '@privapilot/protocol';
export interface CandidateVisionElement {
    readonly ref: string;
    readonly bbox: readonly [number, number, number, number];
    readonly role: string;
    readonly affordances: ReadonlyArray<string>;
    readonly confidence: number;
    readonly provenance: 'vision';
    readonly labelHint?: string;
    readonly primaryCta?: boolean;
    readonly surfaceType?: 'canvas' | 'img' | 'standard' | 'shadow_dom';
    readonly conceptMatch?: string;
    readonly rawPixelBox?: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
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
        readonly box: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
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
export declare const CONCEPT_PROTOTYPES: Record<string, UiPrototypeClass>;
export declare class VisionPerceptionLane {
    /**
     * Perceives the active screenshot canvas purely through computer vision and CLIP ViT,
     * producing candidate elements under strict resource constraints.
     */
    static perceive(canvas: HTMLCanvasElement | OffscreenCanvas, meta: ViewportMetadata, options?: VisionLaneOptions): Promise<VisionLaneResult>;
}
//# sourceMappingURL=vision-lane.d.ts.map