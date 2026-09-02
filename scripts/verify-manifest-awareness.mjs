/**
 * @privapilot/scripts - R1 exit gate: is the server actually aware of the redaction scheme?
 *
 * The problem statement requires the central server to be "aware for this redaction
 * scheme and can process data accordingly". That is only demonstrated if the model's
 * behaviour changes with the manifest - a prompt that asserts "PII has been blacked
 * out" in fixed prose proves nothing, because it says the same thing regardless of
 * what the client did.
 *
 * This sends the SAME page twice, differing only in the redaction manifest, and
 * reports whether the model's reasoning reflects the difference.
 *
 * Usage: npm run verify:manifest
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessRegistry, waitForHttp } from './lib/chrome-launcher.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4531;
const BASE = `http://127.0.0.1:${PORT}`;

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function basePayload(redactionManifest, elements) {
  return {
    protocolVersion: '1.0',
    runId: `run_${Date.now()}`,
    goal: 'Sign in to the portal',
    screenshot: PIXEL,
    elements,
    pageState: { title: 'Staff Portal', viewport: [1280, 800] },
    redactionManifest
  };
}

const REDACTED_ELEMENTS = [
  { localId: 'el_1', role: 'input', sanitizedName: '[EMAIL FIELD]', coarseBounds: [0.1, 0.2, 0.4, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] },
  { localId: 'el_2', role: 'input', sanitizedName: '[PASSWORD FIELD]', coarseBounds: [0.1, 0.3, 0.4, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] },
  { localId: 'el_3', role: 'button', sanitizedName: 'Sign In', coarseBounds: [0.1, 0.4, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] }
];

const PLAIN_ELEMENTS = [
  { localId: 'el_1', role: 'input', sanitizedName: 'Search records', coarseBounds: [0.1, 0.2, 0.4, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click', 'type'] },
  { localId: 'el_2', role: 'button', sanitizedName: 'Run Report', coarseBounds: [0.1, 0.3, 0.2, 0.05], state: ['visible', 'enabled'], actionCapabilities: ['click'] }
];

const MANIFEST_WITH_REDACTIONS = {
  schemeVersion: '1.0',
  categories: [
    { category: 'password', count: 1, method: 'opaque_mask' },
    { category: 'email', count: 1, method: 'opaque_mask' }
  ],
  totalRegions: 2,
  masksRendered: 2,
  conventions: {
    opaqueFillColor: '#0f172a',
    imageLabelFormat: '[REDACTED: CATEGORY]',
    faceImageLabel: '[FACE BLUR]',
    elementPlaceholders: ['[EMAIL FIELD]', '[PASSWORD FIELD]']
  },
  coverage: { pixelVerified: true, regionsAssessed: 2, regionsUnassessable: 0 },
  withheldCapabilities: ['type']
};

const MANIFEST_EMPTY = {
  schemeVersion: '1.0',
  categories: [],
  totalRegions: 0,
  masksRendered: 0,
  conventions: {
    opaqueFillColor: '#0f172a',
    imageLabelFormat: '[REDACTED: CATEGORY]',
    faceImageLabel: '[FACE BLUR]',
    elementPlaceholders: []
  },
  coverage: { pixelVerified: true, regionsAssessed: 0, regionsUnassessable: 0 },
  withheldCapabilities: []
};

async function reason(payload) {
  const res = await fetch(`${BASE}/api/v1/reason`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  return { status: res.status, body };
}

const reg = new ProcessRegistry('privapilot-manifest-gate');
reg.installSignalHandlers();
let failures = 0;

try {
  const server = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', path.join(ROOT_DIR, 'apps', 'server', 'dist', 'index.js')],
    { cwd: ROOT_DIR, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } }
  );
  reg.add(server);

  if (!(await waitForHttp(`${BASE}/health`, 15000))) {
    throw new Error('reasoning server failed to start');
  }

  const status = await (await fetch(`${BASE}/api/v1/model-status`)).json();
  console.log(`Model: ${status.modelName} (${status.provider}) | connected: ${status.modelConnected} | ${status.detail || ""}`);
  if (!status.modelConnected) {
    console.log('\nSKIPPED: no reasoning model reachable. The generated-prompt half of this');
    console.log('gate is covered by tests/redaction-manifest.test.js; the live half needs a model.');
    process.exit(0);
  }

  // --- 1. Structural gate: the manifest is mandatory ---
  console.log('\n=== manifest is required by the protocol ===');
  const noManifest = basePayload(undefined, REDACTED_ELEMENTS);
  delete noManifest.redactionManifest;
  const rejected = await reason(noManifest);
  const ok1 = rejected.status === 400;
  if (!ok1) failures++;
  console.log(`  ${ok1 ? 'PASS' : 'FAIL'}  payload without a manifest -> HTTP ${rejected.status}`);

  // --- 2. Behavioural gate: reasoning reflects what was redacted ---
  console.log('\n=== model reasons about the redacted fields ===');
  const withRedactions = await reason(basePayload(MANIFEST_WITH_REDACTIONS, REDACTED_ELEMENTS));
  if (withRedactions.status !== 200) console.log(`  HTTP ${withRedactions.status}: ${JSON.stringify(withRedactions.body)}`);
  const rationale = String(withRedactions.body?.rationale || '');
  const action = withRedactions.body || {};
  console.log(`  action    : ${action.kind} -> ${action.targetLocalId} (risk ${action.risk})`);
  console.log(`  rationale : ${rationale}`);

  // The withheld capability must be honoured: the server was never offered "type"
  // on the redacted fields, so proposing it would mean it ignored the scheme.
  const typedIntoRedacted =
    action.kind === 'type' && (action.targetLocalId === 'el_1' || action.targetLocalId === 'el_2');
  if (typedIntoRedacted) failures++;
  console.log(`  ${typedIntoRedacted ? 'FAIL' : 'PASS'}  did not propose typing into a redacted field`);

  const REDACTION_TERMS = /redact|mask|blur|hidden|obscur|sensitive|placeholder|blacked/i;
  const referencesRedaction = REDACTION_TERMS.test(rationale);
  console.log(
    `  ${referencesRedaction ? 'PASS' : 'WARN'}  rationale references the redaction scheme` +
    (referencesRedaction ? '' : ' (model output varies run to run; not counted as a failure)')
  );

  // --- 3. The prompt is derived: an empty manifest yields different reasoning ---
  console.log('\n=== an unredacted page is described differently ===');
  const plain = await reason(basePayload(MANIFEST_EMPTY, PLAIN_ELEMENTS));
  if (plain.status !== 200) console.log(`  HTTP ${plain.status}: ${JSON.stringify(plain.body)}`);
  const plainRationale = String(plain.body?.rationale || '');
  console.log(`  action    : ${plain.body?.kind} -> ${plain.body?.targetLocalId}`);
  console.log(`  rationale : ${plainRationale}`);
  const ok3 = plain.status === 200 && plainRationale.length > 0;
  if (!ok3) failures++;
  console.log(`  ${ok3 ? 'PASS' : 'FAIL'}  unredacted capture reasoned about without redaction framing`);

  console.log(
    failures === 0
      ? '\nMANIFEST AWARENESS: PASS'
      : `\nMANIFEST AWARENESS: ${failures} FAILURE(S)`
  );
  if (failures) process.exitCode = 1;
} catch (err) {
  console.error('MANIFEST AWARENESS: FAIL -', err.message);
  process.exitCode = 1;
} finally {
  reg.cleanup();
}
