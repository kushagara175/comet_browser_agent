/**
 * @privapilot/extension - Coordinate Transformation Pipeline
 */
import { ViewportMetadata, ViewportCssPixelBox, ScreenshotPixelBox } from '@privapilot/protocol';
export declare class CoordinateTransformer {
    private readonly metadata;
    constructor(metadata: ViewportMetadata);
    toScreenshotBox(box: ViewportCssPixelBox, paddingPx?: number): ScreenshotPixelBox;
    toViewportBox(box: ScreenshotPixelBox): ViewportCssPixelBox;
    mergeBoxes(boxes: ReadonlyArray<ScreenshotPixelBox>): ScreenshotPixelBox[];
}
//# sourceMappingURL=coordinate-transformer.d.ts.map