/**
 * @privapilot/benchmark - Visual Context Extraction Accuracy Metrics
 *
 * Weight in SIH Scoring: 25%
 */
export interface AccuracyReport {
    readonly elementRecall: number;
    readonly elementPrecision: number;
    readonly roleAccuracy: number;
    readonly medianIoU: number;
    readonly truePositives: number;
    readonly falsePositives: number;
    readonly falseNegatives: number;
}
export declare function computeBoxIoU(boxA: [number, number, number, number] | {
    normX: number;
    normY: number;
    normW: number;
    normH: number;
}, boxB: [number, number, number, number] | {
    normX: number;
    normY: number;
    normW: number;
    normH: number;
}): number;
export declare function computeAccuracyMetrics(extractedElements: ReadonlyArray<any>, groundTruthElements: ReadonlyArray<any>): AccuracyReport;
//# sourceMappingURL=accuracy-metrics.d.ts.map