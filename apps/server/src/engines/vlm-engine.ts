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

import { SanitizedNetworkPayload, ActionProposal, validateActionProposal, ALLOWED_ACTION_PROPOSAL_KEYS } from '@privapilot/protocol';
import { MockReasoningEngine } from './mock-engine.js';

export interface VlmConfig {
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly modelName?: string;
  readonly timeoutMs?: number;
  readonly probeTimeoutMs?: number;
  /** Ollama context window. See the numCtx accessor for why the default is unusable. */
  readonly numCtx?: number;
  readonly maxTokens?: number;
}

export interface EngineStatus {
  readonly provider: 'ollama' | 'lm-studio' | 'vlm-cloud' | 'mock';
  readonly endpoint: string;
  readonly modelName: string;
  readonly isOnline: boolean;
  readonly isMultimodal: boolean;
  /** Human-readable diagnosis of how this backend was chosen, or why none was. */
  readonly detail?: string;
  /** Connection or inference errors observed while probing, if any. */
  readonly lastError?: string;
}

export interface ChatResult {
  readonly reply: string;
  readonly provider: EngineStatus['provider'];
  readonly modelName: string;
  /** True when the reply came from the offline fallback rather than a real model. */
  readonly degraded: boolean;
  readonly detail?: string;
}

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
function normalizeOrigin(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    // 0.0.0.0 is a bind address, not a dial address.
    if (parsed.hostname === '0.0.0.0') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function uniqueOrigins(...candidates: Array<string | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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
export function buildProviderAuthHeaders(endpoint: string, apiKey?: string): Record<string, string> {
  if (!apiKey) return {};

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (hostname.endsWith('.openai.azure.com') || hostname.endsWith('.services.ai.azure.com')) {
      return { 'api-key': apiKey };
    }
  } catch {
    // Let fetch report malformed endpoints; do not risk placing a key in the URL.
  }

  return { Authorization: `Bearer ${apiKey}` };
}

/** Loose match so a configured "qwen2.5-vl" still resolves an installed "qwen2.5vl:7b". */
function looselyMatchesModel(installedName: string, configured: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const installed = installedName.toLowerCase();
  const wanted = configured.toLowerCase();
  if (installed === wanted) return true;
  if (installed.split(':')[0] === wanted.split(':')[0]) return true;
  return norm(wanted).length >= 4 && norm(installed).startsWith(norm(wanted));
}

function isEmbeddingModel(model: any): boolean {
  const name = String(model?.name || model?.model || '').toLowerCase();
  if (EMBEDDING_NAME_HINTS.some((hint) => name.includes(hint))) return true;
  const family = String(model?.details?.family || '').toLowerCase();
  return EMBEDDING_FAMILIES.has(family);
}

function isVisionModel(model: any): boolean {
  if (Array.isArray(model?.capabilities) && model.capabilities.includes('vision')) return true;
  const name = String(model?.name || model?.model || '').toLowerCase();
  if (VISION_NAME_HINTS.some((hint) => name.includes(hint))) return true;
  const families: string[] = Array.isArray(model?.details?.families) ? model.details.families : [];
  return families.some((f) => VISION_FAMILIES.has(String(f).toLowerCase()));
}

export class VlmReasoningEngine {
  private config: VlmConfig;
  private readonly mockFallback: MockReasoningEngine;
  private cachedStatus: EngineStatus | null = null;
  private lastProbeTime = 0;
  private cloudExhaustedUntil = 0;

  constructor(config: VlmConfig = {}) {
    this.config = {
      endpoint: config.endpoint || process.env.VLM_ENDPOINT || undefined,
      apiKey: config.apiKey || process.env.VLM_API_KEY || undefined,
      // Left undefined when unset so auto-probe can pick whatever is actually installed
      // instead of insisting on a default tag the user never pulled.
      modelName: config.modelName || process.env.VLM_MODEL || undefined,
      timeoutMs: config.timeoutMs ?? parseInt(process.env.VLM_TIMEOUT_MS || '90000', 10),
      probeTimeoutMs: config.probeTimeoutMs ?? parseInt(process.env.VLM_PROBE_TIMEOUT_MS || '4000', 10),
      numCtx: config.numCtx ?? parseInt(process.env.VLM_NUM_CTX || '8192', 10),
      maxTokens: config.maxTokens ?? parseInt(process.env.VLM_MAX_TOKENS || '600', 10)
    };
    this.mockFallback = new MockReasoningEngine();
  }

  /** Forces the next getStatus() call to re-probe every backend. */
  invalidateStatusCache(): void {
    this.cachedStatus = null;
    this.lastProbeTime = 0;
  }

  private get inferenceTimeoutMs(): number {
    const v = this.config.timeoutMs;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 90000;
  }

  private get maxTokens(): number {
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
  private get numCtx(): number {
    const v = this.config.numCtx;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 8192;
  }

  private get probeTimeoutMs(): number {
    const v = this.config.probeTimeoutMs;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 4000;
  }

  private ollamaOrigins(): string[] {
    return uniqueOrigins(
      normalizeOrigin(process.env.OLLAMA_HOST),
      'http://127.0.0.1:11434',
      'http://localhost:11434'
    );
  }

  private lmStudioOrigins(): string[] {
    return uniqueOrigins(
      normalizeOrigin(process.env.LM_STUDIO_HOST),
      'http://127.0.0.1:1234',
      'http://localhost:1234'
    );
  }

  /**
   * Probes active local or remote model backends.
   */
  async getStatus(): Promise<EngineStatus> {
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
    const probeErrors: string[] = [];

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

      const models: any[] = Array.isArray(tags.data?.models) ? tags.data.models : [];
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
      let selected: any;
      let detail: string;

      if (configured) {
        const match = chatModels.find((m) => looselyMatchesModel(String(m.name || m.model || ''), configured));
        if (match) {
          selected = match;
          detail = `Ollama at ${origin} using configured model "${match.name}"`;
        } else {
          // The configured model is not pulled. Falling back to an installed one keeps
          // the system usable instead of returning "model not found" on every request.
          selected = chatModels.find(isVisionModel) || chatModels[0];
          detail =
            `Ollama at ${origin}: configured VLM_MODEL "${configured}" is not installed ` +
            `(run "ollama pull ${configured}"). Falling back to "${selected.name}".`;
          probeErrors.push(`VLM_MODEL "${configured}" not found in Ollama`);
        }
      } else {
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

      const loaded: any[] = Array.isArray(models.data?.data) ? models.data.data : [];
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
      detail:
        'No local or configured model backend reachable. Using the deterministic offline reasoner. ' +
        'Start Ollama ("ollama serve" then "ollama pull qwen2.5vl") or LM Studio, or set VLM_ENDPOINT.',
      lastError: probeErrors.join(' | ') || undefined
    };
    return this.cachedStatus;
  }

  /**
   * Sanitized conversational turn. Never throws: a backend failure degrades to an
   * explanatory offline reply rather than surfacing a 500 to the extension.
   */
  async chat(systemPrompt: string, userMessage: string): Promise<ChatResult> {
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
      const raw =
        status.provider === 'ollama'
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
    } catch (err: any) {
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

  private buildOfflineReply(status: EngineStatus, requestError?: string): string {
    const cause = requestError
      ? `The "${status.modelName}" backend accepted the connection but the request failed: ${requestError}.`
      : status.lastError
        ? `No model backend is reachable (${status.lastError}).`
        : 'No model backend is reachable.';

    return (
      'PrivaPilot sanitized this page locally and the privacy firewall is active, ' +
      'but the reasoning model is not answering right now.\n\n' +
      `${cause}\n\n` +
      'To connect a model:\n' +
      '  1. Start Ollama:  ollama serve\n' +
      '  2. Pull a vision model:  ollama pull qwen2.5vl\n' +
      '  3. Or point the gateway at any OpenAI-compatible endpoint via VLM_ENDPOINT / VLM_API_KEY / VLM_MODEL.\n\n' +
      'Open http://localhost:4501/api/v1/model-status for a live diagnosis.'
    );
  }

  private async chatViaOllama(status: EngineStatus, systemPrompt: string, userMessage: string): Promise<string> {
    const res = await this.fetchWithTimeout(
      `${status.endpoint.replace(/\/$/, '')}/api/chat`,
      {
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
      },
      this.inferenceTimeoutMs
    );

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}: ${await this.safeErrorText(res)}`);
    }
    const data: any = await res.json();
    return data?.message?.content || '';
  }

  private async chatViaOpenAICompatible(
    status: EngineStatus,
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildProviderAuthHeaders(status.endpoint, this.config.apiKey)
    };

    const isOpenRouter = status.endpoint.includes('openrouter.ai');
    const requestBody: any = {
      model: status.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.4,
      max_tokens: this.maxTokens
    };

    if (isOpenRouter) {
      requestBody.route = 'fallback';
      requestBody.models = [status.modelName, 'qwen/qwen-2.5-72b-instruct'];
    }

    const res = await this.fetchWithTimeout(
      status.endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      },
      this.inferenceTimeoutMs
    );

    if (!res.ok) {
      throw new Error(`Endpoint returned ${res.status}: ${await this.safeErrorText(res)}`);
    }
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  /**
   * Main reasoning invocation. Returns schema-valid ActionProposal.
   */
  async decideNextAction(payload: SanitizedNetworkPayload): Promise<ActionProposal> {
    const status = await this.getStatus();

    if (status.provider === 'mock' || !status.isOnline) {
      return this.mockProposal(payload);
    }

    try {
      if (status.provider === 'ollama') {
        return await this.callOllama(payload, status.endpoint, status.modelName);
      } else {
        return await this.callOpenAICompatible(payload, status.endpoint, status.modelName);
      }
    } catch (err: any) {
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
  private async mockProposal(payload: SanitizedNetworkPayload, degradeReason?: string): Promise<ActionProposal> {
    const fallbackProposal = await this.mockFallback.decideNextAction(payload);
    // Sanitize degradeReason to clean text only (no URLs, no script tags, no html)
    const cleanReason = degradeReason
      ? degradeReason.replace(/https?:\/\/[^\s)]+/gi, '').replace(/[<>]/g, '').replace(/[^a-zA-Z0-9 _.,:;-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
      : '';
    const annotated: ActionProposal = cleanReason
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
  private async callOllama(
    payload: SanitizedNetworkPayload,
    baseUrl: string,
    modelName: string
  ): Promise<ActionProposal> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(payload);
    const chatUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;

    // Extract base64 image data without data URI prefix for Ollama
    const base64Image = payload.screenshot?.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const images = base64Image ? [base64Image] : [];

    const userMessage: any = { role: 'user', content: userPrompt };
    if (this.cachedStatus?.isMultimodal && images.length > 0) {
      userMessage.images = images;
    }

    const post = (messages: any[], temperature: number) =>
      this.fetchWithTimeout(
        chatUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages,
            format: 'json',
            stream: false,
            options: { temperature, num_ctx: this.numCtx }
          })
        },
        this.inferenceTimeoutMs
      );

    let response = await post([{ role: 'system', content: systemPrompt }, userMessage], 0.1);

    if (!response.ok && userMessage.images) {
      // Fallback: retry text-only if the model does not accept images
      delete userMessage.images;
      response = await post([{ role: 'system', content: systemPrompt }, userMessage], 0.1);
    }

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}: ${await this.safeErrorText(response)}`);
    }

    const data: any = await response.json();
    const content = data.message?.content || '';

    try {
      return this.parseActionProposal(content, payload);
    } catch (firstErr: any) {
      // At most ONE schema repair attempt
      console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
      const repairResponse = await post(
        [
          { role: 'system', content: systemPrompt },
          userMessage,
          { role: 'assistant', content },
          {
            role: 'user',
            content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
          }
        ],
        0.05
      );

      if (!repairResponse.ok) {
        throw new Error(`Schema repair failed: Ollama returned status ${repairResponse.status}`);
      }

      const repairData: any = await repairResponse.json();
      const repairContent = repairData.message?.content || '';
      return this.parseActionProposal(repairContent, payload);
    }
  }

  /**
   * Handles standard OpenAI-compatible format (/v1/chat/completions) with at most one schema-repair attempt.
   */
  private async callOpenAICompatible(
    payload: SanitizedNetworkPayload,
    endpoint: string,
    modelName: string
  ): Promise<ActionProposal> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const contentArray: any[] = [
      { type: 'text', text: userPrompt }
    ];

    if (payload.screenshot && payload.screenshot.startsWith('data:image')) {
      contentArray.push({
        type: 'image_url',
        image_url: { url: payload.screenshot }
      });
    }

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentArray }
    ];

    const isOpenRouter = endpoint.includes('openrouter.ai');
    const post = (msgs: any[], temperature: number) => {
      const requestBody: any = {
        model: modelName,
        messages: msgs,
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: this.maxTokens
      };

      if (isOpenRouter) {
        requestBody.route = 'fallback';
        requestBody.models = [modelName, 'qwen/qwen-2.5-72b-instruct'];
      }

      return this.fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        },
        this.inferenceTimeoutMs
      );
    };

    const response = await post(messages, 0.1);

    if (!response.ok) {
      throw new Error(`Endpoint returned status ${response.status}: ${await this.safeErrorText(response)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
      return this.parseActionProposal(content, payload);
    } catch (firstErr: any) {
      // At most ONE schema repair attempt
      console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
      const repairResponse = await post(
        [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
          }
        ],
        0.05
      );

      if (!repairResponse.ok) {
        throw new Error(`Schema repair failed: Endpoint returned status ${repairResponse.status}`);
      }

      const repairData: any = await repairResponse.json();
      const repairContent = repairData.choices?.[0]?.message?.content || '';
      return this.parseActionProposal(repairContent, payload);
    }
  }

  /**
   * Extracts and validates an ActionProposal from raw model output string.
   */
  private parseActionProposal(content: string, payload: SanitizedNetworkPayload): ActionProposal {
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

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      throw new Error('Model output could not be parsed as JSON');
    }

    // Clean empty strings and normalize common LLM variations
    if (parsed && typeof parsed === 'object') {
      if (!parsed.rationale && (parsed.explanation || parsed.thought || parsed.reasoning || parsed.summary)) {
        parsed.rationale = String(parsed.explanation || parsed.thought || parsed.reasoning || parsed.summary).slice(0, 500);
      }
      if (!parsed.targetLocalId && (parsed.target || parsed.elementId || parsed.id || parsed.targetId)) {
        parsed.targetLocalId = String(parsed.target || parsed.elementId || parsed.id || parsed.targetId);
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
    }

    // 3. Strict Closed Validation against current context elements
    const validation = validateActionProposal(parsed, payload.elements);
    if (!validation.isValid || !validation.proposal) {
      throw new Error(validation.errorMessage || 'Invalid action proposal schema');
    }

    return validation.proposal;
  }

  private buildSystemPrompt(): string {
    return `
You are PrivaPilot's Centralized Reasoning Agent for browser automation.
You receive a sanitized screenshot (with all sensitive PII intentionally blacked out or blurred) and a compact list of interactive elements with local IDs (e.g. "el_1", "el_2").

Strict Rules:
1. Return ONLY schema-valid JSON for one single next action.
2. Target elements using "targetLocalId" ONLY for interaction actions ("click", "type", "select"). NEVER invent CSS selectors, XPath, or JavaScript.
3. Classify risk as "safe" (read/navigate/preview/filter/finish) or "protected" (submit/delete/pay/sign).
4. SEARCH / FILTER / INPUT DIRECTIVE: When the user's goal asks to search, filter, type, fill, enter, write, or set text in a search box or text input (role: "input" or "textarea"), you MUST return kind: "type", target that input's local ID, and set "textToType" to the exact requested text. Do NOT propose "click", "observe", "wait", or a prose plan when the intention is to enter text or filter.
5. SELECT DIRECTIVE: When selecting an option from a dropdown (role: "select"), you MUST return kind: "select", target that select's local ID, and provide "selectOptionValue" with the desired option value.
6. Provide a concise rationale. Never answer with a plan, instructions, or conversational prose; choose the single next executable action.
7. Do not return "finish" merely because you have explained what should happen. Use "finish" only when visible page state proves the user's requested browser operation is already complete.
8. GOAL COMPLETION: If the user's goal has already been achieved by the current page state and visible landmarks:
   - If the goal was to open a preview drawer/modal and it is already visible/open: return kind: "finish".
   - If the goal was to click Refresh Sync / synchronize and the status already says "Synchronized" or "Sync": return kind: "finish".
   - If the goal was to submit clearance approval and the status already says "Approved": return kind: "finish".
   - If the goal was to filter for a query and the search box already has the query text and table is filtered: return kind: "finish".
   You MUST return kind: "finish" with risk: "safe", confidence: 1.0, and a rationale explaining that the goal has been satisfied. Never re-trigger, repeat, or double-click an action that has already succeeded.

JSON Schema:
{
  "actionId": "act_1",
  "kind": "click" | "type" | "select" | "scroll" | "wait" | "finish",
  "targetLocalId": "el_1",
  "confidence": 0.95,
  "risk": "safe" | "protected",
  "textToType": "Optional text when kind is type",
  "selectOptionValue": "Required option value string when kind is select (e.g. 'pending')",
  "rationale": "Short explanation",
  "expectedState": "Expected UI change"
}
`.trim();
  }

  private buildUserPrompt(payload: SanitizedNetworkPayload): string {
    const compactElements = payload.elements.map(e => ({
      id: e.localId,
      role: e.role,
      name: e.sanitizedName,
      bounds: e.coarseBounds,
      capabilities: e.actionCapabilities
    }));

    const pageState = payload.pageState || { title: 'Active Page', viewport: [1280, 800] };
    const landmarks: string[] = [];
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

    return `Goal: ${payload.goal || 'Inspect page'}
${redactionBlock}${landmarksBlock}Active Viewport Elements:
${JSON.stringify(compactElements, null, 2)}

${promptSuffix}`;
  }

  private isLocalAddress(urlStr: string): boolean {
    return urlStr.includes('localhost') || urlStr.includes('127.0.0.1') || urlStr.includes('0.0.0.0');
  }

  /**
   * Bounded fetch. Reports an abort as a timeout and a transport failure by its
   * OS error code, so probe diagnostics say what actually happened instead of
   * the opaque "fetch failed".
   */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new Error(`timed out after ${timeoutMs}ms`);
      }
      throw new Error(err?.cause?.code || err?.message || 'connection failed');
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchJson(url: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    try {
      const res = await this.fetchWithTimeout(url, { method: 'GET' }, this.probeTimeoutMs);
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      return { ok: true, data: await res.json() };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'connection failed' };
    }
  }

  private async pingEndpoint(urlStr: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.fetchWithTimeout(urlStr, { method: 'GET' }, this.probeTimeoutMs);
      // Any non-5xx answer proves something is listening and routing.
      return res.status < 500 ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'connection failed' };
    }
  }

  private async safeErrorText(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, 200);
    } catch {
      return res.statusText || '';
    }
  }
}
