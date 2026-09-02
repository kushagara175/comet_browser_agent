/**
 * Demo Portal + Benchmark Fixture Server
 *
 * Serves the hand-built "Valley Workspace Hub" demo page, and also exposes the 14
 * benchmark fixtures over HTTP at /fixtures/<id>. The fixtures live as HTML strings
 * in packages/test-fixtures and previously could not be loaded by a browser at all,
 * which is why the benchmark had to score them by string matching instead of
 * rendering them.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.PORT || '4500', 10);
const PUBLIC_DIR = path.join(__dirname, 'src');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

// Loaded lazily: the portal must still start if the workspace has not been built.
let FIXTURES = null;
async function getFixtures() {
  if (FIXTURES) return FIXTURES;
  try {
    const mod = await import('@privapilot/test-fixtures');
    FIXTURES = mod.TEST_FIXTURES || {};
  } catch (err) {
    console.warn('[PrivaPilot] Fixtures unavailable (run `npm run build`):', err.message);
    FIXTURES = {};
  }
  return FIXTURES;
}

/** Resolves a fixture by its object key or its `id` field ("standard-login"). */
function findFixture(fixtures, key) {
  if (fixtures[key]) return fixtures[key];
  return Object.values(fixtures).find((f) => f && f.id === key) || null;
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html, 'utf-8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // Fixture index
  if (pathname === '/fixtures' || pathname === '/fixtures/') {
    const fixtures = await getFixtures();
    const rows = Object.entries(fixtures)
      .map(([key, f]) => `<li><a href="/fixtures/${f.id || key}">${f.id || key}</a> — ${f.name || ''}</li>`)
      .join('\n');
    return sendHtml(res, `<!DOCTYPE html><title>Fixtures</title><h1>Benchmark fixtures</h1><ul>${rows}</ul>`);
  }

  // Individual fixture
  if (pathname.startsWith('/fixtures/')) {
    const id = pathname.slice('/fixtures/'.length);
    const fixtures = await getFixtures();
    const fixture = findFixture(fixtures, id);
    if (!fixture) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end(`Unknown fixture: ${id}`);
    }
    return sendHtml(res, fixture.html);
  }

  // Static files, confined to PUBLIC_DIR
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);

  // Path-traversal guard: resolve() collapses "..", so anything escaping the public
  // directory is rejected rather than served.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const contentType = MIME_TYPES[path.extname(filePath)] || 'text/plain';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      const code = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(code, { 'Content-Type': 'text/plain' });
      res.end(code === 404 ? '404 Not Found' : `Server Error: ${err.code}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(content, 'utf-8');
  });
});

server.listen(PORT, () => {
  console.log(`[PrivaPilot] Demo Portal running at http://localhost:${PORT}`);
  console.log(`[PrivaPilot] Benchmark fixtures at  http://localhost:${PORT}/fixtures`);
});
