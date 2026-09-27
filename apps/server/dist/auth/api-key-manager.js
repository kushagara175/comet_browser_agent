/**
 * @privapilot/server - Multi-Tenant API Key Manager & Rate Limiter
 *
 * Implements:
 * 1. Bearer / x-api-key authentication for third-party agents and developers
 * 2. Usage tracking, remaining step quotas, and per-minute rate-limiting
 * 3. Seeded default keys for instant hackathon evaluation and development
 */
import crypto from 'node:crypto';
export class ApiKeyManager {
    static instance = null;
    tenants = new Map(); // key: apiKey -> TenantInfo
    rateLimitCounters = new Map();
    requestLogs = [];
    totalRequests = 0;
    static DEFAULT_DEMO_KEY = 'comet_live_sih2026_demo_key';
    constructor() {
        this.seedDefaultTenants();
    }
    static getInstance() {
        if (!ApiKeyManager.instance) {
            ApiKeyManager.instance = new ApiKeyManager();
        }
        return ApiKeyManager.instance;
    }
    seedDefaultTenants() {
        // 1. Default Comet SIH Evaluation & Dev Demo Key
        this.tenants.set(ApiKeyManager.DEFAULT_DEMO_KEY, {
            tenantId: 'tenant_sih_demo_01',
            name: 'ISRO / SIH Evaluation Demo Tenant',
            tier: 'enterprise',
            rateLimitPerMinute: 120,
            monthlyQuotaSteps: 50_000,
            remainingSteps: 49_800,
            active: true,
            createdAt: Date.now()
        });
        // 1b. Legacy Demo Key backwards compatibility
        this.tenants.set('privapilot_live_sih2026_demo_key', {
            tenantId: 'tenant_sih_demo_01',
            name: 'ISRO / SIH Evaluation Demo Tenant (Legacy)',
            tier: 'enterprise',
            rateLimitPerMinute: 120,
            monthlyQuotaSteps: 50_000,
            remainingSteps: 49_800,
            active: true,
            createdAt: Date.now()
        });
        // 2. Default Sandbox Test Key
        this.tenants.set('comet_test_sandbox_key', {
            tenantId: 'tenant_sandbox_test',
            name: 'Developer Sandbox Environment',
            tier: 'developer',
            rateLimitPerMinute: 60,
            monthlyQuotaSteps: 5_000,
            remainingSteps: 5_000,
            active: true,
            createdAt: Date.now()
        });
        this.tenants.set('privapilot_test_sandbox_key', {
            tenantId: 'tenant_sandbox_test',
            name: 'Developer Sandbox Environment (Legacy)',
            tier: 'developer',
            rateLimitPerMinute: 60,
            monthlyQuotaSteps: 5_000,
            remainingSteps: 5_000,
            active: true,
            createdAt: Date.now()
        });
    }
    /**
     * Extracts API key from Authorization header ("Bearer <key>") or "x-api-key"
     */
    extractKey(headers) {
        const authHeader = headers['authorization'];
        if (typeof authHeader === 'string') {
            const parts = authHeader.trim().split(/\s+/);
            if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
                return parts[1];
            }
        }
        const xApiKey = headers['x-api-key'];
        if (typeof xApiKey === 'string' && xApiKey.trim()) {
            return xApiKey.trim();
        }
        return null;
    }
    /**
     * Validates API key, checks active status, rate limit, and step quota.
     */
    validate(rawKey) {
        if (!rawKey || typeof rawKey !== 'string') {
            return {
                valid: false,
                error: 'Missing API key. Provide Authorization: Bearer <comet_key> or x-api-key header.',
                statusCode: 401
            };
        }
        const key = rawKey.trim();
        let tenant = this.tenants.get(key);
        if (!tenant && /^(?:comet|privapilot)_live_[a-f0-9]{32}$/i.test(key)) {
            const livePrefixIdx = key.indexOf('_live_');
            const hexStart = livePrefixIdx !== -1 ? livePrefixIdx + 6 : 11;
            tenant = {
                tenantId: `tenant_${key.slice(hexStart, hexStart + 10)}`,
                name: 'Production Workspace Tenant',
                tier: 'enterprise',
                rateLimitPerMinute: 120,
                monthlyQuotaSteps: 50_000,
                remainingSteps: 50_000,
                active: true,
                createdAt: Date.now()
            };
            this.tenants.set(key, tenant);
        }
        if (!tenant) {
            return {
                valid: false,
                error: 'Invalid API key. Check your Comet API key or issue a new key at POST /api/v1/platform/keys.',
                statusCode: 401
            };
        }
        if (!tenant.active) {
            return {
                valid: false,
                error: 'Tenant API key has been revoked or suspended.',
                statusCode: 403
            };
        }
        if (tenant.remainingSteps <= 0) {
            return {
                valid: false,
                error: 'Tenant step quota exhausted. Upgrade your tier or contact support.',
                statusCode: 429
            };
        }
        // Rate Limiting (sliding 60-second window)
        const now = Date.now();
        const limiter = this.rateLimitCounters.get(rawKey) || { count: 0, windowStart: now };
        if (now - limiter.windowStart > 60_000) {
            limiter.count = 1;
            limiter.windowStart = now;
        }
        else {
            limiter.count += 1;
            if (limiter.count > tenant.rateLimitPerMinute) {
                return {
                    valid: false,
                    error: `Rate limit exceeded (${tenant.rateLimitPerMinute} req/min). Please back off.`,
                    statusCode: 429
                };
            }
        }
        this.rateLimitCounters.set(rawKey, limiter);
        tenant.lastUsedAt = now;
        return { valid: true, tenant };
    }
    /**
     * Deducts executed steps from tenant balance.
     */
    recordStepUsage(apiKey, steps) {
        const tenant = this.tenants.get(apiKey);
        if (!tenant)
            return false;
        tenant.remainingSteps = Math.max(0, tenant.remainingSteps - steps);
        return true;
    }
    /**
     * Creates a new live or test API key for an external tenant.
     */
    createKey(name, tier = 'developer') {
        const randomBytes = crypto.randomBytes(16).toString('hex');
        const apiKey = `comet_live_${randomBytes}`;
        const tenantId = `tenant_${crypto.randomBytes(8).toString('hex')}`;
        const tenant = {
            tenantId,
            name: name.trim() || 'Unnamed External Tenant',
            tier,
            rateLimitPerMinute: tier === 'enterprise' ? 120 : 45,
            monthlyQuotaSteps: tier === 'enterprise' ? 50_000 : 2_500,
            remainingSteps: tier === 'enterprise' ? 50_000 : 2_500,
            active: true,
            createdAt: Date.now()
        };
        this.tenants.set(apiKey, tenant);
        return { apiKey, tenant };
    }
    /**
     * Revokes an existing API key.
     */
    revokeKey(apiKey) {
        const tenant = this.tenants.get(apiKey);
        if (!tenant)
            return false;
        tenant.active = false;
        return true;
    }
    /**
     * Records a request into the live developer telemetry stream.
     */
    recordRequest(entry) {
        this.totalRequests++;
        const apiKeyMasked = entry.apiKey.length > 18
            ? `${entry.apiKey.slice(0, 15)}...${entry.apiKey.slice(-4)}`
            : 'comet_***';
        const log = {
            id: `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            timestamp: Date.now(),
            tenantId: entry.tenantId,
            apiKeyMasked,
            endpoint: entry.endpoint,
            method: entry.method,
            status: entry.status,
            goalSnippet: entry.goalSnippet ? entry.goalSnippet.slice(0, 80) : undefined,
            durationMs: entry.durationMs
        };
        this.requestLogs.unshift(log);
        if (this.requestLogs.length > 50) {
            this.requestLogs.pop();
        }
    }
    /**
     * Returns recent request logs for the developer dashboard.
     */
    getRecentRequests(limit = 20) {
        return this.requestLogs.slice(0, limit);
    }
    /**
     * Returns aggregated platform telemetry for the extension dashboard.
     */
    getPlatformTelemetry() {
        const activeTenants = Array.from(this.tenants.values()).filter((t) => t.active);
        return {
            totalRequests: this.totalRequests,
            activeTenants: activeTenants.length,
            tenants: activeTenants,
            recentLogs: this.getRecentRequests(15)
        };
    }
    /**
     * Returns tenant statistics for developer telemetry.
     */
    getTenant(apiKey) {
        return this.tenants.get(apiKey) || null;
    }
}
//# sourceMappingURL=api-key-manager.js.map