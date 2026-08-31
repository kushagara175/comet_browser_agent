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
    readonly f1Score: number;
}
export interface PiiDetectionReport {
    readonly aggregateRecall: number;
    readonly aggregatePrecision: number;
    readonly aggregateF1: number;
    readonly totalTruePositives: number;
    readonly totalFalsePositives: number;
    readonly totalFalseNegatives: number;
    readonly categoryBreakdown: Record<string, CategoryMetric>;
}
export declare function computePiiMetrics(detections: ReadonlyArray<{
    category: SensitiveCategory;
    boundingBox?: any;
    text?: string;
    normX?: number;
    normY?: number;
    normW?: number;
    normH?: number;
}>, groundTruth: ReadonlyArray<{
    category: SensitiveCategory;
    normX?: number;
    normY?: number;
    normW?: number;
    normH?: number;
    tokenOrLabel?: string;
}>): PiiDetectionReport;
//# sourceMappingURL=pii-metrics.d.ts.map