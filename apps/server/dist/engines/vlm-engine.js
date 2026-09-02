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
import { validateActionProposal, describeRedactionScheme } from '@privapilot/protocol';
import { MockReasoningEngine } from './mock-engine.js';
const DEFAULT_MODEL_NAME = 'qwen2.5-vl';
/** A successful probe result stays valid this long. */
const STATUS_CACHE_MS = 10_000;
/** A "no backend found" result is re-probed much sooner so a late start is picked up. */
const OFFLINE_STATUS_CACHE_MS = 2_000;
/** Models that exist in Ollama but cannot answer a chat request. */
const EMBEDDING_NAME_HINTS = ['embed', 'embedding', 'bge-', 'gte-', 'e5-'];
const EMBEDDING_FAMILIES = new Set(['bert', 'nomic-bert', 'gte', 'mxbai']);
/** Substrings and families that mark a tag as vision-capable. */
const VISION_NAME_HINTS = ['vl', 'vision', 'llava', 'moondream', 'minicpm-v', 'bakllava', 'gemma3'];
const VISION_FAMILIES = new Set(['clip', 'mllama', 'llava', 'qwen2vl', 'qwen2.5vl']);
/**
 * Normalises a user-supplied host into an absolute origin.
 * Accepts "127.0.0.1:11434", "http://host:port" and trailing slashes.
 */
function normalizeOrigin(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed)
        return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    try {
        const parsed = new URL(withScheme);
        // 0.0.0.0 is a bind address, not a dial address.
        if (parsed.hostname === '0.0.0.0') {
            parsed.hostname = '127.0.0.1';
        }
        return parsed.origin;
    }
    catch {
        return null;
    }
}
function uniqueOrigins(...candidates) {
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
        if (c && !seen.has(c)) {
            seen.add(c);
            out.push(c);
        }
    }
    return out;
}
/** Loose match so a configured "qwen2.5-vl" still resolves an installed "qwen2.5vl:7b". */
function looselyMatchesModel(installedName, configured) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const installed = installedName.toLowerCase();
    const wanted = configured.toLowerCase();
    if (installed === wanted)
        return true;
    if (installed.split(':')[0] === wanted.split(':')[0])
        return true;
    return norm(wanted).length >= 4 && norm(installed).startsWith(norm(wanted));
}
function isEmbeddingModel(model) {
    const name = String(model?.name || model?.model || '').toLowerCase();
    if (EMBEDDING_NAME_HINTS.some((hint) => name.includes(hint)))
        return true;
    const family = String(model?.details?.family || '').toLowerCase();
    return EMBEDDING_FAMILIES.has(family);
}
function isVisionModel(model) {
    if (Array.isArray(model?.capabilities) && model.capabilities.includes('vision'))
        return true;
    const name = String(model?.name || model?.model || '').toLowerCase();
    if (VISION_NAME_HINTS.some((hint) => name.includes(hint)))
        return true;
    const families = Array.isArray(model?.details?.families) ? model.details.families : [];
    return families.some((f) => VISION_FAMILIES.has(String(f).toLowerCase()));
}
export class VlmReasoningEngine {
    config;
    mockFallback;
    cachedStatus = null;
    lastProbeTime = 0;
    constructor(config = {}) {
        this.config = {
            endpoint: config.endpoint || process.env.VLM_ENDPOINT || undefined,
            apiKey: config.apiKey || process.env.VLM_API_KEY || undefined,
            // Left undefined when unset so auto-probe can pick whatever is actually installed
            // instead of insisting on a default tag the user never pulled.
            modelName: config.modelName || process.env.VLM_MODEL || undefined,
            timeoutMs: config.timeoutMs ?? parseInt(process.env.VLM_TIMEOUT_MS || '90000', 10),
            probeTimeoutMs: config.probeTimeoutMs ?? parseInt(process.env.VLM_PROBE_TIMEOUT_MS || '4000', 10),
            numCtx: config.numCtx ?? parseInt(process.env.VLM_NUM_CTX || '8192', 10)
        };
        this.mockFallback = new MockReasoningEngine();
    }
    /** Forces the next getStatus() call to re-probe every backend. */
    invalidateStatusCache() {
        this.cachedStatus = null;
        this.lastProbeTime = 0;
    }
    get inferenceTimeoutMs() {
        const v = this.config.timeoutMs;
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 90000;
    }
    /**
     * Ollama context window. Its default (2048-4096) is far too small once a
     * screenshot is attached: Qwen2.5-VL turns a 1280x800 capture into thousands of
     * vision tokens, and Ollama SILENTLY TRUNCATES the prompt rather than erroring.
     * The model then reasons over a partial element list and returns schema-invalid
     * output, which looks like a model quality problem but is a configuration one.
     * Only applies to Ollama; hosted OpenAI-compatible endpoints manage their own.
     */
    get numCtx() {
        const v = this.config.numCtx;
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 8192;
    }
    get probeTimeoutMs() {
        const v = this.config.probeTimeoutMs;
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 4000;
    }
    ollamaOrigins() {
        return uniqueOrigins(normalizeOrigin(process.env.OLLAMA_HOST), 'http://127.0.0.1:11434', 'http://localhost:11434');
    }
    lmStudioOrigins() {
        return uniqueOrigins(normalizeOrigin(process.env.LM_STUDIO_HOST), 'http://127.0.0.1:1234', 'http://localhost:1234');
    }
    /**
     * Probes active local or remote model backends.
     */
    async getStatus() {
        const now = Date.now();
        if (this.cachedStatus) {
            const ttl = this.cachedStatus.provider === 'mock' ? OFFLINE_STATUS_CACHE_MS : STATUS_CACHE_MS;
            if (now - this.lastProbeTime < ttl) {
                return this.cachedStatus;
            }
        }
        this.lastProbeTime = now;
        const probeErrors = [];
        // 1. Explicitly configured endpoint always wins.
        if (this.config.endpoint) {
            const isLocal = this.isLocalAddress(this.config.endpoint);
            // A GET against a chat-completions URL is not a health check for a hosted
            // provider, and an unauthenticated GET may legitimately fail. Only gate a
            // local endpoint on reachability; trust an explicitly configured cloud one.
            let isOnline = true;
            let detail = `Using explicitly configured VLM_ENDPOINT (${this.config.endpoint})`;
            if (isLocal) {
                const ping = await this.pingEndpoint(this.config.endpoint);
                isOnline = ping.ok;
                if (!ping.ok) {
                    detail = `Configured local VLM_ENDPOINT ${this.config.endpoint} is not reachable`;
                    probeErrors.push(ping.error || 'unreachable');
                }
            }
            this.cachedStatus = {
                provider: isLocal ? 'lm-studio' : 'vlm-cloud',
                endpoint: this.config.endpoint,
                modelName: this.config.modelName || 'custom-vlm',
                isOnline,
                isMultimodal: true,
                detail,
                lastError: probeErrors[0]
            };
            return this.cachedStatus;
        }
        // 2. Auto-probe Ollama across every plausible loopback origin.
        for (const origin of this.ollamaOrigins()) {
            const tags = await this.fetchJson(`${origin}/api/tags`);
            if (!tags.ok) {
                probeErrors.push(`Ollama ${origin}: ${tags.error || 'offline'}`);
                continue;
            }
            const models = Array.isArray(tags.data?.models) ? tags.data.models : [];
            const chatModels = models.filter((m) => !isEmbeddingModel(m));
            if (models.length === 0) {
                probeErrors.push(`Ollama ${origin}: running but no models installed (run "ollama pull llama3.2")`);
                continue;
            }
            if (chatModels.length === 0) {
                probeErrors.push(`Ollama ${origin}: only embedding models installed; none can answer chat requests`);
                continue;
            }
            const configured = this.config.modelName;
            let selected;
            let detail;
            if (configured) {
                const match = chatModels.find((m) => looselyMatchesModel(String(m.name || m.model || ''), configured));
                if (match) {
                    selected = match;
                    detail = `Ollama at ${origin} using configured model "${match.name}"`;
                }
                else {
                    // The configured model is not pulled. Falling back to an installed one keeps
                    // the system usable instead of returning "model not found" on every request.
                    selected = chatModels.find(isVisionModel) || chatModels[0];
                    detail =
                        `Ollama at ${origin}: configured VLM_MODEL "${configured}" is not installed ` +
                            `(run "ollama pull ${configured}"). Falling back to "${selected.name}".`;
                    probeErrors.push(`VLM_MODEL "${configured}" not found in Ollama`);
                }
            }
            else {
                const visionModel = chatModels.find(isVisionModel);
                selected = visionModel || chatModels[0];
                detail = visionModel
                    ? `Ollama at ${origin} auto-selected vision model "${selected.name}"`
                    : `Ollama at ${origin} auto-selected text model "${selected.name}" ` +
                        `(no vision model installed; run "ollama pull qwen2.5vl" for screenshot reasoning)`;
            }
            this.cachedStatus = {
                provider: 'ollama',
                endpoint: origin,
                modelName: String(selected.name || selected.model || DEFAULT_MODEL_NAME),
                isOnline: true,
                isMultimodal: isVisionModel(selected),
                detail,
                lastError: probeErrors[0]
            };
            return this.cachedStatus;
        }
        // 3. Auto-probe LM Studio across every plausible loopback origin.
        for (const origin of this.lmStudioOrigins()) {
            const models = await this.fetchJson(`${origin}/v1/models`);
            if (!models.ok) {
                probeErrors.push(`LM Studio ${origin}: ${models.error || 'offline'}`);
                continue;
            }
            const loaded = Array.isArray(models.data?.data) ? models.data.data : [];
            const configured = this.config.modelName;
            const match = configured
                ? loaded.find((m) => looselyMatchesModel(String(m.id || ''), configured))
                : undefined;
            const selectedId = match?.id || loaded[0]?.id || configured || 'local-model';
            this.cachedStatus = {
                provider: 'lm-studio',
                endpoint: `${origin}/v1/chat/completions`,
                modelName: String(selectedId),
                isOnline: true,
                isMultimodal: true,
                detail: `LM Studio at ${origin} serving "${selectedId}"`,
                lastError: probeErrors[0]
            };
            return this.cachedStatus;
        }
        // 4. Default to the deterministic offline engine.
        this.cachedStatus = {
            provider: 'mock',
            endpoint: 'in-process-deterministic',
            modelName: 'PrivaPilot-Mock-Reasoner-v1',
            isOnline: true,
            isMultimodal: true,
            detail: 'No local or configured model backend reachable. Using the deterministic offline reasoner. ' +
                'Start Ollama ("ollama serve" then "ollama pull qwen2.5vl") or LM Studio, or set VLM_ENDPOINT.',
            lastError: probeErrors.join(' | ') || undefined
        };
        return this.cachedStatus;
    }
    /**
     * Sanitized conversational turn. Never throws: a backend failure degrades to an
     * explanatory offline reply rather than surfacing a 500 to the extension.
     */
    async chat(systemPrompt, userMessage) {
        const status = await this.getStatus();
        if (status.provider === 'mock' || !status.isOnline) {
            return {
                reply: this.buildOfflineReply(status),
                provider: 'mock',
                modelName: status.modelName,
                degraded: true,
                detail: status.detail
            };
        }
        try {
            const raw = status.provider === 'ollama'
                ? await this.chatViaOllama(status, systemPrompt, userMessage)
                : await this.chatViaOpenAICompatible(status, systemPrompt, userMessage);
            const reply = raw.trim();
            if (!reply) {
                throw new Error('Model returned an empty response');
            }
            return {
                reply,
                provider: status.provider,
                modelName: status.modelName,
                degraded: false,
                detail: status.detail
            };
        }
        catch (err) {
            const reason = err?.message || 'unknown error';
            console.warn(`[PrivaPilot:VLM] Chat failed via ${status.provider} (${reason}). Degrading to offline reply.`);
            // The backend answered the probe but not the request: re-probe on the next call.
            this.invalidateStatusCache();
            return {
                reply: this.buildOfflineReply(status, reason),
                provider: status.provider,
                modelName: status.modelName,
                degraded: true,
                detail: `${status.detail || ''} - request failed: ${reason}`.trim()
            };
        }
    }
    buildOfflineReply(status, requestError) {
        const cause = requestError
            ? `The "${status.modelName}" backend accepted the connection but the request failed: ${requestError}.`
            : status.lastError
                ? `No model backend is reachable (${status.lastError}).`
                : 'No model backend is reachable.';
        return ('PrivaPilot sanitized this page locally and the privacy firewall is active, ' +
            'but the reasoning model is not answering right now.\n\n' +
            `${cause}\n\n` +
            'To connect a model:\n' +
            '  1. Start Ollama:  ollama serve\n' +
            '  2. Pull a vision model:  ollama pull qwen2.5vl\n' +
            '  3. Or point the gateway at any OpenAI-compatible endpoint via VLM_ENDPOINT / VLM_API_KEY / VLM_MODEL.\n\n' +
            'Open http://localhost:4501/api/v1/model-status for a live diagnosis.');
    }
    async chatViaOllama(status, systemPrompt, userMessage) {
        const res = await this.fetchWithTimeout(`${status.endpoint.replace(/\/$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: status.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                stream: false,
                options: { temperature: 0.4, num_ctx: this.numCtx }
            })
        }, this.inferenceTimeoutMs);
        if (!res.ok) {
            throw new Error(`Ollama returned ${res.status}: ${await this.safeErrorText(res)}`);
        }
        const data = await res.json();
        return data?.message?.content || '';
    }
    async chatViaOpenAICompatible(status, systemPrompt, userMessage) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const res = await this.fetchWithTimeout(status.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: status.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.4
            })
        }, this.inferenceTimeoutMs);
        if (!res.ok) {
            throw new Error(`Endpoint returned ${res.status}: ${await this.safeErrorText(res)}`);
        }
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || '';
    }
    /**
     * Main reasoning invocation. Returns schema-valid ActionProposal.
     */
    async decideNextAction(payload) {
        const status = await this.getStatus();
        if (status.provider === 'mock' || !status.isOnline) {
            return this.mockProposal(payload);
        }
        try {
            if (status.provider === 'ollama') {
                return await this.callOllama(payload, status.endpoint, status.modelName);
            }
            else {
                return await this.callOpenAICompatible(payload, status.endpoint, status.modelName);
            }
        }
        catch (err) {
            // A model that cannot answer must not end the run. Degrade to the deterministic
            // offline reasoner; the client still risk-classifies and confirms every action.
            console.warn(`[PrivaPilot:VLM] Model reasoning failed (${err.message}). Falling back to offline reasoner.`);
            this.invalidateStatusCache();
            return this.mockProposal(payload, err.message);
        }
    }
    /**
     * Deterministic offline proposal, validated against the same closed schema.
     */
    async mockProposal(payload, degradeReason) {
        const fallbackProposal = await this.mockFallback.decideNextAction(payload);
        const annotated = degradeReason
            ? {
                ...fallbackProposal,
                rationale: `[offline reasoner: ${degradeReason}] ${fallbackProposal.rationale}`.slice(0, 500)
            }
            : fallbackProposal;
        const validation = validateActionProposal(annotated, payload.elements);
        if (!validation.isValid || !validation.proposal) {
            return {
                actionId: `act_error_${Date.now()}`,
                kind: 'blocked',
                confidence: 0,
                risk: 'blocked',
                rationale: 'Fallback reasoning proposal failed validation'
            };
        }
        return validation.proposal;
    }
    /**
     * Handles Ollama native format (/api/chat) with at most one schema-repair attempt.
     */
    async callOllama(payload, baseUrl, modelName) {
        const systemPrompt = this.buildSystemPrompt(payload);
        const userPrompt = this.buildUserPrompt(payload);
        const chatUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;
        // Extract base64 image data without data URI prefix for Ollama
        const base64Image = payload.screenshot?.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const images = base64Image ? [base64Image] : [];
        const userMessage = { role: 'user', content: userPrompt };
        if (this.cachedStatus?.isMultimodal && images.length > 0) {
            userMessage.images = images;
        }
        const post = (messages, temperature) => this.fetchWithTimeout(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                messages,
                format: 'json',
                stream: false,
                options: { temperature, num_ctx: this.numCtx }
            })
        }, this.inferenceTimeoutMs);
        let response = await post([{ role: 'system', content: systemPrompt }, userMessage], 0.1);
        if (!response.ok && userMessage.images) {
            // Fallback: retry text-only if the model does not accept images
            delete userMessage.images;
            response = await post([{ role: 'system', content: systemPrompt }, userMessage], 0.1);
        }
        if (!response.ok) {
            throw new Error(`Ollama returned status ${response.status}: ${await this.safeErrorText(response)}`);
        }
        const data = await response.json();
        const content = data.message?.content || '';
        try {
            return this.parseActionProposal(content, payload);
        }
        catch (firstErr) {
            // At most ONE schema repair attempt
            console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
            const repairResponse = await post([
                { role: 'system', content: systemPrompt },
                userMessage,
                { role: 'assistant', content },
                {
                    role: 'user',
                    content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
                }
            ], 0.05);
            if (!repairResponse.ok) {
                throw new Error(`Schema repair failed: Ollama returned status ${repairResponse.status}`);
            }
            const repairData = await repairResponse.json();
            const repairContent = repairData.message?.content || '';
            return this.parseActionProposal(repairContent, payload);
        }
    }
    /**
     * Handles standard OpenAI-compatible format (/v1/chat/completions) with at most one schema-repair attempt.
     */
    async callOpenAICompatible(payload, endpoint, modelName) {
        const systemPrompt = this.buildSystemPrompt(payload);
        const userPrompt = this.buildUserPrompt(payload);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const contentArray = [
            { type: 'text', text: userPrompt }
        ];
        if (payload.screenshot && payload.screenshot.startsWith('data:image')) {
            contentArray.push({
                type: 'image_url',
                image_url: { url: payload.screenshot }
            });
        }
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentArray }
        ];
        const post = (msgs, temperature) => this.fetchWithTimeout(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: modelName,
                messages: msgs,
                response_format: { type: 'json_object' },
                temperature
            })
        }, this.inferenceTimeoutMs);
        const response = await post(messages, 0.1);
        if (!response.ok) {
            throw new Error(`Endpoint returned status ${response.status}: ${await this.safeErrorText(response)}`);
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        try {
            return this.parseActionProposal(content, payload);
        }
        catch (firstErr) {
            // At most ONE schema repair attempt
            console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
            const repairResponse = await post([
                ...messages,
                { role: 'assistant', content },
                {
                    role: 'user',
                    content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
                }
            ], 0.05);
            if (!repairResponse.ok) {
                throw new Error(`Schema repair failed: Endpoint returned status ${repairResponse.status}`);
            }
            const repairData = await repairResponse.json();
            const repairContent = repairData.choices?.[0]?.message?.content || '';
            return this.parseActionProposal(repairContent, payload);
        }
    }
    /**
     * Extracts and validates an ActionProposal from raw model output string.
     */
    parseActionProposal(content, payload) {
        // 1. Strip markdown code fences if present (```json ... ```)
        let cleanJson = content.trim();
        const codeBlockMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) {
            cleanJson = codeBlockMatch[1].trim();
        }
        // 2. Extract first valid JSON block
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            cleanJson = cleanJson.slice(jsonStart, jsonEnd + 1);
        }
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        }
        catch {
            throw new Error('Model output could not be parsed as JSON');
        }
        // 3. Strict Closed Validation against current context elements
        const validation = validateActionProposal(parsed, payload.elements);
        if (!validation.isValid || !validation.proposal) {
            throw new Error(validation.errorMessage || 'Invalid action proposal schema');
        }
        return validation.proposal;
    }
    /**
     * Builds the system prompt for THIS payload.
     *
     * The redaction section is generated from the manifest the client sent, not
     * asserted in fixed prose. Previously the prompt claimed PII "has been blacked
     * out" without the server ever being told what was removed, how much, or by what
     * convention - so the model was reasoning over holes it had no description of,
     * which is exactly what the problem statement's "aware for this redaction scheme"
     * clause asks us not to do.
     */
    buildSystemPrompt(payload) {
        const scheme = describeRedactionScheme(payload?.redactionManifest);
        return `
You are PrivaPilot's Centralized Reasoning Agent for browser automation.
You receive a sanitized screenshot and a compact list of interactive elements with local IDs (e.g. "el_1", "el_2").

${scheme}

Strict Rules:
1. Return ONLY schema-valid JSON for one single next action.
2. Target elements using "targetLocalId" ONLY. NEVER invent CSS selectors, XPath, or JavaScript.
3. Classify risk as "safe" (read/navigate/preview/filter) or "protected" (submit/delete/pay/sign).
4. Provide a concise rationale. When a redacted region is relevant to your decision, say so in the rationale.

JSON Schema:
{
  "actionId": "act_1",
  "kind": "click" | "type" | "select" | "scroll" | "wait" | "finish",
  "targetLocalId": "el_1",
  "confidence": 0.95,
  "risk": "safe" | "protected",
  "textToType": "Optional text when kind is type",
  "rationale": "Short explanation",
  "expectedState": "Expected UI change"
}
`.trim();
    }
    buildUserPrompt(payload) {
        const compactElements = payload.elements.map(e => ({
            id: e.localId,
            role: e.role,
            name: e.sanitizedName,
            bounds: e.coarseBounds,
            capabilities: e.actionCapabilities
        }));
        return `Goal: ${payload.goal || 'Inspect page'}
Active Viewport Elements:
${JSON.stringify(compactElements, null, 2)}

Analyze the layout and return the JSON action proposal.`;
    }
    isLocalAddress(urlStr) {
        return urlStr.includes('localhost') || urlStr.includes('127.0.0.1') || urlStr.includes('0.0.0.0');
    }
    /**
     * Bounded fetch. Reports an abort as a timeout and a transport failure by its
     * OS error code, so probe diagnostics say what actually happened instead of
     * the opaque "fetch failed".
     */
    async fetchWithTimeout(url, init, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        catch (err) {
            if (controller.signal.aborted) {
                throw new Error(`timed out after ${timeoutMs}ms`);
            }
            throw new Error(err?.cause?.code || err?.message || 'connection failed');
        }
        finally {
            clearTimeout(timer);
        }
    }
    async fetchJson(url) {
        try {
            const res = await this.fetchWithTimeout(url, { method: 'GET' }, this.probeTimeoutMs);
            if (!res.ok) {
                return { ok: false, error: `HTTP ${res.status}` };
            }
            return { ok: true, data: await res.json() };
        }
        catch (err) {
            return { ok: false, error: err?.message || 'connection failed' };
        }
    }
    async pingEndpoint(urlStr) {
        try {
            const res = await this.fetchWithTimeout(urlStr, { method: 'GET' }, this.probeTimeoutMs);
            // Any non-5xx answer proves something is listening and routing.
            return res.status < 500 ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
        }
        catch (err) {
            return { ok: false, error: err?.message || 'connection failed' };
        }
    }
    async safeErrorText(res) {
        try {
            const text = await res.text();
            return text.slice(0, 200);
        }
        catch {
            return res.statusText || '';
        }
    }
}
//# sourceMappingURL=vlm-engine.js.map