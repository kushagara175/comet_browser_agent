/**
 * @privapilot/server - Multi-Tenant API Key Manager & Rate Limiter
 *
 * Implements:
 * 1. Bearer / x-api-key authentication for third-party agents and developers
 * 2. Usage tracking, remaining step quotas, and per-minute rate-limiting
 * 3. Seeded default keys for instant hackathon evaluation and development
 */
import http from 'node:http';
export interface TenantInfo {
    readonly tenantId: string;
    readonly name: string;
    readonly tier: 'developer' | 'enterprise';
    readonly rateLimitPerMinute: number;
    readonly monthlyQuotaSteps: number;
    remainingSteps: number;
    active: boolean;
    readonly createdAt: number;
    lastUsedAt?: number;
}
export interface ApiKeyValidationResult {
    readonly valid: boolean;
    readonly tenant?: TenantInfo;
    readonly error?: string;
    readonly statusCode?: number;
}
export interface ApiRequestLog {
    readonly id: string;
    readonly timestamp: number;
    readonly tenantId: string;
    readonly apiKeyMasked: string;
    readonly endpoint: string;
    readonly method: string;
    readonly status: number;
    readonly goalSnippet?: string;
    readonly durationMs?: number;
}
export declare class ApiKeyManager {
    private static instance;
    private readonly tenants;
    private readonly rateLimitCounters;
    private readonly requestLogs;
    private totalRequests;
    static readonly DEFAULT_DEMO_KEY = "comet_live_sih2026_demo_key";
    constructor();
    static getInstance(): ApiKeyManager;
    private seedDefaultTenants;
    /**
     * Extracts API key from Authorization header ("Bearer <key>") or "x-api-key"
     */
    extractKey(headers: http.IncomingHttpHeaders): string | null;
    /**
     * Validates API key, checks active status, rate limit, and step quota.
     */
    validate(rawKey: string | null | undefined): ApiKeyValidationResult;
    /**
     * Deducts executed steps from tenant balance.
     */
    recordStepUsage(apiKey: string, steps: number): boolean;
    /**
     * Creates a new live or test API key for an external tenant.
     */
    createKey(name: string, tier?: 'developer' | 'enterprise'): {
        apiKey: string;
        tenant: TenantInfo;
    };
    /**
     * Revokes an existing API key.
     */
    revokeKey(apiKey: string): boolean;
    /**
     * Records a request into the live developer telemetry stream.
     */
    recordRequest(entry: {
        tenantId: string;
        apiKey: string;
        endpoint: string;
        method: string;
        status: number;
        goalSnippet?: string;
        durationMs?: number;
    }): void;
    /**
     * Returns recent request logs for the developer dashboard.
     */
    getRecentRequests(limit?: number): ApiRequestLog[];
    /**
     * Returns aggregated platform telemetry for the extension dashboard.
     */
    getPlatformTelemetry(): {
        totalRequests: number;
        activeTenants: number;
        tenants: TenantInfo[];
        recentLogs: ApiRequestLog[];
    };
    /**
     * Returns tenant statistics for developer telemetry.
     */
    getTenant(apiKey: string): TenantInfo | null;
}
//# sourceMappingURL=api-key-manager.d.ts.map