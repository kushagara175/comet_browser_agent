/**
 * @privapilot/extension - Client Resource Governor & Budget Enforcer
 *
 * Enforces runtime model tiering (T0/T1/T2), p95 latency hysteresis,
 * warm-up exclusion, rate limiting with explicit backpressure,
 * and delayed session disposal.
 */
import { ModelTier, TierOverride, ResourceBudgetConfig, ResourceTelemetry, BackpressureResult, MemoryBreakdown } from '@privapilot/protocol';
export declare class ResourceGovernor {
    private readonly config;
    private activeTier;
    private requestedTier;
    private tierOverride;
    private tierDowngraded;
    private tierDowngradeReason?;
    private isCaptureActive;
    private captureTimestamps;
    private recentFrameLatencies;
    private warmupInferencesLeft;
    private warmupMs?;
    private downgradeHistory;
    private consecutiveUnderBudgetFrames;
    private consecutiveOverMemoryFrames;
    private lastDowngradeTimestamp;
    private currentDwellMs;
    private isProbingReupgrade;
    private probingFromTier;
    private disposalTimer;
    private totalPerceptionQueries;
    private totalCacheHits;
    private lastPerceptionMs;
    private lastEstimatedResidentMb;
    /** Active candidate region proposal limit for T1 (12 -> 6 -> 3 degradation). */
    private regionBudget;
    constructor(config?: Partial<ResourceBudgetConfig>);
    /**
     * Returns whether governor is currently probing a higher tier.
     */
    isProbing(): boolean;
    /**
     * Returns the current dwell backoff duration in milliseconds.
     */
    getCurrentDwellMs(): number;
    /**
     * Returns active candidate region proposal budget (12, 6, or 3).
     */
    getRegionBudget(): 12 | 6 | 3;
    /**
     * Sets manual tier override for live evaluation and demonstrations.
     */
    setTierOverride(override: TierOverride): void;
    getTierOverride(): TierOverride;
    /**
     * Sets requested tier based on page characteristics or DecisionRouter escalation.
     */
    setRequestedTier(tier: ModelTier): void;
    getActiveTier(): ModelTier;
    getRequestedTier(): ModelTier;
    /**
     * Checks whether a new capture cycle is permitted or blocked by backpressure.
     */
    checkBackpressure(): BackpressureResult;
    /**
     * Marks a capture cycle as actively executing.
     */
    recordCaptureStarted(): void;
    /**
     * Marks active capture as concluded.
     */
    recordCaptureEnded(): void;
    /**
     * Routes browser-level captureVisibleTab quota errors directly into backpressure.
     */
    recordBrowserQuotaExceeded(retryAfterMs?: number): BackpressureResult;
    /**
     * Computes p95 of the given numeric samples.
     */
    private computeP95;
    /**
     * Records completed perception frame metrics, tracks p95 sliding window,
     * warm-up exclusions, and enforces tier downgrade/re-upgrade hysteresis.
     */
    recordFramePerception(perceptionMs: number, cacheHit: boolean, estimatedResidentMb: number): void;
    private persistDowngradeHistory;
    /**
     * Records an explicit network timeout for T2 server escalation (8s budget ceiling).
     */
    recordNetworkTimeout(step: number, timeoutMs?: number): void;
    private downgradeTier;
    private reupgradeTier;
    /**
     * Resets capture timestamps sliding window between independent demo steps.
     */
    resetCaptureTimestamps(): void;
    /**
     * Emits the four accounted resident memory components in MB separately:
     * 1. baseMb: ~20 MB (Base MV3 runtime + DOM engine baseline)
     * 2. wasmHeapMb: 0 MB cold / post-grace; 105 MB warm (ViT ONNX weights 88.6MB + runtime heap)
     * 3. arenaMb: 0 MB cold / post-grace; 6.7 MB warm (UltraFace weights 1.7MB + tensor arena 5MB)
     * 4. bitmapMb: live canvas byteLength (or clamped w*h*4, max 8.2MB on 4K)
     */
    getMemoryBreakdown(viewport?: {
        screenshotWidth?: number;
        screenshotHeight?: number;
        canvasByteLength?: number;
    }, options?: {
        assumeModelsActive?: boolean;
    }): MemoryBreakdown;
    /**
     * Computes total accounted resident memory in MB with HiDPI downscaling clamp.
     */
    calculateAccountedMemoryMb(viewport?: {
        screenshotWidth?: number;
        screenshotHeight?: number;
        canvasByteLength?: number;
    }, options?: {
        assumeModelsActive?: boolean;
    }): number;
    /**
     * Generates a complete snapshot of resource telemetry.
     */
    getTelemetry(currentPerceptionMs?: number, currentCacheHit?: boolean): ResourceTelemetry;
}
//# sourceMappingURL=resource-governor.d.ts.map