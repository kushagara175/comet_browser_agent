/**
 * @privapilot/benchmark - Benchmark Result Reporter
 *
 * Generates verified, reproducible markdown & JSON reports for judges and reviewers.
 */
import { AccuracyReport } from './accuracy-metrics.js';
import { PiiDetectionReport } from './pii-metrics.js';
import { RedactionPrecisionReport } from './redaction-metrics.js';
import { LatencyBenchmarkSummary } from './latency-profiler.js';
export interface BenchmarkMetadata {
    readonly command: string;
    readonly date: string;
    readonly environment: string;
    readonly browserVersion: string;
    readonly modelProvider: string;
    readonly gitSha: string;
    readonly split: string;
}
export interface FullBenchmarkResults {
    readonly timestamp: string;
    readonly fixturesEvaluated: number;
    readonly metadata: BenchmarkMetadata;
    readonly accuracy: AccuracyReport;
    readonly pii: PiiDetectionReport;
    readonly redaction: RedactionPrecisionReport;
    readonly latency: LatencyBenchmarkSummary;
}
export declare class BenchmarkReporter {
    static formatMarkdownReport(results: FullBenchmarkResults): string;
}
//# sourceMappingURL=reporter.d.ts.map