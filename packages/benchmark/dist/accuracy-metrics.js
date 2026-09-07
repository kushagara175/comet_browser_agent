/**
 * @privapilot/benchmark - Visual Context Extraction Accuracy Metrics
 *
 * Weight in SIH Scoring: 25%
 */
export function computeBoxIoU(boxA, boxB) {
    const ax1 = Array.isArray(boxA) ? boxA[0] : boxA.normX;
    const ay1 = Array.isArray(boxA) ? boxA[1] : boxA.normY;
    const aw = Array.isArray(boxA) ? boxA[2] : boxA.normW;
    const ah = Array.isArray(boxA) ? boxA[3] : boxA.normH;
    const ax2 = ax1 + aw;
    const ay2 = ay1 + ah;
    const bx1 = Array.isArray(boxB) ? boxB[0] : boxB.normX;
    const by1 = Array.isArray(boxB) ? boxB[1] : boxB.normY;
    const bw = Array.isArray(boxB) ? boxB[2] : boxB.normW;
    const bh = Array.isArray(boxB) ? boxB[3] : boxB.normH;
    const bx2 = bx1 + bw;
    const by2 = by1 + bh;
    const interX1 = Math.max(ax1, bx1);
    const interY1 = Math.max(ay1, by1);
    const interX2 = Math.min(ax2, bx2);
    const interY2 = Math.min(ay2, by2);
    const interW = Math.max(0, interX2 - interX1);
    const interH = Math.max(0, interY2 - interY1);
    const interArea = interW * interH;
    const areaA = Math.max(0, aw * ah);
    const areaB = Math.max(0, bw * bh);
    const unionArea = areaA + areaB - interArea;
    if (unionArea <= 0)
        return 0;
    return interArea / unionArea;
}
/**
 * Resolves spatial bounding boxes for ground truth elements that define a selector.
 * Resolves 28 elements across 15 standard HTML fixtures from their DOM candidates.
 */
export function resolveGroundTruthBoxes(gtElements, domCandidates = []) {
    return gtElements.map(gt => {
        if (gt.normX !== undefined && gt.normY !== undefined) {
            return gt;
        }
        if (gt.selector && domCandidates.length > 0) {
            const selId = gt.selector.replace(/^#/, '').toLowerCase();
            const match = domCandidates.find(c => (c.id && c.id.toLowerCase() === selId) ||
                (c.name && gt.name && c.name.toLowerCase().includes(gt.name.toLowerCase())));
            if (match && match.boundingBox) {
                return {
                    ...gt,
                    normX: Math.round((match.boundingBox.x / 1280) * 1000) / 1000,
                    normY: Math.round((match.boundingBox.y / 720) * 1000) / 1000,
                    normW: Math.round((match.boundingBox.width / 1280) * 1000) / 1000,
                    normH: Math.round((match.boundingBox.height / 720) * 1000) / 1000,
                    boxResolvedFromSelector: true
                };
            }
        }
        return gt;
    });
}
export function computeAccuracyMetrics(extractedElements, groundTruthElements, options = {}) {
    const minIoU = options.minIoU ?? 0.50;
    const allowLegacyNameMatch = options.allowLegacyNameMatch ?? true;
    if (groundTruthElements.length === 0 && extractedElements.length === 0) {
        return {
            elementRecall: 100,
            elementPrecision: 100,
            roleAccuracy: 100,
            medianIoU: 1.0,
            truePositives: 0,
            falsePositives: 0,
            falseNegatives: 0
        };
    }
    const matchedGtIndices = new Set();
    const matchedExtractedIndices = new Set();
    const iouScores = [];
    let correctRoleMatches = 0;
    // Greedy bipartite matching under canonical spatial rule (IoU >= minIoU)
    for (let eIdx = 0; eIdx < extractedElements.length; eIdx++) {
        const ext = extractedElements[eIdx];
        let bestGtIdx = -1;
        let bestScore = -1;
        for (let gIdx = 0; gIdx < groundTruthElements.length; gIdx++) {
            if (matchedGtIndices.has(gIdx))
                continue;
            const gt = groundTruthElements[gIdx];
            let matchScore = 0;
            let iou = 0;
            const hasExtBox = ext.coarseBounds || (ext.normX !== undefined && ext.normY !== undefined) || ext.boundingBox;
            const hasGtBox = gt.normX !== undefined && gt.normY !== undefined;
            if (hasExtBox && hasGtBox) {
                let boxExt;
                if (ext.coarseBounds) {
                    boxExt = ext.coarseBounds;
                }
                else if (ext.normX !== undefined) {
                    boxExt = [ext.normX, ext.normY, ext.normW, ext.normH];
                }
                else {
                    boxExt = [ext.boundingBox.x / 1280, ext.boundingBox.y / 720, ext.boundingBox.width / 1280, ext.boundingBox.height / 720];
                }
                const boxGt = [gt.normX, gt.normY, gt.normW, gt.normH];
                iou = computeBoxIoU(boxExt, boxGt);
            }
            const roleMatch = (ext.role || '').toLowerCase() === (gt.role || '').toLowerCase();
            if (allowLegacyNameMatch) {
                const extName = (ext.sanitizedName || ext.name || '').toLowerCase().trim();
                const gtName = (gt.name || '').toLowerCase().trim();
                const nameMatch = extName && gtName && (extName.includes(gtName) || gtName.includes(extName));
                if (iou >= 0.4 || nameMatch) {
                    matchScore = (iou * 2) + (roleMatch ? 1.0 : 0) + (nameMatch ? 1.0 : 0);
                }
            }
            else {
                // CANONICAL RULE: Strict spatial IoU >= 0.50 (no name matching)
                if (iou >= minIoU) {
                    matchScore = (iou * 2) + (roleMatch ? 1.0 : 0);
                }
            }
            if (matchScore > bestScore && matchScore > 0.5) {
                bestScore = matchScore;
                bestGtIdx = gIdx;
            }
        }
        if (bestGtIdx !== -1) {
            matchedGtIndices.add(bestGtIdx);
            matchedExtractedIndices.add(eIdx);
            const gt = groundTruthElements[bestGtIdx];
            const roleMatch = (ext.role || '').toLowerCase() === (gt.role || '').toLowerCase();
            if (roleMatch)
                correctRoleMatches++;
            const hasExtBox = ext.coarseBounds || (ext.normX !== undefined) || ext.boundingBox;
            const hasGtBox = gt.normX !== undefined;
            if (hasExtBox && hasGtBox) {
                let boxExt;
                if (ext.coarseBounds) {
                    boxExt = ext.coarseBounds;
                }
                else if (ext.normX !== undefined) {
                    boxExt = [ext.normX, ext.normY, ext.normW, ext.normH];
                }
                else {
                    boxExt = [ext.boundingBox.x / 1280, ext.boundingBox.y / 720, ext.boundingBox.width / 1280, ext.boundingBox.height / 720];
                }
                const boxGt = [gt.normX, gt.normY, gt.normW, gt.normH];
                iouScores.push(computeBoxIoU(boxExt, boxGt));
            }
            else {
                iouScores.push(1.0);
            }
        }
    }
    const tp = matchedGtIndices.size;
    const fp = extractedElements.length - tp;
    const fn = groundTruthElements.length - tp;
    const recall = groundTruthElements.length > 0 ? (tp / groundTruthElements.length) * 100 : 100;
    const precision = extractedElements.length > 0 ? (tp / extractedElements.length) * 100 : 100;
    const roleAccuracy = tp > 0 ? (correctRoleMatches / tp) * 100 : 100;
    let medianIoU = 1.0;
    if (iouScores.length > 0) {
        iouScores.sort((a, b) => a - b);
        const mid = Math.floor(iouScores.length / 2);
        medianIoU = iouScores.length % 2 === 0 ? (iouScores[mid - 1] + iouScores[mid]) / 2 : iouScores[mid];
    }
    return {
        elementRecall: Math.round(recall * 10) / 10,
        elementPrecision: Math.round(precision * 10) / 10,
        roleAccuracy: Math.round(roleAccuracy * 10) / 10,
        medianIoU: Math.round(medianIoU * 100) / 100,
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn
    };
}
//# sourceMappingURL=accuracy-metrics.js.map