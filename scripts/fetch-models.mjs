/**
 * @privapilot/scripts - One-time model asset fetch
 *
 * The ViT weights are NOT committed. UltraFace is 1.27 MB and lives in the repo;
 * the CLIP vision tower is ~88 MB, which does not belong in git history that every
 * clone has to carry forever.
 *
 * This is a BUILD-time fetch, not a runtime one. The weights are bundled into the
 * extension package and loaded from `chrome.runtime.getURL` at runtime, so the
 * problem statement's on-device requirement is unaffected: the shipped extension
 * makes no network request for a model.
 *
 * Usage: npm run fetch:models
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = path.join(ROOT_DIR, 'apps', 'extension', 'assets', 'models');

/**
 * Pinned by exact size and SHA-256. A model that silently changed upstream would
 * invalidate every accuracy number measured against it, so a mismatch is a hard
 * failure rather than a warning.
 */
const ASSETS = [
  {
    name: 'clip-vit-base-patch32-vision-uint8.onnx',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_uint8.onnx',
    bytes: 88648915,
    note: 'CLIP ViT-B/32 vision tower, uint8. 12-layer Vision Transformer, 32x32 patches, 224x224 input.'
  }
];

function human(n) {
  return `${(n / 1048576).toFixed(1)} MB`;
}

async function download(asset, dest) {
  process.stdout.write(`  fetching ${asset.name} (${human(asset.bytes)}) ... `);
  const res = await fetch(asset.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${asset.url}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== asset.bytes) {
    throw new Error(`size mismatch: expected ${asset.bytes} bytes, got ${buf.length}`);
  }

  fs.writeFileSync(dest, buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  console.log('ok');
  return sha;
}

async function main() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log('\n[PrivaPilot] Fetching model assets\n');

  const lockPath = path.join(MODEL_DIR, 'MODELS.lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf-8')) : {};

  for (const asset of ASSETS) {
    const dest = path.join(MODEL_DIR, asset.name);

    if (fs.existsSync(dest) && fs.statSync(dest).size === asset.bytes) {
      const sha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
      if (!lock[asset.name] || lock[asset.name].sha256 === sha) {
        console.log(`  ${asset.name} already present (${human(asset.bytes)})`);
        lock[asset.name] = { sha256: sha, bytes: asset.bytes, url: asset.url, note: asset.note };
        continue;
      }
      console.log(`  ${asset.name} present but checksum differs - refetching`);
    }

    const sha = await download(asset, dest);
    if (lock[asset.name] && lock[asset.name].sha256 !== sha) {
      throw new Error(
        `${asset.name} changed upstream (sha256 ${sha} != recorded ${lock[asset.name].sha256}). ` +
        `Every accuracy number measured against the old weights would be invalid. Investigate before proceeding.`
      );
    }
    lock[asset.name] = { sha256: sha, bytes: asset.bytes, url: asset.url, note: asset.note };
  }

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`\n  lockfile: ${path.relative(ROOT_DIR, lockPath)}`);
  console.log('  done\n');
}

main().catch((err) => {
  console.error(`\n[PrivaPilot] Model fetch failed: ${err.message}\n`);
  process.exitCode = 1;
});
