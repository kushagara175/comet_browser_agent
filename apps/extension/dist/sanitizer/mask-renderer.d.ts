/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 */
import { SensitiveRegion } from '@privapilot/protocol';
export interface RenderResult {
    readonly sanitizedScreenshotDataUrl: string;
    readonly renderedMaskCount: number;
}
export declare class MaskRenderer {
    /**
     * Applies irreversible privacy masks and real face blurs directly onto the screenshot canvas.
     *
     * Enforces:
     * 1. Two-pass rendering: Blur pass first, opaque mask pass second (opaque masks always win).
     * 2. Strict bounds clamping to prevent sampling outside canvas boundaries.
     * 3. Irreversible block pixelation and color averaging for human faces.
     * 4. 100% opaque deep-slate blackouts for credentials, PII, payment data, and uninspectable surfaces.
     * 5. Fail-closed error handling if canvas operations fail.
     */
    static renderMasks(imageCanvas: HTMLCanvasElement | OffscreenCanvas, regions: ReadonlyArray<SensitiveRegion>): RenderResult;
}
//# sourceMappingURL=mask-renderer.d.ts.map