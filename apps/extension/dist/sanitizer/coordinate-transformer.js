/**
 * @privapilot/extension - Coordinate Transformation Pipeline
 */
import { viewportToScreenshotBox, screenshotToViewportBox, mergeBoundingBoxes } from '@privapilot/protocol';
export class CoordinateTransformer {
    metadata;
    constructor(metadata) {
        this.metadata = metadata;
    }
    toScreenshotBox(box, paddingPx = 6) {
        return viewportToScreenshotBox(box, this.metadata, paddingPx);
    }
    toViewportBox(box) {
        return screenshotToViewportBox(box, this.metadata);
    }
    mergeBoxes(boxes) {
        return mergeBoundingBoxes(boxes);
    }
}
//# sourceMappingURL=coordinate-transformer.js.map