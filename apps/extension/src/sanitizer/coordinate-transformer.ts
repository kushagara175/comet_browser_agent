/**
 * @privapilot/extension - Coordinate Transformation Pipeline
 */

import {
  ViewportMetadata,
  ViewportCssPixelBox,
  ScreenshotPixelBox,
  viewportToScreenshotBox,
  mergeBoundingBoxes
} from '@privapilot/protocol';

export class CoordinateTransformer {
  private readonly metadata: ViewportMetadata;

  constructor(metadata: ViewportMetadata) {
    this.metadata = metadata;
  }

  toScreenshotBox(box: ViewportCssPixelBox, paddingPx: number = 6): ScreenshotPixelBox {
    return viewportToScreenshotBox(box, this.metadata, paddingPx);
  }

  mergeBoxes(boxes: ReadonlyArray<ScreenshotPixelBox>): ScreenshotPixelBox[] {
    return mergeBoundingBoxes(boxes);
  }
}
