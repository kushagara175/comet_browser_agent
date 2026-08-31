/**
 * @privapilot/benchmark - Automated Benchmark Suite Runner
 *
 * Honest, non-circular benchmark execution evaluating real perception and
 * sanitization against static fixture-authored ground truth.
 */
import { BenchmarkSplit } from '@privapilot/test-fixtures';
import { FullBenchmarkResults } from './reporter.js';
export interface BenchmarkRunOptions {
    readonly split?: BenchmarkSplit | 'all';
    readonly detectorOverrides?: {
        readonly disableTextPii?: boolean;
        readonly disableDomSemantic?: boolean;
        readonly disableVisionFace?: boolean;
        readonly disableHighRiskSurfaces?: boolean;
    };
}
export declare class BenchmarkRunner {
    static getGitSha(): string;
    static runAll(options?: BenchmarkRunOptions): FullBenchmarkResults;
}
//# sourceMappingURL=runner.d.ts.map