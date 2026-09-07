/**
 * @privapilot/server - Universal Local & Cloud VLM Reasoning Adapter
 *
 * Supports:
 * - Local Ollama (Native API :11434/api/chat & OpenAI API :11434/v1/chat/completions)
 * - Local LM Studio / LocalAI / vLLM (:1234/v1, :8000/v1)
 * - Cloud Open-Weight VLMs (Groq, OpenRouter, Together AI, OpenAI, Gemini)
 * - Auto-probing of local model instances with graceful fallback to MockReasoningEngine.
 *
 * Connection robustness:
 * - Probes both 127.0.0.1 and localhost. On Windows `localhost` resolves to ::1 first,
 *   while Ollama and LM Studio bind the IPv4 loopback only.
 * - Honours OLLAMA_HOST / LM_STUDIO_HOST when the backend was moved to another port.
 * - Probe and inference timeouts are generous and configurable; a cold local model
 *   routinely needs far longer than a sub-second probe to answer.
 * - A negative probe is cached only briefly, so a backend started after the gateway
 *   is picked up on the next request instead of being stuck on "mock".
 */
import { SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';
export interface VlmConfig {
    readonly endpoint?: string;
    readonly apiKey?: string;
    readonly modelName?: string;
    readonly timeoutMs?: number;
    readonly probeTimeoutMs?: number;
    /** Ollama context window. See the numCtx accessor for why the default is unusable. */
    readonly numCtx?: number;
    readonly maxTokens?: number;
}
export interface EngineStatus {
    readonly provider: 'ollama' | 'lm-studio' | 'vlm-cloud' | 'mock';
    readonly endpoint: string;
    readonly modelName: string;
    readonly isOnline: boolean;
    readonly isMultimodal: boolean;
    /** Human-readable diagnosis of how this backend was chosen, or why none was. */
    readonly detail?: string;
    /** Connection or inference errors observed while probing, if any. */
    readonly lastError?: string;
}
export interface ChatResult {
    readonly reply: string;
    readonly provider: EngineStatus['provider'];
    readonly modelName: string;
    /** True when the reply came from the offline fallback rather than a real model. */
    readonly degraded: boolean;
    readonly detail?: string;
}
/** Azure OpenAI and Azure AI Foundry use `api-key`; other OpenAI-compatible
 * providers conventionally use an OAuth-style Bearer token. */
export declare function buildProviderAuthHeaders(endpoint: string, apiKey?: string): Record<string, string>;
export declare class VlmReasoningEngine {
    private config;
    private readonly mockFallback;
    private cachedStatus;
    private lastProbeTime;
    private cloudExhaustedUntil;
    constructor(config?: VlmConfig);
    /** Forces the next getStatus() call to re-probe every backend. */
    invalidateStatusCache(): void;
    private get inferenceTimeoutMs();
    private get maxTokens();
    /**
     * Ollama context window. Its default (2048-4096) is far too small once a
     * screenshot is attached: Qwen2.5-VL turns a 1280x800 capture into thousands of
     * vision tokens, and Ollama SILENTLY TRUNCATES the prompt rather than erroring.
     * The model then reasons over a partial element list and returns schema-invalid
     * output, which looks like a model quality problem but is a configuration one.
     * Only applies to Ollama; hosted OpenAI-compatible endpoints manage their own.
     */
    private get numCtx();
    private get probeTimeoutMs();
    private ollamaOrigins;
    private lmStudioOrigins;
    /**
     * Probes active local or remote model backends.
     */
    getStatus(): Promise<EngineStatus>;
    /**
     * Sanitized conversational turn. Never throws: a backend failure degrades to an
     * explanatory offline reply rather than surfacing a 500 to the extension.
     */
    chat(systemPrompt: string, userMessage: string): Promise<ChatResult>;
    private buildOfflineReply;
    private chatViaOllama;
    private chatViaOpenAICompatible;
    /**
     * Main reasoning invocation. Returns schema-valid ActionProposal.
     */
    decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal>;
    /**
     * Deterministic offline proposal, validated against the same closed schema.
     */
    private mockProposal;
    /**
     * Handles Ollama native format (/api/chat) with at most one schema-repair attempt.
     */
    private callOllama;
    /**
     * Handles standard OpenAI-compatible format (/v1/chat/completions) with at most one schema-repair attempt.
     */
    private callOpenAICompatible;
    /**
     * Extracts and validates an ActionProposal from raw model output string.
     */
    private parseActionProposal;
    private buildSystemPrompt;
    private buildUserPrompt;
    private isLocalAddress;
    /**
     * Bounded fetch. Reports an abort as a timeout and a transport failure by its
     * OS error code, so probe diagnostics say what actually happened instead of
     * the opaque "fetch failed".
     */
    private fetchWithTimeout;
    private fetchJson;
    private pingEndpoint;
    private safeErrorText;
}
//# sourceMappingURL=vlm-engine.d.ts.map