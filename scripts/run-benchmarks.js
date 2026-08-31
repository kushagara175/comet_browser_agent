/**
 * Automated Benchmark Runner Script
 * Executes benchmark suite and writes results to docs/benchmark-results/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'benchmark-results');

async function main() {
  const splitArg = process.argv.find(a => a.startsWith('--split='));
  const split = splitArg ? splitArg.split('=')[1] : 'all';

  console.log(`⚡ [PrivaPilot] Running Benchmark Evaluation Suite (Split: ${split})...\n`);

  // Dynamic import of built benchmark package
  const { BenchmarkRunner, BenchmarkReporter } = await import('../packages/benchmark/dist/index.js');

  const results = BenchmarkRunner.runAll({ split });
  const markdownReport = BenchmarkReporter.formatMarkdownReport(results);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const reportMdPath = path.join(OUTPUT_DIR, 'EVALUATION_REPORT.md');
  const reportJsonPath = path.join(OUTPUT_DIR, 'EVALUATION_REPORT.json');

  fs.writeFileSync(reportMdPath, markdownReport, 'utf-8');
  fs.writeFileSync(reportJsonPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(markdownReport);
  console.log(`\n📄 Report saved to:\n  - ${reportMdPath}\n  - ${reportJsonPath}\n`);
}

main().catch((err) => {
  console.error('❌ Benchmark runner failed:', err);
  process.exit(1);
});
