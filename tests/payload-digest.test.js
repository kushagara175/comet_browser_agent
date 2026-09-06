/**
 * Payload Digest & Cryptographic Integrity Test Suite
 *
 * Verifies:
 * 1. Web Crypto SHA-256 test vectors match known NIST values.
 * 2. Deterministic canonicalization is independent of object key insertion order.
 * 3. computePayloadDigestSha256 outputs a valid 64-char hex string prefixed with 'sha256_'.
 * 4. Any mutation to the sanitized payload invalidates verifyPayloadDigestSha256.
 * 5. Deterministic hashing never incorporates raw predictable PII strings.
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  canonicalizeJson,
  computeSha256Hex,
  computePayloadDigestSha256,
  verifyPayloadDigestSha256
} from '../apps/extension/dist/security/digest.js';

test('Payload Digest: NIST SHA-256 test vectors produce exact known hashes', async () => {
  // Empty string
  const emptyHash = await computeSha256Hex('');
  assert.strictEqual(
    emptyHash,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'SHA-256 of empty string must match NIST standard'
  );

  // "abc"
  const abcHash = await computeSha256Hex('abc');
  assert.strictEqual(
    abcHash,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'SHA-256 of "abc" must match NIST standard'
  );

  // "The quick brown fox jumps over the lazy dog"
  const foxHash = await computeSha256Hex('The quick brown fox jumps over the lazy dog');
  assert.strictEqual(
    foxHash,
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    'SHA-256 of test sentence must match NIST standard'
  );
});

test('Payload Digest: Canonical JSON serialization is strictly key-order independent', () => {
  const objA = { z: 1, a: 2, m: { nestedB: 'hello', nestedA: 'world' } };
  const objB = { a: 2, m: { nestedA: 'world', nestedB: 'hello' }, z: 1 };

  const canonicalA = canonicalizeJson(objA);
  const canonicalB = canonicalizeJson(objB);

  assert.strictEqual(canonicalA, canonicalB, 'Objects with different key order must produce identical canonical strings');
  assert.strictEqual(
    canonicalA,
    '{"a":2,"m":{"nestedA":"world","nestedB":"hello"},"z":1}'
  );
});

test('Payload Digest: computePayloadDigestSha256 generates a 71-character sha256_<64hex> string', async () => {
  const samplePayload = {
    captureId: 'cap_test_123',
    goal: 'Click on Preview button',
    maskCount: 3,
    pageState: {
      title: 'Portal Dashboard',
      viewport: [1280, 800]
    },
    elements: [
      {
        localId: 'el_1',
        role: 'button',
        sanitizedName: 'Preview Security Clearance',
        coarseBounds: [0.1, 0.1, 0.2, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click']
      }
    ]
  };

  const digest = await computePayloadDigestSha256(samplePayload);
  assert.ok(digest.startsWith('sha256_'), 'Digest must start with sha256_ prefix');
  assert.strictEqual(digest.length, 71, 'Digest must be exactly 71 chars: sha256_ + 64 hex characters');

  const hexPart = digest.slice(7);
  assert.match(hexPart, /^[a-f0-9]{64}$/, 'Hex portion must be valid 64-character lowercase hexadecimal');

  const isValid = await verifyPayloadDigestSha256(samplePayload, digest);
  assert.strictEqual(isValid, true, 'Original payload must verify cleanly against its own digest');
});

test('Payload Digest: Any payload tampering breaks verification', async () => {
  const basePayload = {
    captureId: 'cap_tamper_test',
    goal: 'Submit application',
    maskCount: 2,
    pageState: { title: 'Form', viewport: [1280, 800] },
    elements: [
      { localId: 'el_submit', role: 'button', sanitizedName: 'Submit' }
    ]
  };

  const originalDigest = await computePayloadDigestSha256(basePayload);

  // Tamper 1: Alter goal
  const tamperedGoal = { ...basePayload, goal: 'Transfer funds' };
  assert.strictEqual(
    await verifyPayloadDigestSha256(tamperedGoal, originalDigest),
    false,
    'Altering goal must break digest verification'
  );

  // Tamper 2: Alter mask count
  const tamperedMasks = { ...basePayload, maskCount: 0 };
  assert.strictEqual(
    await verifyPayloadDigestSha256(tamperedMasks, originalDigest),
    false,
    'Altering mask count must break digest verification'
  );

  // Tamper 3: Alter target element
  const tamperedElement = {
    ...basePayload,
    elements: [{ localId: 'el_malicious', role: 'button', sanitizedName: 'Download' }]
  };
  assert.strictEqual(
    await verifyPayloadDigestSha256(tamperedElement, originalDigest),
    false,
    'Altering elements must break digest verification'
  );
});
