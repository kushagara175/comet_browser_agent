/**
 * @privapilot/scripts - Chrome launch + process lifecycle helpers
 *
 * Extracted from scripts/run-e2e-chrome.js so the e2e script and the browser
 * benchmark harness share one implementation. The resolver logic here is covered
 * by tests/e2e-chrome-resolver.test.js and must keep the same behaviour.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns platform-specific standard candidate paths for Chrome / Chromium.
 */
export function getPlatformCandidates(platform = process.platform, env = process.env) {
  const home = env.HOME || env.USERPROFILE || '';
  const localAppData = env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
  const programFiles = env.ProgramFiles || 'C:\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\Program Files (x86)';
  const pWin = path.win32 || path;

  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      ];
    case 'win32':
      return [
        pWin.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        pWin.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        localAppData ? pWin.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        pWin.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        pWin.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ].filter(Boolean);
    default:
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/bin/microsoft-edge'
      ];
  }
}

/**
 * Resolves a usable Chrome binary: CHROME_PATH wins, then platform defaults.
 */
export function resolveChromeBinary(
  env = process.env,
  platform = process.platform,
  existsFn = fs.existsSync
) {
  const attempted = [];

  if (env.CHROME_PATH) {
    attempted.push(env.CHROME_PATH);
    if (existsFn(env.CHROME_PATH)) {
      return { path: env.CHROME_PATH, attempted, source: 'env' };
    }
  }

  const candidates = getPlatformCandidates(platform, env);
  for (const candidate of candidates) {
    attempted.push(candidate);
    if (existsFn(candidate)) {
      return { path: candidate, attempted, source: 'platform-default' };
    }
  }

  return { path: null, attempted, source: 'not-found' };
}

export function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/** Resolves on any HTTP response, without requiring a JSON body. */
export function headOk(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) resolve(res.statusCode);
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/** Waits for any HTTP endpoint, JSON or not. */
export async function waitForHttp(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await headOk(url);
      return true;
    } catch {
      await sleep(150);
    }
  }
  return false;
}

export async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetchJson(url);
      return true;
    } catch {
      await sleep(150);
    }
  }
  return false;
}

/**
 * Deterministic rendering flags. Screenshot-diffing and pixel assertions are
 * meaningless if scale factor, scrollbars or font hinting vary between runs.
 */
export const DETERMINISTIC_FLAGS = [
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
];

/**
 * Tracks spawned processes and the temp profile so a crash never leaks a Chrome.
 */
export class ProcessRegistry {
  constructor(profilePrefix = 'privapilot-chrome') {
    this.processes = new Set();
    this.profileDir = path.join(os.tmpdir(), `${profilePrefix}-${Date.now()}`);
    this._installed = false;
  }

  add(proc) {
    this.processes.add(proc);
    return proc;
  }

  cleanup() {
    for (const proc of this.processes) {
      try {
        if (!proc.killed) proc.kill('SIGTERM');
      } catch (_) {}
    }
    this.processes.clear();
    try {
      if (fs.existsSync(this.profileDir)) {
        fs.rmSync(this.profileDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }

  installSignalHandlers() {
    if (this._installed) return;
    this._installed = true;
    const bail = (code) => () => {
      this.cleanup();
      process.exit(code);
    };
    process.on('SIGINT', bail(130));
    process.on('SIGTERM', bail(143));
    process.on('uncaughtException', (err) => {
      console.error('[PrivaPilot] Uncaught Exception:', err);
      this.cleanup();
      process.exit(1);
    });
  }
}

/**
 * Launches headless Chrome with a remote debugging port and waits for CDP to answer.
 * `extensionPath`, when given, loads an unpacked extension (MV3 works under --headless=new).
 */
export async function launchChrome({
  port = 9222,
  registry,
  extensionPath = null,
  startUrl = 'about:blank',
  extraFlags = [],
  timeoutMs = 15000
} = {}) {
  const resolved = resolveChromeBinary();
  if (!resolved.path) {
    throw new Error(
      `Chrome not found. Set CHROME_PATH. Attempted:\n  ${resolved.attempted.join('\n  ')}`
    );
  }

  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${registry.profileDir}`,
    ...DETERMINISTIC_FLAGS,
    ...extraFlags
  ];

  if (extensionPath) {
    args.push(`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`);
  }

  args.push(startUrl);

  const proc = spawn(resolved.path, args, { stdio: 'ignore' });
  registry.add(proc);

  const ready = await waitForServer(`http://127.0.0.1:${port}/json/version`, timeoutMs);
  if (!ready) {
    throw new Error(`Chrome did not expose CDP on port ${port} within ${timeoutMs}ms`);
  }

  return { proc, chromePath: resolved.path, port };
}
