/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 * Validates geometry, enforces pixel-true coverage, and triggers opaque fallbacks
 * when face blur cannot be proven.
 */
import { SensitiveRegion, ScreenshotPixelBox, RedactionMethod } from '@privapilot/protocol';
export interface RegionRenderRecord {
    readonly regionId: string;
    readonly requestedBox: ScreenshotPixelBox;
    readonly clampedBox: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly method: RedactionMethod;
    readonly success: boolean;
    readonly fallbackApplied?: boolean;
    readonly failureReason?: string;
}
export interface FocusedRegion {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly type?: 'dialog' | 'form' | 'cluster' | string;
}
export interface RenderResult {
    readonly sanitizedScreenshotDataUrl: string;
    readonly renderedMaskCount: number;
    readonly regionRecords: ReadonlyArray<RegionRenderRecord>;
    readonly cropApplied?: boolean;
    readonly cropBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export declare class MaskRenderer {
    /**
     * Applies irreversible privacy masks and real face blurs directly onto the screenshot canvas.
     *
     * Enforces:
     * 1. Two-pass rendering: Blur pass first, opaque mask pass second (opaque masks always win).
     * 2. Strict geometry validation: Rejects NaN, Inf, non-positive dimensions, off-canvas, or 1px degenerate boxes.
     * 3. Irreversible block pixelation and color averaging for human faces with automatic opaque fallback if unproven.
     * 4. 100% opaque deep-slate blackouts for credentials, PII, payment data, and uninspectable surfaces.
     * 5. Per-region forensic audit records.
     */
    static renderMasks(imageCanvas: HTMLCanvasElement | OffscreenCanvas, regions: ReadonlyArray<SensitiveRegion>, interactiveElements?: ReadonlyArray<any>, viewport?: {
        width: number;
        height: number;
    }, focusedRegion?: FocusedRegion): RenderResult;
    /**
     * Safely crops an image canvas to a focused region of interest (e.g. active modal or form card).
     * Fallback to the full canvas if anything goes wrong or if the region is degenerate.
     */
    static cropCanvasToRegion(imageCanvas: HTMLCanvasElement | OffscreenCanvas, focusedRegion: FocusedRegion, viewport?: {
        width: number;
        height: number;
    }): {
        targetCanvas: HTMLCanvasElement | OffscreenCanvas;
        cropApplied: boolean;
        cropBox?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    /**
     * Set-of-Marks (SOM) visual labeling overlay renderer.
     * Places clear, high-contrast badges (e.g. "1", "2") corresponding to "el_1", "el_2"
     * on the sanitized screenshot canvas.
     */
    static renderSetOfMarks(imageCanvas: HTMLCanvasElement | OffscreenCanvas, elements: ReadonlyArray<any>, viewportWidth?: number, viewportHeight?: number): void;
    /**
     * Returns a clean, human-readable semantic surrogate label for a sensitive category.
     * Gives multimodal vision models unambiguous visual understanding of the data slot without exposing PII.
     */
    static getSemanticCategoryLabel(category: string, availableWidth: number): string;
}
//# sourceMappingURL=mask-renderer.d.ts.map