/**
 * @privapilot/scripts - Repository Integrity & Truth Checker
 *
 * Verifies binding truth guarantees per docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md:
 * 1. Build Freshness: Generated dist/ files must be up to date with src/ files.
 * 2. Zero-Denominator Guard: Empty categories (0/0) must never be reported as 100%.
 * 3. Documentation Link Integrity: Markdown file references in README and docs must point to existing files.
 * 4. Fake Digest Guard: Production runtime must not contain rolling polynomial simulated hashes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * 1. Verifies that dist/ build artifacts are at least as fresh as src/ source files.
 */
export function checkBuildFreshness() {
  const errors = [];
  const packages = [
    'packages/protocol',
    'packages/pii-rules',
    'packages/test-fixtures',
    'packages/benchmark',
    'apps/server',
    'apps/extension'
  ];

  for (const pkg of packages) {
    const pkgDir = path.join(ROOT_DIR, pkg);
    const srcDir = path.join(pkgDir, 'src');
    const distDir = path.join(pkgDir, 'dist');

    if (!fs.existsSync(srcDir)) continue;
    if (!fs.existsSync(distDir)) {
      errors.push(`Missing dist directory for ${pkg}. Run 'npm run build' first.`);
      continue;
    }

    // Find newest src mtime
    let newestSrcMtime = 0;
    let newestSrcFile = '';

    function scanSrc(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanSrc(full);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > newestSrcMtime) {
            newestSrcMtime = stat.mtimeMs;
            newestSrcFile = path.relative(ROOT_DIR, full);
          }
        }
      }
    }
    scanSrc(srcDir);

    // Find newest dist mtime
    let newestDistMtime = 0;
    function scanDist(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDist(full);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
          const stat = fs.statSync(full);
          if (stat.mtimeMs > newestDistMtime) {
            newestDistMtime = stat.mtimeMs;
          }
        }
      }
    }
    scanDist(distDir);

    // Allow 1.5s tolerance for clock jitter during file writing
    if (newestSrcMtime > newestDistMtime + 1500) {
      errors.push(
        `Artifacts stale in ${pkg}: source file '${newestSrcFile}' is newer than dist/ artifacts. Run 'npm run build'.`
      );
    }
  }

  return {
    checkName: 'Build Artifact Freshness',
    passed: errors.length === 0,
    errors
  };
}

/**
 * 2. Checks benchmark result files to ensure no 0/0 metric is formatted as 100%.
 */
export function checkZeroDenominatorSemantics() {
  const errors = [];
  const benchDir = path.join(ROOT_DIR, 'docs', 'benchmark-results');

  if (!fs.existsSync(benchDir)) {
    return { checkName: 'Zero-Denominator Guard', passed: true, errors: [] };
  }

  const files = fs.readdirSync(benchDir).filter((f) => f.endsWith('.json') && !f.includes('archive'));

  for (const file of files) {
    const filePath = path.join(benchDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Check category-level metrics
      if (data && typeof data === 'object') {
        const checkObject = (obj, pathStr) => {
          if (!obj || typeof obj !== 'object') return;
          
          if (obj.total === 0 || (obj.tp === 0 && obj.fp === 0 && obj.fn === 0)) {
            if (obj.accuracy === 1 || obj.accuracy === 100 || obj.precision === 1 || obj.precision === 100) {
              errors.push(
                `${file}: '${pathStr}' has 0 assessable items but reports 100% precision/accuracy. Zero-denominator must be not_applicable or null.`
              );
            }
          }

          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object') {
              checkObject(obj[key], `${pathStr}.${key}`);
            }
          }
        };

        checkObject(data, file);
      }
    } catch {
      // Ignore parse errors on temporary files
    }
  }

  return {
    checkName: 'Zero-Denominator Guard',
    passed: errors.length === 0,
    errors
  };
}

/**
 * 3. Verifies that markdown links in README and docs reference existing local files.
 */
export function checkDocLinkIntegrity() {
  const errors = [];
  const docFiles = [
    path.join(ROOT_DIR, 'README.md'),
    ...fs
      .readdirSync(path.join(ROOT_DIR, 'docs'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(ROOT_DIR, 'docs', f))
  ];

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const docFile of docFiles) {
    if (!fs.existsSync(docFile)) continue;
    const content = fs.readFileSync(docFile, 'utf-8');
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkTarget = match[2].trim();

      // Skip web links, anchors, mailto, and special protocols
      if (
        linkTarget.startsWith('http://') ||
        linkTarget.startsWith('https://') ||
        linkTarget.startsWith('#') ||
        linkTarget.startsWith('mailto:') ||
        linkTarget.startsWith('conversation:')
      ) {
        continue;
      }

      // Remove anchor fragments
      const cleanPath = linkTarget.split('#')[0];
      if (!cleanPath) continue;

      const resolved = path.resolve(path.dirname(docFile), cleanPath);
      if (!fs.existsSync(resolved)) {
        errors.push(
          `${path.relative(ROOT_DIR, docFile)}: Broken local link '[${match[1]}](${linkTarget})' -> file does not exist`
        );
      }
    }
  }

  return {
    checkName: 'Documentation Link Integrity',
    passed: errors.length === 0,
    errors
  };
}

/**
 * 4. Ensures no rolling simulated polynomial hash exists in production extension code.
 */
export function checkNoSimulatedHashes() {
  const errors = [];
  const extSrc = path.join(ROOT_DIR, 'apps', 'extension', 'src');

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
        const content = fs.readFileSync(full, 'utf-8');
        if (content.includes('((a << 5) - a)') || content.includes('Simple SHA-256 simulation')) {
          errors.push(
            `${path.relative(ROOT_DIR, full)}: Prohibited simulated rolling polynomial hash found. Use apps/extension/src/security/digest.ts instead.`
          );
        }
      }
    }
  }

  scan(extSrc);

  return {
    checkName: 'Real Cryptographic Hash Guard',
    passed: errors.length === 0,
    errors
  };
}

// CLI Execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('🛡️ [PrivaPilot] Running Repository Integrity Checks...\n');

  const checks = [
    checkBuildFreshness(),
    checkNoSimulatedHashes(),
    checkZeroDenominatorSemantics(),
    checkDocLinkIntegrity()
  ];

  let allPassed = true;
  for (const c of checks) {
    if (c.passed) {
      console.log(`  ✓ ${c.checkName}: PASSED`);
    } else {
      allPassed = false;
      console.log(`  ❌ ${c.checkName}: FAILED (${c.errors.length} issue(s))`);
      for (const err of c.errors) {
        console.error(`     - ${err}`);
      }
    }
  }

  if (!allPassed) {
    console.error('\n❌ Repository integrity verification failed.');
    process.exit(1);
  }

  console.log('\n✓ All repository integrity checks passed.');
}
