/**
 * @privapilot/protocol - Named Coordinate Spaces and Transformations
 *
 * Explicitly distinguishes:
 * - screenshotPixel: Coordinates in the real image pixel buffer (physical pixels)
 * - viewportCssPixel: Coordinates relative to visible viewport in CSS pixels
 * - documentCssPixel: Coordinates relative to entire document in CSS pixels
 */
export type CoordinateSpace = 'screenshotPixel' | 'viewportCssPixel' | 'documentCssPixel';
export interface BoundingBox<TSpace extends CoordinateSpace = CoordinateSpace> {
    readonly space: TSpace;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export type ScreenshotPixelBox = BoundingBox<'screenshotPixel'>;
export type ViewportCssPixelBox = BoundingBox<'viewportCssPixel'>;
export type DocumentCssPixelBox = BoundingBox<'documentCssPixel'>;
export interface ViewportMetadata {
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly screenshotWidth: number;
    readonly screenshotHeight: number;
    readonly devicePixelRatio: number;
    readonly scrollX: number;
    readonly scrollY: number;
    /**
     * Full scrollable document height, when the host can report it.
     *
     * Client-internal: this is never transmitted. It exists so the local decision
     * tier can tell "there is more page below" from "this is the whole page", which
     * is the difference between scrolling on evidence and scrolling on a guess.
     */
    readonly documentHeight?: number;
    readonly captureTimestamp: number;
}
/**
 * Converts a ViewportCssPixelBox to ScreenshotPixelBox with category-specific padding and image boundary clamping.
 */
export declare function viewportToScreenshotBox(box: ViewportCssPixelBox, meta: ViewportMetadata, paddingPx?: number): ScreenshotPixelBox;
/**
 * Converts a ScreenshotPixelBox to ViewportCssPixelBox.
 */
export declare function screenshotToViewportBox(box: ScreenshotPixelBox, meta: ViewportMetadata): ViewportCssPixelBox;
/**
 * Converts a DocumentCssPixelBox to ViewportCssPixelBox.
 */
export declare function documentToViewportBox(box: DocumentCssPixelBox, meta: ViewportMetadata): ViewportCssPixelBox;
/**
 * Merges overlapping or adjacent bounding boxes into unified regions.
 */
export declare function mergeBoundingBoxes<TSpace extends CoordinateSpace>(boxes: ReadonlyArray<BoundingBox<TSpace>>): Array<BoundingBox<TSpace>>;
//# sourceMappingURL=coordinates.d.ts.map