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

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));
  return sorted[index];
}

export function measureCurrentProcessResources(startCpu?: NodeJS.CpuUsage, startTimeMs?: number): ResourceMetrics {
  const mem = process.memoryUsage();
  const peakMemoryMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10;

  let cpuLoadPct = 0;
  if (startCpu && startTimeMs) {
    const elapsedMs = Math.max(1, Date.now() - startTimeMs);
    const cpuDelta = process.cpuUsage(startCpu);
    const totalCpuTimeMs = (cpuDelta.user + cpuDelta.system) / 1000;
    // Normalized CPU % over elapsed time
    cpuLoadPct = Math.round((totalCpuTimeMs / elapsedMs) * 1000) / 10;
  }

  return {
    peakMemoryMb,
    cpuLoadPct,
    heapUsedMb,
    heapTotalMb,
    memoryScope: 'Node.js test process (RSS + V8 Heap)'
  };
}

export function computeLatencyBenchmark(
  telemetries: ReadonlyArray<RunTelemetry>,
  resourceOverride?: ResourceMetrics
): LatencyBenchmarkSummary {
  const currentRes = resourceOverride || measureCurrentProcessResources();

  if (telemetries.length === 0) {
    return {
      sampleCount: 0,
      p50TotalLatencyMs: 0,
      p95TotalLatencyMs: 0,
      p50ClientPerceptionMs: 0,
      p95ClientPerceptionMs: 0,
      p50ServerReasoningMs: 0,
      p95ServerReasoningMs: 0,
      p50ActionExecutionMs: 0,
      peakMemoryMb: currentRes.peakMemoryMb,
      cpuLoadPct: currentRes.cpuLoadPct,
      heapUsedMb: currentRes.heapUsedMb,
      heapTotalMb: currentRes.heapTotalMb,
      memoryScope: currentRes.memoryScope
    };
  }

  const totals = telemetries.map(t => t.totalLatencyMs || 0);
  const clients = telemetries.map(t => t.clientLatencyMs || 0);
  const servers = telemetries.map(t => t.serverLatencyMs || 0);
  const actions = telemetries.map(t => Math.max(0, (t.totalLatencyMs || 0) - (t.clientLatencyMs || 0) - (t.serverLatencyMs || 0)));

  return {
    sampleCount: telemetries.length,
    p50TotalLatencyMs: calculatePercentile(totals, 0.50),
    p95TotalLatencyMs: calculatePercentile(totals, 0.95),
    p50ClientPerceptionMs: calculatePercentile(clients, 0.50),
    p95ClientPerceptionMs: calculatePercentile(clients, 0.95),
    p50ServerReasoningMs: calculatePercentile(servers, 0.50),
    p95ServerReasoningMs: calculatePercentile(servers, 0.95),
    p50ActionExecutionMs: calculatePercentile(actions, 0.50),
    peakMemoryMb: currentRes.peakMemoryMb,
    cpuLoadPct: currentRes.cpuLoadPct,
    heapUsedMb: currentRes.heapUsedMb,
    heapTotalMb: currentRes.heapTotalMb,
    memoryScope: currentRes.memoryScope
  };
}

