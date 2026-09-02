/**
 * @privapilot/scripts - Real End-to-End Extension Run
 *
 * Loads the actual unpacked extension into real Chrome, opens the demo portal,
 * and drives a full agent run through the extension's own message plumbing:
 * side panel -> service worker -> content script -> offscreen sanitizer ->
 * reasoning server -> action execution.
 *
 * This replaces scripts/run-e2e-chrome.js, which launched Chrome, never connected
 * to it, never loaded the extension, and wrote Node-side arithmetic to
 * docs/benchmark-results/real-e2e-latencies.json as if it were measured.
 * See docs/benchmark-results/archive/README-FABRICATED-LATENCIES.md.
 *
 * Chrome 137+ removed --load-extension, so the extension is installed over CDP via
 * Extensions.loadUnpacked, which requires --enable-unsafe-extension-debugging.
 *
 * Usage: npm run test:e2e
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ProcessRegistry, launchChrome, waitForHttp, waitForServer, sleep } from './lib/chrome-launcher.mjs';
import { CdpClient, CdpPage } from './lib/cdp-client.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = path.join(ROOT_DIR, 'apps', 'extension');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'benchmark-results');
const PORTAL_PORT = 4500;
const SERVER_PORT = 4501;
const CDP_PORT = 9337;

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** Finds our extension's service worker, which registers lazily after install. */
async function findServiceWorker(client, extensionId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = await client.listTargets();
    const sw = targets.find(
      (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extensionId}/`)
    );
    if (sw) return sw;
    await sleep(400);
  }
  return null;
}

async function main() {
  const registry = new ProcessRegistry('privapilot-e2e');
  registry.installSignalHandlers();

  console.log('\n[PrivaPilot] Real extension end-to-end run\n');

  // 1. Services
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: String(PORTAL_PORT) }
  });
  registry.add(portal);

  const server = spawn(process.execPath, ['--env-file-if-exists=.env', path.join(ROOT_DIR, 'apps', 'server', 'dist', 'index.js')], {
    cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: String(SERVER_PORT) }
  });
  registry.add(server);

  if (!(await waitForHttp(`http://127.0.0.1:${PORTAL_PORT}/`, 10000))) throw new Error('Demo portal failed to start');
  if (!(await waitForServer(`http://127.0.0.1:${SERVER_PORT}/health`, 10000))) throw new Error('Reasoning server failed to start');
  console.log(`  [1/5] Portal :${PORTAL_PORT} and reasoning server :${SERVER_PORT} up`);

  const modelStatus = await (await fetch(`http://127.0.0.1:${SERVER_PORT}/api/v1/model-status`)).json();
  console.log(`  [2/5] Model  : ${modelStatus.modelName} (${modelStatus.provider}), connected=${modelStatus.modelConnected}`);

  // 2. Chrome + extension. Chrome 137+ dropped --load-extension; install over CDP.
  const { chromePath } = await launchChrome({
    port: CDP_PORT,
    registry,
    extraFlags: ['--enable-unsafe-extension-debugging']
  });
  const client = await CdpClient.connect(CDP_PORT);

  const { id: extensionId } = await client.send('Extensions.loadUnpacked', { path: EXT_DIR });
  console.log(`  [3/5] Extension installed: ${extensionId}`);

  const sw = await findServiceWorker(client, extensionId);
  if (!sw) throw new Error('Extension service worker never registered');
  const swSession = await client.attach(sw.targetId);
  await client.send('Runtime.enable', {}, swSession).catch(() => {});
  await client.send('Runtime.runIfWaitingForDebugger', {}, swSession).catch(() => {});
  await sleep(400);
  console.log('  [4/5] Service worker attached and running');

  // 3. A real tab for the agent to act on.
  const { targetId, sessionId } = await client.newPage('about:blank');
  const page = new CdpPage(client, sessionId, targetId);
  await page.enableDomains();
  await page.setViewport(1280, 800);
  await page.goto(`http://127.0.0.1:${PORTAL_PORT}/`);
  await sleep(600); // let the content script attach

  // 4. Drive the run through the extension's own message path, exactly as the
  //    side panel does. The service worker cannot message itself, so the request
  //    is issued from an extension page - which is what production does.
  const { targetId: panelTarget, sessionId: panelSession } = await client.newPage(
    `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`
  );
  const panel = new CdpPage(client, panelSession, panelTarget);
  await panel.send('Runtime.enable').catch(() => {});
  await sleep(400);

  // The side panel page must not be the active tab: the coordinator captures the
  // active tab, and correctly refuses to capture a chrome-extension:// origin.
  // Re-focus the portal tab, which is what happens in real use - the panel is a
  // panel, not a tab.
  await client.send('Target.activateTarget', { targetId });
  await page.send('Page.bringToFront').catch(() => {});
  await sleep(300);

  const goal = 'Open the safe preview for the pending request';
  const t0 = Date.now();

  const runJson = await panel.evaluate(
    `new Promise((resolve) => {
       const started = performance.now();
       chrome.runtime.sendMessage({ type: 'START_AGENT_RUN', goal: ${JSON.stringify(goal)} }, (res) => {
         resolve(JSON.stringify({
           elapsedMs: performance.now() - started,
           lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
           result: res || null
         }));
       });
     })`,
    { timeoutMs: 180000 }
  );

  const totalMs = Date.now() - t0;
  const run = JSON.parse(runJson);
  console.log('  [5/5] Agent run complete\n');

  const result = run.result || {};
  const telemetry = result.telemetry || null;

  console.log('-'.repeat(72));
  console.log(`  goal            : ${goal}`);
  console.log(`  success         : ${result.success}`);
  console.log(`  state           : ${result.state}`);
  if (result.error) console.log(`  error           : ${result.error}`);
  if (run.lastError) console.log(`  runtime error   : ${run.lastError}`);
  if (result.proposal) {
    console.log(`  action          : ${result.proposal.kind} -> ${result.proposal.targetLocalId || 'page'} (${result.proposal.risk})`);
    console.log(`  rationale       : ${String(result.proposal.rationale || '').slice(0, 90)}`);
  }
  if (result.sanitized) {
    console.log(`  masks applied   : ${result.sanitized.maskCount}`);
    console.log(`  elements sent   : ${result.sanitized.elements ? result.sanitized.elements.length : 0}`);
    const shot = result.sanitized.sanitizedScreenshotDataUrl || '';
    console.log(`  screenshot sent : ${Math.round(shot.length * 0.75 / 1024)} KB` +
                `${shot.length < 200 ? '  <-- SUSPICIOUS: too small to be a real screenshot' : ''}`);
  }
  if (telemetry) {
    console.log(`  client latency  : ${telemetry.clientLatencyMs} ms`);
    console.log(`  server latency  : ${telemetry.serverLatencyMs} ms`);
    console.log(`  total round-trip: ${telemetry.totalLatencyMs} ms`);
  }
  console.log(`  wall clock      : ${totalMs} ms`);
  console.log('-'.repeat(72));

  const record = {
    timestamp: new Date().toISOString(),
    harness: 'extension-e2e',
    measured: true,
    metadata: {
      command: 'npm run test:e2e',
      environment: `${process.platform} ${process.arch} (Node ${process.version})`,
      chromePath,
      extensionId,
      gitSha: gitSha(),
      model: { name: modelStatus.modelName, provider: modelStatus.provider, connected: modelStatus.modelConnected }
    },
    goal,
    success: result.success === true,
    state: result.state,
    error: result.error || run.lastError || null,
    proposal: result.proposal || null,
    maskCount: result.sanitized ? result.sanitized.maskCount : null,
    elementsTransmitted: result.sanitized && result.sanitized.elements ? result.sanitized.elements.length : null,
    sanitizedScreenshotBytes: result.sanitized && result.sanitized.sanitizedScreenshotDataUrl
      ? Math.round(result.sanitized.sanitizedScreenshotDataUrl.length * 0.75)
      : null,
    telemetry,
    wallClockMs: totalMs
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'E2E_EXTENSION_RUN.json'), JSON.stringify(record, null, 2));
  console.log('\nWritten to docs/benchmark-results/E2E_EXTENSION_RUN.json\n');

  client.close();
  registry.cleanup();

  // A run that failed safe is a legitimate outcome to record, but not a pass.
  if (!record.success) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[PrivaPilot] E2E run failed:', err.message);
  process.exit(1);
});
