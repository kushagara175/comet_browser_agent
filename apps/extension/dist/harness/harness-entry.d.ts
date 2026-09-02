/**
 * @privapilot/extension - Benchmark Harness Entry Point
 *
 * Exposes the SHIPPED client pipeline to a CDP-driven benchmark so it can be
 * measured in a real rendering engine.
 *
 * This exists because the previous benchmark had no browser: it scored string
 * matches against fixture literals and synthetic coordinates, and never executed
 * the element extractor, the mask renderer, or the ONNX face model. Everything
 * below calls the production modules unmodified - this file contains no detection
 * logic of its own, and must never be allowed to grow any.
 *
 * Bundled by scripts/build.js as an IIFE under the global `__privapilot`.
 */
import { SanitizedContext, ViewportMetadata } from '@privapilot/protocol';
/**
 * Must match protocol ViewportMetadata exactly. Emitting innerWidth/innerHeight
 * instead of viewportWidth/viewportHeight silently produces NaN boxes downstream:
 * fillRect(NaN) is a no-op that still increments the mask count, so nothing is
 * masked and the count-based verifier still passes.
 */
export type HarnessViewport = ViewportMetadata;
export interface HarnessExtractResult {
    readonly snapshot: any;
    readonly viewport: HarnessViewport;
    readonly elementCount: number;
    readonly extractMs: number;
}
/** Runs the real element extractor against the live document. */
export declare function extractSnapshot(): HarnessExtractResult;
export interface HarnessSanitizeResult {
    readonly sanitized: SanitizedContext | null;
    readonly blocked: boolean;
    readonly blockReason?: string;
    readonly sanitizeMs: number;
    readonly maskCount: number;
    readonly elementCount: number;
    readonly sanitizedScreenshotDataUrl: string;
}
/**
 * Runs the real sanitizer against a captured screenshot, with a canvas supplied -
 * which is what enables the ONNX face model. Fail-closed blocks are reported
 * rather than thrown, so a blocked fixture stays measurable instead of fatal.
 */
export declare function sanitize(screenshotDataUrl: string, snapshot: any, viewport: HarnessViewport, goal: string): Promise<HarnessSanitizeResult>;
export interface FailClosedProbe {
    readonly correctPlacement: {
        isValid: boolean;
        reason?: string;
    };
    readonly displacedPlacement: {
        isValid: boolean;
        reason?: string;
    };
    /** True only when a correct mask passes AND a displaced one is rejected. */
    readonly passed: boolean;
}
/**
 * Proves the SHIPPED verifier fails closed when a mask misses its region.
 *
 * Renders a real mask through MaskRenderer twice - once on the region and once
 * offset away from it - and runs PostRedactionVerifier over both. The second case
 * is the one the old count-based check waved through: a mask was rendered, the
 * count matched, and the secret was still legible underneath.
 */
export declare function probeDisplacedMaskFailsClosed(): FailClosedProbe;
/**
 * Points the vision model at an HTTP asset base. Required outside the extension,
 * where `chrome.runtime.getURL` does not exist.
 */
export declare function configureVisionAssets(assetBase: string | null): void;
export interface HarnessFaceResult {
    readonly providerUsed: string;
    readonly durationMs: number;
    readonly faces: ReadonlyArray<{
        readonly confidence: number;
        readonly box: readonly [number, number, number, number];
        readonly areaFraction: number;
    }>;
}
/**
 * Runs ONLY the ONNX face model and reports what it returned.
 *
 * Face detection had no instrument at all: the model's output reached the mask
 * renderer and nothing else, so a false positive was invisible unless it happened
 * to land on a ground-truth box. Exposing the raw detections is what makes face
 * behaviour - and `providerUsed`, which silently degrades to `heuristic_fallback`
 * on any error - measurable rather than assumed.
 */
export declare function detectFaces(screenshotDataUrl: string, viewport: HarnessViewport): Promise<HarnessFaceResult>;
export interface RegionProbe {
    readonly id: string;
    readonly normX: number;
    readonly normY: number;
    readonly normW: number;
    readonly normH: number;
}
export interface RegionVerdict {
    readonly id: string;
    readonly covered: boolean;
    /** False when the raw region carried too little detail for any pixel test to judge it. */
    readonly assessable: boolean;
    readonly opaqueFraction: number;
    readonly overlayFraction: number;
    readonly residualVariance: number;
    readonly rawVariance: number;
    readonly varianceReduction: number;
    /** Mean local luminance gradient in the raw region. */
    readonly rawDetail: number;
    /** The same, in the sanitized region, ignoring redaction chrome. */
    readonly residualDetail: number;
    readonly detailRemoved: number;
    readonly sampledPixels: number;
}
/**
 * Pixel-true redaction check.
 *
 * The shipped PostRedactionVerifier only compares detected-region count to
 * rendered-mask count and never reads a pixel, so a mask drawn at the wrong
 * coordinates passes it. This reads the actual output image and asks the question
 * the rubric asks: is this region genuinely destroyed?
 *
 * A region counts as covered if it is painted with the opaque mask fill, or if the
 * fine detail that was there has been destroyed (the pixelation path).
 */
export declare function verifyRedaction(rawDataUrl: string, sanitizedDataUrl: string, regions: ReadonlyArray<RegionProbe>): Promise<RegionVerdict[]>;
export declare function resolveSelectorBoxes(entries: ReadonlyArray<{
    id: string;
    selector: string;
    token?: string;
}>): Array<{
    id: string;
    found: boolean;
    anchor: string;
    normX: number;
    normY: number;
    normW: number;
    normH: number;
}>;
/** Stops animation loops and transitions so repeated screenshots are comparable. */
export declare function freezeAnimations(): void;
//# sourceMappingURL=harness-entry.d.ts.map