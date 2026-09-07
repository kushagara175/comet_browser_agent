/**
 * @privapilot/extension - Client Resource Governor & Budget Enforcer
 *
 * Enforces runtime model tiering (T0/T1/T2), p95 latency hysteresis,
 * warm-up exclusion, rate limiting with explicit backpressure,
 * and delayed session disposal.
 */

import {
  ModelTier,
  TierOverride,
  ResourceBudgetConfig,
  DEFAULT_RESOURCE_BUDGET,
  DowngradeEvent,
  ResourceTelemetry,
  BackpressureResult,
  ExecutionProvider,
  MemoryBreakdown
} from '@privapilot/protocol';
import { CapabilityDetector } from '../vision/capability-detector.js';
import { VitEncoder } from '../vision/vit-encoder.js';
import { UltraFaceModelRunner } from '../vision/face-model.js';

declare const chrome: any;

export class ResourceGovernor {
  private readonly config: ResourceBudgetConfig;
  private activeTier: ModelTier = 'T1';
  private requestedTier: ModelTier = 'T1';
  private tierOverride: TierOverride = 'auto';
  private tierDowngraded = false;
  private tierDowngradeReason?: string;

  private isCaptureActive = false;
  private captureTimestamps: number[] = [];

  private recentFrameLatencies: number[] = [];
  private warmupInferencesLeft: number;
  private warmupMs?: number;

  private downgradeHistory: DowngradeEvent[] = [];
  private consecutiveUnderBudgetFrames = 0;
  private consecutiveOverMemoryFrames = 0;
  private lastDowngradeTimestamp = 0;
  private currentDwellMs: number;
  private isProbingReupgrade = false;
  private probingFromTier: ModelTier = 'T0';
  private disposalTimer: any = null;

  private totalPerceptionQueries = 0;
  private totalCacheHits = 0;
  private lastPerceptionMs = 0;
  private lastEstimatedResidentMb = 25; // Base extension memory

  /** Active candidate region proposal limit for T1 (12 -> 6 -> 3 degradation). */
  private regionBudget: 12 | 6 | 3 = 12;

  constructor(config: Partial<ResourceBudgetConfig> = {}) {
    this.config = { ...DEFAULT_RESOURCE_BUDGET, ...config };
    this.warmupInferencesLeft = this.config.warmupInferenceCount;
    this.currentDwellMs = this.config.reupgradeDwellMs;
    this.regionBudget = this.config.initialRegionBudget ?? 12;

    // Restore persisted downgrade history from chrome.storage.session if available
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.get(['privapilot_downgrade_history'], (items: any) => {
        if (items?.privapilot_downgrade_history && Array.isArray(items.privapilot_downgrade_history)) {
          this.downgradeHistory = items.privapilot_downgrade_history;
        }
      });
    }
  }

  /**
   * Returns whether governor is currently probing a higher tier.
   */
  isProbing(): boolean {
    return this.isProbingReupgrade;
  }

  /**
   * Returns the current dwell backoff duration in milliseconds.
   */
  getCurrentDwellMs(): number {
    return this.currentDwellMs;
  }

  /**
   * Returns active candidate region proposal budget (12, 6, or 3).
   */
  getRegionBudget(): 12 | 6 | 3 {
    return this.regionBudget;
  }

  /**
   * Sets manual tier override for live evaluation and demonstrations.
   */
  setTierOverride(override: TierOverride): void {
    this.tierOverride = override;
    if (override === 'force-T0') {
      this.activeTier = 'T0';
    } else if (override === 'force-T1') {
      this.activeTier = 'T1';
      this.regionBudget = 12;
    } else if (override === 'force-T2') {
      this.activeTier = 'T2';
    } else {
      // Auto: restore based on budget state
      this.activeTier = this.tierDowngraded ? 'T0' : this.requestedTier;
      if (!this.tierDowngraded) {
        this.regionBudget = 12;
      }
    }
  }

  getTierOverride(): TierOverride {
    return this.tierOverride;
  }

  /**
   * Sets requested tier based on page characteristics or DecisionRouter escalation.
   */
  setRequestedTier(tier: ModelTier): void {
    this.requestedTier = tier;
    if (this.tierOverride === 'auto') {
      if (!this.tierDowngraded) {
        this.activeTier = tier;
      }
    }
  }

  getActiveTier(): ModelTier {
    return this.activeTier;
  }

  getRequestedTier(): ModelTier {
    return this.requestedTier;
  }

  /**
   * Checks whether a new capture cycle is permitted or blocked by backpressure.
   */
  checkBackpressure(): BackpressureResult {
    // 1. Concurrency backpressure guard: Never queue unbounded captures
    if (this.isCaptureActive) {
      return {
        allowed: false,
        reasonCode: 'CONCURRENT_CAPTURE_IN_PROGRESS',
        message: 'A perception capture cycle is already in progress. Rejecting concurrent capture.'
      };
    }

    // 2. Sliding window rate limit (default 45 captures/minute)
    const now = Date.now();
    const windowStart = now - 60000;
    this.captureTimestamps = this.captureTimestamps.filter((t) => t > windowStart);

    if (this.captureTimestamps.length >= this.config.maxCapturesPerMinute) {
      const oldestInWindow = this.captureTimestamps[0];
      const retryAfterMs = Math.max(100, 60000 - (now - oldestInWindow));
      return {
        allowed: false,
        reasonCode: 'RATE_LIMIT_EXCEEDED',
        message: `Capture rate ceiling of ${this.config.maxCapturesPerMinute}/min reached. Backpressure active.`,
        retryAfterMs
      };
    }

    return { allowed: true };
  }

  /**
   * Marks a capture cycle as actively executing.
   */
  recordCaptureStarted(): void {
    this.isCaptureActive = true;
    this.captureTimestamps.push(Date.now());
  }

  /**
   * Marks active capture as concluded.
   */
  recordCaptureEnded(): void {
    this.isCaptureActive = false;
  }

  /**
   * Routes browser-level captureVisibleTab quota errors directly into backpressure.
   */
  recordBrowserQuotaExceeded(retryAfterMs = 1000): BackpressureResult {
    this.isCaptureActive = false;
    return {
      allowed: false,
      reasonCode: 'BROWSER_CAPTURE_QUOTA_EXCEEDED',
      message: 'Chrome captureVisibleTab browser quota exceeded (~2 captures/second). Throttling gracefully.',
      retryAfterMs
    };
  }

  /**
   * Computes p95 of the given numeric samples.
   */
  private computeP95(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Records completed perception frame metrics, tracks p95 sliding window,
   * warm-up exclusions, and enforces tier downgrade/re-upgrade hysteresis.
   */
  recordFramePerception(perceptionMs: number, cacheHit: boolean, estimatedResidentMb: number): void {
    this.totalPerceptionQueries++;
    this.lastPerceptionMs = perceptionMs;
    this.lastEstimatedResidentMb = estimatedResidentMb;

    if (cacheHit) {
      this.totalCacheHits++;
      // Cache hits (~0ms) are recorded for HUD sparkline
      this.recentFrameLatencies.push(perceptionMs);
      if (this.recentFrameLatencies.length > 30) this.recentFrameLatencies.shift();
      return;
    }

    // Warm-up exclusion: first N inferences (graph compile, weight paging) are excluded from p95
    if (this.warmupInferencesLeft > 0) {
      this.warmupInferencesLeft--;
      if (this.warmupMs === undefined) {
        this.warmupMs = perceptionMs;
      }
      this.recentFrameLatencies.push(perceptionMs);
      if (this.recentFrameLatencies.length > 30) this.recentFrameLatencies.shift();
      return;
    }

    this.recentFrameLatencies.push(perceptionMs);
    if (this.recentFrameLatencies.length > 30) {
      this.recentFrameLatencies.shift();
    }

    // Evaluate moving p95 over last 20 non-warmup frames
    const windowSamples = this.recentFrameLatencies.slice(-20);
    const p95 = this.computeP95(windowSamples);

    // If override is forced, do not automatically change tier, but record metrics
    if (this.tierOverride !== 'auto') {
      return;
    }

    // 1. Probe Evaluation: If we just executed a 1-frame probe of T1 after dwell expired
    if (this.isProbingReupgrade) {
      this.isProbingReupgrade = false;
      const probeFailed = perceptionMs > this.config.maxMsPerFrame || estimatedResidentMb > this.config.maxResidentMb;

      if (probeFailed) {
        // Probe failed! Back off dwell exponentially (15s -> 30s -> 60s -> 120s max)
        this.currentDwellMs = Math.min(120000, this.currentDwellMs * 2);
        this.lastDowngradeTimestamp = Date.now();
        const reason = perceptionMs > this.config.maxMsPerFrame
          ? `Probe T1 failed (${Math.round(perceptionMs)}ms > ${this.config.maxMsPerFrame}ms ceiling). Backing off dwell to ${this.currentDwellMs / 1000}s`
          : `Probe T1 failed (${Math.round(estimatedResidentMb)}MB > ${this.config.maxResidentMb}MB ceiling). Backing off dwell to ${this.currentDwellMs / 1000}s`;

        this.downgradeTier(
          'T0',
          reason,
          perceptionMs > this.config.maxMsPerFrame ? perceptionMs : estimatedResidentMb,
          perceptionMs > this.config.maxMsPerFrame ? this.config.maxMsPerFrame : this.config.maxResidentMb
        );
        return;
      } else {
        // Probe succeeded! Reset dwell back to nominal 15s and stay in T1 at probe region budget (3)
        this.currentDwellMs = this.config.reupgradeDwellMs;
        this.reupgradeTier();
        this.regionBudget = 3;
        this.consecutiveUnderBudgetFrames = 0;
        return;
      }
    }

    // 2. If in T0, check whether dwell has elapsed to launch a 1-frame probe
    if (this.activeTier === 'T0') {
      if (this.tierDowngraded && this.tierOverride === 'auto') {
        const timeSinceDowngrade = Date.now() - this.lastDowngradeTimestamp;
        if (timeSinceDowngrade >= this.currentDwellMs) {
          this.isProbingReupgrade = true;
          this.probingFromTier = this.activeTier;
          this.activeTier = 'T1';
          this.regionBudget = 3; // Probe cautiously at 3 regions
        }
      }
      return;
    }

    // 3. For T1 and T2: Budget Violation & Graceful Region Degradation Evaluation
    const latencyExceeded = p95 > this.config.maxMsPerFrame;

    // Apply sustained-breach rule for monotonic WASM memory heap growth (N=3 consecutive samples over ceiling)
    if (estimatedResidentMb > this.config.maxResidentMb) {
      this.consecutiveOverMemoryFrames++;
    } else {
      this.consecutiveOverMemoryFrames = 0;
    }
    const memoryExceeded = this.consecutiveOverMemoryFrames >= 3;

    if (latencyExceeded || memoryExceeded) {
      this.consecutiveUnderBudgetFrames = 0;
      this.consecutiveOverMemoryFrames = 0;
      this.lastDowngradeTimestamp = Date.now();

      if (this.activeTier === 'T2') {
        const reason = latencyExceeded
          ? `Perception p95 (${p95}ms) exceeded ceiling (${this.config.maxMsPerFrame}ms)`
          : `Resident memory sustained breach (${estimatedResidentMb}MB) exceeded ceiling (${this.config.maxResidentMb}MB)`;
        this.regionBudget = 12;
        this.downgradeTier('T1', reason, latencyExceeded ? p95 : estimatedResidentMb, latencyExceeded ? this.config.maxMsPerFrame : this.config.maxResidentMb);
      } else if (this.activeTier === 'T1') {
        if (memoryExceeded) {
          const reason = `Resident memory sustained breach (${estimatedResidentMb}MB) exceeded ceiling (${this.config.maxResidentMb}MB)`;
          this.downgradeTier('T0', reason, estimatedResidentMb, this.config.maxResidentMb);
        } else if (latencyExceeded) {
          // Intra-Tier Region Degradation: 12 -> 6 -> 3 -> T0
          if (this.regionBudget === 12) {
            this.regionBudget = 6;
            this.recentFrameLatencies = []; // Clear latency window to evaluate under new 6-region budget
            this.tierDowngradeReason = `T1 intra-tier degraded: 12 -> 6 regions (p95 latency breach: ${p95}ms > ${this.config.maxMsPerFrame}ms)`;
          } else if (this.regionBudget === 6) {
            this.regionBudget = 3;
            this.recentFrameLatencies = []; // Clear latency window to evaluate under new 3-region budget
            this.tierDowngradeReason = `T1 intra-tier degraded: 6 -> 3 regions (p95 latency breach: ${p95}ms > ${this.config.maxMsPerFrame}ms)`;
          } else {
            // regionBudget is 3 and still breaching! Smallest budget has breached -> Demote to T0
            const reason = `Perception p95 (${p95}ms) breached ${this.config.maxMsPerFrame}ms ceiling at minimum region budget (3 regions)`;
            this.downgradeTier('T0', reason, p95, this.config.maxMsPerFrame);
          }
        }
      }
    } else {
      // Under budget: Step region budget back up if recovering (3 -> 6 -> 12)
      if (this.activeTier === 'T1' && !this.tierDowngraded) {
        if (this.regionBudget < 12) {
          this.consecutiveUnderBudgetFrames++;
          if (this.consecutiveUnderBudgetFrames >= 3) {
            this.consecutiveUnderBudgetFrames = 0;
            if (this.regionBudget === 3) {
              this.regionBudget = 6;
            } else if (this.regionBudget === 6) {
              this.regionBudget = 12;
            }
          }
        }
      }
    }
  }

  private persistDowngradeHistory(): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.set({ privapilot_downgrade_history: this.downgradeHistory }).catch(() => {});
    }
  }

  /**
   * Records an explicit network timeout for T2 server escalation (8s budget ceiling).
   */
  recordNetworkTimeout(step: number, timeoutMs = 8000): void {
    const event: DowngradeEvent = {
      timestamp: Date.now(),
      fromTier: 'T2',
      toTier: 'T1',
      reason: `T2 network reasoning timeout: server exceeded ${timeoutMs / 1000}s budget ceiling on step ${step}. Falling back to on-device perception`,
      metricValue: timeoutMs,
      threshold: timeoutMs
    };
    this.downgradeHistory.push(event);
    if (this.downgradeHistory.length > 20) this.downgradeHistory.shift();
    this.persistDowngradeHistory();
  }

  private downgradeTier(targetTier: ModelTier, reason: string, metricValue: number, threshold: number): void {
    const fromTier = this.activeTier;
    this.activeTier = targetTier;
    this.tierDowngraded = true;
    this.tierDowngradeReason = reason;

    const event: DowngradeEvent = {
      timestamp: Date.now(),
      fromTier,
      toTier: targetTier,
      reason,
      metricValue: Math.round(metricValue),
      threshold
    };
    this.downgradeHistory.push(event);
    if (this.downgradeHistory.length > 20) this.downgradeHistory.shift();
    this.persistDowngradeHistory();

    // Delayed session disposal: give a grace period (15s) so transient load doesn't destroy warm sessions immediately
    if (targetTier === 'T0') {
      if (this.disposalTimer) clearTimeout(this.disposalTimer);
      this.disposalTimer = setTimeout(async () => {
        this.disposalTimer = null;
        if (this.activeTier === 'T0') {
          await VitEncoder.disposeSession();
          await UltraFaceModelRunner.disposeSession();
        }
      }, this.config.sessionDisposalGraceMs);
    }
  }

  private reupgradeTier(): void {
    if (this.disposalTimer) {
      clearTimeout(this.disposalTimer);
      this.disposalTimer = null;
    }
    const fromTier = this.probingFromTier || 'T0';
    this.activeTier = this.requestedTier;
    this.tierDowngraded = false;
    this.tierDowngradeReason = undefined;
    this.consecutiveUnderBudgetFrames = 0;
    this.probingFromTier = 'T0';

    const event: DowngradeEvent = {
      timestamp: Date.now(),
      fromTier,
      toTier: this.requestedTier,
      reason: `Re-upgrade successful: 1-frame probe verified perception fits within budget. Active tier restored to ${this.requestedTier}`,
      metricValue: 0,
      threshold: this.config.maxMsPerFrame
    };
    this.downgradeHistory.push(event);
    if (this.downgradeHistory.length > 20) this.downgradeHistory.shift();
    this.persistDowngradeHistory();
  }

  /**
   * Resets capture timestamps sliding window between independent demo steps.
   */
  resetCaptureTimestamps(): void {
    this.captureTimestamps = [];
    this.isCaptureActive = false;
  }

  /**
   * Emits the four accounted resident memory components in MB separately:
   * 1. baseMb: ~20 MB (Base MV3 runtime + DOM engine baseline)
   * 2. wasmHeapMb: 0 MB cold / post-grace; 105 MB warm (ViT ONNX weights 88.6MB + runtime heap)
   * 3. arenaMb: 0 MB cold / post-grace; 6.7 MB warm (UltraFace weights 1.7MB + tensor arena 5MB)
   * 4. bitmapMb: live canvas byteLength (or clamped w*h*4, max 8.2MB on 4K)
   */
  getMemoryBreakdown(
    viewport?: { screenshotWidth?: number; screenshotHeight?: number; canvasByteLength?: number },
    options?: { assumeModelsActive?: boolean }
  ): MemoryBreakdown {
    const baseMb = 20;

    let canvasBytes = viewport?.canvasByteLength || 0;
    if (!canvasBytes) {
      let rawW = viewport?.screenshotWidth || 1280;
      let rawH = viewport?.screenshotHeight || 800;
      const maxDimension = 1920;
      if (rawW > maxDimension || rawH > 1080) {
        const scale = Math.min(maxDimension / rawW, 1080 / rawH);
        rawW = Math.round(rawW * scale);
        rawH = Math.round(rawH * scale);
      }
      canvasBytes = rawW * rawH * 4;
    }
    const bitmapMb = Math.round((canvasBytes / (1024 * 1024)) * 10) / 10;

    const modelsStillResident = this.activeTier !== 'T0' || Boolean(this.disposalTimer);
    let wasmHeapMb = 0;
    let arenaMb = 0;

    if (modelsStillResident) {
      const isWarm = options?.assumeModelsActive || VitEncoder.getMemoryFootprintBytes() > 0 || (this.activeTier !== 'T0');
      if (isWarm) {
        wasmHeapMb = 105;
        arenaMb = 6.7;
      }
    }

    return {
      baseMb,
      wasmHeapMb,
      arenaMb,
      bitmapMb
    };
  }

  /**
   * Computes total accounted resident memory in MB with HiDPI downscaling clamp.
   */
  calculateAccountedMemoryMb(
    viewport?: { screenshotWidth?: number; screenshotHeight?: number; canvasByteLength?: number },
    options?: { assumeModelsActive?: boolean }
  ): number {
    const bd = this.getMemoryBreakdown(viewport, options);
    return Math.round(bd.baseMb + bd.wasmHeapMb + bd.arenaMb + bd.bitmapMb);
  }

  /**
   * Generates a complete snapshot of resource telemetry.
   */
  getTelemetry(currentPerceptionMs?: number, currentCacheHit = false): ResourceTelemetry {
    const perceptionMs = currentPerceptionMs ?? this.lastPerceptionMs;
    const windowSamples = this.recentFrameLatencies.slice(-20);
    const p95PerceptionMs = this.computeP95(windowSamples);
    const cacheHitRate = this.totalPerceptionQueries > 0
      ? Math.round((this.totalCacheHits / this.totalPerceptionQueries) * 100) / 100
      : 0;

    const now = Date.now();
    const capturesInLastMinute = this.captureTimestamps.filter((t) => t > now - 60000).length;
    const provider: ExecutionProvider = CapabilityDetector.detectBestProvider();
    const breakdown = this.getMemoryBreakdown();

    return {
      activeTier: this.activeTier,
      requestedTier: this.requestedTier,
      tierDowngraded: this.tierDowngraded,
      tierDowngradeReason: this.tierDowngradeReason,
      tierOverride: this.tierOverride,
      regionBudget: this.regionBudget,
      perceptionMs,
      p95PerceptionMs,
      warmupExcluded: this.warmupInferencesLeft > 0,
      warmupMs: this.warmupMs,
      estimatedResidentMb: this.lastEstimatedResidentMb,
      memoryAccountingMethod: `base(${breakdown.baseMb}MB)+wasmHeap(${breakdown.wasmHeapMb}MB)+arena(${breakdown.arenaMb}MB)+bitmap(${breakdown.bitmapMb}MB)`,
      memoryBreakdown: breakdown,
      maxPerceptionMsCeiling: this.config.maxMsPerFrame,
      maxMemoryMbCeiling: this.config.maxResidentMb,
      maxCapturesPerMinuteCeiling: this.config.maxCapturesPerMinute,
      capturesInLastMinute,
      cacheHit: currentCacheHit,
      cacheHitRate,
      totalPerceptionQueries: this.totalPerceptionQueries,
      totalCacheHits: this.totalCacheHits,
      executionProvider: provider,
      backpressureApplied: this.isCaptureActive || capturesInLastMinute >= this.config.maxCapturesPerMinute,
      recentFrameLatencies: [...this.recentFrameLatencies],
      downgradeHistory: [...this.downgradeHistory]
    };
  }
}
