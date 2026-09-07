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
import { AgentState, RawCapture, SanitizedContext, ActionProposal, RunTelemetry } from '@privapilot/protocol';
import { BrowserAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient, ModelStatus } from './http-client.js';
import { AuditLogger } from './audit-logger.js';
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
    readonly runId?: string;
}
export interface CoordinatorListeners {
    onStateChange?(state: AgentState, message?: string, runId?: string): void;
    onSanitizationComplete?(raw: RawCapture, sanitized: SanitizedContext, runId?: string): void;
    onActionProposed?(action: ActionProposal, runId?: string): void;
    onActionConfirmedRequired?(action: ActionProposal, runId?: string): void;
    onTelemetryUpdated?(telemetry: RunTelemetry, runId?: string): void;
    onStepProgress?(step: number, maxSteps: number, message: string, runId?: string): void;
}
export interface E2EStepTrace {
    readonly step: number;
    readonly captureId: string;
    readonly pageGeneration: string;
    readonly maskCount: number;
    readonly sanitizedScreenshotBytes: number;
    readonly decisionOrigin: 'local' | 'server';
    readonly proposal: ActionProposal;
    readonly riskDecision: string;
    readonly confidenceDecision: string;
    readonly executed: boolean;
    readonly executionResult?: {
        readonly success: boolean;
        readonly staleTarget: boolean;
        readonly reasonCode?: string;
    };
    readonly verification?: {
        readonly verified: boolean;
        readonly reasonCode: string;
        readonly matchedCondition?: string;
        readonly durationMs: number;
    };
    readonly networkRequestMade: boolean;
    readonly timings: Record<string, number>;
}
export interface CoordinatorRunResult {
    readonly runId?: string;
    readonly success: boolean;
    readonly state: AgentState;
    readonly message?: string;
    readonly error?: string;
    readonly sanitized?: SanitizedContext;
    readonly proposal?: ActionProposal;
    readonly telemetry?: RunTelemetry;
    readonly stepCount?: number;
    readonly diagnostic?: SanitizerDiagnostic;
    readonly steps?: ReadonlyArray<E2EStepTrace>;
}
export type SanitizerFailureClass = 'OFFSCREEN_UNAVAILABLE' | 'SCREENSHOT_DECODE_FAILED' | 'CANVAS_UNAVAILABLE' | 'MASK_RENDER_FAILED' | 'MASK_VERIFICATION_FAILED' | 'DIGEST_FAILED' | 'SANITIZER_TIMEOUT' | 'UNKNOWN_SANITIZER_FAILURE';
export interface SanitizerDiagnostic {
    readonly failureClass: SanitizerFailureClass;
    readonly sanitizedDetail: string;
}
export declare function sanitizeErrorDetail(rawMessage: string): string;
export declare function classifySanitizerError(err: any): SanitizerDiagnostic;
export declare function isRestrictedBrowserUrl(urlStr?: string): {
    isRestricted: boolean;
    reason?: string;
};
export declare class RunCoordinator {
    private state;
    private readonly browser;
    private readonly httpClient;
    private readonly auditLogger;
    private readonly defaultMaxSteps;
    private readonly defaultMaxStaleRetries;
    private listeners;
    private currentGoal;
    private currentStep;
    private currentMaxSteps;
    private currentStaleRetries;
    private maxStaleRetries;
    private pendingAction;
    private currentSanitizedContext;
    private lastRunResult;
    private actionHistory;
    private t0_runStart;
    private cumulativeClientLatency;
    private cumulativeServerLatency;
    private isCancelled;
    private stepsTrace;
    private currentTaskContract;
    private currentRunId;
    constructor(browser?: BrowserAdapter, httpClient?: ReasoningHttpClient, auditLogger?: AuditLogger, options?: {
        defaultMaxSteps?: number;
        maxStaleRetries?: number;
    });
    setListeners(listeners: CoordinatorListeners): void;
    getState(): AgentState;
    getCurrentRunId(): string;
    getLastResult(): CoordinatorRunResult | null;
    private completeWithResult;
    cancelRun(): void;
    private transition;
    private recordActionHistory;
    private isRepeatedAction;
    private tryResolveLocalSafeAction;
    private verifyTerminalPostcondition;
    private createTelemetry;
    /**
     * Starts an automated bounded multi-step agent run for a specific user goal.
     */
    startRun(goal: string, options?: CoordinatorRunOptions): Promise<CoordinatorRunResult>;
    /**
     * Resumes the agent loop after a paused state or user approval.
     */
    resumeRun(): Promise<CoordinatorRunResult>;
    private executeLoop;
    /**
     * Reports whether the reasoning gateway and a model backend are reachable.
     */
    getModelStatus(): Promise<ModelStatus>;
    /**
     * Performs page-aware chat strictly across the privacy boundary.
     */
    chatWithPage(userMessage: string): Promise<ChatOutcome>;
    /**
     * Directly chats with the reasoning model without page context or perception overhead.
     */
    chatWithoutPage(userMessage: string): Promise<ChatOutcome>;
    /**
     * Contextless chat turn. Reports a real connection failure instead of claiming
     * the model is ready — that claim is what made a broken model look like a
     * working one with nothing to say.
     */
    private generalChat;
    /**
     * Called when the user clicks 'Approve' on a protected action card.
     * If resumeLoop is true, continues multi-step execution loop.
     */
    approvePendingAction(options?: {
        resumeLoop?: boolean;
    }): Promise<CoordinatorRunResult>;
    /**
     * Called when the user clicks 'Deny' on a protected action card.
     */
    denyPendingAction(): CoordinatorRunResult;
    setServerUrl(url: string): void;
}
//# sourceMappingURL=coordinator.d.ts.map