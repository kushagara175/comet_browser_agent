/**
 * @privapilot/server - Deterministic Offline Reasoning Engine
 *
 * Provides instant, zero-dependency reasoning over sanitized layout for tests and offline demos.
 */
import { SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';
export declare class MockReasoningEngine {
    decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal>;
    private computeAction;
}
//# sourceMappingURL=mock-engine.d.ts.map