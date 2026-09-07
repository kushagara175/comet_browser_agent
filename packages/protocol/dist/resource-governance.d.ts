/**
 * @privapilot/protocol - Resource Governance & Model Tiering Contracts
 *
 * Enforces client runtime budgeting, observable tiering (T0/T1/T2),
 * explicit backpressure, and accounted resident memory.
 */
export type ModelTier = 'T0' | 'T1' | 'T2';
export type TierOverride = 'auto' | 'force-T0' | 'force-T1' | 'force-T2';
export type ExecutionProvider = 'webgpu' | 'wasm' | 'cpu' | 'unavailable';
export interface ResourceBudgetConfig {
    /**
     * Maximum acceptable steady-state perception latency (p95) in milliseconds.
     * Re-derived from the ~2.5s end-to-end agent cycle constraint:
     * Allocating 1.2–1.5s (1500 ms p95) to client visual perception + sanitization
     * reserves ~1.0–1.3s for network transport, server reasoning, and action dispatch.
     */
    readonly maxMsPerFrame: number;
    /** Maximum accounted resident memory ceiling in megabytes. */
    readonly maxResidentMb: number;
    /** Maximum captures per minute ceiling (token-bucket / sliding window). */
    readonly maxCapturesPerMinute: number;
    /** Number of warm-up inferences excluded from moving p95. */
    readonly warmupInferenceCount: number;
    /** Dwell time (ms) required before considering re-upgrading tier after under-budget run. */
    readonly reupgradeDwellMs: number;
    /** Grace period (ms) before disposing idle model sessions on tier downgrade. */
    readonly sessionDisposalGraceMs: number;
    /** Initial region proposal count for T1 (12 -> 6 -> 3 degradation). */
    readonly initialRegionBudget?: 12 | 6 | 3;
}
export declare const DEFAULT_RESOURCE_BUDGET: ResourceBudgetConfig;
export interface DowngradeEvent {
    readonly timestamp: number;
    readonly fromTier: ModelTier;
    readonly toTier: ModelTier;
    readonly reason: string;
    readonly metricValue: number;
    readonly threshold: number;
}
export interface MemoryBreakdown {
    readonly baseMb: number;
    readonly wasmHeapMb: number;
    readonly arenaMb: number;
    readonly bitmapMb: number;
}
export interface ResourceTelemetry {
    readonly activeTier: ModelTier;
    readonly requestedTier: ModelTier;
    readonly tierDowngraded: boolean;
    readonly tierDowngradeReason?: string;
    readonly tierOverride: TierOverride;
    readonly regionBudget: number;
    readonly perceptionMs: number;
    readonly p95PerceptionMs: number;
    readonly warmupExcluded: boolean;
    readonly warmupMs?: number;
    readonly estimatedResidentMb: number;
    readonly memoryAccountingMethod: string;
    readonly memoryBreakdown?: MemoryBreakdown;
    readonly maxPerceptionMsCeiling: number;
    readonly maxMemoryMbCeiling: number;
    readonly maxCapturesPerMinuteCeiling: number;
    readonly capturesInLastMinute: number;
    readonly cacheHit: boolean;
    readonly cacheHitRate: number;
    readonly totalPerceptionQueries: number;
    readonly totalCacheHits: number;
    readonly executionProvider: ExecutionProvider;
    readonly backpressureApplied: boolean;
    readonly backpressureReason?: string;
    readonly recentFrameLatencies: ReadonlyArray<number>;
    readonly downgradeHistory: ReadonlyArray<DowngradeEvent>;
}
export type BackpressureReasonCode = 'CONCURRENT_CAPTURE_IN_PROGRESS' | 'RATE_LIMIT_EXCEEDED' | 'BROWSER_CAPTURE_QUOTA_EXCEEDED';
export interface BackpressureResult {
    readonly allowed: boolean;
    readonly reasonCode?: BackpressureReasonCode;
    readonly message?: string;
    readonly retryAfterMs?: number;
}
//# sourceMappingURL=resource-governance.d.ts.map