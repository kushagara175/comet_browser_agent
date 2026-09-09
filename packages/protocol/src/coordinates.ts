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
  readonly captureTimestamp: number;
}

/**
 * Converts a ViewportCssPixelBox to ScreenshotPixelBox with category-specific padding and image boundary clamping.
 */
export function viewportToScreenshotBox(
  box: ViewportCssPixelBox,
  meta: ViewportMetadata,
  paddingPx: number = 4
): ScreenshotPixelBox {
  const scaleX = meta.screenshotWidth / meta.viewportWidth;
  const scaleY = meta.screenshotHeight / meta.viewportHeight;

  const rawX = box.x * scaleX - paddingPx;
  const rawY = box.y * scaleY - paddingPx;
  const rawW = box.width * scaleX + paddingPx * 2;
  const rawH = box.height * scaleY + paddingPx * 2;

  // Real geometric intersection with screenshot rectangle [0, 0, screenshotWidth, screenshotHeight]
  const startX = Math.max(0, rawX);
  const startY = Math.max(0, rawY);
  const endX = Math.min(meta.screenshotWidth, rawX + rawW);
  const endY = Math.min(meta.screenshotHeight, rawY + rawH);

  const clampedW = Math.max(0, endX - startX);
  const clampedH = Math.max(0, endY - startY);
  const clampedX = clampedW > 0 ? startX : 0;
  const clampedY = clampedH > 0 ? startY : 0;

  return {
    space: 'screenshotPixel',
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedW),
    height: Math.round(clampedH)
  };
}

/**
 * Converts a ScreenshotPixelBox to ViewportCssPixelBox.
 */
export function screenshotToViewportBox(
  box: ScreenshotPixelBox,
  meta: ViewportMetadata
): ViewportCssPixelBox {
  const scaleX = meta.screenshotWidth / meta.viewportWidth;
  const scaleY = meta.screenshotHeight / meta.viewportHeight;

  return {
    space: 'viewportCssPixel',
    x: Math.round(box.x / scaleX),
    y: Math.round(box.y / scaleY),
    width: Math.round(box.width / scaleX),
    height: Math.round(box.height / scaleY)
  };
}

/**
 * Converts a DocumentCssPixelBox to ViewportCssPixelBox.
 */
export function documentToViewportBox(
  box: DocumentCssPixelBox,
  meta: ViewportMetadata
): ViewportCssPixelBox {
  return {
    space: 'viewportCssPixel',
    x: box.x - meta.scrollX,
    y: box.y - meta.scrollY,
    width: box.width,
    height: box.height
  };
}

/**
 * Merges overlapping or adjacent bounding boxes into unified regions.
 */
export function mergeBoundingBoxes<TSpace extends CoordinateSpace>(
  boxes: ReadonlyArray<BoundingBox<TSpace>>
): Array<BoundingBox<TSpace>> {
  if (boxes.length <= 1) {
    return [...boxes];
  }

  const sorted = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
  const merged: Array<BoundingBox<TSpace>> = [];

  for (const current of sorted) {
    if (merged.length === 0) {
      merged.push({ ...current });
      continue;
    }

    const last = merged[merged.length - 1];
    const overlaps =
      current.x <= last.x + last.width &&
      current.x + current.width >= last.x &&
      current.y <= last.y + last.height &&
      current.y + current.height >= last.y;

    if (overlaps) {
      const minX = Math.min(last.x, current.x);
      const minY = Math.min(last.y, current.y);
      const maxX = Math.max(last.x + last.width, current.x + current.width);
      const maxY = Math.max(last.y + last.height, current.y + current.height);

      merged[merged.length - 1] = {
        space: last.space,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}
