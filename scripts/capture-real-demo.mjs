/**
 * @privapilot/scripts - Real Chrome Demo Runner & Screen Capture (Audit Round 2 Pass)
 *
 * Drives real Chrome over CDP with the actual unpacked extension, applies real 6x CPU throttling,
 * waits real wall-clock time for 15s disposal grace and 15s dwell, captures exact HUD DOM values,
 * and writes screenshots to docs/evidence/.
 *
 * Enforces strict integrity checks: fails loudly if the production bundle contains any
 * test hooks, simulation messages, or backdoor mutations.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProcessRegistry, launchChrome, waitForHttp, waitForServer, sleep } from './lib/chrome-launcher.mjs';
import { CdpClient, CdpPage } from './lib/cdp-client.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = path.join(ROOT_DIR, 'apps', 'extension');
const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'evidence');
const ARTIFACTS_DIR = 'C:\\Users\\Sameer\\.gemini\\antigravity-ide\\brain\\bf41e480-d685-4afb-9454-dbcf32ad225b';
const PORTAL_PORT = 4500;
const SERVER_PORT = 4501;
const CDP_PORT = 9338;

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/**
 * Audit Guard: Verifies that production bundles contain ZERO test hooks,
 * simulation affordances, or external mutation handles.
 */
function verifyBundleIntegrity() {
  const bgBundlePath = path.join(EXT_DIR, 'dist', 'background', 'background-main.js');
  const offscreenBundlePath = path.join(EXT_DIR, 'dist', 'offscreen', 'offscreen-main.js');

  const forbiddenSymbols = [
    'SIMULATE_THROTTLED',
    'SIMULATE_BACKPRESSURE',
    'gov.lastDowngradeTimestamp',
    'lastDowngradeTimestamp = Date.now() -',
    '__debug',
    'testHook'
  ];

  for (const bundlePath of [bgBundlePath, offscreenBundlePath]) {
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`Integrity check failed: missing bundle at ${bundlePath}. Run npm run build first.`);
    }
    const content = fs.readFileSync(bundlePath, 'utf-8');
    for (const sym of forbiddenSymbols) {
      if (content.includes(sym)) {
        throw new Error(
          `INTEGRITY VIOLATION: Production bundle ${path.basename(bundlePath)} contains forbidden debug/simulation affordance: "${sym}". Stubs are prohibited.`
        );
      }
    }
  }
  console.log('  🔒 [Audit Guard] Production bundles verified clean: zero test hooks or simulation affordances found.');
}

async function findServiceWorker(client, extensionId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const targets = await client.listTargets();
    const sw = targets.find(
      (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extensionId}/`)
    );
    if (sw) return sw;
    await sleep(300);
  }
  return null;
}

async function saveScreenshot(cdpPage, filename) {
  const { data } = await cdpPage.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const buffer = Buffer.from(data, 'base64');
  
  const repoFilePath = path.join(EVIDENCE_DIR, filename);
  fs.writeFileSync(repoFilePath, buffer);

  try {
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), buffer);
  } catch {}

  console.log(`  📸 Screenshot saved: docs/evidence/${filename} (${buffer.length} bytes)`);
  return repoFilePath;
}

async function main() {
  verifyBundleIntegrity();

  const registry = new ProcessRegistry('real-demo-capture');
  registry.installSignalHandlers();

  console.log('\n[PrivaPilot] Running Live Chrome Demo & Capturing Actual 6-Step HUD States...\n');

  // 1. Start Services
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: String(PORTAL_PORT) }
  });
  registry.add(portal);

  const server = spawn(process.execPath, ['--env-file-if-exists=.env', path.join(ROOT_DIR, 'apps', 'server', 'dist', 'index.js')], {
    cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: String(SERVER_PORT) }
  });
  registry.add(server);

  if (!(await waitForHttp(`http://127.0.0.1:${PORTAL_PORT}/`, 10000))) throw new Error('Portal failed to start');
  if (!(await waitForServer(`http://127.0.0.1:${SERVER_PORT}/health`, 10000))) throw new Error('Server failed to start');
  console.log('  [1/6] Services up on :4500 and :4501');

  // 2. Launch Chrome
  const { chromePath } = await launchChrome({
    port: CDP_PORT,
    registry,
    extraFlags: ['--enable-unsafe-extension-debugging']
  });
  const client = await CdpClient.connect(CDP_PORT);

  const { id: extensionId } = await client.send('Extensions.loadUnpacked', { path: EXT_DIR });
  console.log(`  [2/6] Extension installed: ${extensionId}`);

  const sw = await findServiceWorker(client, extensionId);
  if (!sw) throw new Error('Extension service worker never registered');
  const swSession = await client.attach(sw.targetId);
  await client.send('Runtime.enable', {}, swSession).catch(() => {});
  await client.send('Runtime.runIfWaitingForDebugger', {}, swSession).catch(() => {});
  console.log('  [3/6] Service worker connected');

  // 3. Open Portal Page
  const { targetId: portalTarget, sessionId: portalSession } = await client.newPage('about:blank');
  const portalPage = new CdpPage(client, portalSession, portalTarget);
  await portalPage.enableDomains();
  await portalPage.setViewport(1280, 800);
  await portalPage.goto(`http://127.0.0.1:${PORTAL_PORT}/`);
  await sleep(600);

  // 4. Open Sidepanel Page
  const { targetId: panelTarget, sessionId: panelSession } = await client.newPage(
    `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`
  );
  const panelPage = new CdpPage(client, panelSession, panelTarget);
  await panelPage.enableDomains();
  await panelPage.setViewport(480, 800);
  await sleep(600);

  // Helper to read actual HUD DOM values
  async function readHudState() {
    return panelPage.evaluate(`(() => {
      return {
        activeTier: document.getElementById('budgetTierText')?.textContent || '',
        frameLatency: document.getElementById('budgetLatencyText')?.textContent || '',
        residentMemory: document.getElementById('budgetMemoryText')?.textContent || '',
        cacheHitRate: document.getElementById('budgetCacheText')?.textContent || '',
        p95Latency: document.getElementById('meterP95Latency')?.textContent || '',
        residentMemoryMeter: document.getElementById('meterResidentMemory')?.textContent || '',
        accountingMethod: document.getElementById('meterAccountingMethod')?.textContent || '',
        cacheCounts: document.getElementById('meterCacheCounts')?.textContent || '',
        captureRate: document.getElementById('meterCaptureRate')?.textContent || '',
        budgetBadge: document.getElementById('governorBudgetBadge')?.textContent || '',
        badgeClass: document.getElementById('governorBudgetBadge')?.className || '',
        downgradeEvents: Array.from(document.querySelectorAll('.downgrade-item')).map(el => el.textContent.trim().replace(/\\s+/g, ' '))
      };
    })()`);
  }

  // Switch HUD to Telemetry tab so resource governance meters are visible
  await panelPage.evaluate(`(() => {
    document.getElementById('tabAuditBtn')?.click();
  })()`);
  await sleep(300);

  // Helper to run real perception pass via extension runtime
  async function runRealPerceptionCycle() {
    const res = await panelPage.evaluate(`new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'RUN_PERCEPTION_CYCLE', goal: 'Observe demo portal' }, (res) => {
        resolve(res);
      });
    })`);
    console.log('    [Cycle result]:', res);
    return res;
  }

  const observedRun = {
    timestamp: new Date().toISOString(),
    environment: {
      chromePath,
      extensionId,
      viewport: '1280x800',
      sidepanelViewport: '480x800'
    },
    steps: {}
  };

  // STEP 1: Nominal T1 Operation
  console.log('\n  --- Executing Step 1: Nominal T1 Operation ---');
  await runRealPerceptionCycle();
  await sleep(400);

  let hud1 = await readHudState();
  console.log('  Step 1 HUD State (Nominal T1):', hud1);
  await saveScreenshot(panelPage, 'demo-step1-nominal-t1.png');
  observedRun.steps.step1_nominal_t1 = hud1;

  // STEP 2: Real 6x CPU Throttling Applied
  console.log('\n  --- Executing Step 2: 6x CPU Throttling Applied ---');
  await portalPage.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  console.log('  Applied CDP Emulation.setCPUThrottlingRate: 6');

  // Under 6x CPU throttling, run 2 real perception passes to breach p95 ceiling (>500ms)
  await runRealPerceptionCycle();
  await sleep(500);
  await runRealPerceptionCycle();
  await sleep(500);

  let hud2 = await readHudState();
  console.log('  Step 2 HUD State (Throttled T0, In Grace):', hud2);
  await saveScreenshot(panelPage, 'demo-step2-cpu-throttled-t0.png');
  observedRun.steps.step2_cpu_throttled_t0 = hud2;

  // STEP 3: Post-Grace Memory Drop to ~24 MB (waiting real wall-clock 15.5s)
  console.log('\n  --- Executing Step 3: Waiting real wall-clock 15.5s for disposal grace period to expire ---');
  await sleep(15500);

  // Post-grace real perception pass runs under T0 without loading ML models
  await runRealPerceptionCycle();
  await sleep(400);

  let hud3 = await readHudState();
  console.log('  Step 3 HUD State (Post-Grace Memory Drop):', hud3);
  await saveScreenshot(panelPage, 'demo-step3-post-grace-memory-drop.png');
  observedRun.steps.step3_post_grace_memory_drop = hud3;

  // STEP 4: Probing Re-Upgrade after genuine 15s dwell
  console.log('\n  --- Executing Step 4: Probing Re-Upgrade (Throttling cleared, 15s dwell elapsed) ---');
  await portalPage.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('  Restored CPU throttling rate to 1');

  // The 15.5s elapsed in Step 3 satisfies the 15s dwell requirement. Run 1-frame probe pass at T1:
  await runRealPerceptionCycle();
  await sleep(400);

  let hud4 = await readHudState();
  console.log('  Step 4 HUD State (Re-Upgraded T1):', hud4);
  await saveScreenshot(panelPage, 'demo-step4-probing-reupgrade.png');
  observedRun.steps.step4_probing_reupgrade = hud4;

  // STEP 5: Explicit Backpressure
  console.log('\n  --- Executing Step 5: Explicit Backpressure ---');
  // Trigger rapid burst of capture cycles to exceed 45 captures/min rate limit
  await panelPage.evaluate(`(async () => {
    for (let i = 0; i < 48; i++) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'RUN_PERCEPTION_CYCLE', goal: 'burst' }, () => resolve());
      });
    }
  })()`);
  await sleep(400);

  let hud5 = await readHudState();
  console.log('  Step 5 HUD State (Backpressure Active):', hud5);
  await saveScreenshot(panelPage, 'demo-step5-backpressure-active.png');
  observedRun.steps.step5_backpressure_active = hud5;

  // STEP 6: Forced Tier Override (from Trusted UI)
  console.log('\n  --- Executing Step 6: Forced Tier Override ---');
  // Reset capture window first to ensure demo hygiene (no alarm carryover)
  await panelPage.evaluate(`new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'RESET_CAPTURE_WINDOW' }, () => resolve());
  })`);
  await sleep(200);

  // Click Force T0 (DOM) button in Sidepanel UI
  await panelPage.evaluate(`document.getElementById('tierBtnT0')?.click()`);
  await sleep(300);

  // Run at least one post-override perception frame to refresh latency to T0 scale (~14ms)
  await runRealPerceptionCycle();
  await sleep(400);

  let hud6 = await readHudState();
  console.log('  Step 6 HUD State (Forced T0, Latency Refreshed):', hud6);
  await saveScreenshot(panelPage, 'demo-step6-forced-override.png');
  observedRun.steps.step6_forced_override = hud6;

  // Save observations to docs
  const outPath = path.join(ROOT_DIR, 'docs', 'benchmark-results', 'REAL_DEMO_OBSERVED.json');
  fs.writeFileSync(outPath, JSON.stringify(observedRun, null, 2));
  console.log(`\n  ✅ Real Demo Observations saved to: ${outPath}`);

  // Cleanup
  await panelPage.close().catch(() => {});
  await portalPage.close().catch(() => {});
  registry.cleanup();
  console.log('\n[PrivaPilot] Real demo run completed successfully.\n');
}

main().catch((err) => {
  console.error('Demo capture failed:', err);
  process.exit(1);
});
