/**
 * @privapilot/scripts - Offline generation of the ViT reference table
 *
 * The runtime ships only the CLIP IMAGE tower. Classifying a region against text
 * prompts would need the text encoder (64 MB) plus a BPE tokenizer in the extension;
 * instead, reference vectors are produced here, once, and shipped as a small JSON
 * table. Nothing at runtime tokenizes anything.
 *
 * References are built by RENDERING synthetic UI controls in the same browser engine
 * and embedding them with the same model the extension uses, so the reference and the
 * query come from an identical pipeline. Several visually varied examples per class
 * are averaged, which is what stops a prototype from encoding one particular button's
 * colour scheme.
 *
 * The classes are generic UI affordances, never site-specific - the finale pages are
 * unknown, and a prototype that encoded "the login button on site X" would be exactly
 * the overfitting this project forbids.
 *
 * Usage: npm run generate:prototypes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { ProcessRegistry, launchChrome, waitForHttp } from './lib/chrome-launcher.mjs';
import { CdpClient, CdpPage } from './lib/cdp-client.mjs';
import { readHarnessBundle } from './lib/harness-runner.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT_DIR, 'apps', 'extension', 'src', 'vision', 'ui-prototypes.generated.ts');
const PORT = 4520;
const CDP_PORT = 9350;

/**
 * Each class gets several deliberately different renderings: light and dark, small
 * and large, bordered and flat. Averaging them yields a prototype for the CONCEPT
 * rather than for one theme.
 */
const CLASSES = {
  button: [
    '<button style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:6px;font:600 15px sans-serif">Continue</button>',
    '<button style="padding:8px 18px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;border-radius:4px;font:500 14px sans-serif">Cancel</button>',
    '<button style="padding:14px 30px;background:#059669;color:#fff;border:none;border-radius:24px;font:700 16px sans-serif">Submit Request</button>',
    '<button style="padding:6px 14px;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:3px;font:400 13px monospace">Run</button>'
  ],
  text_input: [
    '<input value="rohan.sharma" style="padding:9px 12px;width:220px;border:1px solid #94a3b8;border-radius:4px;font:14px sans-serif" />',
    '<input placeholder="Search records" style="padding:12px 14px;width:280px;border:2px solid #2563eb;border-radius:8px;font:15px sans-serif" />',
    '<input value="" style="padding:7px 10px;width:160px;border:1px solid #d1d5db;border-radius:2px;background:#f9fafb;font:13px sans-serif" />',
    '<textarea style="padding:10px;width:240px;height:70px;border:1px solid #94a3b8;border-radius:4px;font:14px sans-serif">Notes</textarea>'
  ],
  checkbox_or_toggle: [
    '<div style="display:flex;gap:8px;align-items:center;font:14px sans-serif"><input type="checkbox" checked style="width:18px;height:18px" /><span>Enabled</span></div>',
    '<div style="display:flex;gap:8px;align-items:center;font:14px sans-serif"><input type="checkbox" style="width:22px;height:22px" /><span>Remember me</span></div>',
    '<div style="width:46px;height:24px;background:#22c55e;border-radius:12px;position:relative"><div style="position:absolute;right:2px;top:2px;width:20px;height:20px;background:#fff;border-radius:50%"></div></div>',
    '<div style="display:flex;gap:6px;align-items:center;font:13px sans-serif"><input type="radio" checked /><span>Option A</span></div>'
  ],
  link_or_nav: [
    '<a href="#" style="color:#2563eb;text-decoration:underline;font:15px sans-serif">View full report</a>',
    '<nav style="display:flex;gap:18px;font:14px sans-serif;color:#334155"><span>Home</span><span>Reports</span><span>Settings</span></nav>',
    '<a href="#" style="color:#a5b4fc;text-decoration:underline;font:13px sans-serif;background:#1e293b;padding:4px">Back to list</a>',
    '<nav style="display:flex;gap:10px;font:600 13px sans-serif;color:#0f172a;border-bottom:2px solid #2563eb;padding-bottom:6px"><span>Overview</span><span>Details</span></nav>'
  ],
  text_block: [
    '<p style="width:300px;font:14px/1.6 sans-serif;color:#1f2937">Mission telemetry is nominal across all subsystems. The next downlink window opens in fourteen minutes.</p>',
    '<p style="width:260px;font:13px/1.5 Georgia,serif;color:#374151">Approval is pending review by the operations desk. No further action is required at this time.</p>',
    '<div style="width:280px;font:12px/1.7 monospace;color:#e2e8f0;background:#0f172a;padding:10px">status: OK<br/>latency: 42ms<br/>queue: empty</div>',
    '<h2 style="font:700 22px sans-serif;color:#0f172a;width:280px">Quarterly Operations Summary</h2>'
  ],
  chart_or_graph: [
    '<svg width="220" height="130"><rect width="220" height="130" fill="#fff"/><polyline points="10,110 45,70 80,88 115,40 150,58 185,22" fill="none" stroke="#2563eb" stroke-width="3"/><line x1="10" y1="120" x2="210" y2="120" stroke="#94a3b8"/></svg>',
    '<svg width="200" height="130"><rect width="200" height="130" fill="#fff"/><rect x="20" y="60" width="26" height="55" fill="#059669"/><rect x="60" y="35" width="26" height="80" fill="#059669"/><rect x="100" y="80" width="26" height="35" fill="#059669"/><rect x="140" y="20" width="26" height="95" fill="#059669"/></svg>',
    '<svg width="150" height="150"><circle cx="75" cy="75" r="60" fill="#e2e8f0"/><path d="M75 75 L75 15 A60 60 0 0 1 128 105 Z" fill="#2563eb"/></svg>',
    '<svg width="220" height="120"><rect width="220" height="120" fill="#0f172a"/><polyline points="10,100 50,60 90,75 130,30 170,50 210,18" fill="none" stroke="#38bdf8" stroke-width="2"/></svg>'
  ],
  table_or_list: [
    '<table style="border-collapse:collapse;font:13px sans-serif"><tr><th style="border:1px solid #cbd5e1;padding:6px 12px">ID</th><th style="border:1px solid #cbd5e1;padding:6px 12px">Status</th></tr><tr><td style="border:1px solid #cbd5e1;padding:6px 12px">4412</td><td style="border:1px solid #cbd5e1;padding:6px 12px">Open</td></tr><tr><td style="border:1px solid #cbd5e1;padding:6px 12px">4413</td><td style="border:1px solid #cbd5e1;padding:6px 12px">Closed</td></tr></table>',
    '<ul style="font:14px sans-serif;color:#1f2937;width:220px"><li>Downlink scheduled</li><li>Payload nominal</li><li>Thermal within limits</li></ul>',
    '<table style="border-collapse:collapse;font:12px monospace;background:#0f172a;color:#e2e8f0"><tr><td style="padding:5px 10px">alpha</td><td style="padding:5px 10px">1.4</td></tr><tr><td style="padding:5px 10px">beta</td><td style="padding:5px 10px">2.9</td></tr></table>',
    '<ol style="font:13px sans-serif;color:#334155;width:200px"><li>Verify credentials</li><li>Confirm request</li><li>Submit for approval</li></ol>'
  ],
  icon: [
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/></svg>',
    '<svg width="36" height="36" viewBox="0 0 24 24" fill="#2563eb"><path d="M12 2 L15 9 L22 9 L16 13 L18 21 L12 16 L6 21 L8 13 L2 9 L9 9 Z"/></svg>',
    '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>',
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="#f59e0b"><path d="M3 5h18v3H3zM3 10h18v3H3zM3 15h12v3H3z"/></svg>'
  ],
  image_photo: [
    '<svg width="150" height="150"><defs><filter id="n1"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="4" seed="3"/></filter></defs><rect width="150" height="150" fill="#8fa6bd"/><rect width="150" height="150" filter="url(#n1)" opacity="0.9"/><circle cx="75" cy="66" r="40" fill="#ffcc99"/><ellipse cx="60" cy="58" rx="6" ry="4" fill="#3b2a1d"/><ellipse cx="90" cy="58" rx="6" ry="4" fill="#3b2a1d"/></svg>',
    '<svg width="160" height="110"><defs><filter id="n2"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="5" seed="8"/></filter></defs><rect width="160" height="110" fill="#6b8f5e"/><rect width="160" height="110" filter="url(#n2)" opacity="0.85"/></svg>',
    '<svg width="130" height="130"><defs><filter id="n3"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="15"/></filter></defs><rect width="130" height="130" fill="#c9a27a"/><rect width="130" height="130" filter="url(#n3)" opacity="0.9"/><circle cx="65" cy="58" r="34" fill="#e8b487"/></svg>',
    '<svg width="140" height="140"><defs><filter id="n4"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="4" seed="21"/></filter></defs><rect width="140" height="140" fill="#4a5568"/><rect width="140" height="140" filter="url(#n4)" opacity="0.95"/></svg>'
  ],
  empty_space: [
    '<div style="width:200px;height:120px;background:#ffffff"></div>',
    '<div style="width:180px;height:100px;background:#f8fafc;border:1px solid #f1f5f9"></div>',
    '<div style="width:220px;height:140px;background:#0f172a"></div>',
    '<div style="width:160px;height:90px;background:#e2e8f0"></div>'
  ]
};


/**
 * Held-out renders, NOT used to build the prototypes.
 *
 * The reference set classifies itself perfectly by construction, so it can only ever
 * report 100% and cannot calibrate anything. These are deliberately different -
 * other colours, fonts, sizes and framings - and they are the only honest evidence
 * of whether the table generalises, and of where to put the abstain threshold.
 */
const HOLDOUT = {
  button: [
    '<button style="padding:11px 26px;background:#7c3aed;color:#fff;border:none;border-radius:2px;font:600 14px Georgia,serif">Authorize</button>',
    '<button style="padding:9px 20px;background:#fef3c7;color:#92400e;border:2px dashed #f59e0b;border-radius:10px;font:500 15px sans-serif">Retry Upload</button>'
  ],
  text_input: [
    '<input value="4412-XX" style="padding:11px 16px;width:200px;border:none;border-bottom:2px solid #7c3aed;background:#faf5ff;font:15px Georgia,serif" />',
    '<input placeholder="Filter by station" style="padding:8px 12px;width:250px;border:1px solid #475569;border-radius:16px;background:#1e293b;color:#e2e8f0;font:13px sans-serif" />'
  ],
  checkbox_or_toggle: [
    '<div style="display:flex;gap:10px;align-items:center;font:15px Georgia,serif;color:#7c3aed"><input type="checkbox" checked style="width:26px;height:26px" /><span>Acknowledge</span></div>',
    '<div style="width:60px;height:30px;background:#94a3b8;border-radius:15px;position:relative"><div style="position:absolute;left:3px;top:3px;width:24px;height:24px;background:#fff;border-radius:50%"></div></div>'
  ],
  link_or_nav: [
    '<a href="#" style="color:#be123c;text-decoration:underline;font:600 16px Georgia,serif">Download archive</a>',
    '<nav style="display:flex;gap:24px;font:12px monospace;color:#64748b;background:#f8fafc;padding:8px"><span>/root</span><span>/logs</span><span>/config</span></nav>'
  ],
  text_block: [
    '<p style="width:320px;font:16px/1.8 Georgia,serif;color:#78350f">The ground station recorded nominal signal strength throughout the pass, with no anomalies logged by the tracking subsystem.</p>',
    '<h3 style="font:800 18px monospace;color:#be123c;width:260px">ANOMALY REPORT 0042</h3>'
  ],
  chart_or_graph: [
    '<svg width="240" height="140"><rect width="240" height="140" fill="#fdf4ff"/><polyline points="15,120 55,95 95,105 135,60 175,80 215,35" fill="none" stroke="#a21caf" stroke-width="4"/></svg>',
    '<svg width="180" height="140"><rect width="180" height="140" fill="#f0fdf4"/><rect x="15" y="90" width="30" height="40" fill="#15803d"/><rect x="60" y="50" width="30" height="80" fill="#15803d"/><rect x="105" y="25" width="30" height="105" fill="#15803d"/></svg>'
  ],
  table_or_list: [
    '<table style="border-collapse:collapse;font:14px Georgia,serif;background:#fffbeb"><tr><td style="border:2px solid #f59e0b;padding:8px 16px">Station</td><td style="border:2px solid #f59e0b;padding:8px 16px">Pass</td></tr><tr><td style="border:2px solid #f59e0b;padding:8px 16px">Bengaluru</td><td style="border:2px solid #f59e0b;padding:8px 16px">14:02</td></tr></table>',
    '<ul style="font:12px monospace;color:#0f172a;width:240px;background:#f1f5f9;padding:12px 28px"><li>uplink.ok</li><li>downlink.ok</li><li>thermal.warn</li></ul>'
  ],
  icon: [
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a21caf" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12 L11 15 L16 9"/></svg>',
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="#15803d"><circle cx="12" cy="12" r="9"/><path d="M12 7 v6 M12 16 v1" stroke="#fff" stroke-width="2"/></svg>'
  ],
  image_photo: [
    '<svg width="170" height="120"><defs><filter id="h1"><feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="5" seed="41"/></filter></defs><rect width="170" height="120" fill="#b45309"/><rect width="170" height="120" filter="url(#h1)" opacity="0.9"/></svg>',
    '<svg width="120" height="160"><defs><filter id="h2"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" seed="57"/></filter></defs><rect width="120" height="160" fill="#7f5539"/><rect width="120" height="160" filter="url(#h2)" opacity="0.88"/><circle cx="60" cy="70" r="36" fill="#f0c39a"/></svg>'
  ],
  empty_space: [
    '<div style="width:240px;height:150px;background:#fdf4ff"></div>',
    '<div style="width:150px;height:110px;background:#1e293b"></div>'
  ]
};

function buildPage(source, prefix) {
  const cells = [];
  for (const [cls, samples] of Object.entries(source)) {
    samples.forEach((html, i) => {
      cells.push(
        `<div data-proto="${cls}" data-idx="${prefix}${i}" style="display:inline-flex;align-items:center;` +
        `justify-content:center;margin:14px;padding:10px;background:#ffffff">${html}</div>`
      );
    });
  }
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>proto</title>' +
    '<style>body{margin:0;background:#ffffff;font-family:sans-serif}</style></head>' +
    `<body><div style="display:flex;flex-wrap:wrap;align-items:flex-start">${cells.join('')}</div></body></html>`
  );
}

function l2normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function cosine(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

const reg = new ProcessRegistry('privapilot-prototypes');
reg.installSignalHandlers();

try {
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) }
  });
  reg.add(portal);
  if (!(await waitForHttp(`http://127.0.0.1:${PORT}/fixtures`, 10000))) {
    throw new Error('asset server failed to start');
  }

  await launchChrome({ port: CDP_PORT, registry: reg });
  const client = await CdpClient.connect(CDP_PORT);
  const { sessionId, targetId } = await client.newPage('about:blank');
  const page = new CdpPage(client, sessionId, targetId);
  await page.enableDomains();
  await page.setViewport(1400, 1000);

  async function renderAndEmbed(source, prefix, label) {
    // Served from the asset origin so the model and wasm are same-origin reachable.
    await page.goto(`http://127.0.0.1:${PORT}/fixtures`);
    await page.evaluate(
      `document.open(); document.write(${JSON.stringify(buildPage(source, prefix))}); document.close(); true`,
      { awaitPromise: false }
    );
    await page.evaluate(readHarnessBundle(), { awaitPromise: false });
    await page.evaluate(`__privapilot.configureVisionAssets("http://127.0.0.1:${PORT}/ext-assets"), true`, {
      awaitPromise: false
    });

    const ext = JSON.parse(await page.evaluate('JSON.stringify(__privapilot.extractSnapshot())', { awaitPromise: false }));
    const regs = JSON.parse(
      await page.evaluate(
        `JSON.stringify([...document.querySelectorAll('[data-proto]')].map((el) => {
           const r = el.getBoundingClientRect();
           return { id: el.dataset.proto + ':' + el.dataset.idx,
                    x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
         }))`,
        { awaitPromise: false }
      )
    );
    console.log('  embedding ' + regs.length + ' ' + label + ' renders ...');
    const shot = await page.captureScreenshot();
    return JSON.parse(
      await page.evaluate(
        `__privapilot.embedRegions(${JSON.stringify(shot)}, ${JSON.stringify(ext.viewport)}, ` +
        `${JSON.stringify(regs)}).then(r => JSON.stringify(r))`,
        { timeoutMs: 900000 }
      )
    );
  }

  console.log('');
  const embedded = await renderAndEmbed(CLASSES, 'r', 'reference');

  const byClass = new Map();
  for (const e of embedded) {
    const cls = e.id.split(':')[0];
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(e.vector);
  }

  const prototypes = {};
  for (const [cls, vectors] of byClass) {
    const dim = vectors[0].length;
    const mean = new Array(dim).fill(0);
    for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i] / vectors.length;
    prototypes[cls] = l2normalize(mean);
  }

  // Separation report. A prototype table where every class looks like every other is
  // useless no matter how fast the model is, so this is measured before it is shipped.
  const names = Object.keys(prototypes);
  console.log('  class separation (cosine between class prototypes)');
  let worstPair = { a: '', b: '', sim: -1 };
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const sim = cosine(prototypes[names[i]], prototypes[names[j]]);
      if (sim > worstPair.sim) worstPair = { a: names[i], b: names[j], sim };
    }
  }
  console.log(`    most-similar pair: ${worstPair.a} <-> ${worstPair.b} = ${worstPair.sim.toFixed(3)}`);

  function evaluate(set, name) {
    let correct = 0;
    const perClass = {};
    const correctMargins = [];
    const wrongMargins = [];
    for (const e of set) {
      const trueCls = e.id.split(':')[0];
      const ranked = Object.entries(prototypes)
        .map(([cls, proto]) => ({ cls, sim: cosine(e.vector, proto) }))
        .sort((a, b) => b.sim - a.sim);
      const margin = ranked[0].sim - ranked[1].sim;
      perClass[trueCls] = perClass[trueCls] || { total: 0, hit: 0 };
      perClass[trueCls].total++;
      if (ranked[0].cls === trueCls) { correct++; perClass[trueCls].hit++; correctMargins.push(margin); }
      else wrongMargins.push({ margin, got: ranked[0].cls, want: trueCls });
    }
    const stat = (xs) => xs.length
      ? 'min ' + Math.min(...xs).toFixed(4) + ' / median ' + xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)].toFixed(4) + ' / max ' + Math.max(...xs).toFixed(4)
      : 'n/a';
    console.log('  ' + name + ': ' + correct + '/' + set.length + ' correct');
    console.log('    margin when correct : ' + stat(correctMargins));
    console.log('    margin when wrong   : ' + stat(wrongMargins.map((w) => w.margin)));
    for (const w of wrongMargins) {
      console.log('      MISS ' + w.want + ' -> ' + w.got + ' (margin ' + w.margin.toFixed(4) + ')');
    }
    return { correct, total: set.length, correctMargins, wrongMargins };
  }

  console.log('');
  evaluate(embedded, 'reference set (leave-in, optimistic by construction)');
  console.log('');
  const holdout = await renderAndEmbed(HOLDOUT, 'h', 'held-out');
  console.log('');
  const holdoutStats = evaluate(holdout, 'HELD-OUT set (the number that means something)');

  // The abstain threshold must separate correct from wrong on data the prototypes
  // were NOT built from. Taking it off the reference set would be taking it off a set
  // that is 100% correct by construction, i.e. choosing it arbitrarily.
  const wrongM = holdoutStats.wrongMargins.map((w) => w.margin);
  console.log('');
  console.log('  suggested abstain margin: ' + (wrongM.length
    ? (Math.max(...wrongM) + 0.001).toFixed(4) + ' (above every wrong margin observed)'
    : 'no held-out misclassifications, so no evidence to separate against'));

  // What the threshold actually buys: abstaining is only worth it if the labels that
  // survive are trustworthy. Precision-when-it-speaks is the number that matters,
  // because a confidently wrong label is worse for the agent than no label.
  console.log('');
  console.log('  threshold sweep on held-out data');
  for (const t of [0, 0.005, 0.0162, 0.025, 0.04]) {
    let accepted = 0, acceptedCorrect = 0;
    for (const m of holdoutStats.correctMargins) if (m >= t) { accepted++; acceptedCorrect++; }
    for (const w of holdoutStats.wrongMargins) if (w.margin >= t) accepted++;
    const prec = accepted ? (acceptedCorrect / accepted * 100).toFixed(0) : '-';
    const cov = (accepted / holdoutStats.total * 100).toFixed(0);
    console.log('    margin >= ' + t.toFixed(4) + ' : labels ' + accepted + '/' + holdoutStats.total +
                ' (' + cov + '% coverage), precision ' + prec + '%');
  }



  const meanInference = Math.round(embedded.reduce((n, e) => n + e.inferenceMs, 0) / embedded.length);
  console.log(`    mean inference: ${meanInference} ms/region\n`);

  const banner =
    `/**\n` +
    ` * GENERATED FILE - do not edit by hand.\n` +
    ` *\n` +
    ` * Produced by \`npm run generate:prototypes\`, which renders synthetic UI controls\n` +
    ` * in headless Chrome and embeds them with the same CLIP ViT-B/32 tower the\n` +
    ` * extension runs. Each vector is the L2-normalized mean of ${Object.values(CLASSES)[0].length} varied renders.\n` +
    ` *\n` +
    ` * Regenerate whenever the model file changes: embeddings from one model are\n` +
    ` * meaningless against another.\n` +
    ` */\n\n`;

  const body =
    `export const UI_PROTOTYPE_DIMENSIONS = ${Object.values(prototypes)[0].length};\n\n` +
    `export type UiPrototypeClass =\n` +
    names.map((n) => `  | '${n}'`).join('\n') + ';\n\n' +
    `export const UI_PROTOTYPES: Readonly<Record<UiPrototypeClass, ReadonlyArray<number>>> = {\n` +
    names
      .map((n) => `  ${n}: [${prototypes[n].map((x) => x.toFixed(6)).join(',')}]`)
      .join(',\n') +
    '\n};\n';

  fs.writeFileSync(OUT_FILE, banner + body);
  console.log(`  written: ${path.relative(ROOT_DIR, OUT_FILE)}\n`);
} catch (err) {
  console.error('PROTOTYPE GENERATION FAILED:', err.message);
  process.exitCode = 1;
} finally {
  reg.cleanup();
}
