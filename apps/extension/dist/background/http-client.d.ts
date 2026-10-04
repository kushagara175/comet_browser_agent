/**
 * @privapilot/extension - Strict Typed HTTP Reasoning Client
 *
 * Privacy Boundary Enforcement:
 * This client ONLY accepts `SanitizedContext`.
 * It is impossible to pass `RawCapture` to this client.
 */
import { SanitizedContext, ChatHistoryMessage, ActionProposal, TaskSpecification } from '@privapilot/protocol';
export declare const DEFAULT_SERVER_BASE_URL = "http://localhost:4501";
export interface ModelStatus {
    readonly reachable: boolean;
    readonly provider?: 'ollama' | 'lm-studio' | 'vlm-cloud' | 'mock';
    readonly modelName?: string;
    readonly endpoint?: string;
    readonly modelConnected?: boolean;
    readonly detail?: string;
    readonly lastError?: string;
    /** Populated when the gateway itself could not be reached. */
    readonly error?: string;
}
export interface ChatReply {
    readonly reply: string;
    readonly reasoning?: string;
    readonly modelConnected?: boolean;
    readonly provider?: string;
    readonly modelName?: string;
    readonly detail?: string;
}
export declare class ReasoningHttpClient {
    private serverBaseUrl;
    constructor(serverBaseUrl?: string);
    getServerBaseUrl(): string;
    setServerBaseUrl(url: string): void;
    /**
     * Turns a transport failure into something the user can act on. A bare
     * "Failed to fetch" is the single most confusing symptom in this system:
     * it means the gateway is not running, not that the model refused.
     */
    private describeTransportError;
    /**
     * Bounded fetch helper wrapping AbortController with deterministic timeouts.
     */
    private fetchWithTimeout;
    /**
     * Diagnoses the two failures that look identical in the UI: the gateway being
     * down, and the gateway being up with no model backend behind it.
     */
    getModelStatus(): Promise<ModelStatus>;
    /**
     * Transmits SanitizedContext to Reasoning Server and returns one ActionProposal.
     */
    requestReasoningAction(sanitized: SanitizedContext): Promise<ActionProposal>;
    /**
     * Transmits SanitizedContext to Reasoning Stream endpoint and consumes SSE deltas in real time.
     * Delivers live thought and reply tokens to UI listeners and returns validated ActionProposal upon completion.
     */
    requestReasoningActionStream(sanitized: SanitizedContext, options?: {
        onThoughtDelta?: (text: string) => void;
        onReplyDelta?: (text: string) => void;
    }): Promise<ActionProposal>;
    /**
     * Requests dynamic task decomposition and guardrails (tasks to do & tasks NOT to do)
     * from the reasoning planner.
     */
    requestTaskSpecification(goal: string, contextUrl?: string, customPrompt?: string): Promise<TaskSpecification>;
    private normalizeTaskSpecification;
    /**
     * Transmits sanitized page-aware context projection to Chat endpoint.
     * Strictly accepts SanitizedContext only (never raw captures or URLs).
     */
    requestChat(sanitized: SanitizedContext, message: string, history?: ReadonlyArray<ChatHistoryMessage>, customPrompt?: string): Promise<ChatReply>;
    /**
     * Transmits contextless general query (zero page or browser state).
     */
    requestGeneralChat(message: string, history?: ReadonlyArray<ChatHistoryMessage>, customPrompt?: string): Promise<ChatReply>;
    /**
     * Transmits sanitized page-aware context projection to Chat stream endpoint.
     * Consumes SSE chunks in real time, delivering onThoughtDelta and onReplyDelta.
     */
    requestChatStream(sanitized: SanitizedContext, message: string, options?: {
        history?: ReadonlyArray<ChatHistoryMessage>;
        customPrompt?: string;
        onThoughtDelta?: (text: string) => void;
        onReplyDelta?: (text: string) => void;
    }): Promise<ChatReply>;
    /**
     * Transmits contextless general query to Chat stream endpoint.
     * Consumes SSE chunks in real time, delivering onThoughtDelta and onReplyDelta.
     */
    requestGeneralChatStream(message: string, options?: {
        history?: ReadonlyArray<ChatHistoryMessage>;
        customPrompt?: string;
        onThoughtDelta?: (text: string) => void;
        onReplyDelta?: (text: string) => void;
    }): Promise<ChatReply>;
    getPlatformApiTelemetry(): Promise<any>;
    generatePlatformApiKey(name?: string, tier?: string): Promise<any>;
    dispatchPlatformTask(payload: {
        goal: string;
        enableSubAgents?: boolean;
        maxParallel?: number;
        contextUrl?: string;
    }, apiKey?: string): Promise<any>;
    testPlatformApiKey(apiKey: string, goal?: string): Promise<{
        ok: boolean;
        status: number;
        latencyMs: number;
        data: any;
    }>;
    /**
     * Performs an autonomous web search via Tavily through the reasoning server gateway.
     */
    searchWeb(query: string, maxResults?: number): Promise<{
        success: boolean;
        query: string;
        answer?: string | null;
        results: Array<{
            title: string;
            url: string;
            content: string;
            score: number;
        }>;
    }>;
}
//# sourceMappingURL=http-client.d.ts.map