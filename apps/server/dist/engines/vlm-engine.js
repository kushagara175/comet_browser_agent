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
import { validateActionProposal, ALLOWED_ACTION_PROPOSAL_KEYS, groundTargetCandidates, tokenizeSemanticText } from '@privapilot/protocol';
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
/** Azure OpenAI and Azure AI Foundry use `api-key`; other OpenAI-compatible
 * providers conventionally use an OAuth-style Bearer token. */
export function buildProviderAuthHeaders(endpoint, apiKey) {
    if (!apiKey)
        return {};
    try {
        const hostname = new URL(endpoint).hostname.toLowerCase();
        if (hostname.endsWith('.openai.azure.com') || hostname.endsWith('.services.ai.azure.com')) {
            return { 'api-key': apiKey };
        }
    }
    catch {
        // Let fetch report malformed endpoints; do not risk placing a key in the URL.
    }
    return { Authorization: `Bearer ${apiKey}` };
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
export function stripThinkingTags(raw) {
    if (!raw || typeof raw !== 'string')
        return '';
    return raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/<think>[\s\S]*$/gi, '')
        .replace(/<thought>[\s\S]*$/gi, '')
        .trim();
}
export function extractThinking(raw) {
    if (!raw || typeof raw !== 'string')
        return '';
    const match = raw.match(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i) ||
        raw.match(/<thought>([\s\S]*?)(?:<\/thought>|$)/i);
    if (match) {
        return match[1].trim();
    }
    return '';
}
export function sanitizeProhibitedText(text) {
    if (!text || typeof text !== 'string')
        return '';
    return text
        .replace(/https?:\/\//gi, 'https //')
        .replace(/ftp:\/\//gi, 'ftp //')
        .replace(/file:\/\//gi, 'file //')
        .replace(/wss?:\/\//gi, 'ws //')
        .replace(/blob:/gi, 'blob ')
        .replace(/data:/gi, 'data ')
        .replace(/<script\b/gi, '[script')
        .replace(/javascript:/gi, 'javascript ')
        .replace(/vbscript:/gi, 'vbscript ')
        .replace(/data:text\/html/gi, 'data text/html')
        .replace(/\bon\w+\s*=/gi, 'evt=')
        .replace(/\beval\s*\(/gi, 'eval ')
        .replace(/\bexpression\s*\(/gi, 'expression ');
}
export class VlmReasoningEngine {
    config;
    mockFallback;
    cachedStatus = null;
    lastProbeTime = 0;
    cloudExhaustedUntil = 0;
    constructor(config = {}) {
        this.config = {
            endpoint: config.endpoint || process.env.VLM_ENDPOINT || undefined,
            apiKey: config.apiKey || process.env.VLM_API_KEY || undefined,
            // Left undefined when unset so auto-probe can pick whatever is actually installed
            // instead of insisting on a default tag the user never pulled.
            modelName: config.modelName || process.env.VLM_MODEL || undefined,
            timeoutMs: config.timeoutMs ?? parseInt(process.env.VLM_TIMEOUT_MS || '90000', 10),
            probeTimeoutMs: config.probeTimeoutMs ?? parseInt(process.env.VLM_PROBE_TIMEOUT_MS || '4000', 10),
            numCtx: config.numCtx ?? parseInt(process.env.VLM_NUM_CTX || '8192', 10),
            maxTokens: config.maxTokens ?? parseInt(process.env.VLM_MAX_TOKENS || '2500', 10)
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
    get maxTokens() {
        const v = this.config.maxTokens;
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 600;
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
        if (this.cloudExhaustedUntil && now < this.cloudExhaustedUntil) {
            return {
                provider: 'mock',
                endpoint: this.config.endpoint || 'http://localhost:4501',
                modelName: 'offline-reasoner',
                isOnline: true,
                isMultimodal: true,
                detail: 'Cloud provider exhausted (credit limit / 402); degraded to deterministic offline reasoner',
                lastError: 'HTTP 402: Payment required'
            };
        }
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
    async chat(systemPrompt, userMessage, history) {
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
            const outcome = status.provider === 'ollama'
                ? await this.chatViaOllama(status, systemPrompt, userMessage, history)
                : await this.chatViaOpenAICompatible(status, systemPrompt, userMessage, history);
            if (!outcome.reply) {
                throw new Error('Model returned an empty response');
            }
            return {
                reply: outcome.reply,
                reasoning: outcome.reasoning,
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
    async chatViaOllama(status, systemPrompt, userMessage, history) {
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        if (Array.isArray(history) && history.length > 0) {
            for (const h of history) {
                if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
                    messages.push({ role: h.role, content: h.content });
                }
            }
        }
        messages.push({ role: 'user', content: userMessage });
        const res = await this.fetchWithTimeout(`${status.endpoint.replace(/\/$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: status.modelName,
                messages,
                stream: false,
                options: { temperature: 0.4, num_ctx: this.numCtx }
            })
        }, this.inferenceTimeoutMs);
        if (!res.ok) {
            throw new Error(`Ollama returned ${res.status}: ${await this.safeErrorText(res)}`);
        }
        const data = await res.json();
        const rawContent = data?.message?.content || '';
        const extractedThinking = extractThinking(rawContent);
        const cleanReply = stripThinkingTags(rawContent);
        return {
            reply: cleanReply,
            reasoning: extractedThinking || undefined
        };
    }
    async chatViaOpenAICompatible(status, systemPrompt, userMessage, history) {
        const headers = {
            'Content-Type': 'application/json',
            ...buildProviderAuthHeaders(status.endpoint, this.config.apiKey)
        };
        const isOpenRouter = status.endpoint.includes('openrouter.ai');
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        if (Array.isArray(history) && history.length > 0) {
            for (const h of history) {
                if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
                    messages.push({ role: h.role, content: h.content });
                }
            }
        }
        messages.push({ role: 'user', content: userMessage });
        const requestBody = {
            model: status.modelName,
            messages,
            temperature: 0.4,
            max_tokens: this.maxTokens
        };
        if (isOpenRouter) {
            requestBody.route = 'fallback';
            requestBody.models = (status.modelName && status.modelName.includes(':free'))
                ? [status.modelName, 'meta-llama/llama-3.3-70b-instruct:free']
                : [status.modelName, 'qwen/qwen-2.5-72b-instruct'];
        }
        const res = await this.fetchWithTimeout(status.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        }, this.inferenceTimeoutMs);
        if (!res.ok) {
            throw new Error(`Endpoint returned ${res.status}: ${await this.safeErrorText(res)}`);
        }
        const data = await res.json();
        const rawContent = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
        const rawReasoning = data?.choices?.[0]?.message?.reasoning || data?.choices?.[0]?.message?.reasoning_content || '';
        const extractedThinking = extractThinking(rawContent) || (typeof rawReasoning === 'string' && rawReasoning.trim() ? rawReasoning.trim() : '');
        const cleanReply = stripThinkingTags(rawContent);
        return {
            reply: cleanReply,
            reasoning: extractedThinking || undefined
        };
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
            if (err.message && (err.message.includes('402') || err.message.includes('credit') || err.message.includes('tokens limit') || err.message.includes('afford'))) {
                this.cloudExhaustedUntil = Date.now() + 5000;
            }
            this.invalidateStatusCache();
            return this.mockProposal(payload, err.message);
        }
    }
    /**
     * Deterministic offline proposal, validated against the same closed schema.
     */
    async mockProposal(payload, degradeReason) {
        const fallbackProposal = await this.mockFallback.decideNextAction(payload);
        // Sanitize degradeReason to clean text only (no URLs, no script tags, no html)
        const cleanReason = degradeReason
            ? degradeReason.replace(/https?:\/\/[^\s)]+/gi, '').replace(/[<>]/g, '').replace(/[^a-zA-Z0-9 _.,:;-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
            : '';
        const annotated = cleanReason
            ? {
                ...fallbackProposal,
                rationale: `[offline reasoner: ${cleanReason}] ${fallbackProposal.rationale}`.slice(0, 500)
            }
            : fallbackProposal;
        let validation = validateActionProposal(annotated, payload.elements);
        if (!validation.isValid || !validation.proposal) {
            validation = validateActionProposal(fallbackProposal, payload.elements);
        }
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
        const systemPrompt = this.buildSystemPrompt();
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
        const extractedThinking = extractThinking(content);
        try {
            return this.parseActionProposal(content, payload, extractedThinking);
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
            const repairThinking = extractThinking(repairContent);
            return this.parseActionProposal(repairContent, payload, repairThinking || extractedThinking);
        }
    }
    /**
     * Handles standard OpenAI-compatible format (/v1/chat/completions) with at most one schema-repair attempt.
     */
    async callOpenAICompatible(payload, endpoint, modelName) {
        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(payload);
        const headers = {
            'Content-Type': 'application/json',
            ...buildProviderAuthHeaders(endpoint, this.config.apiKey)
        };
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
        const isOpenRouter = endpoint.includes('openrouter.ai');
        const post = (msgs, temperature) => {
            const requestBody = {
                model: modelName,
                messages: msgs,
                response_format: { type: 'json_object' },
                temperature,
                max_tokens: this.maxTokens
            };
            if (isOpenRouter) {
                requestBody.route = 'fallback';
                requestBody.models = (modelName && modelName.includes(':free'))
                    ? [modelName, 'meta-llama/llama-3.3-70b-instruct:free']
                    : [modelName, 'qwen/qwen-2.5-72b-instruct'];
            }
            return this.fetchWithTimeout(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            }, this.inferenceTimeoutMs);
        };
        const response = await post(messages, 0.1);
        if (!response.ok) {
            throw new Error(`Endpoint returned status ${response.status}: ${await this.safeErrorText(response)}`);
        }
        const data = await response.json();
        const rawReasoning = data.choices?.[0]?.message?.reasoning ||
            data.choices?.[0]?.message?.reasoning_content ||
            '';
        const content = data.choices?.[0]?.message?.content ||
            rawReasoning ||
            '';
        const extractedThinking = extractThinking(content) || (typeof rawReasoning === 'string' && rawReasoning.trim() ? rawReasoning.trim() : '');
        try {
            return this.parseActionProposal(content, payload, extractedThinking);
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
            const repairReasoning = repairData.choices?.[0]?.message?.reasoning ||
                repairData.choices?.[0]?.message?.reasoning_content ||
                '';
            const repairContent = repairData.choices?.[0]?.message?.content ||
                repairReasoning ||
                '';
            const repairThinking = extractThinking(repairContent) || (typeof repairReasoning === 'string' && repairReasoning.trim() ? repairReasoning.trim() : '');
            return this.parseActionProposal(repairContent, payload, repairThinking || extractedThinking);
        }
    }
    /**
     * Extracts and validates an ActionProposal from raw model output string.
     */
    parseActionProposal(content, payload, extractedThinking) {
        // 1. Strip thinking tags: <think> ... </think> or <thought> ... </thought>
        let cleanJson = stripThinkingTags(content || '');
        // 2. Strip markdown code fences if present (```json ... ```)
        const codeBlockMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) {
            cleanJson = codeBlockMatch[1].trim();
        }
        // 3. Extract first valid JSON block
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            cleanJson = cleanJson.slice(jsonStart, jsonEnd + 1);
        }
        // 4. Remove trailing commas before } or ]
        cleanJson = cleanJson.replace(/,\s*([}\]])/g, '$1');
        let parsed;
        try {
            parsed = JSON.parse(cleanJson);
        }
        catch {
            // If parsing failed, try extracting any balanced JSON block
            const match = cleanJson.match(/\{(?:[^{}]|(\{[^{}]*\}))*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
                }
                catch (_) { }
            }
            if (!parsed) {
                // If content was conversational prose/greeting rather than JSON, gracefully wrap as kind: 'answer'
                const rawText = stripThinkingTags(content || '').trim();
                if (rawText) {
                    parsed = {
                        actionId: `act_reply_${Date.now()}`,
                        kind: 'answer',
                        confidence: 1.0,
                        risk: 'safe',
                        rationale: rawText.slice(0, 990),
                        reply: rawText,
                        reasoning: extractedThinking || undefined
                    };
                }
                else {
                    throw new Error('Model output could not be parsed as JSON');
                }
            }
        }
        // Clean empty strings and normalize common LLM variations
        if (parsed && typeof parsed === 'object') {
            // If model wrapped response inside a sub-object (e.g. { "action": { ... } } or { "exploration": { ... } })
            if (parsed.action && typeof parsed.action === 'object' && !parsed.kind) {
                parsed = { ...parsed.action, ...parsed };
            }
            if (parsed.actionProposal && typeof parsed.actionProposal === 'object' && !parsed.kind) {
                parsed = { ...parsed.actionProposal, ...parsed };
            }
            if (parsed.exploration && typeof parsed.exploration === 'object' && !parsed.kind) {
                parsed = { ...parsed.exploration, ...parsed };
            }
            // If model returned an array of actions or batch
            if (Array.isArray(parsed.actions) && !parsed.batchActions) {
                parsed.batchActions = parsed.actions;
            }
            if (Array.isArray(parsed.batchActions) && parsed.batchActions.length > 0) {
                parsed.kind = 'batch';
                parsed.batchActions = parsed.batchActions.map((sub, idx) => {
                    let s = typeof sub === 'object' && sub !== null ? { ...sub } : { kind: 'click' };
                    if (!s.actionId)
                        s.actionId = `act_sub_${idx + 1}_${Date.now()}`;
                    if (!s.kind) {
                        if (s.textToType || s.text || s.input)
                            s.kind = 'type';
                        else
                            s.kind = 'click';
                    }
                    if (!s.targetLocalId && (s.target || s.elementId || s.element || s.id)) {
                        s.targetLocalId = String(s.target || s.elementId || s.element || s.id);
                    }
                    if (s.text && !s.textToType)
                        s.textToType = String(s.text);
                    if (s.value && !s.textToType && s.kind === 'type')
                        s.textToType = String(s.value);
                    if (s.targetLocalId && !payload.elements.some((e) => e.localId === s.targetLocalId)) {
                        const rawTarget = s.targetLocalId.trim().toLowerCase();
                        const found = payload.elements.find((e) => e.localId.toLowerCase() === rawTarget || e.sanitizedName.toLowerCase().includes(rawTarget));
                        if (found)
                            s.targetLocalId = found.localId;
                    }
                    return s;
                });
            }
            // Handle interactive slot-filling normalization
            if (parsed.kind === 'ask_user' || parsed.kind === 'slot_fill') {
                parsed.kind = 'request_user_input';
            }
            if (parsed.kind === 'request_user_input') {
                if (!parsed.userInputPrompt && (parsed.prompt || parsed.question || parsed.message)) {
                    parsed.userInputPrompt = String(parsed.prompt || parsed.question || parsed.message).slice(0, 500);
                }
            }
            // If kind is missing, infer kind from fields
            if (!parsed.kind) {
                if (parsed.status === 'completed' || parsed.status === 'finished' || parsed.action === 'finish') {
                    parsed.kind = 'finish';
                }
                else if (parsed.reply || parsed.answer || parsed.message) {
                    parsed.kind = 'answer';
                    if (!parsed.rationale)
                        parsed.rationale = String(parsed.reply || parsed.answer || parsed.message).slice(0, 990);
                }
                else if (parsed.textToType || parsed.text || parsed.input) {
                    parsed.kind = 'type';
                }
                else if (parsed.targetLocalId || parsed.target || parsed.elementId || parsed.element) {
                    parsed.kind = 'click';
                }
                else {
                    parsed.kind = 'finish';
                }
            }
            if (parsed.kind === 'answer' && !parsed.rationale) {
                parsed.rationale = String(parsed.reply || parsed.answerText || 'Answer formulated').slice(0, 990);
            }
            if (!parsed.targetLocalId && (parsed.target || parsed.elementId || parsed.id || parsed.targetId || parsed.element || parsed.elementName)) {
                parsed.targetLocalId = String(parsed.target || parsed.elementId || parsed.id || parsed.targetId || parsed.element || parsed.elementName);
            }
            // If targetLocalId does not match an element ID directly, resolve via semantic grounding
            if (parsed.targetLocalId && !payload.elements.some((e) => e.localId === parsed.targetLocalId)) {
                const rawTarget = parsed.targetLocalId.trim();
                const lowTarget = rawTarget.toLowerCase();
                // 1. Direct case-insensitive or substring match on localId or sanitizedName
                let found = payload.elements.find((e) => e.localId.toLowerCase() === lowTarget ||
                    e.sanitizedName.toLowerCase() === lowTarget ||
                    e.sanitizedName.toLowerCase().includes(lowTarget) ||
                    lowTarget.includes(e.sanitizedName.toLowerCase()));
                // 2. Token overlap match
                if (!found) {
                    const targetTokens = lowTarget.split(/[\s_-]+/).filter((t) => t.length > 2);
                    if (targetTokens.length > 0) {
                        let maxOverlap = 0;
                        for (const el of payload.elements) {
                            const elName = (el.sanitizedName || '').toLowerCase();
                            const overlap = targetTokens.filter((t) => elName.includes(t)).length;
                            if (overlap > maxOverlap) {
                                maxOverlap = overlap;
                                found = el;
                            }
                        }
                    }
                }
                // 3. Structured intent grounding
                if (!found) {
                    const intent = {
                        intent: (parsed.kind === 'type' ? 'type' : 'click'),
                        targetPhrase: rawTarget,
                        targetTokens: tokenizeSemanticText(rawTarget)
                    };
                    const groundRes = groundTargetCandidates(payload.elements, intent);
                    if (groundRes.bestCandidate) {
                        found = groundRes.bestCandidate.element;
                    }
                    else if (groundRes.candidates.length > 0) {
                        found = groundRes.candidates[0].element;
                    }
                }
                // 4. Fallback for interactive actions: ground against user's overall goal
                if (!found && parsed.kind !== 'finish' && parsed.kind !== 'wait') {
                    const goalIntent = {
                        intent: (parsed.kind === 'type' ? 'type' : 'click'),
                        targetPhrase: payload.goal || '',
                        targetTokens: tokenizeSemanticText(payload.goal || '')
                    };
                    const goalGroundRes = groundTargetCandidates(payload.elements, goalIntent);
                    if (goalGroundRes.bestCandidate) {
                        found = goalGroundRes.bestCandidate.element;
                    }
                    else if (goalGroundRes.candidates.length > 0) {
                        found = goalGroundRes.candidates[0].element;
                    }
                }
                if (found) {
                    parsed.targetLocalId = found.localId;
                }
            }
            if (!parsed.actionId) {
                parsed.actionId = `act_${Date.now()}`;
            }
            if (typeof parsed.confidence !== 'number') {
                parsed.confidence = 0.95;
            }
            if (!parsed.risk) {
                parsed.risk = 'safe';
            }
            if (!parsed.rationale) {
                parsed.rationale = String(parsed.explanation ||
                    parsed.thought ||
                    parsed.reasoning ||
                    parsed.information ||
                    parsed.summary ||
                    `Execute ${parsed.kind} on target`).slice(0, 500);
            }
            if (!parsed.expectedState) {
                parsed.expectedState = parsed.kind === 'finish' ? 'Goal complete' : 'UI updates after action';
            }
            const thinking = parsed.reasoning || parsed.thought || extractedThinking;
            if (Array.isArray(thinking)) {
                parsed.reasoning = thinking.filter(Boolean).map((s) => String(s).trim()).join('\n').slice(0, 5000);
            }
            else if (thinking && typeof thinking === 'string' && thinking.trim().length > 0) {
                parsed.reasoning = String(thinking).trim().slice(0, 5000);
            }
            else {
                delete parsed.reasoning;
            }
            if (!parsed.textToType && (parsed.text || parsed.value || parsed.input || parsed.content)) {
                parsed.textToType = String(parsed.text || parsed.value || parsed.input || parsed.content);
            }
            if (!parsed.kind && (parsed.action || parsed.actionType || parsed.type)) {
                parsed.kind = String(parsed.action || parsed.actionType || parsed.type);
            }
            // Strip any extra properties not allowed by the closed schema
            for (const k of Object.keys(parsed)) {
                if (!ALLOWED_ACTION_PROPOSAL_KEYS.has(k)) {
                    delete parsed[k];
                }
            }
            if (parsed.targetLocalId === '' || (parsed.kind === 'finish' && !parsed.targetLocalId)) {
                delete parsed.targetLocalId;
            }
            if (parsed.textToType === '') {
                delete parsed.textToType;
            }
            if (parsed.selectOptionValue === '') {
                delete parsed.selectOptionValue;
            }
            if (parsed.kind === 'select' && (!parsed.selectOptionValue || parsed.selectOptionValue === '')) {
                const optionMatch = (payload.goal || '').match(/(?:select|choose)(?:\s+(?:status|option))?\s+["']?([^"']+)["']?/i);
                parsed.selectOptionValue = optionMatch ? optionMatch[1].trim() : 'pending';
            }
            if (parsed.scrollDirection === '') {
                delete parsed.scrollDirection;
            }
            if (parsed.expectedState === '') {
                delete parsed.expectedState;
            }
            if (parsed.rationale) {
                parsed.rationale = sanitizeProhibitedText(parsed.rationale).slice(0, 500);
            }
            if (parsed.reasoning) {
                parsed.reasoning = sanitizeProhibitedText(parsed.reasoning).slice(0, 5000);
            }
            if (parsed.reply) {
                parsed.reply = sanitizeProhibitedText(parsed.reply).slice(0, 5000);
            }
            if (parsed.userInputPrompt) {
                parsed.userInputPrompt = sanitizeProhibitedText(parsed.userInputPrompt).slice(0, 500);
            }
            if (Array.isArray(parsed.batchActions)) {
                for (const act of parsed.batchActions) {
                    if (act.rationale) {
                        act.rationale = sanitizeProhibitedText(act.rationale).slice(0, 500);
                    }
                }
            }
        }
        // 3. Strict Closed Validation against current context elements
        const validation = validateActionProposal(parsed, payload.elements);
        if (!validation.isValid || !validation.proposal) {
            throw new Error(validation.errorMessage || 'Invalid action proposal schema');
        }
        return validation.proposal;
    }
    buildSystemPrompt() {
        return `
You are PrivaPilot's Centralized Reasoning Agent for browser automation and conversational assistance.
You receive a sanitized screenshot (with all sensitive PII intentionally blacked out or blurred) and a compact list of interactive elements with local IDs (e.g. "el_1", "el_2").

Strict Rules:
1. Return ONLY schema-valid JSON for one single next action or answer.
2. Target elements using "targetLocalId" ONLY for interaction actions ("click", "type", "select", "hover", "drag_and_drop", "upload_file"). NEVER invent CSS selectors, XPath, or JavaScript.
3. Classify risk as "safe" (read/navigate/preview/filter/hover/drag/upload/finish/answer) or "protected" (submit/delete/pay/sign).
4. SEARCH / FILTER / INPUT DIRECTIVE: When the user's goal asks to search, filter, type, fill, enter, write, or set text in a search box or text input (role: "input" or "textarea"), you MUST return kind: "type", target that input's local ID, and set "textToType" to the exact requested text. When searching on web portals, Wikipedia, or search engines, set "pressEnter": true so the search is executed immediately. Do NOT propose "click", "observe", "wait", or a prose plan when the intention is to enter text or filter.
5. SELECT DIRECTIVE: When selecting an option from a dropdown (role: "select"), you MUST return kind: "select", target that select's local ID, and provide "selectOptionValue" with the desired option value.
6. HOVER DIRECTIVE: When hovering or inspecting flyouts/dropdown menus, return kind: "hover", and target that element's local ID.
7. DRAG AND DROP DIRECTIVE: When moving or dragging an item, return kind: "drag_and_drop", set "targetLocalId" to the source element and "destinationLocalId" to the target drop container.
8. FILE UPLOAD DIRECTIVE: When uploading or attaching a file, return kind: "upload_file", set "targetLocalId" to the file input and "fileName" to the file name.
9. MULTI-STEP REASONING: For compound goals (e.g. "go to X and search Y", "click tab and find Z", "scroll and check count"):
   Execute step 1 (navigation or intermediate click/scroll/hover), observe the updated page state on the next cycle, and continue with the subsequent steps (typing, extracting, or verifying) before proposing "finish". Do NOT propose "finish" prematurely after intermediate navigation clicks.
10. REASONING & RATIONALE: Provide a detailed step-by-step thinking process in the "reasoning" field (or inside <think>...</think> tags) explaining what elements you observe on the screen and why you chose this action or reply to advance toward the user's goal.
11. Do not return "finish" merely because you have explained what should happen. Use "finish" only when visible page state proves the user's requested browser operation is already complete.
12. GOAL COMPLETION & PROGRESSION:
   - For QUESTION-ANSWERING & INFORMATION RETRIEVAL GOALS (e.g. "search for X and tell me Y", "find Z and tell me when it was first launched and who organizes it", "how many submissions..."):
     Typing into a search box or clicking a search tab is ONLY an intermediate step! DO NOT conclude that the goal is complete just because text was typed into an input. If the search results or answer are not yet visible on screen (e.g. still on the home page or search input), DO NOT propose kind: "finish"! Instead, propose clicking the search button or submitting the search. Once the search results or target page are visible, read the answer and provide the complete answer in the "reply" and "rationale" fields before proposing kind: "finish".
   - DO NOT treat information retrieval or question-answering goals as single-action operations! Single-action completion applies ONLY to purely imperative operations (e.g. "type hello into input", "click the blue button") where no information or answer was requested. If the goal is a single-action operation and the postcondition history indicates that the action was executed: return kind: "finish" with confidence: 1.0 and a rationale confirming completion. NEVER propose repeating the exact same type or click action that was already executed.
   - If the goal was to open a preview drawer/modal and it is already visible/open: return kind: "finish".
   - If the goal was to click Refresh Sync / synchronize and the status already says "Synchronized" or "Sync": return kind: "finish".
   - If the goal was to submit clearance approval and the status already says "Approved": return kind: "finish".
   - If the goal was to filter for a query and the table is already filtered: return kind: "finish".
   You MUST return kind: "finish" with risk: "safe", confidence: 1.0, and a rationale explaining that the goal has been satisfied. Never re-trigger, repeat, or double-click an action that has already succeeded.
13. INFORMATION RETRIEVAL & DOM NAVIGATION DIRECTIVE (CRITICAL):
   - ALWAYS ground the user's request in the current active web page (see "Active Web Page" at the top of the user prompt).
   - If the user asks to see, find, check, count, or verify information (e.g. "when was it first launched and who organizes it", "how many submissions are done in problem statement 171", "what is the deadline", "who is the coordinator"):
     a) ASSUME the question refers to the current website or search results! NEVER hallucinate third-party platforms (like LeetCode, Codeforces, YouTube, etc.).
     b) NEVER return kind: "answer" asking "which platform is this from?" or asking the user for clarification when the current website is clearly relevant.
     c) If the requested information is ALREADY visible on the current screen (or inside an element's context/table row/snippet, such as a submissions count "8/500", or Wikipedia search result snippets containing dates and organizers):
        Return kind: "finish" with confidence: 1.0, risk: "safe", and state the full answer clearly in the "reply" and "rationale" fields!
     d) On Wikipedia or Search Result pages (e.g. Special:Search, Google, ISRO search):
        Read the visible search result snippets and titles directly on the page! For example, if searching "Smart India Hackathon" displays snippets with "Ministry of Education (India)" and "All India Council for Technical Education ... launching a Smart India Hackathon-2017", you can extract the launch year (2017) and organizers (Ministry of Education & AICTE) directly from the snippets and satisfy the user's goal with kind: "finish"!
        If the answer is not visible in the snippets, click the most relevant article link (role: "link") to navigate into the article and read it.
     e) If the requested information is NOT yet visible on the current screen (e.g., requires navigating to another page/section, clicking a tab, or searching):
        YOU MUST PROPOSE A DOM ACTION: return kind: "click" on the relevant menu link or tab (e.g. "PROBLEM STATEMENTS", "Submissions", "Explore", "Search"), or return kind: "type" into a search box with "pressEnter": true to find it.
        DO NOT return kind: "answer" or kind: "finish" until you have navigated and observed the actual answer!
   - ONLY return kind: "answer" for pure greetings ("hi", "hello", "who are you") or pure questions that have zero relation to web browsing or the current page (e.g. "what is 2 + 2").
14. SET-OF-MARKS (SOM) VISUAL GROUNDING:
   - The sanitized screenshot includes high-contrast visual numbered mark badges (e.g. [1], [2], [3]) drawn directly on interactive controls.
   - The badge number corresponds directly to the numeric suffix of targetLocalId (badge 1 is el_1, badge 2 is el_2, etc.). Use these visual marks to accurately locate controls on the visual viewport.
15. MULTI-ACTION BATCH DIRECTIVE (HIGHLY RECOMMENDED FOR MULTI-STEP FORMS):
   - When a form requires filling multiple fields and/or clicking a button (e.g. Type into el_1, Type into el_3, then Click el_2 to advance), return kind: "batch" with a list of atomic actions in "batchActions":
     {
       "actionId": "act_batch_1",
       "kind": "batch",
       "batchActions": [
         { "actionId": "act_1", "kind": "type", "targetLocalId": "el_1", "textToType": "Alice" },
         { "actionId": "act_2", "kind": "click", "targetLocalId": "el_2" }
       ],
       "confidence": 0.95,
       "risk": "safe",
       "rationale": "Fill input and proceed to next step"
     }
16. INTERACTIVE SLOT-FILLING DIRECTIVE (FOR MISSING USER DATA):
   - If a multi-step form requires user information that was NOT provided in the user's prompt (such as a GitHub URL, email address, custom field, or password), do NOT guess, hallucinate, or fail.
   - Return kind: "request_user_input", set "targetLocalId" to the input field, and provide "userInputPrompt" explaining clearly what data is required. The user will be prompted locally in the sidepanel and execution will smoothly resume.

JSON Schema:
{
  "actionId": "act_1",
  "kind": "click" | "type" | "select" | "scroll" | "hover" | "drag_and_drop" | "upload_file" | "wait" | "batch" | "request_user_input" | "finish" | "extract" | "answer",
  "targetLocalId": "el_1 (Required for click/type/select/hover/drag/upload/request_user_input)",
  "destinationLocalId": "Optional el_2 when kind is drag_and_drop",
  "confidence": 0.95,
  "risk": "safe" | "protected",
  "textToType": "Optional text when kind is type",
  "fileName": "Optional filename when kind is upload_file",
  "selectOptionValue": "Required option value string when kind is select (e.g. 'pending')",
  "scrollDirection": "down" | "up",
  "userInputPrompt": "Optional prompt text when kind is request_user_input asking user for missing information",
  "batchActions": [
    { "actionId": "act_sub_1", "kind": "type", "targetLocalId": "el_1", "textToType": "..." },
    { "actionId": "act_sub_2", "kind": "click", "targetLocalId": "el_2" }
  ],
  "reasoning": "Detailed step-by-step thinking process explaining what you observe on page and why this action or answer was chosen",
  "rationale": "Short explanation or summary of action/answer",
  "reply": "Optional conversational response text when kind is answer or finish",
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
            capabilities: e.actionCapabilities,
            ...(e.containerContext ? { context: e.containerContext } : {}),
            ...(e.nearestHeading ? { heading: e.nearestHeading } : {})
        }));
        const pageState = payload.pageState || { title: 'Active Page', viewport: [1280, 800] };
        const landmarks = [];
        if (pageState.visibleDialogCount && pageState.visibleDialogCount > 0) {
            landmarks.push(`Visible Dialogs/Drawers Count: ${pageState.visibleDialogCount}`);
        }
        if (pageState.dialogTitles && pageState.dialogTitles.length > 0) {
            landmarks.push(`Visible Dialog Titles: ${pageState.dialogTitles.join(', ')}`);
        }
        if (pageState.statusSummaries && pageState.statusSummaries.length > 0) {
            landmarks.push(`Status / Alerts: ${pageState.statusSummaries.join('; ')}`);
        }
        if (pageState.postconditionSummary) {
            landmarks.push(`Verified Postcondition History: ${pageState.postconditionSummary}`);
        }
        if (pageState.counters && pageState.counters.length > 0) {
            landmarks.push(`Counters & Metrics: ${pageState.counters.map((c) => `${c.label}: ${c.value}`).join(', ')}`);
        }
        if (pageState.contentSummaries && pageState.contentSummaries.length > 0) {
            landmarks.push(`Content Summaries: ${pageState.contentSummaries.join('; ')}`);
        }
        const landmarksBlock = landmarks.length > 0
            ? `\nPage State Landmarks:\n${landmarks.map(l => `- ${l}`).join('\n')}\n`
            : '';
        let redactionBlock = '';
        if (payload.redactionManifest) {
            const m = payload.redactionManifest;
            redactionBlock = `\nPrivacy Redaction Manifest:
- Total Sensitive Regions Redacted: ${m.totalRegions}
- Breakdown: ${m.categoryCounts?.piiText ?? 0} PII text, ${m.categoryCounts?.domInput ?? 0} sensitive inputs, ${m.categoryCounts?.face ?? 0} human faces/avatars, ${m.categoryCounts?.surface ?? 0} uninspectable surfaces
- Methods Applied: ${m.methodCounts?.opaqueBox ?? 0} opaque masks (#0f172a), ${m.methodCounts?.spatialBlur ?? 0} irreversible spatial blurs
- Redaction Convention: ${m.placeholderConvention || '[REDACTED]'}
- Verification: Pixel verification passed (${m.pixelVerificationPassed})
IMPORTANT PRIVACY INSTRUCTION: All redacted values and blackened regions are permanently destroyed on the local client. You MUST NOT attempt to guess, hallucinate, recover, or infer redacted text or images.\n`;
        }
        const promptSuffix = 'Analyze the layout and return the JSON action proposal. If the goal has already been achieved by the visible page state and landmarks, return kind "finish".';
        const pageTitle = pageState.title || 'Active Web Page';
        const domainStr = pageState.domain ? ` | Domain: ${pageState.domain}` : '';
        const routeStr = pageState.routeFingerprint ? ` | Route: ${pageState.routeFingerprint}` : '';
        return `Active Web Page: "${pageTitle}"${domainStr}${routeStr}
User Goal: ${payload.goal || 'Inspect page'}
${redactionBlock}${landmarksBlock}Active Viewport Elements:
${JSON.stringify(compactElements, null, 2)}

${promptSuffix}`;
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