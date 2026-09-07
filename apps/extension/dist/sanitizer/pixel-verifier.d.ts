/**
 * @privapilot/extension - Production Pixel Verifier
 *
 * Shared pixel-true verification algorithms used across production pipeline,
 * post-redaction verification, and benchmark evaluation harness.
 *
 * Inspects the actual pixel buffer to guarantee that:
 * 1. Opaque masks physically cover sensitive coordinates with verified overlay palette.
 * 2. Spatial face blur destroys high-frequency variance or triggers verified opaque fallback.
 * 3. Geometry is strictly valid and within canvas bounds (no NaN, inf, or degenerate 1px boxes).
 */
import { SensitiveRegion, ScreenshotPixelBox, RedactionMethod } from '@privapilot/protocol';
export declare const MASK_FILL_RGB: readonly [15, 23, 42];
export declare const MASK_CHROME_RGB: readonly [56, 189, 248];
export interface GeometryValidationResult {
    readonly isValid: boolean;
    readonly reason?: string;
}
export interface RegionVerificationVerdict {
    readonly id: string;
    readonly covered: boolean;
    readonly method: RedactionMethod;
    readonly opaqueFraction: number;
    readonly overlayFraction: number;
    readonly residualVariance: number;
    readonly rawVariance: number;
    readonly varianceReduction: number;
    readonly sampledPixels: number;
    readonly fallbackApplied?: boolean;
    readonly failureReason?: string;
}
export interface CanvasVerificationReport {
    readonly allPassed: boolean;
    readonly verdicts: ReadonlyArray<RegionVerificationVerdict>;
    readonly failureReason?: string;
}
/**
 * Validates region bounding box geometry against canvas constraints.
 * Rejects NaN, Inf, non-positive dimensions, fully off-canvas boxes, and degenerate inputs.
 */
export declare function validateRegionGeometry(box: ScreenshotPixelBox, canvasWidth: number, canvasHeight: number): GeometryValidationResult;
/**
 * Computes luminance variance of an RGBA image buffer.
 */
export declare function computeLuminanceVariance(data: Uint8ClampedArray): number;
export declare const varianceOf: typeof computeLuminanceVariance;
/**
 * Fraction of pixels matching the opaque mask fill #0f172a within tolerance.
 */
export declare function opaqueFractionOf(data: Uint8ClampedArray, tolerance?: number): number;
/**
 * Fraction of pixels belonging to the redaction overlay rather than original page content.
 * Matches fill (#0f172a), chrome border/label (#38bdf8), and their antialiased blends.
 */
export declare function overlayFractionOf(data: Uint8ClampedArray, tolerance?: number): number;
/**
 * Verifies that a specific sensitive region in the sanitized pixel buffer is properly destroyed.
 */
export declare function verifyRegionPixelBuffer(sanitizedData: Uint8ClampedArray, rawData: Uint8ClampedArray | null, method: RedactionMethod, regionId?: string): RegionVerificationVerdict;
/**
 * Runs end-to-end pixel verification across an entire canvas given raw and sanitized canvases.
 */
export declare function verifyCanvasRedaction(sanitizedCanvas: HTMLCanvasElement | OffscreenCanvas, rawCanvas: HTMLCanvasElement | OffscreenCanvas | null, regions: ReadonlyArray<SensitiveRegion>): CanvasVerificationReport;
//# sourceMappingURL=pixel-verifier.d.ts.map