/**
 * Repository Integrity & Truth Guard Test Suite
 *
 * Verifies that the automated repository integrity scanner enforces:
 * 1. Build freshness
 * 2. Real cryptographic SHA-256 (no polynomial simulations)
 * 3. Zero-denominator safety
 * 4. Documentation link validity
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  checkBuildFreshness,
  checkNoSimulatedHashes,
  checkZeroDenominatorSemantics,
  checkDocLinkIntegrity
} from '../../scripts/check-repo-integrity.mjs';

test('Repo Integrity: Production codebase contains zero simulated polynomial hashes', () => {
  const result = checkNoSimulatedHashes();
  assert.strictEqual(
    result.passed,
    true,
    `Real cryptographic hash guard failed: ${result.errors.join(', ')}`
  );
  assert.strictEqual(result.errors.length, 0);
});

test('Repo Integrity: Built artifacts in dist/ are fresh relative to src/', () => {
  const result = checkBuildFreshness();
  assert.strictEqual(
    result.passed,
    true,
    `Build artifact freshness check failed: ${result.errors.join(', ')}`
  );
});

test('Repo Integrity: Zero-denominator metrics guard passes across all active benchmark files', () => {
  const result = checkZeroDenominatorSemantics();
  assert.strictEqual(
    result.passed,
    true,
    `Zero-denominator guard failed: ${result.errors.join(', ')}`
  );
});

test('Repo Integrity: Documentation links in README and docs resolve to existing files', () => {
  const result = checkDocLinkIntegrity();
  assert.strictEqual(
    result.passed,
    true,
    `Documentation link check failed: ${result.errors.join(', ')}`
  );
});
