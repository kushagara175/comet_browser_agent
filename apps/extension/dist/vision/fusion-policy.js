/**
 * @privapilot/extension - Explicit Auditable Multimodal Fusion Policy
 *
 * Fuses candidate elements from the parallel DOM lane and Vision lane into a single
 * unified SceneGraph.
 *
 * Hard Design Rules (Zero black-box ML):
 * 1. Spatial Matching: IoU >= 0.50 greedy bipartite matching sorted by combined confidence.
 * 2. DOM wins on: input type, ARIA role, form semantics, tab order, disabled state.
 * 3. Vision wins on: canvas content, <img> concept content, shadow-DOM / iframe content,
 *    visual layer occlusion, and primary CTA visual salience.
 * 4. Disagreement Policy: Whenever lanes conflict, log to SceneGraph.conflicts.
 *    NEVER silently discard a disagreement.
 * 5. Execution Modes: Supports 'fused' (default), 'dom-only' (ablation), and 'vision-only' (ablation).
 */
import { sanitizeElementName } from '@privapilot/pii-rules';
/**
 * Computes standard Intersection over Union (IoU) between two 2D boxes.
 * Box coordinates are in the same scale space [x, y, w, h].
 */
export function computeIoU(boxA, boxB) {
    const xLeft = Math.max(boxA.x, boxB.x);
    const yTop = Math.max(boxA.y, boxB.y);
    const xRight = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yBottom = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
    if (xRight <= xLeft || yBottom <= yTop) {
        return 0.0;
    }
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const areaA = boxA.width * boxA.height;
    const areaB = boxB.width * boxB.height;
    const unionArea = areaA + areaB - intersectionArea;
    return unionArea <= 0 ? 0.0 : intersectionArea / unionArea;
}
/**
 * Checks if the center of boxA is contained within boxB, useful for extreme aspect-ratio elements.
 */
function isCenterContained(boxA, boxB) {
    const centerX = boxA.x + boxA.width / 2;
    const centerY = boxA.y + boxA.height / 2;
    return (centerX >= boxB.x &&
        centerX <= boxB.x + boxB.width &&
        centerY >= boxB.y &&
        centerY <= boxB.y + boxB.height);
}
export class FusionPolicy {
    /**
     * Fuses candidate elements from DOM and Vision into a unified SceneGraph.
     */
    static fuse(domCandidates, visionCandidates, meta, options = {}) {
        const mode = options.mode ?? 'fused';
        const iouThreshold = options.iouThreshold ?? 0.50;
        const sw = meta.screenshotWidth || meta.viewportWidth || 1280;
        const sh = meta.screenshotHeight || meta.viewportHeight || 800;
        const vw = meta.viewportWidth || 1280;
        const vh = meta.viewportHeight || 720;
        // --- MODE 1: DOM-ONLY (Vision Lane Disabled) ---
        if (mode === 'dom-only') {
            const elements = [];
            let idx = 0;
            for (const dom of domCandidates) {
                // Geometric hygiene: discard zero-sized or offscreen DOM artifacts
                if (dom.isZeroSized || dom.boundingBox.width <= 0 || dom.boundingBox.height <= 0)
                    continue;
                if (dom.isOffscreen || dom.boundingBox.y > vh || dom.boundingBox.x > vw)
                    continue;
                const ref = dom.id;
                const normX = Math.max(0, Math.min(1, Math.round((dom.boundingBox.x / vw) * 1000) / 1000));
                const normY = Math.max(0, Math.min(1, Math.round((dom.boundingBox.y / vh) * 1000) / 1000));
                const normW = Math.max(0.01, Math.min(1 - normX, Math.round((dom.boundingBox.width / vw) * 1000) / 1000));
                const normH = Math.max(0.01, Math.min(1 - normY, Math.round((dom.boundingBox.height / vh) * 1000) / 1000));
                const affordances = ['clickable'];
                if (dom.role === 'input' || dom.role === 'textarea')
                    affordances.push('typable');
                if (dom.role === 'select' || dom.role === 'checkbox' || dom.role === 'radio')
                    affordances.push('selectable');
                elements.push({
                    ref,
                    bbox: [normX, normY, normW, normH],
                    role: dom.role,
                    affordances,
                    confidence: dom.confidence ?? (dom.disabled ? 0.70 : 0.90),
                    provenance: 'dom',
                    labelHint: sanitizeElementName(dom.name)
                });
            }
            return { elements, conflicts: [] };
        }
        // --- MODE 2: VISION-ONLY (DOM Lane Disabled) ---
        if (mode === 'vision-only') {
            const elements = [];
            let idx = 0;
            for (const vis of visionCandidates) {
                idx++;
                const ref = `el_${idx}`;
                elements.push({
                    ref,
                    bbox: vis.bbox,
                    role: vis.role,
                    affordances: vis.affordances,
                    confidence: vis.confidence,
                    provenance: 'vision',
                    labelHint: vis.labelHint ? sanitizeElementName(vis.labelHint) : undefined,
                    primaryCta: vis.primaryCta
                });
            }
            return { elements, conflicts: [] };
        }
        // --- MODE 3: FUSED PERCEPTION (Both Lanes Active) ---
        const conflicts = [];
        const elements = [];
        // Filter valid DOM candidates
        const validDom = domCandidates.filter((d) => {
            const w = d.boundingBox.width;
            const h = d.boundingBox.height;
            return !d.isZeroSized && w > 0 && h > 0 && !d.isOffscreen;
        });
        // Convert DOM boxes to screenshot pixel space for fair comparison with Vision pixel boxes
        const scaleX = sw / vw;
        const scaleY = sh / vh;
        const domBoxesInPixels = validDom.map((d) => ({
            ...d,
            pixelBox: {
                x: d.boundingBox.x * scaleX,
                y: d.boundingBox.y * scaleY,
                width: d.boundingBox.width * scaleX,
                height: d.boundingBox.height * scaleY
            }
        }));
        const candidatePairs = [];
        for (let d = 0; d < domBoxesInPixels.length; d++) {
            const dom = domBoxesInPixels[d];
            for (let v = 0; v < visionCandidates.length; v++) {
                const vis = visionCandidates[v];
                const visPixelBox = vis.rawPixelBox || {
                    x: vis.bbox[0] * sw,
                    y: vis.bbox[1] * sh,
                    width: vis.bbox[2] * sw,
                    height: vis.bbox[3] * sh
                };
                const iou = computeIoU(dom.pixelBox, visPixelBox);
                const centerIn = isCenterContained(dom.pixelBox, visPixelBox) || isCenterContained(visPixelBox, dom.pixelBox);
                if (iou >= iouThreshold || (centerIn && iou >= 0.25)) {
                    const domConf = dom.confidence ?? 0.90;
                    const visConf = vis.confidence ?? 0.80;
                    candidatePairs.push({
                        domIdx: d,
                        visIdx: v,
                        iou,
                        combinedScore: domConf * visConf * (1 + iou)
                    });
                }
            }
        }
        // Sort pairs descending by combined confidence score (Greedy Assignment)
        candidatePairs.sort((a, b) => b.combinedScore - a.combinedScore);
        const matchedDomIndices = new Set();
        const matchedVisIndices = new Set();
        let fusedCounter = 0;
        for (const pair of candidatePairs) {
            if (matchedDomIndices.has(pair.domIdx) || matchedVisIndices.has(pair.visIdx)) {
                continue;
            }
            matchedDomIndices.add(pair.domIdx);
            matchedVisIndices.add(pair.visIdx);
            const dom = domBoxesInPixels[pair.domIdx];
            const vis = visionCandidates[pair.visIdx];
            const ref = dom.id;
            // Audit & Conflict Detection: Check role, disabled, occlusion, and CTA agreements
            let finalRole = dom.role;
            let finalDisabled = dom.disabled ?? false;
            let conflictRecorded = false;
            // RULE: DOM wins on input type, ARIA role, form semantics, tab order, disabled state
            const roleDisagreement = dom.role !== vis.role && vis.role !== 'generic';
            if (roleDisagreement) {
                conflicts.push({
                    ref,
                    domClaim: { role: dom.role, inputType: dom.inputType, ariaRole: dom.ariaRole },
                    visionClaim: { role: vis.role, confidence: vis.confidence },
                    resolvedTo: 'dom',
                    reason: 'DOM semantic hierarchy wins on input type and form semantics'
                });
                conflictRecorded = true;
                finalRole = dom.role;
            }
            // RULE: Vision wins on primary CTA salience
            let isPrimary = false;
            if (vis.primaryCta) {
                isPrimary = true;
                if (dom.role !== 'button') {
                    conflicts.push({
                        ref,
                        domClaim: { role: dom.role },
                        visionClaim: { primaryCta: true, role: vis.role },
                        resolvedTo: 'vision',
                        reason: 'Vision visual prominence overrides DOM generic tag to primary CTA'
                    });
                    conflictRecorded = true;
                    finalRole = 'button';
                }
            }
            // RULE: Vision wins on visual layer occlusion
            if (dom.isOccluded) {
                conflicts.push({
                    ref,
                    domClaim: { role: dom.role, bbox: [dom.boundingBox.x, dom.boundingBox.y, dom.boundingBox.width, dom.boundingBox.height] },
                    visionClaim: { visuallyOccluded: true },
                    resolvedTo: 'vision',
                    reason: 'Vision confirms element is visually occluded by overlapping layers'
                });
                // Element is occluded; drop from interactive scene graph
                continue;
            }
            // Normalized Bounding Box: average between DOM layout and Vision pixels
            const normX = Math.max(0, Math.min(1, Math.round(((dom.pixelBox.x + vis.bbox[0] * sw) / (2 * sw)) * 1000) / 1000));
            const normY = Math.max(0, Math.min(1, Math.round(((dom.pixelBox.y + vis.bbox[1] * sh) / (2 * sh)) * 1000) / 1000));
            const normW = Math.max(0.01, Math.min(1 - normX, Math.round(((dom.pixelBox.width + vis.bbox[2] * sw) / (2 * sw)) * 1000) / 1000));
            const normH = Math.max(0.01, Math.min(1 - normY, Math.round(((dom.pixelBox.height + vis.bbox[3] * sh) / (2 * sh)) * 1000) / 1000));
            const affordances = Array.from(new Set([...vis.affordances, ...(dom.role === 'input' ? ['typable'] : ['clickable'])]));
            elements.push({
                ref,
                bbox: [normX, normY, normW, normH],
                role: finalRole,
                affordances,
                confidence: Math.min(0.99, Math.max(dom.confidence ?? 0.90, vis.confidence) + 0.05),
                provenance: 'fused',
                labelHint: sanitizeElementName(dom.name || vis.labelHint || finalRole),
                primaryCta: isPrimary
            });
        }
        // Unmatched Vision Elements: Vision wins on canvas, image badges, shadow-DOM, or prominent CTAs
        for (let v = 0; v < visionCandidates.length; v++) {
            if (matchedVisIndices.has(v))
                continue;
            const vis = visionCandidates[v];
            // Keep if it originates from an uninspectable surface or possesses high visual confidence
            if (vis.surfaceType === 'canvas' || vis.surfaceType === 'img' || vis.conceptMatch || vis.confidence >= 0.75) {
                const ref = vis.ref;
                elements.push({
                    ref,
                    bbox: vis.bbox,
                    role: vis.role,
                    affordances: vis.affordances,
                    confidence: vis.confidence,
                    provenance: 'vision',
                    labelHint: vis.labelHint ? sanitizeElementName(vis.labelHint) : vis.role,
                    primaryCta: vis.primaryCta
                });
            }
        }
        // Unmatched DOM Elements: retain visible DOM elements not detected by vision (e.g. low-contrast text links)
        for (let d = 0; d < domBoxesInPixels.length; d++) {
            if (matchedDomIndices.has(d))
                continue;
            const dom = domBoxesInPixels[d];
            if (dom.isOccluded)
                continue;
            const ref = dom.id;
            const normX = Math.max(0, Math.min(1, Math.round((dom.boundingBox.x / vw) * 1000) / 1000));
            const normY = Math.max(0, Math.min(1, Math.round((dom.boundingBox.y / vh) * 1000) / 1000));
            const normW = Math.max(0.01, Math.min(1 - normX, Math.round((dom.boundingBox.width / vw) * 1000) / 1000));
            const normH = Math.max(0.01, Math.min(1 - normY, Math.round((dom.boundingBox.height / vh) * 1000) / 1000));
            const affordances = ['clickable'];
            if (dom.role === 'input' || dom.role === 'textarea')
                affordances.push('typable');
            if (dom.role === 'select' || dom.role === 'checkbox' || dom.role === 'radio')
                affordances.push('selectable');
            elements.push({
                ref,
                bbox: [normX, normY, normW, normH],
                role: dom.role,
                affordances,
                confidence: (dom.confidence ?? 0.90) * 0.95,
                provenance: 'dom',
                labelHint: sanitizeElementName(dom.name)
            });
        }
        return { elements, conflicts };
    }
}
//# sourceMappingURL=fusion-policy.js.map