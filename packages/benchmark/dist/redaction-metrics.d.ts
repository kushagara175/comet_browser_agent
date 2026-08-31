import { SensitiveCategory } from '@privapilot/protocol';
export interface RedactionPrecisionReport {
    readonly sensitiveRegionCoverage: number;
    readonly underMaskCount: number;
    readonly overMaskRatio: number;
    readonly safeElementPreservation: number;
    readonly safeElementsPreserved: number;
    readonly totalSafeElements: number;
}
export interface MaskBox {
    readonly normX: number;
    readonly normY: number;
    readonly normW: number;
    readonly normH: number;
}
export interface SensitiveTargetBox {
    readonly normX: number;
    readonly normY: number;
    readonly normW: number;
    readonly normH: number;
    readonly category: SensitiveCategory;
    readonly tokenOrLabel?: string;
}
export declare function computeRedactionMetrics(renderedMasks: ReadonlyArray<MaskBox>, groundTruthSensitiveBoxes: ReadonlyArray<SensitiveTargetBox>, extractedSafeElements: ReadonlyArray<any>, groundTruthSafeElements: ReadonlyArray<any>): RedactionPrecisionReport;
//# sourceMappingURL=redaction-metrics.d.ts.map