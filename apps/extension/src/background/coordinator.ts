/**
 * @privapilot/extension - Background Run Coordinator
 *
 * Coordinates the full end-to-end privacy and bounded multi-step execution loop:
 * 1. Capture Active Tab (fresh ephemeral IDs per cycle)
 * 2. Run Local Multi-Layer Sanitizer (offscreen host)
 * 3. Transmit Sanitized Context to Server (zero raw screenshot/DOM transmission)
 * 4. Validate Action Proposal against Closed Schema & Sanitized Elements
 * 5. Prompt for Confirmation if Protected (pauses loop)
 * 6. Execute Safe Action via Content Script
 * 7. Semantically Verify UI Outcome
 * 8. Repeat perception cycle up to bounded step budget or until finish/failure
 */

import {
  AgentState,
  RawCapture,
  SanitizedContext,
  ActionProposal,
  classifyActionRisk,
  validateActionProposal,
  RunTelemetry,
  TierOverride,
  ModelTier
} from '@privapilot/protocol';
import { BrowserAdapter, WebExtensionAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient, ModelStatus } from './http-client.js';
import { AuditLogger } from './audit-logger.js';
import { DecisionRouter } from './decision-router.js';
import { ResourceGovernor } from './resource-governor.js';

export interface ChatOutcome {
  readonly success: boolean;
  readonly reply: string;
  readonly maskCount: number;
  readonly elementCount: number;
  /** False when the gateway answered from its offline reasoner, or not at all. */
  readonly modelConnected?: boolean;
}

export interface CoordinatorRunOptions {
  readonly maxSteps?: number;
  readonly maxStaleRetries?: number;
}

export interface CoordinatorListeners {
  onStateChange?(state: AgentState, message?: string): void;
  onSanitizationComplete?(raw: RawCapture, sanitized: SanitizedContext): void;
  onActionProposed?(action: ActionProposal): void;
  onActionConfirmedRequired?(action: ActionProposal): void;
  onTelemetryUpdated?(telemetry: RunTelemetry): void;
  onStepProgress?(step: number, maxSteps: number, message: string): void;
}

export interface CoordinatorRunResult {
  readonly success: boolean;
  readonly state: AgentState;
  readonly message?: string;
  readonly error?: string;
  readonly sanitized?: SanitizedContext;
  readonly proposal?: ActionProposal;
  readonly telemetry?: RunTelemetry;
  readonly stepCount?: number;
}

export function isRestrictedBrowserUrl(urlStr?: string): { isRestricted: boolean; reason?: string } {
  if (!urlStr) return { isRestricted: false };
  const url = urlStr.trim().toLowerCase();
  if (url.startsWith('chrome://')) {
    return { isRestricted: true, reason: 'Chrome internal settings/management surface (chrome://)' };
  }
  if (url.startsWith('chrome-extension://')) {
    return { isRestricted: true, reason: 'Extension internal origin (chrome-extension://)' };
  }
  if (url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('devtools://') || url.startsWith('view-source:')) {
    return { isRestricted: true, reason: 'Privileged browser internal origin' };
  }
  if (url.startsWith('file://')) {
    return { isRestricted: true, reason: 'Local file scheme URL without explicit verified permission' };
  }
  return { isRestricted: false };
}

export class RunCoordinator {
  private state: AgentState = 'idle';
  private readonly browser: BrowserAdapter;
  private readonly httpClient: ReasoningHttpClient;
  private readonly auditLogger: AuditLogger;
  private readonly governor: ResourceGovernor;
  private readonly defaultMaxSteps: number;
  private readonly defaultMaxStaleRetries: number;
  private listeners: CoordinatorListeners = {};

  private currentGoal: string | null = null;
  private currentStep: number = 0;
  private currentMaxSteps: number = 10;
  private currentStaleRetries: number = 0;
  private maxStaleRetries: number = 2;
  private pendingAction: ActionProposal | null = null;
  private currentSanitizedContext: SanitizedContext | null = null;
  private lastRunResult: CoordinatorRunResult | null = null;
  private actionHistory: Array<{ kind: string; targetLocalId?: string; label?: string; textToType?: string; selectOptionValue?: string; scrollDirection?: string }> = [];
  private t0_runStart: number = 0;
  private cumulativeClientLatency: number = 0;
  private cumulativeServerLatency: number = 0;
  private stepsDecidedLocally: number = 0;
  private stepsEscalated: number = 0;
  private bytesTransmittedTotal: number = 0;
  private consecutiveLocalScrolls: number = 0;
  private lastDecisionSource: 'local' | 'remote' = 'remote';
  private isCancelled: boolean = false;

  constructor(
    browser: BrowserAdapter = new WebExtensionAdapter(),
    httpClient: ReasoningHttpClient = new ReasoningHttpClient(),
    auditLogger: AuditLogger = new AuditLogger(),
    options: { defaultMaxSteps?: number; maxStaleRetries?: number; governor?: ResourceGovernor } = {}
  ) {
    this.browser = browser;
    this.httpClient = httpClient;
    this.auditLogger = auditLogger;
    this.governor = options.governor ?? new ResourceGovernor();
    this.defaultMaxSteps = Math.max(1, Math.min(options.defaultMaxSteps ?? 10, 20));
    this.defaultMaxStaleRetries = options.maxStaleRetries ?? 2;
  }

  getGovernor(): ResourceGovernor {
    return this.governor;
  }

  setTierOverride(override: TierOverride): void {
    this.governor.setTierOverride(override);
  }

  setListeners(listeners: CoordinatorListeners): void {
    this.listeners = listeners;
  }

  getState(): AgentState {
    return this.state;
  }

  getLastResult(): CoordinatorRunResult | null {
    return this.lastRunResult;
  }

  /**
   * Executes a single real perception cycle on the active tab without advancing the agent action loop.
   * Runs the full end-to-end perception pipeline:
   * 1. Captures active tab DOM snapshot and visual screenshot via browser adapter
   * 2. Executes offscreen multi-layer privacy sanitizer
   * 3. Measures actual client perception latency
   * 4. Computes honest resident memory footprint
   * 5. Records metrics to ResourceGovernor and broadcasts telemetry to HUD
   */
  async runSinglePerceptionCycle(goal: string = 'Inspect page'): Promise<{ success: boolean; telemetry: RunTelemetry; perceptionMs: number; error?: string }> {
    const activeTab = await this.browser.getActiveTab();
    if (!activeTab || !activeTab.id) {
      const now = Date.now();
      return { success: false, telemetry: this.createTelemetry(now, now, now, now, now, now, now, now, 0), perceptionMs: 0, error: 'No active tab found' };
    }

    const captureId = `cap_single_${Date.now()}`;
    const domResponse = await this.browser.sendMessageToTab(activeTab.id, {
      type: 'EXTRACT_DOM_SNAPSHOT',
      captureId
    });

    if (!domResponse || !domResponse.success) {
      const now = Date.now();
      return { success: false, telemetry: this.createTelemetry(now, now, now, now, now, now, now, now, 0), perceptionMs: 0, error: 'DOM snapshot failed' };
    }

    const screenshotDataUrl = await this.browser.captureVisibleTab();
    const rawCapture: RawCapture = {
      _brand: 'RawCapture_InternalOnly',
      captureId,
      timestamp: Date.now(),
      rawScreenshotDataUrl: screenshotDataUrl,
      rawDomSummary: domResponse.snapshot,
      metadata: domResponse.viewport
    };

    const activeTier = this.governor.getActiveTier();
    const regionBudget = this.governor.getRegionBudget();
    const t0 = Date.now();
    const sanitized = await this.browser.runInSanitizerHost({
      rawCapture,
      snapshot: domResponse.snapshot,
      goal,
      activeTier,
      regionBudget,
      domHash: domResponse.domHash,
      viewportHash: domResponse.viewportHash
    });
    const perceptionMs = Date.now() - t0;
    const isCacheHit = perceptionMs < 5;
    const accountedMb = this.governor.calculateAccountedMemoryMb(domResponse.viewport);
    this.governor.recordFramePerception(perceptionMs, isCacheHit, accountedMb);

    if (this.listeners.onSanitizationComplete) {
      this.listeners.onSanitizationComplete(rawCapture, sanitized);
    }

    const telemetry = this.createTelemetry(t0, t0, t0, t0 + perceptionMs, t0 + perceptionMs, t0 + perceptionMs, t0 + perceptionMs, t0 + perceptionMs, 1);
    if (this.listeners.onTelemetryUpdated) {
      this.listeners.onTelemetryUpdated(telemetry);
    }

    return { success: true, telemetry, perceptionMs };
  }

  cancelRun(): void {
    this.isCancelled = true;
    this.transition('idle', 'Run cancelled by user');
  }

  private transition(next: AgentState, msg?: string): void {
    this.state = next;
    if (this.listeners.onStateChange) {
      this.listeners.onStateChange(next, msg);
    }
  }

  /**
   * `label` is recorded alongside the local id because local ids are regenerated on
   * every capture - el_6 in one step is not el_6 in the next. The label is what
   * survives a re-perception, and it is what lets the decision tier tell "I have
   * already pressed this" from "this is a new control".
   */
  private recordActionHistory(proposal: ActionProposal, label?: string): void {
    this.actionHistory.push({
      kind: proposal.kind,
      targetLocalId: proposal.targetLocalId,
      label,
      textToType: proposal.textToType,
      selectOptionValue: proposal.selectOptionValue,
      scrollDirection: proposal.scrollDirection
    });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
  }

  private isRepeatedAction(proposal: ActionProposal): boolean {
    if (proposal.kind === 'finish' || proposal.kind === 'wait') return false;

    if (this.actionHistory.length >= 2) {
      const last1 = this.actionHistory[this.actionHistory.length - 1];
      const last2 = this.actionHistory[this.actionHistory.length - 2];

      const matches = (a: typeof last1) =>
        a.kind === proposal.kind &&
        a.targetLocalId === proposal.targetLocalId &&
        a.textToType === proposal.textToType &&
        a.selectOptionValue === proposal.selectOptionValue &&
        a.scrollDirection === proposal.scrollDirection;

      if (matches(last1) && matches(last2)) {
        return true;
      }
    }
    return false;
  }

  private createTelemetry(
    t0: number,
    t1: number,
    t2: number,
    t3: number,
    t4: number,
    t5: number,
    t6: number,
    t7: number,
    step: number
  ): RunTelemetry {
    const stepClientMs = (t3 - t0) + (t7 - t5);
    const stepServerMs = t4 - t3;
    this.cumulativeClientLatency += stepClientMs;
    this.cumulativeServerLatency += stepServerMs;

    return {
      runId: `run_${this.t0_runStart}`,
      t0_start: this.t0_runStart,
      t1_captureComplete: t1,
      t2_detectionComplete: t2,
      t3_sanitizationValidated: t3,
      t4_reasoningReceived: t4,
      t5_actionValidated: t5,
      t6_actionExecuted: t6,
      t7_stateVerified: t7,
      totalLatencyMs: t7 - this.t0_runStart,
      clientLatencyMs: this.cumulativeClientLatency,
      serverLatencyMs: this.cumulativeServerLatency,
      stepCount: this.currentMaxSteps,
      stepsCompleted: step,
      decisionSource: this.lastDecisionSource,
      stepsDecidedLocally: this.stepsDecidedLocally,
      stepsEscalated: this.stepsEscalated,
      bytesTransmittedTotal: this.bytesTransmittedTotal,
      resources: this.governor.getTelemetry()
    };
  }

  /**
   * Starts an automated bounded multi-step agent run for a specific user goal.
   */
  async startRun(goal: string, options?: CoordinatorRunOptions): Promise<CoordinatorRunResult> {
    if (
      this.state !== 'idle' &&
      this.state !== 'complete' &&
      this.state !== 'failed-safe' &&
      this.state !== 'blocked-local-only' &&
      this.state !== 'awaiting-user-confirmation'
    ) {
      const errorMsg = 'Cannot start new run: an agent run is already in progress';
      const res: CoordinatorRunResult = { success: false, state: this.state, error: errorMsg };
      this.lastRunResult = res;
      return res;
    }

    this.currentGoal = goal;
    this.currentStep = 0;
    this.currentMaxSteps = Math.max(1, Math.min(options?.maxSteps ?? this.defaultMaxSteps, 20));
    this.maxStaleRetries = options?.maxStaleRetries ?? this.defaultMaxStaleRetries;
    this.currentStaleRetries = 0;
    this.pendingAction = null;
    this.actionHistory = [];
    this.t0_runStart = Date.now();
    this.cumulativeClientLatency = 0;
    this.cumulativeServerLatency = 0;
    this.stepsDecidedLocally = 0;
    this.stepsEscalated = 0;
    this.bytesTransmittedTotal = 0;
    this.consecutiveLocalScrolls = 0;
    this.lastDecisionSource = 'remote';
    this.isCancelled = false;

    return this.executeLoop();
  }

  /**
   * Resumes the agent loop after a paused state or user approval.
   */
  async resumeRun(): Promise<CoordinatorRunResult> {
    return this.executeLoop();
  }

  private async executeLoop(): Promise<CoordinatorRunResult> {
    const goal = this.currentGoal;
    if (!goal) {
      const res: CoordinatorRunResult = { success: false, state: 'idle', error: 'No active goal' };
      this.lastRunResult = res;
      return res;
    }

    while (this.currentStep < this.currentMaxSteps) {
      if (this.isCancelled) {
        this.transition('idle', 'Run cancelled by user');
        const res: CoordinatorRunResult = { success: false, state: 'idle', message: 'Run cancelled by user' };
        this.lastRunResult = res;
        return res;
      }

      this.currentStep++;
      const step = this.currentStep;
      const maxSteps = this.currentMaxSteps;
      const t0_step = Date.now();

      // Backpressure Check: enforce concurrency guard and capture rate ceiling
      const backpressure = this.governor.checkBackpressure();
      if (!backpressure.allowed) {
        const errorMsg = `Perception backpressure applied: ${backpressure.message || backpressure.reasonCode}`;
        this.transition('blocked-local-only', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'blocked-local-only',
          error: errorMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }
      this.governor.recordCaptureStarted();

      // Step 1: Capture active tab DOM & screenshot (fresh captureId each cycle)
      this.transition('capturing', `Step ${step}/${maxSteps}: Capturing active tab DOM & screenshot`);
      const activeTab = await this.browser.getActiveTab();

      // Guard: Block restricted browser surfaces (chrome://, chrome-extension://, file://, devtools://)
      const restrictedCheck = isRestrictedBrowserUrl(activeTab?.url);
      if (restrictedCheck.isRestricted) {
        this.governor.recordCaptureEnded();
        const errorMsg = `Capture blocked: ${restrictedCheck.reason}`;
        this.transition('blocked-local-only', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'blocked-local-only',
          error: errorMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      const captureId = `cap_${Date.now()}_${step}`;
      let domResponse: any;
      try {
        domResponse = await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId
        });
      } catch (err: any) {
        this.governor.recordCaptureEnded();
        const errorMsg = 'Could not connect to webpage. Please reload the target tab (Cmd+R / F5) so the extension content script attaches.';
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      if (!domResponse || !domResponse.success) {
        this.governor.recordCaptureEnded();
        const errorMsg = 'Failed to extract DOM snapshot from content script. Please reload the tab.';
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      let screenshotDataUrl: string;
      try {
        screenshotDataUrl = await this.browser.captureVisibleTab();
      } catch (err: any) {
        if (err?.message?.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') || err?.message?.includes('quota')) {
          this.governor.recordBrowserQuotaExceeded();
          const errorMsg = 'Browser captureVisibleTab rate limit reached. Backpressure active.';
          this.transition('blocked-local-only', errorMsg);
          const res: CoordinatorRunResult = { success: false, state: 'blocked-local-only', error: errorMsg, stepCount: step };
          this.lastRunResult = res;
          return res;
        }
        this.governor.recordCaptureEnded();
        const errorMsg = `Screenshot capture failed: ${err.message || 'Permission denied or restricted tab'}`;
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }
      const t1_captureComplete = Date.now();

      // Ephemeral raw capture - strictly scoped to this cycle, never persisted
      const rawCapture: RawCapture = {
        _brand: 'RawCapture_InternalOnly',
        captureId,
        timestamp: Date.now(),
        rawScreenshotDataUrl: screenshotDataUrl,
        rawDomSummary: domResponse.snapshot,
        metadata: domResponse.viewport
      };

      // Step 2: Offscreen Sanitization
      this.transition('detecting-sensitive-content', `Step ${step}/${maxSteps}: Scanning for sensitive data`);
      const t2_detectionComplete = Date.now();

      this.transition('sanitizing', `Step ${step}/${maxSteps}: Rendering opaque privacy masks`);
      let sanitized: SanitizedContext;
      const activeTier = this.governor.getActiveTier();
      try {
        sanitized = await this.browser.runInSanitizerHost({
          rawCapture,
          snapshot: domResponse.snapshot,
          goal,
          activeTier,
          domHash: domResponse.domHash,
          viewportHash: domResponse.viewportHash
        });
      } catch (err: any) {
        this.governor.recordCaptureEnded();
        const userSafeMsg = 'Sensitive content may be present in an area that cannot be inspected safely. No context was sent.';
        this.transition('blocked-local-only', userSafeMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'blocked-local-only',
          error: userSafeMsg,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      const t3_sanitizationValidated = Date.now();
      const perceptionMs = t3_sanitizationValidated - t1_captureComplete;
      const isCacheHit = perceptionMs < 5;
      const accountedMb = this.governor.calculateAccountedMemoryMb(domResponse.viewport);
      this.governor.recordFramePerception(perceptionMs, isCacheHit, accountedMb);
      this.governor.recordCaptureEnded();

      this.currentSanitizedContext = sanitized;

      if (this.listeners.onSanitizationComplete) {
        this.listeners.onSanitizationComplete(rawCapture, sanitized);
      }

      // Step 3: Decide the step - locally where possible, remotely where required.
      //
      // This is the problem statement's "IF it requires the visual context to be
      // sent to server". Previously there was no "if": every step transmitted.
      const routing = DecisionRouter.route({
        goal,
        sanitized,
        step,
        consecutiveLocalScrolls: this.consecutiveLocalScrolls,
        viewport: domResponse.viewport,
        alreadyActionedLabels: this.actionHistory
          .filter((a) => a.kind === 'click' && a.label)
          .map((a) => a.label as string)
      });

      let proposal: ActionProposal;
      let decisionSource: 'local' | 'remote';
      let bytesTransmitted = 0;

      if (routing.source === 'local') {
        decisionSource = 'local';
        proposal = routing.proposal;
        this.stepsDecidedLocally++;
        this.consecutiveLocalScrolls = proposal.kind === 'scroll' ? this.consecutiveLocalScrolls + 1 : 0;
        this.transition(
          'validating-action',
          `Step ${step}/${maxSteps}: Decided on-device (${routing.rule}) - nothing transmitted`
        );
      } else {
        decisionSource = 'remote';
        this.stepsEscalated++;
        this.consecutiveLocalScrolls = 0;
        this.transition('sending-sanitized-context', `Step ${step}/${maxSteps}: Transmitting sanitized context`);
        this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Awaiting reasoning action`);

        const T2_NETWORK_TIMEOUT_MS = 8000;
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`T2 reasoning server exceeded ${T2_NETWORK_TIMEOUT_MS / 1000}s network budget ceiling`));
          }, T2_NETWORK_TIMEOUT_MS);
        });

        try {
          proposal = await Promise.race([
            this.httpClient.requestReasoningAction(
              sanitized,
              this.actionHistory
                .filter((a) => a.kind !== 'wait')
                .slice(-8)
                .map((a) => ({ kind: a.kind, targetLabel: a.label }))
            ),
            timeoutPromise
          ]);
        } catch (err: any) {
          if (err?.message?.includes('network budget ceiling')) {
            // Surface in HUD and record timeout event in governor
            this.governor.recordNetworkTimeout(step, T2_NETWORK_TIMEOUT_MS);
            if (this.listeners.onTelemetryUpdated) {
              this.listeners.onTelemetryUpdated(this.createTelemetry(this.t0_runStart, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, Date.now(), Date.now(), Date.now(), Date.now(), step));
            }
            // Full Fallback Chain:
            // 1. T1 Local Perception (if activeTier is T1/T2 or vision observations exist)
            // 2. T0 Heuristic DOM result (if activeTier is T0 or vision unavailable)
            // 3. Fallback to wait if no viable candidates exist
            decisionSource = 'local';
            const actioned = new Set((this.actionHistory || []).map((a) => a.label?.toLowerCase().trim()).filter(Boolean));
            const candidates = (sanitized?.elements || []).filter((el) => {
              const name = (el.sanitizedName || '').toLowerCase().trim();
              return !actioned.has(name) && !name.includes('[masked') && !name.includes('[password') && !name.includes('[auth');
            });

            const hasVisionContext = (activeTier === 'T1' || activeTier === 'T2') && (sanitized?.visionObservations?.length || 0) > 0;
            const fallbackTierLabel = hasVisionContext ? 'T1 local perception' : (activeTier === 'T0' ? 'T0 DOM heuristics' : 'on-device perception');

            const bestCandidate = candidates.find((el) => el.role === 'button' || el.actionCapabilities?.includes('click'))
              || candidates.find((el) => el.role === 'input' || el.role === 'textarea' || el.actionCapabilities?.includes('type'))
              || candidates[0];

            if (bestCandidate) {
              const canType = bestCandidate.role === 'input' || bestCandidate.role === 'textarea' || bestCandidate.actionCapabilities?.includes('type');
              proposal = {
                actionId: `act_${Date.now()}`,
                kind: canType ? 'type' : 'click',
                targetLocalId: bestCandidate.localId,
                textToType: canType ? 'test' : undefined,
                rationale: `T2 network timeout (${T2_NETWORK_TIMEOUT_MS}ms exceeded). Falling back to ${fallbackTierLabel} candidate "${bestCandidate.sanitizedName}".`,
                confidence: hasVisionContext ? 0.75 : 0.60,
                risk: 'safe',
                expectedState: `The page responds to "${bestCandidate.sanitizedName}".`
              };
            } else {
              proposal = {
                actionId: `act_${Date.now()}`,
                kind: 'wait',
                rationale: `T2 network timeout (${T2_NETWORK_TIMEOUT_MS}ms exceeded) with no actionable local candidates in ${fallbackTierLabel} context.`,
                confidence: 0.5,
                risk: 'safe'
              };
            }
          } else {
            const errorMsg = `Reasoning server error: ${err.message || 'Request failed'}`;
            this.transition('failed-safe', errorMsg);
            const res: CoordinatorRunResult = {
              success: false,
              state: 'failed-safe',
              error: errorMsg,
              sanitized,
              stepCount: step
            };
            this.lastRunResult = res;
            return res;
          }
        } finally {
          clearTimeout(timeoutHandle);
        }
        // Optional on the interface: an injected client may not do byte accounting.
        bytesTransmitted =
          typeof (this.httpClient as any).getLastRequestBytes === 'function'
            ? (this.httpClient as any).getLastRequestBytes()
            : 0;
      }

      this.lastDecisionSource = decisionSource;
      this.bytesTransmittedTotal += bytesTransmitted;
      this.auditLogger.logDecisionEvent({
        runId: sanitized.runId,
        step,
        decisionSource,
        actionKind: proposal.kind,
        targetLocalId: proposal.targetLocalId,
        confidence: proposal.confidence,
        rule: routing.source === 'local' ? routing.rule : undefined,
        escalationReason: routing.source === 'remote' ? routing.escalationReason : undefined,
        bytesTransmitted
      });

      const t4_reasoningReceived = Date.now();

      // Step 4: Validating Action & Policy Check
      this.transition('validating-action', `Step ${step}/${maxSteps}: Validating proposed action`);
      const t5_actionValidated = Date.now();

      const actionValidation = validateActionProposal(proposal, sanitized.elements);
      if (!actionValidation.isValid || !actionValidation.proposal) {
        const errorMsg = `Action rejected: ${actionValidation.errorMessage || 'Invalid action proposal schema'}`;
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      // Step 5: Risk Classification
      const targetElement = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
      const riskLevel = classifyActionRisk(proposal, targetElement?.sanitizedName);

      if (riskLevel === 'blocked') {
        const errorMsg = `Action blocked by client safety policy: ${proposal.rationale}`;
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      if (riskLevel === 'protected') {
        this.pendingAction = proposal;
        const msg = `Protected action requires user consent: ${proposal.rationale}`;
        this.transition('awaiting-user-confirmation', msg);
        if (this.listeners.onActionConfirmedRequired) {
          this.listeners.onActionConfirmedRequired(proposal);
        }
        const res: CoordinatorRunResult = {
          success: false,
          state: 'awaiting-user-confirmation',
          message: msg,
          sanitized,
          proposal,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      // Step 6: Safe Action Execution
      if (this.listeners.onActionProposed) {
        this.listeners.onActionProposed(proposal);
      }

      if (proposal.kind === 'finish') {
        const tFin = Date.now();
        const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, tFin, tFin, step);
        if (this.listeners.onTelemetryUpdated) {
          this.listeners.onTelemetryUpdated(telemetry);
        }
        this.transition('complete', `Task completed: ${proposal.rationale}`);
        const res: CoordinatorRunResult = {
          success: true,
          state: 'complete',
          message: proposal.rationale,
          sanitized,
          proposal,
          telemetry,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      // Check repeated action loop
      const isDuplicate = this.isRepeatedAction(proposal);
      if (isDuplicate) {
        const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }
      // Execute action via content script
      this.transition('executing', `Step ${step}/${maxSteps}: Executing '${proposal.kind}' on ${proposal.targetLocalId || 'page'}`);

      const execResponse = await this.browser.sendMessageToTab(activeTab.id, {
        type: 'EXECUTE_ACTION',
        proposal,
        captureId: sanitized.captureId
      });

      const t6_actionExecuted = Date.now();

      this.transition('verifying', `Step ${step}/${maxSteps}: Verifying semantic outcome`);
      const t7_stateVerified = Date.now();

      const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
      if (this.listeners.onTelemetryUpdated) {
        this.listeners.onTelemetryUpdated(telemetry);
      }

      // Handle Stale Target Recovery
      if (execResponse && execResponse.staleTarget) {
        if (this.currentStaleRetries < this.maxStaleRetries) {
          this.currentStaleRetries++;
          this.transition('capturing', `Stale target detected. Re-perceiving page (retry ${this.currentStaleRetries}/${this.maxStaleRetries})...`);
          continue;
        } else {
          const errorMsg = `Stale target: target element '${proposal.targetLocalId}' remained stale after ${this.maxStaleRetries} retry attempts`;
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            telemetry,
            stepCount: step
          };
          this.lastRunResult = res;
          return res;
        }
      }

      this.recordActionHistory(
        proposal,
        sanitized.elements.find((e) => e.localId === proposal.targetLocalId)?.sanitizedName
      );

      const isSuccess = Boolean(execResponse && execResponse.success && execResponse.semanticOutcomeVerified);
      if (!isSuccess) {
        const errorMsg = execResponse?.message || 'Action execution or semantic verification failed';
        this.transition('failed-safe', `Execution failed: ${errorMsg}`);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          telemetry,
          stepCount: step
        };
        this.lastRunResult = res;
        return res;
      }

      this.currentStaleRetries = 0;

      if (this.listeners.onStepProgress) {
        this.listeners.onStepProgress(step, maxSteps, proposal.rationale);
      }
    }

    // Step budget exhausted
    const errorMsg = `Step budget exhausted (${this.currentMaxSteps} steps) without completing goal`;
    this.transition('failed-safe', errorMsg);
    const res: CoordinatorRunResult = {
      success: false,
      state: 'failed-safe',
      error: errorMsg,
      stepCount: this.currentStep,
      sanitized: this.currentSanitizedContext || undefined
    };
    this.lastRunResult = res;
    return res;
  }

  /**
   * Reports whether the reasoning gateway and a model backend are reachable.
   */
  async getModelStatus(): Promise<ModelStatus> {
    return this.httpClient.getModelStatus();
  }

  /**
   * Performs page-aware chat strictly across the privacy boundary.
   */
  async chatWithPage(userMessage: string): Promise<ChatOutcome> {
    try {
      const activeTab = await this.browser.getActiveTab();
      if (!activeTab || !activeTab.id) {
        return this.generalChat(userMessage);
      }

      let domResponse: any = null;
      try {
        domResponse = await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId: `chat_cap_${Date.now()}`
        });
      } catch (_) {
        // Tab content script not reachable
      }

      if (!domResponse || !domResponse.success || !domResponse.snapshot) {
        return this.generalChat(userMessage);
      }

      let screenshotDataUrl: string = '';
      try {
        screenshotDataUrl = await this.browser.captureVisibleTab();
      } catch (_) {
        // Tab capture blocked or unavailable
      }

      if (!screenshotDataUrl) {
        return this.generalChat(userMessage);
      }

      const rawCapture: RawCapture = {
        _brand: 'RawCapture_InternalOnly',
        captureId: `chat_cap_${Date.now()}`,
        timestamp: Date.now(),
        rawScreenshotDataUrl: screenshotDataUrl,
        rawDomSummary: domResponse.snapshot,
        metadata: domResponse.viewport
      };

      let sanitized: SanitizedContext;
      try {
        sanitized = await this.browser.runInSanitizerHost({
          rawCapture,
          snapshot: domResponse.snapshot,
          goal: userMessage
        });
      } catch (_) {
        // Sanitizer host unavailable or timed out; fallback to general chat
        return this.generalChat(userMessage);
      }

      if (this.listeners.onSanitizationComplete) {
        this.listeners.onSanitizationComplete(rawCapture, sanitized);
      }

      const chatRes = await this.httpClient.requestChat(sanitized, userMessage);
      return {
        success: true,
        reply: chatRes.reply,
        maskCount: sanitized.maskCount,
        elementCount: sanitized.elements.length,
        modelConnected: chatRes.modelConnected !== false
      };
    } catch (err: any) {
      return this.generalChat(userMessage, err);
    }
  }

  /**
   * Contextless chat turn. Reports a real connection failure instead of claiming
   * the model is ready — that claim is what made a broken model look like a
   * working one with nothing to say.
   */
  private async generalChat(userMessage: string, priorError?: any): Promise<ChatOutcome> {
    try {
      const genRes = await this.httpClient.requestGeneralChat(userMessage);
      return {
        success: true,
        reply: genRes.reply,
        maskCount: 0,
        elementCount: 0,
        modelConnected: genRes.modelConnected !== false
      };
    } catch (err: any) {
      const detail = err?.message || priorError?.message || 'Reasoning gateway unreachable';
      return {
        success: false,
        reply: `Could not reach the reasoning model.\n\n${detail}`,
        maskCount: 0,
        elementCount: 0,
        modelConnected: false
      };
    }
  }

  /**
   * Called when the user clicks 'Approve' on a protected action card.
   * If resumeLoop is true, continues multi-step execution loop.
   */
  async approvePendingAction(options?: { resumeLoop?: boolean }): Promise<CoordinatorRunResult> {
    if (!this.pendingAction || !this.currentSanitizedContext) {
      const res: CoordinatorRunResult = {
        success: false,
        state: 'idle',
        error: 'No pending action to approve'
      };
      this.lastRunResult = res;
      return res;
    }

    const action = this.pendingAction;
    const sanitized = this.currentSanitizedContext;
    this.pendingAction = null;

    const activeTab = await this.browser.getActiveTab();
    const t0 = Date.now();

    this.transition('executing', `Executing approved action '${action.kind}' on ${action.targetLocalId || 'page'}`);

    const execResponse = await this.browser.sendMessageToTab(activeTab.id, {
      type: 'EXECUTE_ACTION',
      proposal: action,
      captureId: sanitized.captureId
    });

    const now = Date.now();
    const telemetry = this.createTelemetry(t0, now, now, now, now, now, now, now, this.currentStep);
    if (this.listeners.onTelemetryUpdated) {
      this.listeners.onTelemetryUpdated(telemetry);
    }

    const isSuccess = Boolean(execResponse && execResponse.success && execResponse.semanticOutcomeVerified);
    if (!isSuccess) {
      const errorMsg = execResponse?.message || 'Execution of approved action failed';
      this.transition('failed-safe', `Execution failed: ${errorMsg}`);
      const res: CoordinatorRunResult = {
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        sanitized,
        proposal: action,
        telemetry,
        stepCount: this.currentStep
      };
      this.lastRunResult = res;
      return res;
    }

    if (options?.resumeLoop && action.kind !== 'finish') {
      return this.executeLoop();
    }

    this.transition('complete', `Approved action executed: ${action.rationale}`);
    const res: CoordinatorRunResult = {
      success: true,
      state: 'complete',
      message: action.rationale,
      sanitized,
      proposal: action,
      telemetry,
      stepCount: this.currentStep
    };
    this.lastRunResult = res;
    return res;
  }

  /**
   * Called when the user clicks 'Deny' on a protected action card.
   */
  denyPendingAction(): CoordinatorRunResult {
    const action = this.pendingAction;
    const sanitized = this.currentSanitizedContext;
    this.pendingAction = null;
    this.isCancelled = true;
    this.transition('idle', 'Action cancelled by user');
    const res: CoordinatorRunResult = {
      success: false,
      state: 'idle',
      message: 'Action cancelled by user',
      proposal: action || undefined,
      sanitized: sanitized || undefined,
      stepCount: this.currentStep
    };
    this.lastRunResult = res;
    return res;
  }
}

