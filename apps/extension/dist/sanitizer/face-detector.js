/**
 * @privapilot/extension - On-Device Face & Avatar Perception Subsystem
 *
 * Merges:
 * 1. UltraFace-320 ONNX vision model inferences from screenshot pixels.
 * 2. Explicit DOM avatar / profile image signals as union fallback.
 * (Generic aspect-ratio heuristics are completely removed).
 */
/**
 * Combines ONNX vision model face detections with explicit DOM avatar signals.
 */
export function detectFaceRegions(images, transformer, modelFaces = []) {
    const regions = [];
    // Model detections inside explicitly classified public posts are public
    // imagery; keep any overlapping private-account signal protected.
    const publicImages = images.filter(img => img.isPublicPostImage && !img.isProfilePhotoOrAvatar);
    const privateImages = images.filter(img => img.isProfilePhotoOrAvatar);
    for (const face of modelFaces) {
        const containsFace = (img) => {
            const box = img.boundingClientRect;
            return face.viewportBox.x >= box.x && face.viewportBox.y >= box.y &&
                face.viewportBox.x + face.viewportBox.width <= box.x + box.width &&
                face.viewportBox.y + face.viewportBox.height <= box.y + box.height;
        };
        const overlapsFace = (img) => {
            const box = img.boundingClientRect;
            return face.viewportBox.x < box.x + box.width && face.viewportBox.x + face.viewportBox.width > box.x &&
                face.viewportBox.y < box.y + box.height && face.viewportBox.y + face.viewportBox.height > box.y;
        };
        if (publicImages.some(containsFace) && !privateImages.some(overlapsFace))
            continue;
        regions.push({
            id: face.id,
            category: 'face',
            viewportBox: face.viewportBox,
            screenshotBox: face.screenshotBox,
            detectorSource: 'face_model',
            method: 'gaussian_blur',
            label: `HUMAN_FACE_MODEL_${Math.round(face.confidence * 100)}%`
        });
    }
    // 2. Add Explicit DOM Avatar/Profile Fallback Signals (Only explicit class/attribute matches)
    for (const img of images) {
        if (!img.isProfilePhotoOrAvatar)
            continue;
        const w = img.boundingClientRect.width;
        const h = img.boundingClientRect.height;
        if (w < 16 || h < 16)
            continue;
        const viewportBox = {
            space: 'viewportCssPixel',
            x: img.boundingClientRect.x,
            y: img.boundingClientRect.y,
            width: w,
            height: h
        };
        // Tight clean 4px padding for avatar regions
        const screenshotBox = transformer.toScreenshotBox(viewportBox, 4);
        if (screenshotBox.width <= 1 || screenshotBox.height <= 1)
            continue;
        // Deduplicate if already covered by an ONNX model box
        let alreadyCovered = false;
        for (const modelFace of modelFaces) {
            const mb = modelFace.screenshotBox;
            const xA = Math.max(screenshotBox.x, mb.x);
            const yA = Math.max(screenshotBox.y, mb.y);
            const xB = Math.min(screenshotBox.x + screenshotBox.width, mb.x + mb.width);
            const yB = Math.min(screenshotBox.y + screenshotBox.height, mb.y + mb.height);
            const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
            const domArea = screenshotBox.width * screenshotBox.height;
            if (domArea > 0 && interArea / domArea > 0.5) {
                alreadyCovered = true;
                break;
            }
        }
        if (!alreadyCovered) {
            regions.push({
                id: `face_dom_${img.id}`,
                category: 'face',
                viewportBox,
                screenshotBox,
                detectorSource: 'face_model',
                method: 'gaussian_blur',
                label: 'DOM_AVATAR_SIGNAL'
            });
        }
    }
    return regions;
}
//# sourceMappingURL=face-detector.js.map