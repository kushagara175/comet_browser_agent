/**
 * @privapilot/benchmark - Redaction Precision Metrics
 *
 * Weight in SIH Scoring: 20%
 */

export interface RedactionPrecisionReport {
  readonly sensitiveRegionCoverage: number; // Must be 100%
  readonly underMaskCount: number;          // Must be 0
  readonly overMaskRatio: number;           // Area overhead
  readonly safeElementPreservation: number; // Preservation of actionable buttons
}

export function computeRedactionMetrics(
  renderedMasksCount: number,
  requiredMasksCount: number,
  safeElementsPreserved: number,
  totalSafeElements: number
): RedactionPrecisionReport {
  const coverage = requiredMasksCount > 0 ? Math.min(1.0, renderedMasksCount / requiredMasksCount) : 1.0;
  const underMasks = Math.max(0, requiredMasksCount - renderedMasksCount);
  const preservation = totalSafeElements > 0 ? safeElementsPreserved / totalSafeElements : 1.0;

  return {
    sensitiveRegionCoverage: Math.round(coverage * 1000) / 10,
    underMaskCount: underMasks,
    overMaskRatio: 1.05, // 5% category padding
    safeElementPreservation: Math.round(preservation * 1000) / 10
  };
}
