/**
 * @privapilot/benchmark - Sensitive/PII Detection Recall & Precision Metrics
 *
 * Weight in SIH Scoring: 20%
 */
import { computeBoxIoU } from './accuracy-metrics.js';
export function computePiiMetrics(detections, groundTruth) {
    const categories = [
        'password',
        'email',
        'phone',
        'credit_card',
        'cvv',
        'national_id',
        'face',
        'high_risk_surface'
    ];
    const breakdown = {};
    let totalTp = 0;
    let totalFp = 0;
    let totalFn = 0;
    for (const cat of categories) {
        const catDetections = detections.filter(d => d.category === cat);
        const catGroundTruth = groundTruth.filter(g => g.category === cat);
        const matchedGtIndices = new Set();
        const matchedDetIndices = new Set();
        // Bipartite matching for this category
        for (let dIdx = 0; dIdx < catDetections.length; dIdx++) {
            const det = catDetections[dIdx];
            let bestGtIdx = -1;
            let bestScore = -1;
            for (let gIdx = 0; gIdx < catGroundTruth.length; gIdx++) {
                if (matchedGtIndices.has(gIdx))
                    continue;
                const gt = catGroundTruth[gIdx];
                let score = 0;
                const hasDetBox = det.boundingBox || (det.normX !== undefined);
                const hasGtBox = gt.normX !== undefined && gt.normY !== undefined && gt.normW !== undefined;
                if (hasDetBox && hasGtBox) {
                    const b1 = det.boundingBox || [det.normX, det.normY, det.normW, det.normH];
                    const b2 = [gt.normX, gt.normY, gt.normW, gt.normH];
                    const iou = computeBoxIoU(b1, b2);
                    if (iou >= 0.4) {
                        score = iou + 1.0;
                    }
                }
                // Text / Token match
                if (det.text && gt.tokenOrLabel) {
                    const t1 = det.text.toLowerCase().trim();
                    const t2 = gt.tokenOrLabel.toLowerCase().trim();
                    if (t1.includes(t2) || t2.includes(t1)) {
                        score = Math.max(score, 1.5);
                    }
                }
                // Default category presence match if spatial/text not specified
                if (!hasDetBox && !hasGtBox && !det.text && !gt.tokenOrLabel) {
                    score = 1.0;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestGtIdx = gIdx;
                }
            }
            if (bestGtIdx !== -1 && bestScore > 0) {
                matchedGtIndices.add(bestGtIdx);
                matchedDetIndices.add(dIdx);
            }
        }
        const tp = matchedGtIndices.size;
        const fp = catDetections.length - tp;
        const fn = catGroundTruth.length - tp;
        totalTp += tp;
        totalFp += fp;
        totalFn += fn;
        const recall = catGroundTruth.length > 0 ? (tp / catGroundTruth.length) * 100 : 100;
        const precision = catDetections.length > 0 ? (tp / catDetections.length) * 100 : 100;
        const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 100;
        breakdown[cat] = {
            category: cat,
            truePositives: tp,
            falsePositives: fp,
            falseNegatives: fn,
            recall: Math.round(recall * 10) / 10,
            precision: Math.round(precision * 10) / 10,
            f1Score: Math.round(f1 * 10) / 10
        };
    }
    const aggregateRecall = (totalTp + totalFn) > 0 ? (totalTp / (totalTp + totalFn)) * 100 : 100;
    const aggregatePrecision = (totalTp + totalFp) > 0 ? (totalTp / (totalTp + totalFp)) * 100 : 100;
    const aggregateF1 = (aggregateRecall + aggregatePrecision) > 0
        ? (2 * aggregateRecall * aggregatePrecision) / (aggregateRecall + aggregatePrecision)
        : 100;
    return {
        aggregateRecall: Math.round(aggregateRecall * 10) / 10,
        aggregatePrecision: Math.round(aggregatePrecision * 10) / 10,
        aggregateF1: Math.round(aggregateF1 * 10) / 10,
        totalTruePositives: totalTp,
        totalFalsePositives: totalFp,
        totalFalseNegatives: totalFn,
        categoryBreakdown: breakdown
    };
}
//# sourceMappingURL=pii-metrics.js.map