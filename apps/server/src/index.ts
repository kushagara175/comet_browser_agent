/**
 * @privapilot/server - Main HTTP Reasoning Server
 *
 * Implements:
 * - GET /health
 * - POST /api/v1/reason
 */

import http from 'node:http';
import { validateSanitizedPayload } from './schemas/payload-validator.js';
import { VlmReasoningEngine } from './engines/vlm-engine.js';
import { CanaryScannerProxy } from './proxy/canary-scanner.js';
import { sanitizeHeadersForLogging } from './middleware/zero-log.js';

const PORT = parseInt(process.env.PORT || '4501', 10);
const engine = new VlmReasoningEngine({
  endpoint: process.env.VLM_ENDPOINT,
  apiKey: process.env.VLM_API_KEY,
  modelName: process.env.VLM_MODEL
});

export function createServer(): http.Server {
  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
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
      req.on('data', (chunk: Buffer | string) => { bodyStr += chunk.toString(); });
      req.on('end', async () => {
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
            res.end(JSON.stringify({ error: validation.errorMessage }));
            return;
          }

          // C. Reasoning Decision
          const action = await engine.decideNextAction(validation.payload);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(action));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Reasoning Engine Error: ${err.message}` }));
        }
      });
      return;
    }

    // 3. Direct Conversational Chat Endpoint (with live page context)
    if (req.method === 'POST' && url === '/api/v1/chat') {
      let bodyStr = '';
      req.on('data', (chunk: Buffer | string) => { bodyStr += chunk.toString(); });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr);
          const { message, pageUrl, pageTitle, pageText } = body;

          if (!message || typeof message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing message field' }));
            return;
          }

          // Build an objective, page-aware prompt that explains content, forms, and privacy implications clearly
          const hasPageContext = !!(pageTitle || pageUrl || (pageText && pageText.trim().length > 0));

          const systemPrompt = hasPageContext
            ? `You are PrivaPilot, a web browser AI assistant. Your task is to objectively describe and explain web page content, forms, buttons, and user requests from the provided page context. Be direct, concise, and helpful.`
            : `You are PrivaPilot, a smart browser AI assistant. Answer briefly and helpfully. When the user navigates to a webpage, you will help them understand what is on screen and protect their privacy.`;

          // Build the user message
          let fullUserMessage = message;

          if (hasPageContext) {
            const contextLines: string[] = [];
            if (pageTitle) contextLines.push(`Page Title: "${pageTitle}"`);
            if (pageUrl) contextLines.push(`Page URL: ${pageUrl}`);
            if (pageText && pageText.trim().length > 0) {
              contextLines.push(`Page Elements & Content: ${pageText.slice(0, 1000)}`);
            }
            fullUserMessage = `${contextLines.join('\n')}\n\nUser Question: ${message}`;
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
              const data: any = await ollamaRes.json();
              reply = data.message?.content || 'No response from model.';
            } else {
              const errText = await ollamaRes.text();
              reply = `Model error (${ollamaRes.status}): ${errText.slice(0, 200)}`;
            }
          } else if (engineStatus.provider === 'lm-studio') {
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
              const data: any = await lmRes.json();
              reply = data.choices?.[0]?.message?.content || 'No response.';
            } else {
              reply = 'LM Studio model error. Please retry.';
            }
          } else {
            // Mock fallback — page-aware
            reply = pageTitle
              ? `PrivaPilot can see you are on "${pageTitle}" (${pageUrl}). No AI model running — start Ollama with \`ollama serve\` to enable live analysis.`
              : `PrivaPilot privacy firewall is active. Start Ollama (\`ollama serve\`) and pull a model (\`ollama pull llama3.2:1b\`) to enable AI chat.`;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reply }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Chat Error: ${err.message}` }));
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
