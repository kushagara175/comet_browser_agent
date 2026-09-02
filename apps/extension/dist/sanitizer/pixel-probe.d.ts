/**
 * @privapilot/extension - Shared pixel sampling for redaction verification
 *
 * The benchmark harness proved a mask landed on its region by reading the output
 * pixels; the shipped PostRedactionVerifier only compared a region count to a mask
 * count, so a mask drawn at the wrong coordinates passed it. These are the routines
 * both now use, so the product enforces exactly what the benchmark measures.
 */
export interface RegionSample {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}
/** True when a pixel lies on the fill-to-chrome line of the redaction palette. */
export declare function isOverlayPixel(r: number, g: number, b: number, tolerance?: number): boolean;
/** Fraction of pixels belonging to the redaction overlay rather than page content. */
export declare function overlayFractionOf(data: Uint8ClampedArray): number;
/**
 * Mean absolute luminance gradient between adjacent pixels - how much fine detail
 * survives.
 *
 * This, not variance, is the measure for the pixelation path: replacing each block
 * with its own mean preserves between-block variance and destroys only within-block
 * variance, so a correctly pixelated face barely moves a variance ratio.
 */
export declare function localDetailOf(data: Uint8ClampedArray, w: number, h: number, skipOverlay?: boolean): number;
/**
 * Reads a clamped region out of a canvas, downscaling the sampled area when the
 * region is very large so verification stays cheap.
 */
export declare function sampleRegion(canvas: HTMLCanvasElement | OffscreenCanvas, box: {
    x: number;
    y: number;
    width: number;
    height: number;
}): RegionSample | null;
//# sourceMappingURL=pixel-probe.d.ts.map