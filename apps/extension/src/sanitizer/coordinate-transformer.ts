/**
 * @privapilot/extension - Coordinate Transformation Pipeline
 */

import {
  ViewportMetadata,
  ViewportCssPixelBox,
  ScreenshotPixelBox,
  viewportToScreenshotBox,
  screenshotToViewportBox,
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

  toViewportBox(box: ScreenshotPixelBox): ViewportCssPixelBox {
    return screenshotToViewportBox(box, this.metadata);
  }

  mergeBoxes(boxes: ReadonlyArray<ScreenshotPixelBox>): ScreenshotPixelBox[] {
    return mergeBoundingBoxes(boxes);
  }
}
