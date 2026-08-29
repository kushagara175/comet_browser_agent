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

const SERVER_URL = 'http://localhost:4501';
const OLLAMA_URL = 'http://localhost:11434';
const LM_STUDIO_URL = 'http://localhost:1234';

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
  console.log('[1/4] Probing Local Ollama Service (http://localhost:11434)...');
  const ollamaCheck = await fetchJson(`${OLLAMA_URL}/api/tags`);
  if (ollamaCheck.ok) {
    const models = ollamaCheck.data?.models || [];
    console.log(`  \x1b[32m✔ Ollama is running online!\x1b[0m`);
    if (models.length > 0) {
      console.log(`  Installed models (${models.length}):`);
      models.forEach(m => console.log(`    - ${m.name} (${(m.size / 1e9).toFixed(2)} GB)`));
    } else {
      console.log('  \x1b[33m⚠ No models installed yet in Ollama.\x1b[0m');
      console.log('    Run: `ollama run qwen2.5-vl` or `ollama run llama3.2-vision` or `ollama run llama3.2:1b`');
    }
  } else {
    console.log(`  \x1b[90m○ Ollama not detected on localhost:11434 (${ollamaCheck.error || 'offline'})\x1b[0m`);
  }

  // 2. Check LM Studio
  console.log('\n[2/4] Probing Local LM Studio Service (http://localhost:1234)...');
  const lmCheck = await fetchJson(`${LM_STUDIO_URL}/v1/models`);
  if (lmCheck.ok) {
    console.log(`  \x1b[32m✔ LM Studio is running online!\x1b[0m`);
    const models = lmCheck.data?.data || [];
    models.forEach(m => console.log(`    - ${m.id}`));
  } else {
    console.log(`  \x1b[90m○ LM Studio not detected on localhost:1234\x1b[0m`);
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
