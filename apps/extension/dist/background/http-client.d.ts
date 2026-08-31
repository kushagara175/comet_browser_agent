/**
 * @privapilot/extension - Strict Typed HTTP Reasoning Client
 *
 * Privacy Boundary Enforcement:
 * This client ONLY accepts `SanitizedContext`.
 * It is impossible to pass `RawCapture` to this client.
 */
import { SanitizedContext, ActionProposal } from '@privapilot/protocol';
export declare class ReasoningHttpClient {
    private readonly serverBaseUrl;
    constructor(serverBaseUrl?: string);
    /**
     * Bounded fetch helper wrapping AbortController with deterministic timeouts.
     */
    private fetchWithTimeout;
    /**
     * Transmits SanitizedContext to Reasoning Server and returns one ActionProposal.
     */
    requestReasoningAction(sanitized: SanitizedContext): Promise<ActionProposal>;
    /**
     * Transmits sanitized page-aware context projection to Chat endpoint.
     * Strictly accepts SanitizedContext only (never raw captures or URLs).
     */
    requestChat(sanitized: SanitizedContext, message: string): Promise<{
        reply: string;
    }>;
    /**
     * Transmits contextless general query (zero page or browser state).
     */
    requestGeneralChat(message: string): Promise<{
        reply: string;
    }>;
}
//# sourceMappingURL=http-client.d.ts.map