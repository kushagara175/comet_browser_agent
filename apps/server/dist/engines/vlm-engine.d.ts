/**
 * @privapilot/server - Universal Local & Cloud VLM Reasoning Adapter
 *
 * Supports:
 * - Local Ollama (Native API :11434/api/chat & OpenAI API :11434/v1/chat/completions)
 * - Local LM Studio / LocalAI / vLLM (:1234/v1, :8000/v1)
 * - Cloud Open-Weight VLMs (Groq, OpenRouter, Together AI, OpenAI, Gemini)
 * - Auto-probing of local model instances with graceful fallback to MockReasoningEngine.
 */
import { SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';
export interface VlmConfig {
    readonly endpoint?: string;
    readonly apiKey?: string;
    readonly modelName?: string;
    readonly timeoutMs?: number;
}
export interface EngineStatus {
    readonly provider: 'ollama' | 'lm-studio' | 'vlm-cloud' | 'mock';
    readonly endpoint: string;
    readonly modelName: string;
    readonly isOnline: boolean;
    readonly isMultimodal: boolean;
}
export declare class VlmReasoningEngine {
    private config;
    private readonly mockFallback;
    private cachedStatus;
    private lastProbeTime;
    constructor(config?: VlmConfig);
    /**
     * Probes active local or remote model backends.
     */
    getStatus(): Promise<EngineStatus>;
    /**
     * Main reasoning invocation. Returns schema-valid ActionProposal.
     */
    decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal>;
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
    private pingEndpoint;
}
//# sourceMappingURL=vlm-engine.d.ts.map