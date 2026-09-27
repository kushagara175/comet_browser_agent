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
import { AgentState, RawCapture, SanitizedContext, SanitizedElement, ActionProposal, ChatHistoryMessage, RunTelemetry } from '@privapilot/protocol';
import { BrowserAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient, ModelStatus } from './http-client.js';
import { AuditLogger } from './audit-logger.js';
/** Only sanitized names are available here; no href, placeholder or DOM class survives sanitization. */
export declare function enforceIsroMissionProgression(goal: string, url: string, elements: readonly SanitizedElement[], proposal: ActionProposal): {
    proposal?: ActionProposal;
    error?: string;
};
export interface ChatOutcome {
    readonly success: boolean;
    readonly reply: string;
    readonly reasoning?: string;
    readonly maskCount: number;
    readonly elementCount: number;
    /** False when the gateway answered from its offline reasoner, or not at all. */
    readonly modelConnected?: boolean;
    readonly isSubAgentSwarm?: boolean;
    readonly subTasks?: ReadonlyArray<any>;
}
export interface CoordinatorRunOptions {
    readonly maxSteps?: number;
    readonly maxStaleRetries?: number;
    readonly runId?: string;
    readonly tabId?: number;
    readonly history?: ReadonlyArray<{
        readonly role: 'user' | 'assistant';
        readonly content: string;
    }>;
    readonly customPrompt?: string;
    readonly agentId?: string;
    readonly agentName?: string;
}
export interface CoordinatorListeners {
    onStateChange?(state: AgentState, message?: string, runId?: string): void;
    onSanitizationComplete?(raw: RawCapture, sanitized: SanitizedContext, runId?: string): void;
    onActionProposed?(action: ActionProposal, runId?: string): void;
    onActionConfirmedRequired?(action: ActionProposal, runId?: string): void;
    onUserInputRequired?(request: {
        kind: 'credentials' | 'text_input' | 'clarification';
        prompt: string;
        targetLocalId?: string;
        inputKey?: string;
        runId?: string;
    }): void;
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
    readonly reply?: string;
    readonly error?: string;
    readonly reasoning?: string;
    readonly isSubAgentSwarm?: boolean;
    readonly subTasks?: ReadonlyArray<any>;
    readonly sanitized?: SanitizedContext;
    readonly proposal?: ActionProposal;
    readonly telemetry?: RunTelemetry;
    readonly stepCount?: number;
    readonly diagnostic?: SanitizerDiagnostic;
    readonly steps?: ReadonlyArray<E2EStepTrace>;
    readonly inputRequest?: {
        kind: 'credentials' | 'text_input' | 'clarification';
        prompt: string;
        targetLocalId?: string;
        inputKey?: string;
        runId?: string;
    };
}
export type SanitizerFailureClass = 'OFFSCREEN_UNAVAILABLE' | 'SCREENSHOT_DECODE_FAILED' | 'CANVAS_UNAVAILABLE' | 'MASK_RENDER_FAILED' | 'MASK_VERIFICATION_FAILED' | 'DIGEST_FAILED' | 'SANITIZER_TIMEOUT' | 'UNKNOWN_SANITIZER_FAILURE';
export interface SanitizerDiagnostic {
    readonly failureClass: SanitizerFailureClass;
    readonly sanitizedDetail: string;
}
export declare function sanitizeErrorDetail(rawMessage: string): string;
/**
 * Detects whether an execution error was caused by normal browser page navigation,
 * bfcache transitions, or content script port reconnections.
 */
export declare function isDisconnectOrNavigationError(err: any): boolean;
export declare function classifySanitizerError(err: any): SanitizerDiagnostic;
export declare function isRestrictedBrowserUrl(urlStr?: string): {
    isRestricted: boolean;
    reason?: string;
};
export declare const AIRPORT_CODES: Record<string, string>;
export declare function isSubAgentSwarmGoal(goal: string): boolean;
/**
 * Helper to normalize elements from raw or sanitized DOM snapshots
 */
export declare function getSnapshotElements(snap: any): any[];
/**
 * Dedicated flight element finders for robust, error-free DOM interaction across IndiGo, Air India, etc.
 */
export declare function findFlightOriginElement(elements: readonly any[]): any | null;
export declare function findFlightDestinationElement(elements: readonly any[], originLocalId?: string): any | null;
export declare function findFlightSearchButton(elements: readonly any[]): any | null;
export declare function findAirportSuggestion(elements: readonly any[], city: string, airportCode: string, excludeIds?: string[]): any | null;
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
    private lastStaleTargetId;
    private pendingAction;
    private pendingInputRequest;
    private currentSanitizedContext;
    private lastActionProposal;
    private lastRunResult;
    private actionHistory;
    private t0_runStart;
    private cumulativeClientLatency;
    private cumulativeServerLatency;
    private isCancelled;
    private stepsTrace;
    private currentTaskContract;
    private currentRunId;
    private currentTabId?;
    private lastGoal;
    private conversationHistory;
    private currentCustomPrompt?;
    private currentExecutionFeedback?;
    private currentTaskSpec?;
    private objectiveProgress?;
    private recentActionHistory;
    private previousSnapshot;
    private previousUrl;
    private lastExecutedProposal;
    private lastExecutionResult;
    private hasTavilyRecovered;
    private autofilledTargets;
    private sessionWebSearchCache;
    private readonly options;
    constructor(browser?: BrowserAdapter, httpClient?: ReasoningHttpClient, auditLogger?: AuditLogger, options?: {
        defaultMaxSteps?: number;
        maxStaleRetries?: number;
        enableLegacyPlaybooks?: boolean;
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
    private getSearchQuery;
    private tryResolveLocalSafeAction;
    private isXBookmarkGoal;
    private verifyTerminalPostcondition;
    private createTelemetry;
    private getSemanticCacheContext;
    /**
     * Starts an automated bounded multi-step agent run for a specific user goal.
     */
    startRun(goal: string, options?: CoordinatorRunOptions): Promise<CoordinatorRunResult>;
    private executeLoop;
    /**
     * Reports whether the reasoning gateway and a model backend are reachable.
     */
    getModelStatus(): Promise<ModelStatus>;
    getPlatformApiTelemetry(): Promise<any>;
    generatePlatformApiKey(name?: string, tier?: string): Promise<any>;
    /**
     * Drives visual browser interaction on a designated tab for a sub-agent worker.
     * Performs real DOM inspection, form typing / search submission, and live result extraction.
     */
    private driveSubAgentOnTab;
    /**
     * Dispatches a multi-target or comparative goal to the backend Sub-Agent Swarm Orchestrator.
     * Runs parallel browser agents in isolated contexts with live visual DOM driving and produces synthesized comparison.
     */
    dispatchSubAgentSwarm(goal: string): Promise<CoordinatorRunResult>;
    /**
     * Performs page-aware chat strictly across the privacy boundary.
     */
    chatWithPage(userMessage: string, history?: ReadonlyArray<ChatHistoryMessage>, customPrompt?: string): Promise<ChatOutcome>;
    /**
     * Directly chats with the reasoning model without page context or perception overhead.
     */
    chatWithoutPage(userMessage: string, history?: ReadonlyArray<ChatHistoryMessage>, customPrompt?: string): Promise<ChatOutcome>;
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
        runId?: string;
        actionId?: string;
    }): Promise<CoordinatorRunResult>;
    /**
     * Called when the user clicks 'Deny' on a protected action card.
     */
    denyPendingAction(options?: {
        runId?: string;
        actionId?: string;
    }): CoordinatorRunResult;
    /**
     * Safely fills user-provided credentials or text into the active tab's form inputs locally
     * without transmitting raw credentials across the network.
     */
    submitUserInput(inputs: {
        username?: string;
        password?: string;
        customText?: string;
    }, targetTabId?: number, options?: {
        resumeLoop?: boolean;
        targetLocalId?: string;
        saveToVault?: boolean;
        inputKey?: string;
        runId?: string;
    }): Promise<CoordinatorRunResult>;
    /**
     * Performs an autonomous web search using the configured Tavily client.
     */
    searchWeb(query: string, maxResults?: number): Promise<any>;
    setServerUrl(url: string): void;
}
//# sourceMappingURL=coordinator.d.ts.map