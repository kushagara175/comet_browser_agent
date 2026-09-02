/**
 * @privapilot/scripts - Model and payload-size comparison
 *
 * Measures how screenshot payload size and model choice affect reasoning latency
 * and action correctness. Uses a REAL sanitized screenshot from the shipped
 * pipeline, downscaled in-browser, posted to each candidate model.
 *
 * Exists because a single slow sample is not evidence: one 40.5s end-to-end run
 * suggested image size dominated latency, and a controlled sweep showed it does
 * not. Re-run this before changing VLM_MODEL.
 *
 * Usage: node --env-file-if-exists=.env scripts/compare-models.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessRegistry, launchChrome, waitForHttp } from './lib/chrome-launcher.mjs';
import { CdpClient } from './lib/cdp-client.mjs';
import { runFixture, readHarnessBundle } from './lib/harness-runner.mjs';
import { CdpPage } from './lib/cdp-client.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.VLM_API_KEY;
const MODELS = ['qwen/qwen2.5-vl-72b-instruct', 'qwen/qwen3-vl-8b-instruct', 'qwen/qwen3-vl-30b-a3b-instruct'];
const WIDTHS = [0, 384, 640, 1024];  // 0 = text-only (no image at all)

const SYSTEM = 'Return ONLY JSON: {"actionId":"act_1","kind":"click","targetLocalId":"el_N","confidence":0.95,"risk":"safe","rationale":"..."}';

const reg = new ProcessRegistry('privapilot-latency');
reg.installSignalHandlers();

try {
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: '4500' }
  });
  reg.add(portal);
  await waitForHttp('http://127.0.0.1:4500/', 10000);

  await launchChrome({ port: 9340, registry: reg });
  const client = await CdpClient.connect(9340);

  // Produce a genuine sanitized screenshot from the real pipeline.
  const r = await runFixture(client, 'http://127.0.0.1:4500/', {
    goal: 'Open the safe preview', bundleSource: readHarnessBundle()
  });
  const elements = (r.sanitize.sanitized.elements || []).map(e => ({
    id: e.localId, role: e.role, name: e.sanitizedName, caps: e.actionCapabilities
  }));
  const userText = `Goal: open the safe preview\nElements: ${JSON.stringify(elements)}`;
  console.log(`sanitized screenshot: ${Math.round(r.sanitizedScreenshotBytes / 1024)} KB, ${elements.length} elements\n`);

  // Downscale in the browser (canvas), no image library needed.
  const { targetId, sessionId } = await client.newPage('about:blank');
  const page = new CdpPage(client, sessionId, targetId);
  await page.enableDomains();
  const shot = r.sanitize.sanitized.sanitizedScreenshotDataUrl;

  const variants = {};
  for (const w of WIDTHS) {
    if (w === 0) { variants[w] = null; continue; }
    variants[w] = await page.evaluate(
      `new Promise((res) => { const i = new Image(); i.onload = () => {
         const s = ${w} / i.naturalWidth; const c = document.createElement('canvas');
         c.width = ${w}; c.height = Math.round(i.naturalHeight * s);
         c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
         res(c.toDataURL('image/jpeg', 0.75));
       }; i.src = ${JSON.stringify(shot)}; })`,
      { timeoutMs: 30000 }
    );
  }

  console.log('model                              image      KB    latency   action    ok');
  console.log('-'.repeat(78));

  for (const model of MODELS) {
    for (const w of WIDTHS) {
      const img = variants[w];
      const content = img
        ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: img } }]
        : userText;
      const kb = img ? Math.round(img.length * 0.75 / 1024) : 0;

      const t0 = Date.now();
      let action = 'ERR', ok = false;
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
          body: JSON.stringify({
            model, temperature: 0.1,
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
            response_format: { type: 'json_object' }
          })
        });
        const j = await res.json();
        const raw = j.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        action = String(parsed.targetLocalId || '?');
        ok = Boolean(parsed.targetLocalId && parsed.kind && parsed.risk);
      } catch (e) {
        action = 'FAIL';
      }
      const ms = Date.now() - t0;
      console.log(
        model.padEnd(34) +
        (w === 0 ? 'text-only' : `${w}px`).padEnd(11) +
        String(kb).padStart(4) + '   ' +
        (ms + 'ms').padStart(8) + '   ' +
        action.padEnd(9) + (ok ? 'yes' : 'NO')
      );
    }
    console.log('');
  }

  client.close();
} catch (e) {
  console.error('LATENCY MATRIX FAIL:', e.message);
  process.exitCode = 1;
} finally {
  reg.cleanup();
}
