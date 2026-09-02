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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessRegistry, launchChrome, waitForHttp } from './lib/chrome-launcher.mjs';
import { CdpClient } from './lib/cdp-client.mjs';
import { runFixture, readHarnessBundle } from './lib/harness-runner.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = new ProcessRegistry('privapilot-probe');
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
  }
];

try {
  const portal = spawn(process.execPath, [path.join(ROOT_DIR, 'apps', 'demo-portal', 'server.js')], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    env: { ...process.env, PORT: '4500' }
  });
  reg.add(portal);

  if (!(await waitForHttp('http://127.0.0.1:4500/fixtures', 10000))) {
    console.log('portal: FAILED');
    process.exit(1);
  }

  await launchChrome({ port: 9334, registry: reg });
  const client = await CdpClient.connect(9334);
  const bundle = readHarnessBundle();

  let failures = 0;

  for (const testCase of CASES) {
    const probes = [...testCase.sensitive, ...testCase.control];
    const r = await runFixture(client, `http://127.0.0.1:4500/fixtures/${testCase.id}`, {
      goal: 'Inspect the page',
      bundleSource: bundle,
      groundTruthSelectors: probes
    });

    console.log(`\n=== ${testCase.id} ===`);
    console.log(
      `elements ${r.extract.elementCount} | masks ${r.sanitize.maskCount} | blocked ${r.sanitize.blocked}` +
      ` | extract ${r.extract.extractMs.toFixed(1)}ms | sanitize ${r.sanitize.sanitizeMs.toFixed(0)}ms`
    );

    const unresolved = r.groundTruth.filter((g) => !g.found).map((g) => g.id);
    if (unresolved.length) console.log('  UNRESOLVED SELECTORS:', unresolved.join(', '));

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

  // The property the whole redaction claim rests on: a mask that misses its region
  // must be rejected BY THE PRODUCT, not merely noticed by the benchmark.
  {
    const { CdpPage } = await import('./lib/cdp-client.mjs');
    const { sessionId, targetId } = await client.newPage('about:blank');
    const page = new CdpPage(client, sessionId, targetId);
    await page.enableDomains();
    await page.evaluate(bundle, { awaitPromise: false });
    const probe = JSON.parse(
      await page.evaluate('JSON.stringify(__privapilot.probeDisplacedMaskFailsClosed())', { awaitPromise: false })
    );
    await page.close();

    console.log('');
    console.log('=== fail-closed on displaced mask ===');
    console.log(`  correct placement  accepted : ${probe.correctPlacement.isValid}`);
    console.log(`  displaced mask     rejected : ${!probe.displacedPlacement.isValid}`);
    if (probe.displacedPlacement.reason) console.log(`    reason: ${probe.displacedPlacement.reason}`);
    if (!probe.passed) {
      failures++;
      console.log('  FAIL  the shipped verifier does not fail closed on a displaced mask');
    } else {
      console.log('  PASS');
    }
  }

  client.close();
  console.log(failures === 0 ? '\nPIXEL VERIFICATION: PASS' : `\nPIXEL VERIFICATION: ${failures} FAILURE(S)`);
  if (failures) process.exitCode = 1;
} catch (e) {
  console.error('PROBE: FAIL -', e.message);
  process.exitCode = 1;
} finally {
  reg.cleanup();
}
