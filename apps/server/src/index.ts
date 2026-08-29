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

    // 1. Healthcheck
    if (req.method === 'GET' && url === '/health') {
      const engineStatus = await engine.getStatus();
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
