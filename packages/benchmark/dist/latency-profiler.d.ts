/**
 * @privapilot/benchmark - End-to-End Latency & Resource Profiler
 *
 * Weight in SIH Scoring: 15% Latency + 20% Resource Footprint
 */
import { RunTelemetry } from '@privapilot/protocol';
export interface ResourceMetrics {
    readonly peakMemoryMb: number;
    readonly cpuLoadPct: number;
    readonly heapUsedMb?: number;
    readonly heapTotalMb?: number;
    readonly memoryScope?: string;
}
export interface LatencyBenchmarkSummary {
    readonly sampleCount: number;
    readonly p50TotalLatencyMs: number;
    readonly p95TotalLatencyMs: number;
    readonly p50ClientPerceptionMs: number;
    readonly p95ClientPerceptionMs: number;
    readonly p50ServerReasoningMs: number;
    readonly p95ServerReasoningMs: number;
    readonly p50ActionExecutionMs: number;
    readonly peakMemoryMb: number;
    readonly cpuLoadPct: number;
    readonly heapUsedMb?: number;
    readonly heapTotalMb?: number;
    readonly memoryScope?: string;
}
export declare function measureCurrentProcessResources(startCpu?: NodeJS.CpuUsage, startTimeMs?: number): ResourceMetrics;
export declare function computeLatencyBenchmark(telemetries: ReadonlyArray<RunTelemetry>, resourceOverride?: ResourceMetrics): LatencyBenchmarkSummary;
//# sourceMappingURL=latency-profiler.d.ts.map