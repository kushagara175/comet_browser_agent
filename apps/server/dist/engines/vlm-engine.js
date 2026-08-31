/**
 * @privapilot/server - Universal Local & Cloud VLM Reasoning Adapter
 *
 * Supports:
 * - Local Ollama (Native API :11434/api/chat & OpenAI API :11434/v1/chat/completions)
 * - Local LM Studio / LocalAI / vLLM (:1234/v1, :8000/v1)
 * - Cloud Open-Weight VLMs (Groq, OpenRouter, Together AI, OpenAI, Gemini)
 * - Auto-probing of local model instances with graceful fallback to MockReasoningEngine.
 */
import { validateActionProposal } from '@privapilot/protocol';
import { MockReasoningEngine } from './mock-engine.js';
export class VlmReasoningEngine {
    config;
    mockFallback;
    cachedStatus = null;
    lastProbeTime = 0;
    constructor(config = {}) {
        this.config = {
            endpoint: config.endpoint || process.env.VLM_ENDPOINT,
            apiKey: config.apiKey || process.env.VLM_API_KEY,
            modelName: config.modelName || process.env.VLM_MODEL || 'qwen2.5-vl',
            timeoutMs: config.timeoutMs || 15000
        };
        this.mockFallback = new MockReasoningEngine();
    }
    /**
     * Probes active local or remote model backends.
     */
    async getStatus() {
        const now = Date.now();
        if (this.cachedStatus && now - this.lastProbeTime < 10000) {
            return this.cachedStatus;
        }
        this.lastProbeTime = now;
        // 1. Explicitly configured endpoint
        if (this.config.endpoint) {
            const isLocal = this.isLocalAddress(this.config.endpoint);
            const isOnline = await this.pingEndpoint(this.config.endpoint);
            this.cachedStatus = {
                provider: isLocal ? 'lm-studio' : 'vlm-cloud',
                endpoint: this.config.endpoint,
                modelName: this.config.modelName || 'custom-vlm',
                isOnline,
                isMultimodal: true
            };
            return this.cachedStatus;
        }
        // 2. Auto-probe Ollama on default port (11434) with bounded timeout
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200);
            const ollamaRes = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
            clearTimeout(timeout);
            if (ollamaRes.ok) {
                const data = await ollamaRes.json();
                const models = data.models || [];
                const detectedModel = this.config.modelName && this.config.modelName !== 'qwen2.5-vl'
                    ? this.config.modelName
                    : (models[0]?.name || 'llama3.2-vision');
                this.cachedStatus = {
                    provider: 'ollama',
                    endpoint: 'http://localhost:11434',
                    modelName: detectedModel,
                    isOnline: true,
                    isMultimodal: true
                };
                return this.cachedStatus;
            }
        }
        catch {
            // Ollama offline or timed out
        }
        // 3. Auto-probe LM Studio on default port (1234)
        const lmStudioOnline = await this.pingEndpoint('http://localhost:1234/v1/models');
        if (lmStudioOnline) {
            this.cachedStatus = {
                provider: 'lm-studio',
                endpoint: 'http://localhost:1234/v1/chat/completions',
                modelName: this.config.modelName || 'local-model',
                isOnline: true,
                isMultimodal: true
            };
            return this.cachedStatus;
        }
        // 4. Default to Mock Engine
        this.cachedStatus = {
            provider: 'mock',
            endpoint: 'in-process-deterministic',
            modelName: 'PrivaPilot-Mock-Reasoner-v1',
            isOnline: true,
            isMultimodal: true
        };
        return this.cachedStatus;
    }
    /**
     * Main reasoning invocation. Returns schema-valid ActionProposal.
     */
    async decideNextAction(payload) {
        const status = await this.getStatus();
        if (status.provider === 'mock' || !status.isOnline) {
            const fallbackProposal = await this.mockFallback.decideNextAction(payload);
            const validation = validateActionProposal(fallbackProposal, payload.elements);
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
        try {
            if (status.provider === 'ollama') {
                return await this.callOllama(payload, status.endpoint, status.modelName);
            }
            else {
                return await this.callOpenAICompatible(payload, status.endpoint, status.modelName);
            }
        }
        catch (err) {
            console.warn(`[PrivaPilot:VLM] Model reasoning failed (${err.message}). Returning safe blocked error.`);
            return {
                actionId: `act_error_${Date.now()}`,
                kind: 'blocked',
                confidence: 0,
                risk: 'blocked',
                rationale: `Reasoning proposal failed closed validation: ${err.message}`
            };
        }
    }
    /**
     * Handles Ollama native format (/api/chat) with at most one schema-repair attempt.
     */
    async callOllama(payload, baseUrl, modelName) {
        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(payload);
        // Extract base64 image data without data URI prefix for Ollama
        const base64Image = payload.screenshot?.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const images = base64Image ? [base64Image] : [];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 15000);
        try {
            const userMessage = { role: 'user', content: userPrompt };
            if (images.length > 0) {
                userMessage.images = images;
            }
            let response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        userMessage
                    ],
                    format: 'json',
                    stream: false,
                    options: {
                        temperature: 0.1
                    }
                }),
                signal: controller.signal
            });
            // If Ollama rejects images because the local model is text-only (e.g. llama3.2:1b), retry without images
            if (!response.ok && images.length > 0 && response.status === 400) {
                delete userMessage.images;
                response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            userMessage
                        ],
                        format: 'json',
                        stream: false,
                        options: {
                            temperature: 0.1
                        }
                    }),
                    signal: controller.signal
                });
            }
            if (!response.ok) {
                throw new Error(`Ollama returned status ${response.status}`);
            }
            const data = await response.json();
            const content = data.message?.content || '';
            try {
                return this.parseActionProposal(content, payload);
            }
            catch (firstErr) {
                // At most ONE schema repair attempt
                console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
                const repairResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            userMessage,
                            { role: 'assistant', content },
                            {
                                role: 'user',
                                content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
                            }
                        ],
                        format: 'json',
                        stream: false,
                        options: {
                            temperature: 0.05
                        }
                    }),
                    signal: controller.signal
                });
                if (!repairResponse.ok) {
                    throw new Error(`Schema repair failed: Ollama returned status ${repairResponse.status}`);
                }
                const repairData = await repairResponse.json();
                const repairContent = repairData.message?.content || '';
                return this.parseActionProposal(repairContent, payload);
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Handles standard OpenAI-compatible format (/v1/chat/completions) with at most one schema-repair attempt.
     */
    async callOpenAICompatible(payload, endpoint, modelName) {
        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(payload);
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 15000);
        const contentArray = [
            { type: 'text', text: userPrompt }
        ];
        if (payload.screenshot && payload.screenshot.startsWith('data:image')) {
            contentArray.push({
                type: 'image_url',
                image_url: { url: payload.screenshot }
            });
        }
        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: contentArray }
            ];
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    response_format: { type: 'json_object' },
                    temperature: 0.1
                }),
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`Endpoint returned status ${response.status}`);
            }
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            try {
                return this.parseActionProposal(content, payload);
            }
            catch (firstErr) {
                // At most ONE schema repair attempt
                console.warn(`[PrivaPilot:VLM] Attempting schema repair after validation error: ${firstErr.message}`);
                const repairResponse = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            ...messages,
                            { role: 'assistant', content },
                            {
                                role: 'user',
                                content: `Your previous response failed schema validation: ${firstErr.message}\nReturn ONLY corrected valid JSON for one action proposal according to the schema.`
                            }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.05
                    }),
                    signal: controller.signal
                });
                if (!repairResponse.ok) {
                    throw new Error(`Schema repair failed: Endpoint returned status ${repairResponse.status}`);
                }
                const repairData = await repairResponse.json();
                const repairContent = repairData.choices?.[0]?.message?.content || '';
                return this.parseActionProposal(repairContent, payload);
            }
        }
        finally {
            clearTimeout(timeout);
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
    buildSystemPrompt() {
        return `
You are PrivaPilot's Centralized Reasoning Agent for browser automation.
You receive a sanitized screenshot (with all sensitive PII intentionally blacked out or blurred) and a compact list of interactive elements with local IDs (e.g. "el_1", "el_2").

Strict Rules:
1. Return ONLY schema-valid JSON for one single next action.
2. Target elements using "targetLocalId" ONLY. NEVER invent CSS selectors, XPath, or JavaScript.
3. Classify risk as "safe" (read/navigate/preview/filter) or "protected" (submit/delete/pay/sign).
4. Provide a concise rationale.

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
    async pingEndpoint(urlStr) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(urlStr, { method: 'GET', signal: controller.signal });
            clearTimeout(timeout);
            return res.status < 500;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=vlm-engine.js.map