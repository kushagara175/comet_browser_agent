/**
 * @privapilot/extension - On-Device Semantic Action Cache
 *
 * Provides instant edge memory for repeated page layouts, forms, and browser automation workflows.
 * Guarantees zero cloud inference latency, zero cloud API cost, and zero network transmission
 * on cache hits while safely falling back to the cloud VLM when page topology mutates.
 */
import { ActionProposal, SanitizedContext } from '@privapilot/protocol';
export interface CachedActionEntry {
    readonly key: string;
    readonly domain: string;
    readonly goal: string;
    readonly proposal: ActionProposal;
    readonly createdAt: number;
    readonly lastUsedAt: number;
    hitCount: number;
    readonly topologySignature: string;
}
export interface SemanticCacheMetrics {
    totalHits: number;
    totalMisses: number;
    tokensSavedEstimate: number;
    latencySavedMsEstimate: number;
}
export declare class SemanticActionCache {
    private static instance;
    private memoryCache;
    private metrics;
    private constructor();
    static getInstance(): SemanticActionCache;
    /**
     * Generates a stable structural fingerprint of interactive page elements.
     * If input fields, buttons, or form controls change, the signature mutates,
     * guaranteeing safe invalidation.
     */
    computeTopologySignature(sanitized: SanitizedContext): string;
    /**
     * Normalizes user intent into canonical token groups.
     */
    normalizeIntent(goal: string): string;
    /**
     * Computes the semantic cache key.
     */
    computeKey(goal: string, sanitized: SanitizedContext): string;
    /**
     * Look up a cached action plan for the current page context and goal.
     */
    get(goal: string, sanitized: SanitizedContext): ActionProposal | null;
    /**
     * Records a verified successful action into the cache.
     */
    set(goal: string, sanitized: SanitizedContext, proposal: ActionProposal): void;
    /**
     * Clears the entire semantic action cache.
     */
    clear(): void;
    /**
     * Clears all cached actions matching a specific domain or keyword.
     */
    clearDomain(domainPattern: string): void;
    /**
     * Returns live performance metrics for presentation and UI telemetry.
     */
    getMetrics(): SemanticCacheMetrics & {
        cachedEntries: number;
    };
    private persistToStorage;
    private loadFromStorage;
}
//# sourceMappingURL=semantic-action-cache.d.ts.map