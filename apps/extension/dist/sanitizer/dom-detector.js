/**
 * @privapilot/extension - In-Browser DOM Semantic Detector
 */
import { analyzeDomElementSensitivity } from '@privapilot/pii-rules';
export function detectDomSensitiveRegions(elements, transformer) {
    const regions = [];
    for (const el of elements) {
        const decision = analyzeDomElementSensitivity(el.descriptor);
        if (decision.isSensitive && decision.category) {
            const viewportBox = {
                space: 'viewportCssPixel',
                x: el.boundingClientRect.x,
                y: el.boundingClientRect.y,
                width: el.boundingClientRect.width,
                height: el.boundingClientRect.height
            };
            const screenshotBox = transformer.toScreenshotBox(viewportBox, 0);
            if (screenshotBox.width <= 1 || screenshotBox.height <= 1)
                continue;
            regions.push({
                id: `dom_sens_${el.id}`,
                category: decision.category,
                viewportBox,
                screenshotBox,
                detectorSource: 'dom_semantic',
                method: 'opaque_mask',
                label: decision.reason
            });
        }
    }
    return regions;
}
//# sourceMappingURL=dom-detector.js.map