/**
 * @privapilot/server - Main HTTP Reasoning Server
 *
 * Implements:
 * - GET /health
 * - GET /api/v1/model-status   (live model-backend diagnosis for the extension)
 * - POST /api/v1/reason
 * - POST /api/v1/chat
 */
import http from 'node:http';
import { validateSanitizedPayload, validateSanitizedChatPayload, validatePlatformTaskRequest, validatePlanRequest, validateSynthesizeRequest } from './schemas/payload-validator.js';
import { VlmReasoningEngine } from './engines/vlm-engine.js';
import { ApiKeyManager } from './auth/api-key-manager.js';
import { SubAgentOrchestrator } from './engines/subagent-orchestrator.js';
import { CanaryScannerProxy } from './proxy/canary-scanner.js';
import { ALLOWED_ACTION_PROPOSAL_KEYS } from '@privapilot/protocol';
const PORT = parseInt(process.env.PORT || '4501', 10);
const engine = new VlmReasoningEngine({
    endpoint: process.env.VLM_ENDPOINT,
    apiKey: process.env.VLM_API_KEY,
    modelName: process.env.VLM_MODEL
});
const apiKeyManager = ApiKeyManager.getInstance();
const orchestrator = SubAgentOrchestrator.getInstance(engine);
export function createServer() {
    const server = http.createServer(async (req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PrivaPilot-Version');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = req.url || '/';
        // 1. Healthcheck & Root Dashboard
        if (req.method === 'GET' && (url === '/health' || url === '/')) {
            const engineStatus = await engine.getStatus();
            // If browser request on '/', return a friendly HTML status page
            if (url === '/' && req.headers['accept']?.includes('text/html')) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>PrivaPilot Reasoning Server (:${PORT})</title>
              <style>
                body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
                .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; }
                h1 { font-size: 20px; color: #38bdf8; margin-top: 0; }
                p { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
                .pill { display: inline-block; background: #065f46; color: #6ee7b7; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 12px; }
                .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 10px; }
                .btn:hover { background: #1d4ed8; }
                pre { background: #0f172a; padding: 12px; border-radius: 8px; font-size: 12px; color: #94a3b8; overflow-x: auto; white-space: pre-wrap; }
                .warn { color: #fbbf24; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🛡️ PrivaPilot Reasoning Server (:${PORT})</h1>
                <p><span class="pill">🟢 Server Active</span> &nbsp; Model: <strong>${engineStatus.modelName}</strong> (${engineStatus.provider})</p>
                ${engineStatus.provider === 'mock' || !engineStatus.isOnline
                    ? `<p class="warn"><strong>⚠ No model backend connected.</strong> Requests are answered by the
                       deterministic offline reasoner. ${engineStatus.detail || ''}</p>
                     ${engineStatus.lastError ? `<pre>${engineStatus.lastError}</pre>` : ''}`
                    : `<p style="color:#6ee7b7;">✓ ${engineStatus.detail || 'Model backend reachable.'}</p>`}
                <p>This is the <strong>AI API Gateway</strong>. To interact with the simulated web app & extension:</p>
                <a class="btn" href="http://localhost:4500" target="_blank">👉 Open Mission Control Portal (:4500)</a>
                <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Active Endpoints: <code>GET /health</code> | <code>GET /api/v1/model-status</code> | <code>POST /api/v1/reason</code> | <code>POST /api/v1/chat</code></p>
              </div>
            </body>
          </html>
        `);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'healthy',
                service: 'PrivaPilot Reasoning Server',
                version: '1.0.0',
                protocolVersion: '1.0',
                engine: engineStatus,
                timestamp: Date.now()
            }));
            return;
        }
        // 1b. Model Backend Diagnosis
        // The extension calls this to tell "gateway down" apart from "gateway up but no
        // model connected", which are the two failures that look identical in the UI.
        if (req.method === 'GET' && url === '/api/v1/model-status') {
            // Always re-probe: the operator is asking precisely because something changed.
            engine.invalidateStatusCache();
            const engineStatus = await engine.getStatus();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                provider: engineStatus.provider,
                modelName: engineStatus.modelName,
                endpoint: engineStatus.endpoint,
                isOnline: engineStatus.isOnline,
                isMultimodal: engineStatus.isMultimodal,
                // A reachable gateway with provider 'mock' still answers requests, but with
                // the deterministic offline reasoner rather than a real model.
                modelConnected: engineStatus.provider !== 'mock' && engineStatus.isOnline,
                detail: engineStatus.detail,
                lastError: engineStatus.lastError,
                timestamp: Date.now()
            }));
            return;
        }
        // 2. Reasoning Endpoint
        if (req.method === 'POST' && url === '/api/v1/reason') {
            let bodyStr = '';
            let exceeded = false;
            const MAX_REASON_BODY_BYTES = 10 * 1024 * 1024; // 10MB (accommodates 4MB decoded screenshot + base64 overhead + DOM context)
            req.on('data', (chunk) => {
                if (exceeded)
                    return;
                bodyStr += chunk.toString();
                if (bodyStr.length > MAX_REASON_BODY_BYTES) {
                    exceeded = true;
                    // Answer 413 and stop accumulating, but DRAIN the remaining upload rather
                    // than destroying the socket. The client is still writing at this point, so a
                    // destroy resets it mid-write and it sees ECONNRESET instead of the status code.
                    // The data handler returns early while 'exceeded' is set, so memory stays bounded.
                    res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
                    res.end(JSON.stringify({ error: 'Payload Too Large: Request body exceeds 10MB limit' }));
                    req.resume();
                }
            });
            req.on('end', async () => {
                if (exceeded)
                    return;
                try {
                    const body = JSON.parse(bodyStr);
                    // A. Security Proxy Canary Check
                    const scan = CanaryScannerProxy.inspect(body, url);
                    if (!scan.passed) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: 'Privacy Boundary Violation: Prohibited canary fixture detected in payload'
                        }));
                        return;
                    }
                    // B. Closed Schema Validation
                    const validation = validateSanitizedPayload(body);
                    if (!validation.isValid || !validation.payload) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: validation.errorMessage || 'Invalid request payload' }));
                        return;
                    }
                    console.log(`[PrivaPilot:Server] POST /api/v1/reason received for goal: "${validation.payload.goal}" (${validation.payload.elements?.length || 0} elements)`);
                    const tReasonStart = Date.now();
                    // C. Reasoning Decision
                    const action = await engine.decideNextAction(validation.payload);
                    console.log(`[PrivaPilot:Server] Action decided: ${action.kind} (took ${Date.now() - tReasonStart}ms)`);
                    const safeAction = { ...action };
                    if (typeof safeAction === 'object' && safeAction !== null) {
                        for (const key of Object.keys(safeAction)) {
                            if (!ALLOWED_ACTION_PROPOSAL_KEYS.has(key)) {
                                delete safeAction[key];
                            }
                        }
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(safeAction));
                }
                catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Reasoning service temporarily unavailable' }));
                }
            });
            return;
        }
        // 3. Sanitized Conversational Chat Endpoint
        if (req.method === 'POST' && url === '/api/v1/chat') {
            let bodyStr = '';
            let exceeded = false;
            const MAX_CHAT_BODY_BYTES = 512 * 1024; // 512KB
            req.on('data', (chunk) => {
                if (exceeded)
                    return;
                bodyStr += chunk.toString();
                if (bodyStr.length > MAX_CHAT_BODY_BYTES) {
                    exceeded = true;
                    // Answer 413 and stop accumulating, but DRAIN the remaining upload rather
                    // than destroying the socket. The client is still writing at this point, so a
                    // destroy resets it mid-write and it sees ECONNRESET instead of the status code.
                    // The data handler returns early while 'exceeded' is set, so memory stays bounded.
                    res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
                    res.end(JSON.stringify({ error: 'Payload Too Large: Chat request body exceeds 512KB limit' }));
                    req.resume();
                }
            });
            req.on('end', async () => {
                if (exceeded)
                    return;
                try {
                    const body = JSON.parse(bodyStr);
                    // A. Security Proxy Canary Check
                    const scan = CanaryScannerProxy.inspect(body, url);
                    if (!scan.passed) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: 'Privacy Boundary Violation: Prohibited canary fixture detected in chat payload'
                        }));
                        return;
                    }
                    // B. Strict Closed Schema Validation
                    const validation = validateSanitizedChatPayload(body);
                    if (!validation.isValid || !validation.payload) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: validation.errorMessage || 'Invalid chat request payload' }));
                        return;
                    }
                    const { message, elements, sanitizedTitle, maskCount, history, customPrompt } = validation.payload;
                    const hasSanitizedContext = Array.isArray(elements) && elements.length > 0;
                    const baseSystemPrompt = hasSanitizedContext
                        ? `You are PrivaPilot, a privacy-first browser AI assistant. The user is asking about the current webpage. Review the sanitized elements and answer helpfully. You must ALWAYS begin your output by thinking step by step inside <think>...</think> tags, analyzing the user's intent and page context. After </think>, provide your concise final response.`
                        : `You are PrivaPilot, a smart privacy-first browser AI assistant. Answer helpfully and concisely. You must ALWAYS begin your output by thinking step by step inside <think>...</think> tags, analyzing the user's message and response plan. After </think>, provide your concise final response.`;
                    const systemPrompt = customPrompt ? `${baseSystemPrompt}\n\n${customPrompt}` : baseSystemPrompt;
                    // Build user message from sanitized element list only (no raw DOM or URLs)
                    let fullUserMessage = message;
                    if (hasSanitizedContext) {
                        const elementSummary = elements
                            .slice(0, 100)
                            .map(e => `• ${e.localId || 'el'}: ${e.role || 'element'} "${e.sanitizedName || 'unnamed'}"`)
                            .join('\n');
                        fullUserMessage = `Page Title: "${sanitizedTitle || 'Untitled'}" (${maskCount || 0} sensitive masks active locally)\n\nSanitized Page Elements:\n${elementSummary}\n\nUser Question: ${message}`;
                    }
                    // Single adapter for every backend. It applies a bounded inference timeout
                    // and degrades to an explanatory offline reply instead of throwing, so a
                    // missing or slow model never becomes an opaque 500 in the extension.
                    const chatResult = await engine.chat(systemPrompt, fullUserMessage, history);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        reply: chatResult.reply,
                        reasoning: chatResult.reasoning || undefined,
                        provider: chatResult.provider,
                        modelName: chatResult.modelName,
                        modelConnected: !chatResult.degraded,
                        detail: chatResult.detail
                    }));
                }
                catch (err) {
                    // Reaching here means the request itself was malformed, not the model.
                    console.error('[PrivaPilot] Chat request handling failed:', err?.message || err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Chat service temporarily unavailable' }));
                }
            });
            return;
        }
        // 3b. POST /api/v1/search - Autonomous Tavily Web Search
        if (req.method === 'POST' && url === '/api/v1/search') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', async () => {
                try {
                    const body = JSON.parse(bodyStr || '{}');
                    const query = String(body.query || '').trim();
                    if (!query) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Query parameter is required' }));
                        return;
                    }
                    const apiKey = process.env.TAVILY_API_KEY;
                    if (!apiKey) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'TAVILY_API_KEY not configured in environment' }));
                        return;
                    }
                    const tavilyRes = await fetch('https://api.tavily.com/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            api_key: apiKey,
                            query,
                            search_depth: body.searchDepth || 'basic',
                            include_answer: true,
                            max_results: body.maxResults || 5
                        })
                    });
                    if (!tavilyRes.ok) {
                        const errText = await tavilyRes.text();
                        res.writeHead(tavilyRes.status, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Tavily API returned ${tavilyRes.status}: ${errText}` }));
                        return;
                    }
                    const searchData = await tavilyRes.json();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        query: searchData.query || query,
                        answer: searchData.answer || null,
                        results: (searchData.results || []).map((r) => ({
                            title: r.title,
                            url: r.url,
                            content: r.content,
                            score: r.score,
                            favicon: r.favicon
                        }))
                    }));
                }
                catch (err) {
                    console.error('[PrivaPilot] Search request failed:', err?.message || err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err?.message || 'Search failed' }));
                }
            });
            return;
        }
        // Helper to read JSON request payloads safely
        const readJson = (maxBytes = 512 * 1024) => {
            return new Promise((resolve) => {
                let str = '';
                let exceeded = false;
                req.on('data', (chunk) => {
                    if (exceeded)
                        return;
                    str += chunk.toString();
                    if (str.length > maxBytes) {
                        exceeded = true;
                        res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
                        res.end(JSON.stringify({ error: 'Payload Too Large' }));
                        req.resume();
                        resolve({ exceeded: true, body: null });
                    }
                });
                req.on('end', () => {
                    if (exceeded)
                        return;
                    try {
                        resolve({ exceeded: false, body: str.trim() ? JSON.parse(str) : {} });
                    }
                    catch {
                        resolve({ exceeded: false, body: null });
                    }
                });
            });
        };
        // 4. Platform API Key Management & Telemetry
        if (url === '/api/v1/platform/keys' || url === '/api/v1/platform/telemetry') {
            if (req.method === 'GET') {
                const telemetry = apiKeyManager.getPlatformTelemetry();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'active',
                    defaultDemoKey: ApiKeyManager.DEFAULT_DEMO_KEY,
                    totalRequests: telemetry.totalRequests,
                    activeTenants: telemetry.activeTenants,
                    tenants: telemetry.tenants,
                    recentLogs: telemetry.recentLogs,
                    hint: 'Include Authorization: Bearer <key> or x-api-key header on all /api/v1/agent/* calls'
                }));
                return;
            }
            if (req.method === 'POST') {
                const { exceeded, body } = await readJson();
                if (exceeded)
                    return;
                const tenantName = (body && typeof body.name === 'string' && body.name) ? body.name : 'External Agent Tenant';
                const tier = (body && body.tier === 'enterprise') ? 'enterprise' : 'developer';
                const { apiKey, tenant } = apiKeyManager.createKey(tenantName, tier);
                apiKeyManager.recordRequest({
                    tenantId: tenant.tenantId,
                    apiKey,
                    endpoint: '/api/v1/platform/keys',
                    method: 'POST',
                    status: 201,
                    goalSnippet: `Key provisioned for ${tenant.name}`
                });
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    apiKey,
                    tenantId: tenant.tenantId,
                    name: tenant.name,
                    tier: tenant.tier,
                    monthlyQuotaSteps: tenant.monthlyQuotaSteps,
                    rateLimitPerMinute: tenant.rateLimitPerMinute
                }));
                return;
            }
        }
        // 5. Platform Agent Task Decomposition: POST /api/v1/agent/plan
        if (req.method === 'POST' && url === '/api/v1/agent/plan') {
            const rawKey = apiKeyManager.extractKey(req.headers);
            const auth = apiKeyManager.validate(rawKey);
            if (!auth.valid) {
                res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: auth.error }));
                return;
            }
            const { exceeded, body } = await readJson();
            if (exceeded)
                return;
            if (!body) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
                return;
            }
            const validation = validatePlanRequest(body);
            if (!validation.isValid || !validation.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: validation.errorMessage || 'Invalid plan request' }));
                return;
            }
            const plan = await orchestrator.planTask(validation.payload.goal, validation.payload.contextUrl);
            apiKeyManager.recordRequest({
                tenantId: auth.tenant.tenantId,
                apiKey: rawKey,
                endpoint: '/api/v1/agent/plan',
                method: 'POST',
                status: 200,
                goalSnippet: validation.payload.goal
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(plan));
            return;
        }
        // 5b. Dynamic Task Specification (Tasks To Do & Not To Do): POST /api/v1/agent/spec
        if (req.method === 'POST' && (url === '/api/v1/agent/spec' || url === '/api/v1/task-spec')) {
            const { exceeded, body } = await readJson();
            if (exceeded)
                return;
            if (!body || typeof body.goal !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Field "goal" is required' }));
                return;
            }
            const spec = await orchestrator.planTaskSpecification(body.goal, body.contextUrl, body.customPrompt);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(spec));
            return;
        }
        // 6. Platform Agent Task Dispatch: POST /api/v1/agent/dispatch
        if (req.method === 'POST' && url === '/api/v1/agent/dispatch') {
            const rawKey = apiKeyManager.extractKey(req.headers);
            const auth = apiKeyManager.validate(rawKey);
            if (!auth.valid) {
                res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: auth.error }));
                return;
            }
            const { exceeded, body } = await readJson();
            if (exceeded)
                return;
            if (!body) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
                return;
            }
            const validation = validatePlatformTaskRequest(body);
            if (!validation.isValid || !validation.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: validation.errorMessage || 'Invalid dispatch request' }));
                return;
            }
            // Record step usage
            apiKeyManager.recordStepUsage(rawKey, 2);
            const taskResponse = await orchestrator.dispatchTask(validation.payload, auth.tenant.tenantId);
            apiKeyManager.recordRequest({
                tenantId: auth.tenant.tenantId,
                apiKey: rawKey,
                endpoint: '/api/v1/agent/dispatch',
                method: 'POST',
                status: 200,
                goalSnippet: validation.payload.goal,
                durationMs: taskResponse.durationMs
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(taskResponse));
            return;
        }
        // 7. Platform Agent Task Polling: GET /api/v1/agent/tasks/:taskId
        if (req.method === 'GET' && url.startsWith('/api/v1/agent/tasks/')) {
            const rawKey = apiKeyManager.extractKey(req.headers);
            const auth = apiKeyManager.validate(rawKey);
            if (!auth.valid) {
                res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: auth.error }));
                return;
            }
            const taskId = url.slice('/api/v1/agent/tasks/'.length).split('?')[0];
            const task = orchestrator.getTask(taskId);
            if (!task) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Task "${taskId}" not found` }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(task));
            return;
        }
        // 8. Platform Agent Synthesis: POST /api/v1/agent/synthesize
        if (req.method === 'POST' && url === '/api/v1/agent/synthesize') {
            const rawKey = apiKeyManager.extractKey(req.headers);
            const auth = apiKeyManager.validate(rawKey);
            if (!auth.valid) {
                res.writeHead(auth.statusCode || 401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: auth.error }));
                return;
            }
            const { exceeded, body } = await readJson();
            if (exceeded)
                return;
            if (!body) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
                return;
            }
            const validation = validateSynthesizeRequest(body);
            if (!validation.isValid || !validation.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: validation.errorMessage || 'Invalid synthesize request' }));
                return;
            }
            const synthesis = await orchestrator.synthesizeResults(validation.payload.originalGoal, validation.payload.subTaskResults);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ synthesis }));
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });
    return server;
}
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
    const server = createServer();
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[PrivaPilot] Port ${PORT} is already in use. Another reasoning server is probably running.\n` +
                `             Stop it, or start this one on a different port with PORT=<port>.`);
        }
        else {
            console.error('[PrivaPilot] Reasoning Server failed to start:', err.message);
        }
        process.exit(1);
    });
    // Default dual-stack bind, so both ::1 and 127.0.0.1 reach the gateway.
    server.listen(PORT, async () => {
        console.log(`[PrivaPilot] Reasoning Server running on http://localhost:${PORT}`);
        // Report the model backend at boot so a missing model is obvious immediately
        // rather than after the first failed request from the extension.
        const status = await engine.getStatus();
        if (status.provider === 'mock') {
            console.warn(`[PrivaPilot] ⚠ No model backend connected — using the deterministic offline reasoner.`);
            if (status.lastError) {
                console.warn(`[PrivaPilot]   Probe results: ${status.lastError}`);
            }
            console.warn(`[PrivaPilot]   Start Ollama ("ollama serve" + "ollama pull qwen2.5vl"), start LM Studio,`);
            console.warn(`[PrivaPilot]   or set VLM_ENDPOINT / VLM_API_KEY / VLM_MODEL, then reload the extension.`);
        }
        else {
            console.log(`[PrivaPilot] ✓ Model connected: ${status.modelName} via ${status.provider} (${status.endpoint})`);
            if (!status.isMultimodal) {
                console.warn(`[PrivaPilot]   Note: this model is text-only; screenshots will not be sent to it.`);
            }
            if (status.lastError) {
                console.warn(`[PrivaPilot]   ${status.lastError}`);
            }
        }
        console.log(`[PrivaPilot] Live model diagnosis: http://localhost:${PORT}/api/v1/model-status`);
    });
}
//# sourceMappingURL=index.js.map