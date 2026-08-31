/**
 * @privapilot/server - Main HTTP Reasoning Server
 *
 * Implements:
 * - GET /health
 * - POST /api/v1/reason
 */
import http from 'node:http';
import { validateSanitizedPayload, validateSanitizedChatPayload } from './schemas/payload-validator.js';
import { VlmReasoningEngine } from './engines/vlm-engine.js';
import { CanaryScannerProxy } from './proxy/canary-scanner.js';
const PORT = parseInt(process.env.PORT || '4501', 10);
const engine = new VlmReasoningEngine({
    endpoint: process.env.VLM_ENDPOINT,
    apiKey: process.env.VLM_API_KEY,
    modelName: process.env.VLM_MODEL
});
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
              <title>PrivaPilot Reasoning Server (:4501)</title>
              <style>
                body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
                .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; }
                h1 { font-size: 20px; color: #38bdf8; margin-top: 0; }
                p { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
                .pill { display: inline-block; background: #065f46; color: #6ee7b7; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 12px; }
                .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 10px; }
                .btn:hover { background: #1d4ed8; }
                pre { background: #0f172a; padding: 12px; border-radius: 8px; font-size: 12px; color: #94a3b8; overflow-x: auto; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🛡️ PrivaPilot Reasoning Server (:4501)</h1>
                <p><span class="pill">🟢 Server Active</span> &nbsp; Model: <strong>${engineStatus.modelName}</strong> (${engineStatus.provider})</p>
                <p>This is the <strong>AI API Gateway</strong>. To interact with the simulated web app & extension:</p>
                <a class="btn" href="http://localhost:4500" target="_blank">👉 Open Mission Control Portal (:4500)</a>
                <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Active Endpoints: <code>GET /health</code> | <code>POST /api/v1/reason</code></p>
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
        // 2. Reasoning Endpoint
        if (req.method === 'POST' && url === '/api/v1/reason') {
            let bodyStr = '';
            let exceeded = false;
            const MAX_REASON_BODY_BYTES = 4 * 1024 * 1024; // 4MB
            req.on('data', (chunk) => {
                if (exceeded)
                    return;
                bodyStr += chunk.toString();
                if (bodyStr.length > MAX_REASON_BODY_BYTES) {
                    exceeded = true;
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload Too Large: Request body exceeds 4MB limit' }));
                    req.destroy();
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
                    // C. Reasoning Decision
                    const action = await engine.decideNextAction(validation.payload);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(action));
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
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload Too Large: Chat request body exceeds 512KB limit' }));
                    req.destroy();
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
                    const { message, elements, sanitizedTitle, maskCount } = validation.payload;
                    const hasSanitizedContext = Array.isArray(elements) && elements.length > 0;
                    const systemPrompt = hasSanitizedContext
                        ? `You are PrivaPilot, a privacy-first browser AI assistant. The user is asking about the current webpage. Review the sanitized elements and answer concisely.`
                        : `You are PrivaPilot, a smart privacy-first browser AI assistant. Answer the user's question helpfully and concisely.`;
                    // Build user message from sanitized element list only (no raw DOM or URLs)
                    let fullUserMessage = message;
                    if (hasSanitizedContext) {
                        const elementSummary = elements
                            .slice(0, 30)
                            .map(e => `• ${e.localId || 'el'}: ${e.role || 'element'} "${e.sanitizedName || 'unnamed'}"`)
                            .join('\n');
                        fullUserMessage = `Page Title: "${sanitizedTitle || 'Untitled'}" (${maskCount || 0} sensitive masks active locally)\n\nSanitized Page Elements:\n${elementSummary}\n\nUser Question: ${message}`;
                    }
                    // Auto-detect active model
                    const engineStatus = await engine.getStatus();
                    let reply = '';
                    if (engineStatus.provider === 'ollama') {
                        const ollamaRes = await fetch(`${engineStatus.endpoint}/api/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: engineStatus.modelName,
                                messages: [
                                    { role: 'system', content: systemPrompt },
                                    { role: 'user', content: fullUserMessage }
                                ],
                                stream: false,
                                options: { temperature: 0.4 }
                            })
                        });
                        if (ollamaRes.ok) {
                            const data = await ollamaRes.json();
                            reply = data.message?.content || 'No response from model.';
                        }
                        else {
                            reply = 'Model reasoning temporarily unavailable.';
                        }
                    }
                    else if (engineStatus.provider === 'lm-studio') {
                        const lmRes = await fetch(engineStatus.endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: engineStatus.modelName,
                                messages: [
                                    { role: 'system', content: systemPrompt },
                                    { role: 'user', content: fullUserMessage }
                                ],
                                temperature: 0.4
                            })
                        });
                        if (lmRes.ok) {
                            const data = await lmRes.json();
                            reply = data.choices?.[0]?.message?.content || 'No response.';
                        }
                        else {
                            reply = 'Model reasoning temporarily unavailable.';
                        }
                    }
                    else {
                        // Sanitized context aware local response
                        reply = sanitizedTitle
                            ? `PrivaPilot verified "${sanitizedTitle}" with ${maskCount || 0} local masks applied. Privacy firewall is active.`
                            : `PrivaPilot privacy firewall is active. Local model reasoning ready.`;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ reply }));
                }
                catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Chat service temporarily unavailable' }));
                }
            });
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });
    return server;
}
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
    const server = createServer();
    server.listen(PORT, () => {
        console.log(`[PrivaPilot] Reasoning Server running on http://localhost:${PORT}`);
    });
}
//# sourceMappingURL=index.js.map