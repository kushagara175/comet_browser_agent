/**
 * @privapilot/test-fixtures - Mock Canvas Test Adapter
 *
 * Provides a pixel-buffer backed mock canvas implementation for Node.js test environments
 * where HTML5 Canvas / OffscreenCanvas is not natively available.
 * Accurately implements 2D context fillRect, strokeRect, fillText, getImageData, and putImageData.
 */
export interface MockCanvasOptions {
    readonly width?: number;
    readonly height?: number;
    readonly initialFill?: [number, number, number, number];
}
export declare function createMockCanvas(width?: number, height?: number, initialFill?: [number, number, number, number]): any;
//# sourceMappingURL=mock-canvas.d.ts.map