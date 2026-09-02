/**
 * @privapilot - Local LLM & VLM Reasoning Diagnostic Script
 *
 * Checks:
 * 1. Active Reasoning Server status (http://localhost:4501)
 * 2. Local Ollama server status & pulled models (http://localhost:11434)
 * 3. Local LM Studio server status (http://localhost:1234)
 * 4. End-to-end reasoning test with a synthetic sanitized payload
 */

import http from 'node:http';

const SERVER_URL = process.env.PRIVAPILOT_SERVER_URL || 'http://localhost:4501';

// Probe both loopback spellings. On Windows `localhost` resolves to ::1 first while
// Ollama and LM Studio bind the IPv4 loopback, which is the single most common reason
// a model that is definitely running still reads as "offline".
const OLLAMA_URLS = ['http://127.0.0.1:11434', 'http://localhost:11434'];
const LM_STUDIO_URLS = ['http://127.0.0.1:1234', 'http://localhost:1234'];

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 3000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function runDiagnostics() {
  console.log('\n' + '='.repeat(64));
  console.log('  PrivaPilot — Local LLM & VLM Model Diagnostic Suite');
  console.log('='.repeat(64) + '\n');

  // 1. Check Ollama
  console.log('[1/4] Probing Local Ollama Service (127.0.0.1 / localhost :11434)...');
  let ollamaFound = false;
  for (const base of OLLAMA_URLS) {
    const ollamaCheck = await fetchJson(`${base}/api/tags`);
    if (!ollamaCheck.ok) {
      console.log(`  \x1b[90m○ ${base} — ${ollamaCheck.error || 'offline'}\x1b[0m`);
      continue;
    }
    ollamaFound = true;
    const models = ollamaCheck.data?.models || [];
    console.log(`  \x1b[32m✔ Ollama is running at ${base}\x1b[0m`);
    if (models.length > 0) {
      console.log(`  Installed models (${models.length}):`);
      models.forEach(m => console.log(`    - ${m.name} (${(m.size / 1e9).toFixed(2)} GB)`));
      const hasVision = models.some(m => /vl|vision|llava|moondream|minicpm-v/i.test(m.name || ''));
      if (!hasVision) {
        console.log('  \x1b[33m⚠ No vision-capable model installed — screenshots will not be sent.\x1b[0m');
        console.log('    Run: `ollama pull qwen2.5vl` (or llama3.2-vision, llava)');
      }
    } else {
      console.log('  \x1b[33m⚠ No models installed yet in Ollama.\x1b[0m');
      console.log('    Run: `ollama pull qwen2.5vl` or `ollama pull llama3.2-vision` or `ollama pull llama3.2:1b`');
    }
    break;
  }
  if (!ollamaFound) {
    console.log('  \x1b[33m  Start it with `ollama serve` (Windows: launch the Ollama app).\x1b[0m');
  }

  // 2. Check LM Studio
  console.log('\n[2/4] Probing Local LM Studio Service (127.0.0.1 / localhost :1234)...');
  let lmFound = false;
  for (const base of LM_STUDIO_URLS) {
    const lmCheck = await fetchJson(`${base}/v1/models`);
    if (!lmCheck.ok) {
      console.log(`  \x1b[90m○ ${base} — ${lmCheck.error || 'offline'}\x1b[0m`);
      continue;
    }
    lmFound = true;
    console.log(`  \x1b[32m✔ LM Studio is running at ${base}\x1b[0m`);
    const models = lmCheck.data?.data || [];
    models.forEach(m => console.log(`    - ${m.id}`));
    break;
  }
  if (!lmFound) {
    console.log('  \x1b[90m  (Optional — only needed if you use LM Studio instead of Ollama.)\x1b[0m');
  }

  // 2b. Check the reasoning gateway itself
  console.log(`\n[2b/4] Probing PrivaPilot Reasoning Gateway (${SERVER_URL})...`);
  const gatewayCheck = await fetchJson(`${SERVER_URL}/api/v1/model-status`);
  if (gatewayCheck.ok) {
    const s = gatewayCheck.data || {};
    console.log(`  \x1b[32m✔ Gateway online\x1b[0m — modelConnected: ${s.modelConnected ? '\x1b[32myes\x1b[0m' : '\x1b[33mno\x1b[0m'}`);
    if (s.detail) console.log(`  ${s.detail}`);
    if (s.lastError) console.log(`  \x1b[33m${s.lastError}\x1b[0m`);
  } else {
    console.log(`  \x1b[33m○ Gateway not reachable (${gatewayCheck.error || 'offline'}). Start it with \`npm run dev:server\`.\x1b[0m`);
  }

  // 3. Test Reasoning Engine Direct Simulation
  console.log('\n[3/4] Testing Reasoning Engine on Synthetic Sanitized Web Context...');

  const syntheticSanitizedPayload = {
    _brand: 'SanitizedContext_Verified',
    schemaVersion: '1.0',
    runId: `diag_${Date.now()}`,
    timestamp: Date.now(),
    goal: 'Find the pending telemetry request and open its safe preview drawer',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      {
        localId: 'el_header_nav',
        role: 'generic',
        sanitizedName: 'Mission Dashboard Header',
        coarseBounds: [0.0, 0.0, 1.0, 0.08],
        state: ['visible'],
        actionCapabilities: []
      },
      {
        localId: 'el_search_input',
        role: 'input',
        sanitizedName: 'Filter Request Subsystem',
        coarseBounds: [0.03, 0.15, 0.25, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['type', 'click']
      },
      {
        localId: 'el_table_row_pending',
        role: 'generic',
        sanitizedName: 'Subsystem A - Status: Pending [REDACTED_AADHAAR]',
        coarseBounds: [0.03, 0.25, 0.94, 0.06],
        state: ['visible'],
        actionCapabilities: []
      },
      {
        localId: 'el_btn_preview_safe',
        role: 'button',
        sanitizedName: 'Safe Preview',
        coarseBounds: [0.75, 0.25, 0.1, 0.04],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      },
      {
        localId: 'el_btn_submit_protected',
        role: 'button',
        sanitizedName: 'Approve & Submit Telemetry Batch',
        coarseBounds: [0.75, 0.85, 0.18, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'PrivaPilot Mission Control Portal',
      viewport: [1280, 800]
    }
  };

  const { VlmReasoningEngine } = await import('../apps/server/dist/engines/vlm-engine.js');
  const engine = new VlmReasoningEngine();
  const status = await engine.getStatus();

  console.log(`  Engine Provider: \x1b[36m${status.provider.toUpperCase()}\x1b[0m`);
  console.log(`  Engine Endpoint: \x1b[90m${status.endpoint}\x1b[0m`);
  console.log(`  Engine Model:    \x1b[33m${status.modelName}\x1b[0m`);
  console.log(`  Multimodal:      ${status.isMultimodal ? 'yes' : '\x1b[33mno (text-only)\x1b[0m'}`);
  if (status.detail) console.log(`  Diagnosis:       ${status.detail}`);
  if (status.lastError) console.log(`  \x1b[33mProbe notes:     ${status.lastError}\x1b[0m`);

  const tStart = Date.now();
  const decision = await engine.decideNextAction(syntheticSanitizedPayload);
  const latency = Date.now() - tStart;

  console.log('\n[4/4] Reasoning Decision Output:');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Action Kind:       \x1b[32m${decision.kind}\x1b[0m`);
  console.log(`  Target Element:    \x1b[36m${decision.targetLocalId || 'none'}\x1b[0m`);
  console.log(`  Risk Policy:       \x1b[${decision.risk === 'protected' ? '33' : '32'}m${decision.risk.toUpperCase()}\x1b[0m`);
  console.log(`  Model Confidence:  ${(decision.confidence * 100).toFixed(1)}%`);
  console.log(`  Model Rationale:   "${decision.rationale}"`);
  console.log(`  Expected State:    "${decision.expectedState}"`);
  console.log(`  Inference Latency: \x1b[35m${latency} ms\x1b[0m`);
  console.log('  ' + '-'.repeat(50));

  console.log('\n\x1b[32m✔ Local Reasoning Diagnostic Completed Successfully!\x1b[0m\n');
}

runDiagnostics().catch(err => {
  console.error('\n❌ Diagnostic failed:', err);
  process.exit(1);
});
