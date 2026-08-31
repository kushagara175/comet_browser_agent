import { computeBoxIoU } from './accuracy-metrics.js';
export function computeRedactionMetrics(renderedMasks, groundTruthSensitiveBoxes, extractedSafeElements, groundTruthSafeElements) {
    let underMaskCount = 0;
    let totalSensitiveArea = 0;
    let totalMaskArea = 0;
    // 1. Check Coverage of every Sensitive Ground Truth Box
    for (const sBox of groundTruthSensitiveBoxes) {
        const sArea = Math.max(0.0001, (sBox.normW || 0.1) * (sBox.normH || 0.05));
        totalSensitiveArea += sArea;
        let isCovered = false;
        for (const mask of renderedMasks) {
            const iou = computeBoxIoU([sBox.normX, sBox.normY, sBox.normW, sBox.normH], [mask.normX, mask.normY, mask.normW, mask.normH]);
            // Check if mask encloses or significantly overlaps sensitive area
            const containsX = mask.normX <= sBox.normX + 0.05 && (mask.normX + mask.normW) >= (sBox.normX + sBox.normW) - 0.05;
            const containsY = mask.normY <= sBox.normY + 0.05 && (mask.normY + mask.normH) >= (sBox.normY + sBox.normH) - 0.05;
            if (iou >= 0.3 || (containsX && containsY)) {
                isCovered = true;
                break;
            }
        }
        if (!isCovered && renderedMasks.length === 0) {
            underMaskCount++;
        }
        else if (!isCovered && renderedMasks.length > 0) {
            // Fallback: check if any mask is present in fixture
            underMaskCount++;
        }
    }
    // 2. Compute Mask Area vs Sensitive Area
    for (const mask of renderedMasks) {
        totalMaskArea += (mask.normW || 0.1) * (mask.normH || 0.05);
    }
    let overMaskRatio = 1.0;
    if (totalSensitiveArea > 0 && totalMaskArea > 0) {
        overMaskRatio = Math.round((totalMaskArea / totalSensitiveArea) * 100) / 100;
    }
    else if (totalSensitiveArea === 0 && totalMaskArea === 0) {
        overMaskRatio = 1.0;
    }
    else if (totalSensitiveArea === 0 && totalMaskArea > 0) {
        overMaskRatio = 1.0 + Math.round(totalMaskArea * 100) / 100;
    }
    const coverage = groundTruthSensitiveBoxes.length > 0
        ? Math.max(0, ((groundTruthSensitiveBoxes.length - underMaskCount) / groundTruthSensitiveBoxes.length) * 100)
        : 100;
    // 3. Compute Safe Element Preservation
    let preservedCount = 0;
    for (const safeGt of groundTruthSafeElements) {
        const isExtracted = extractedSafeElements.some(e => {
            const eName = (e.sanitizedName || e.name || '').toLowerCase().trim();
            const gtName = (safeGt.name || '').toLowerCase().trim();
            return eName && gtName && (eName.includes(gtName) || gtName.includes(eName));
        });
        if (isExtracted) {
            preservedCount++;
        }
    }
    const totalSafe = groundTruthSafeElements.length;
    const preservationRate = totalSafe > 0 ? (preservedCount / totalSafe) * 100 : 100;
    return {
        sensitiveRegionCoverage: Math.round(coverage * 10) / 10,
        underMaskCount,
        overMaskRatio,
        safeElementPreservation: Math.round(preservationRate * 10) / 10,
        safeElementsPreserved: preservedCount,
        totalSafeElements: totalSafe
    };
}
//# sourceMappingURL=redaction-metrics.js.map