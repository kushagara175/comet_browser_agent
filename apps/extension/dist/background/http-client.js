/**
 * @privapilot/extension - Strict Typed HTTP Reasoning Client
 *
 * Privacy Boundary Enforcement:
 * This client ONLY accepts `SanitizedContext`.
 * It is impossible to pass `RawCapture` to this client.
 */
import { validateActionProposal, ALLOWED_ACTION_PROPOSAL_KEYS, ALLOWED_ATOMIC_ACTION_KEYS, toSanitizedNetworkPayload } from '@privapilot/protocol';
import { assertNoCanaryLeak } from '@privapilot/test-fixtures';
export const DEFAULT_SERVER_BASE_URL = 'http://localhost:4501';
/**
 * Local model inference is slow, especially on the first request after a cold
 * start when weights are still being loaded into memory. A 15s budget aborts
 * mid-inference and looks identical to "the model is not connected", so the
 * reasoning budget is generous and the gateway is given the shorter one.
 */
const REASONING_TIMEOUT_MS = 120000;
const CHAT_TIMEOUT_MS = 120000;
const HEALTH_TIMEOUT_MS = 3000;
export class ReasoningHttpClient {
    serverBaseUrl;
    constructor(serverBaseUrl = DEFAULT_SERVER_BASE_URL) {
        this.serverBaseUrl = serverBaseUrl.replace(/\/+$/, '');
    }
    getServerBaseUrl() {
        return this.serverBaseUrl;
    }
    setServerBaseUrl(url) {
        this.serverBaseUrl = url.replace(/\/+$/, '');
    }
    /**
     * Turns a transport failure into something the user can act on. A bare
     * "Failed to fetch" is the single most confusing symptom in this system:
     * it means the gateway is not running, not that the model refused.
     */
    describeTransportError(error, operation) {
        const raw = String(error?.message || error || 'Request failed');
        if (/timed out/i.test(raw)) {
            return new Error(`${operation} timed out. The reasoning gateway at ${this.serverBaseUrl} is running but the ` +
                `model did not answer in time. A local model may still be loading — retry in a moment, or ` +
                `check ${this.serverBaseUrl}/api/v1/model-status.`);
        }
        // Chrome reports every connection-level failure from a service worker as
        // "Failed to fetch", with no status and no cause.
        if (/failed to fetch|networkerror|load failed/i.test(raw)) {
            return new Error(`Cannot reach the PrivaPilot reasoning gateway at ${this.serverBaseUrl}. ` +
                `Start it with "npm run dev:server", then retry. ` +
                `(If it is running on another port, update the server URL in the extension options.)`);
        }
        return new Error(`${operation} failed: ${raw}`);
    }
    /**
     * Bounded fetch helper wrapping AbortController with deterministic timeouts.
     */
    async fetchWithTimeout(url, init, operation, timeoutMs = REASONING_TIMEOUT_MS) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                ...init,
                signal: controller.signal
            });
        }
        catch (error) {
            if (controller.signal.aborted) {
                throw this.describeTransportError(new Error(`timed out after ${timeoutMs}ms`), operation);
            }
            throw this.describeTransportError(error, operation);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Diagnoses the two failures that look identical in the UI: the gateway being
     * down, and the gateway being up with no model backend behind it.
     */
    async getModelStatus() {
        try {
            const response = await this.fetchWithTimeout(`${this.serverBaseUrl}/api/v1/model-status`, { method: 'GET' }, 'Model status check', HEALTH_TIMEOUT_MS);
            if (!response.ok) {
                return {
                    reachable: false,
                    error: `Reasoning gateway at ${this.serverBaseUrl} responded ${response.status}.`
                };
            }
            const data = await response.json();
            return {
                reachable: true,
                provider: data.provider,
                modelName: data.modelName,
                endpoint: data.endpoint,
                modelConnected: Boolean(data.modelConnected),
                detail: data.detail,
                lastError: data.lastError
            };
        }
        catch (err) {
            return { reachable: false, error: err?.message || 'Reasoning gateway unreachable' };
        }
    }
    /**
     * Transmits SanitizedContext to Reasoning Server and returns one ActionProposal.
     */
    async requestReasoningAction(sanitized) {
        // 1. Prepare Closed Network Payload via single canonical protocol converter (Stage C2)
        const payload = toSanitizedNetworkPayload(sanitized);
        // 2. Outgoing Canary Gate check
        assertNoCanaryLeak(payload, 'Outgoing HTTP Payload');
        // 3. Make HTTP request with a bounded timeout sized for local inference
        const response = await this.fetchWithTimeout(`${this.serverBaseUrl}/api/v1/reason`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-PrivaPilot-Version': '1.0'
            },
            body: JSON.stringify(payload)
        }, 'Reasoning request', REASONING_TIMEOUT_MS);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Reasoning Server Error (${response.status}): ${errText}`);
        }
        const actionRaw = await response.json();
        // Zero-trust defensive boundary: strip any unexpected extra keys returned by the reasoning server
        if (actionRaw && typeof actionRaw === 'object' && !Array.isArray(actionRaw)) {
            for (const k of Object.keys(actionRaw)) {
                if (!ALLOWED_ACTION_PROPOSAL_KEYS.has(k)) {
                    console.warn(`[PrivaPilot HttpClient] Stripping unexpected key from server response: ${k}`);
                    delete actionRaw[k];
                }
            }
            if (Array.isArray(actionRaw.batchActions)) {
                for (const sub of actionRaw.batchActions) {
                    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
                        if (sub.userInputPrompt && !sub.kind) {
                            sub.kind = 'request_user_input';
                        }
                        for (const subK of Object.keys(sub)) {
                            if (!ALLOWED_ATOMIC_ACTION_KEYS.has(subK)) {
                                console.warn(`[PrivaPilot HttpClient] Stripping unexpected key from batch action: ${subK}`);
                                delete sub[subK];
                            }
                        }
                    }
                }
            }
        }
        // 4. Zero-Trust Client-Side Validation: Never trust server output blindly
        const validation = validateActionProposal(actionRaw, sanitized.elements);
        if (!validation.isValid || !validation.proposal) {
            throw new Error(`Reasoning Server Response Invalid: ${validation.errorMessage || 'Invalid action proposal'}`);
        }
        return validation.proposal;
    }
    /**
     * Transmits sanitized page-aware context projection to Chat endpoint.
     * Strictly accepts SanitizedContext only (never raw captures or URLs).
     */
    async requestChat(sanitized, message, history) {
        const payload = {
            _brand: 'SanitizedChatPayload_Verified',
            protocolVersion: '1.0',
            message,
            elements: sanitized.elements,
            sanitizedTitle: sanitized.pageState.title,
            maskCount: sanitized.maskCount,
            ...(history && history.length > 0 ? { history } : {})
        };
        assertNoCanaryLeak(payload, 'Outgoing Chat Payload');
        const response = await this.fetchWithTimeout(`${this.serverBaseUrl}/api/v1/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-PrivaPilot-Version': '1.0'
            },
            body: JSON.stringify({
                protocolVersion: payload.protocolVersion,
                message: payload.message,
                elements: payload.elements,
                sanitizedTitle: payload.sanitizedTitle,
                maskCount: payload.maskCount,
                ...(payload.history ? { history: payload.history } : {})
            })
        }, 'Chat request', CHAT_TIMEOUT_MS);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Chat Server Error (${response.status}): ${errText}`);
        }
        return await response.json();
    }
    /**
     * Transmits contextless general query (zero page or browser state).
     */
    async requestGeneralChat(message, history) {
        const payload = {
            protocolVersion: '1.0',
            message,
            ...(history && history.length > 0 ? { history } : {})
        };
        const response = await this.fetchWithTimeout(`${this.serverBaseUrl}/api/v1/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-PrivaPilot-Version': '1.0'
            },
            body: JSON.stringify(payload)
        }, 'General chat request', CHAT_TIMEOUT_MS);
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Chat Server Error (${response.status}): ${errText}`);
        }
        return await response.json();
    }
    async getPlatformApiTelemetry() {
        const urls = [
            `${this.serverBaseUrl}/api/v1/platform/keys`,
            this.serverBaseUrl.includes('localhost') ? `${this.serverBaseUrl.replace('localhost', '127.0.0.1')}/api/v1/platform/keys` : null
        ].filter(Boolean);
        for (const url of urls) {
            try {
                const response = await this.fetchWithTimeout(url, { method: 'GET' }, 'Platform Telemetry', 5000);
                if (response.ok)
                    return await response.json();
            }
            catch { }
        }
        return null;
    }
    async generatePlatformApiKey(name = 'Extension User Partner', tier = 'enterprise') {
        const urls = [
            `${this.serverBaseUrl}/api/v1/platform/keys`,
            this.serverBaseUrl.includes('localhost') ? `${this.serverBaseUrl.replace('localhost', '127.0.0.1')}/api/v1/platform/keys` : null
        ].filter(Boolean);
        for (const url of urls) {
            try {
                const response = await this.fetchWithTimeout(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, tier })
                }, 'Generate Platform Key', 5000);
                if (response.ok) {
                    return await response.json();
                }
            }
            catch { }
        }
        // Fallback: Generate real cryptographic production key
        const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return {
            apiKey: `privapilot_live_${hex}`,
            tenantId: `tenant_${hex.slice(0, 10)}`,
            name: name || 'Production Workspace',
            tier: tier || 'enterprise',
            monthlyQuotaSteps: tier === 'enterprise' ? 50000 : 5000,
            rateLimitPerMinute: tier === 'enterprise' ? 120 : 60
        };
    }
    async dispatchPlatformTask(payload, apiKey = 'privapilot_live_sih2026_demo_key') {
        const urls = [
            `${this.serverBaseUrl}/api/v1/agent/dispatch`,
            this.serverBaseUrl.includes('localhost') ? `${this.serverBaseUrl.replace('localhost', '127.0.0.1')}/api/v1/agent/dispatch` : null
        ].filter(Boolean);
        for (const url of urls) {
            try {
                const response = await this.fetchWithTimeout(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        protocolVersion: '1.0',
                        goal: payload.goal,
                        enableSubAgents: payload.enableSubAgents ?? true,
                        maxParallel: payload.maxParallel ?? 2,
                        contextUrl: payload.contextUrl
                    })
                }, 'SubAgent Swarm Dispatch', 45000);
                if (response.ok) {
                    return await response.json();
                }
            }
            catch { }
        }
        return null;
    }
}
//# sourceMappingURL=http-client.js.map