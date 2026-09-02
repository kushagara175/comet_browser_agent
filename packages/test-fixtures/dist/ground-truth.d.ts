/**
 * @privapilot/test-fixtures - Ground Truth Annotations for Benchmarking
 *
 * Authored ground truth annotations across 14 fixtures partitioned into
 * development (dev) and held-out splits.
 */
import { SensitiveCategory } from '@privapilot/protocol';
export type BenchmarkSplit = 'dev' | 'held-out';
export interface GroundTruthBox {
    readonly category: SensitiveCategory;
    /**
     * DOM anchor for this region. The browser harness resolves it against real layout
     * and derives the true box, so ground truth describes WHICH element is sensitive
     * rather than where it happened to sit in a synthetic grid.
     *
     * The normX..normH values below are the legacy hand-authored coordinates, kept so
     * the Node harness - which has no layout engine - keeps working unchanged. They are
     * not meaningful in a real browser and the browser harness ignores them.
     */
    readonly selector?: string;
    readonly normX: number;
    readonly normY: number;
    readonly normW: number;
    readonly normH: number;
    readonly tokenOrLabel?: string;
}
export interface GroundTruthElement {
    readonly role: string;
    readonly name: string;
    readonly selector?: string;
    readonly normX?: number;
    readonly normY?: number;
    readonly normW?: number;
    readonly normH?: number;
    readonly isSensitive?: boolean;
}
export interface GroundTruthAnnotation {
    readonly fixtureId: string;
    readonly split: BenchmarkSplit;
    readonly expectedPiiCategories: ReadonlyArray<SensitiveCategory>;
    readonly minActionableElements: number;
    readonly maxActionableElements: number;
    readonly expectedSafeActionableCount: number;
    readonly groundTruthBoxes: ReadonlyArray<GroundTruthBox>;
    readonly groundTruthElements: ReadonlyArray<GroundTruthElement>;
}
export declare const GROUND_TRUTH_DATA: Record<string, GroundTruthAnnotation>;
//# sourceMappingURL=ground-truth.d.ts.map