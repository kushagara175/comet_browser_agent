/**
 * @privapilot/scripts - Pixel-true redaction verification
 *
 * Renders fixtures in real Chrome, runs the SHIPPED sanitizer against them, and
 * asserts at the pixel level that sensitive regions are actually destroyed in the
 * output image while safe controls survive.
 *
 * This answers the question the 20%% redaction metric actually asks. The shipped
 * PostRedactionVerifier only compares region count to rendered-mask count and never
 * reads a pixel, so a mask drawn at the wrong coordinates passes it silently.
 *
 * Usage: npm run verify:redaction
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessRegistry, launchChrome, waitForHttp } from './lib/chrome-launcher.mjs';
import { CdpClient } from './lib/cdp-client.mjs';
import { runFixture, readHarnessBundle } from './lib/harness-runner.mjs';


const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4519;
const PUBLIC_DIRECTORY_HTML = `<!DOCTYPE html><html><head><title>Institute Directory</title>
<style>body { font: 18px sans-serif; padding: 30px; } input, button, a, select { margin: 10px; padding: 10px; display: inline-block; }</style>
</head><body>
<nav><a id="contactLink" href="#contact">CONTACT US</a><a id="spocLink" href="#spoc">Know Your SPOC</a></nav>
<label for="instituteSearch">Search by Institute Name</label>
<input id="instituteSearch" type="search" name="username" placeholder="Search by Institute Name" value="IIT Delhi" />
<button id="searchDirectoryBtn">Search</button>
<select id="stateSelect"><option>Select State</option><option>Delhi</option></select>
<input id="cardInSearch" type="search" name="topic_query" value="4532 0150 1234 5671" />
<input id="directoryPassword" type="password" value="hidden-password" />
<p>Launched on 14 July 2023. SIH 2026.</p>
</body></html>`;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const reg = new ProcessRegistry('privapilot-probe');
let localFixture;
reg.installSignalHandlers();

// Selector-anchored ground truth: what SHOULD be destroyed, and one control that
// must survive. A harness that cannot fail the control is not measuring anything.
const CASES = [
  {
    id: 'standard-login',
    sensitive: [
      { id: 'password', selector: '#passwordInput' },
      { id: 'email', selector: '#emailInput' }
    ],
    control: [{ id: 'submit-button', selector: '#submitBtn' }]
  },
  {
    id: 'payment-portal',
    sensitive: [
      { id: 'card', selector: '#cardNumber' },
      { id: 'cvv', selector: '#cardCvv' },
      { id: 'exp', selector: '#cardExp' }
    ],
    control: [{ id: 'pay-button', selector: '#paySubmitBtn' }]
  },
  {
    id: 'public-directory',
    checkActions: true,
    sensitive: [
      { id: 'card-in-search', selector: '#cardInSearch' },
      { id: 'password', selector: '#directoryPassword' }
    ],
    control: [
      { id: 'institute-search', selector: '#instituteSearch' },
      { id: 'search-button', selector: '#searchDirectoryBtn' },
      { id: 'contact-link', selector: '#contactLink' },
      { id: 'spoc-link', selector: '#spocLink' },
      { id: 'state-select', selector: '#stateSelect' }
    ]
  }
];

try {
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) }
  });
  reg.add(portal);

  if (!(await waitForHttp(`${BASE_URL}/fixtures`, 10000))) {
    throw new Error('fixture portal failed to start');
  }
  // A stale portal on the fixed port would make pixel checks silently test old fixtures.
  const fixtureResponse = await fetch(`${BASE_URL}/fixtures/standard-login`);
  if (!fixtureResponse.ok || !(await fixtureResponse.text()).includes('id="passwordInput"')) {
    throw new Error('fixture portal is serving stale or missing standard-login fixture');
  }
  localFixture = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PUBLIC_DIRECTORY_HTML);
  });
  await new Promise(resolve => localFixture.listen(0, '127.0.0.1', resolve));

  await launchChrome({ port: 9334, registry: reg });
  const client = await CdpClient.connect(9334);
  const bundle = readHarnessBundle();

  let failures = 0;

  for (const testCase of CASES) {
    const probes = [...testCase.sensitive, ...testCase.control];
    const url = testCase.id === 'public-directory'
      ? `http://127.0.0.1:${localFixture.address().port}/`
      : `${BASE_URL}/fixtures/${testCase.id}`;
    const r = await runFixture(client, url, {
      goal: 'Inspect the page',
      bundleSource: bundle,
      groundTruthSelectors: probes,
      beforeExtraction: testCase.checkActions ? async (page) => {
        const actions = await page.evaluate(`JSON.stringify((() => {
          const search = document.querySelector('#instituteSearch');
          const link = document.querySelector('#contactLink');
          const extractor = __privapilot.extractSnapshot();
          const input = extractor.snapshot.interactiveElements.find(el => el.rawName === 'Search by Institute Name');
          const contact = extractor.snapshot.interactiveElements.find(el => el.rawName === 'CONTACT US');
          return { searchType: input?.actionCapabilities.includes('type'),
            searchName: input?.rawName, contactClick: contact?.actionCapabilities.includes('click'),
            contactName: contact?.rawName, searchValue: search?.value, contactHref: link?.getAttribute('href') };
        })())`);
        const result = JSON.parse(actions);
        if (!result.searchType || result.searchName !== 'Search by Institute Name' ||
            !result.contactClick || result.contactName !== 'CONTACT US' ||
            result.searchValue !== 'IIT Delhi' || result.contactHref !== '#contact') {
          throw new Error(`Public search/navigation action regression: ${actions}`);
        }
      } : null
    });

    console.log(`\n=== ${testCase.id} ===`);
    console.log(
      `elements ${r.extract.elementCount} | masks ${r.sanitize.maskCount} | blocked ${r.sanitize.blocked}` +
      ` | extract ${r.extract.extractMs.toFixed(1)}ms | sanitize ${r.sanitize.sanitizeMs.toFixed(0)}ms`
    );

    const unresolved = r.groundTruth.filter((g) => !g.found).map((g) => g.id);
    if (unresolved.length) {
      failures += unresolved.length;
      console.log('  UNRESOLVED SELECTORS:', unresolved.join(', '));
    }

    const sensitiveIds = new Set(testCase.sensitive.map((s) => s.id));
    for (const v of r.redactionVerdicts) {
      const mustBeCovered = sensitiveIds.has(v.id);
      const ok = mustBeCovered ? v.covered : !v.covered;
      if (!ok) failures++;
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'}  ${v.id.padEnd(14)}` +
        ` expect ${mustBeCovered ? 'REDACTED' : 'INTACT  '}` +
        ` | covered ${String(v.covered).padEnd(5)}` +
        ` | overlay ${(v.overlayFraction * 100).toFixed(1)}%` +
        ` | fill ${(v.opaqueFraction * 100).toFixed(1)}%` +
        ` | varReduction ${(v.varianceReduction * 100).toFixed(1)}%` +
        ` | px ${v.sampledPixels}`
      );
    }
  }

  client.close();
  console.log(failures === 0 ? '\nPIXEL VERIFICATION: PASS' : `\nPIXEL VERIFICATION: ${failures} FAILURE(S)`);
  if (failures) process.exitCode = 1;
} catch (e) {
  console.error('PROBE: FAIL -', e.message);
  process.exitCode = 1;
} finally {
  localFixture?.close();
  reg.cleanup();
}
