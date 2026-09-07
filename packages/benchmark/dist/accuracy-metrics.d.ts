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
export interface AccuracyOptions {
    readonly minIoU?: number;
    readonly allowLegacyNameMatch?: boolean;
}
/**
 * Resolves spatial bounding boxes for ground truth elements that define a selector.
 * Resolves 28 elements across 15 standard HTML fixtures from their DOM candidates.
 */
export declare function resolveGroundTruthBoxes(gtElements: ReadonlyArray<any>, domCandidates?: ReadonlyArray<any>): Array<any>;
export declare function computeAccuracyMetrics(extractedElements: ReadonlyArray<any>, groundTruthElements: ReadonlyArray<any>, options?: AccuracyOptions): AccuracyReport;
//# sourceMappingURL=accuracy-metrics.d.ts.map