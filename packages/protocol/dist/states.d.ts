/**
 * @privapilot/protocol - Agent Lifecycle States
 */
export type AgentState = 'idle' | 'capturing' | 'detecting-sensitive-content' | 'sanitizing' | 'blocked-local-only' | 'sending-sanitized-context' | 'awaiting-reasoning' | 'validating-action' | 'awaiting-user-confirmation' | 'executing' | 'verifying' | 'complete' | 'failed-safe';
export interface StateTransitionEvent {
    readonly previousState: AgentState;
    readonly currentState: AgentState;
    readonly timestamp: number;
    readonly reason?: string;
}
//# sourceMappingURL=states.d.ts.map