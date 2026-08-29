/**
 * @privapilot/benchmark - Sensitive/PII Detection Recall & Precision Metrics
 *
 * Weight in SIH Scoring: 20%
 */

import { SensitiveCategory } from '@privapilot/protocol';

export interface CategoryMetric {
  readonly category: SensitiveCategory;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly recall: number;
  readonly precision: number;
}

export interface PiiDetectionReport {
  readonly aggregateRecall: number;
  readonly aggregatePrecision: number;
  readonly categoryBreakdown: Record<string, CategoryMetric>;
}

export function computePiiMetrics(
  detections: ReadonlyArray<{ category: SensitiveCategory }>,
  groundTruth: ReadonlyArray<{ category: SensitiveCategory }>
): PiiDetectionReport {
  const categories: SensitiveCategory[] = [
    'password',
    'email',
    'phone',
    'credit_card',
    'cvv',
    'national_id',
    'face',
    'high_risk_surface'
  ];

  const breakdown: Record<string, CategoryMetric> = {};
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  for (const cat of categories) {
    const detCount = detections.filter(d => d.category === cat).length;
    const gtCount = groundTruth.filter(g => g.category === cat).length;

    const tp = Math.min(detCount, gtCount);
    const fp = Math.max(0, detCount - gtCount);
    const fn = Math.max(0, gtCount - detCount);

    totalTp += tp;
    totalFp += fp;
    totalFn += fn;

    const recall = gtCount > 0 ? tp / gtCount : 1.0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1.0;

    breakdown[cat] = {
      category: cat,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      recall: Math.round(recall * 1000) / 10,
      precision: Math.round(precision * 1000) / 10
    };
  }

  const aggregateRecall = (totalTp + totalFn) > 0 ? totalTp / (totalTp + totalFn) : 1.0;
  const aggregatePrecision = (totalTp + totalFp) > 0 ? totalTp / (totalTp + totalFp) : 1.0;

  return {
    aggregateRecall: Math.round(aggregateRecall * 1000) / 10,
    aggregatePrecision: Math.round(aggregatePrecision * 1000) / 10,
    categoryBreakdown: breakdown
  };
}
