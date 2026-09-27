/**
 * @privapilot/pii-rules - Aadhaar Verhoeff Checksum & Anti-Regression Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  isValidVerhoeff,
  calculateVerhoeffChecksum,
  isValidAadhaar,
  scanTextForPII,
  scrubText
} from '../../packages/pii-rules/dist/index.js';

// ============================================================================
// 1. Verhoeff Unit Tests
// ============================================================================

test('Verhoeff: Mathematically computes and validates checksum digits accurately', () => {
  // Test with standard 11-digit prefixes and their verified Verhoeff check digits
  const testPrefixes = [
    { prefix: '45328901234', expectedCheck: 2 },
    { prefix: '98765432109', expectedCheck: 6 },
    { prefix: '23456789012', expectedCheck: 4 },
    { prefix: '34567890123', expectedCheck: 8 },
    { prefix: '56789012345', expectedCheck: 8 }
  ];

  for (const { prefix, expectedCheck } of testPrefixes) {
    const computedCheck = calculateVerhoeffChecksum(prefix);
    assert.strictEqual(computedCheck, expectedCheck, `Check digit for ${prefix} should be ${expectedCheck}`);
    const fullNumber = prefix + computedCheck;
    assert.strictEqual(isValidVerhoeff(fullNumber), true, `${fullNumber} should be Verhoeff-valid`);
  }
});

// ============================================================================
// 2. Synthetic Valid Aadhaar & Formatting Variants
// ============================================================================

test('Aadhaar: Validates official-style synthetic Aadhaar numbers across all formatting variants', () => {
  const validNumbers = [
    '453289012342',
    '4532 8901 2342',
    '4532-8901-2342',
    '987654321096',
    '9876 5432 1096',
    '9876-5432-1096',
    '234567890124',
    '2345 6789 0124',
    '2345-6789-0124',
    '3456 7890 1238',
    '5678-9012-3458'
  ];

  for (const num of validNumbers) {
    assert.strictEqual(isValidAadhaar(num), true, `Expected ${num} to be recognized as valid Aadhaar`);
  }
});

// ============================================================================
// 3. Invalid Near-Misses and False Positive Rejection
// ============================================================================

test('Aadhaar: Rejects invalid near-misses, transposed digits, and arbitrary 12-digit numbers', () => {
  const invalidNumbers = [
    // Transposed adjacent digits (Verhoeff catches 100% of single transposition errors)
    '4532 8901 2432', // '34' transposed to '43'
    '4532 8901 2324', // '42' transposed to '24'
    '9876 5432 0196', // '10' transposed to '01'
    '2345 7689 0124', // '67' transposed to '76'

    // Altered check digit
    '4532 8901 2340',
    '4532 8901 2341',
    '4532 8901 2345',
    '9876 5432 1090',
    '9876 5432 1097',

    // Invalid first digit (0 or 1)
    '0123 4567 8901',
    '1234 5678 9012',
    '1987 6543 2100',

    // Repeating identical digits
    '0000 0000 0000',
    '1111 1111 1111',
    '2222 2222 2222',
    '9999 9999 9999',

    // Arbitrary order / transaction / timestamp reference IDs (12 digits)
    '202608311205',
    '202401010001',
    '987654321098',
    '234567890128'
  ];

  for (const num of invalidNumbers) {
    assert.strictEqual(isValidAadhaar(num), false, `Expected ${num} to be rejected as invalid Aadhaar`);
  }
});

// ============================================================================
// 4. Scanner Text Extraction & Overlap / Coexistence Tests
// ============================================================================

test('Aadhaar: scanTextForPII detects valid Aadhaar without false-positive order IDs', () => {
  const text = `
    Order Ref: 202608311205 (Tracking: 234567890128).
    Citizen Record:
    Valid Aadhaar 1: 4532 8901 2342
    Valid Aadhaar 2: 9876-5432-1096
    Invalid Near-Miss Aadhaar: 4532 8901 2345
  `;

  const matches = scanTextForPII(text);
  const aadhaarMatches = matches.filter(m => m.category === 'national_id');

  // Should detect the 2 valid Aadhaar numbers, NOT the 2 order refs and NOT the invalid near-miss
  assert.strictEqual(aadhaarMatches.length, 2, 'Should match exactly 2 valid Aadhaar numbers');
});

// ============================================================================
// 5. Anti-Regression: Existing PAN, Phone, Card, and Token Detection
// ============================================================================

test('Anti-Regression: PAN, Phone, Card, CVV, and Secret Tokens continue to be detected cleanly', () => {
  const sample = `
    User: alex@enterprise.corp
    PAN: ABCDE1234F
    Aadhaar: 4532 8901 2342
    Phone: +91 98765 43210
    Intl Phone: +1-555-234-5678
    Card: 4532 0150 1234 5671
    CVV: 892
    Token: sk_live_9876543210abcdef12345678
  `;

  const matches = scanTextForPII(sample);
  const categories = new Set(matches.map(m => m.category));

  assert.ok(categories.has('email'), 'Must detect email');
  assert.ok(categories.has('national_id'), 'Must detect PAN and valid Aadhaar');
  assert.ok(categories.has('phone'), 'Must detect phone numbers');
  assert.ok(categories.has('credit_card'), 'Must detect Luhn card');
  assert.ok(categories.has('cvv'), 'Must detect CVV');
  assert.ok(categories.has('token'), 'Must detect API token');

  // Verify scrubber masks all of them
  const scrubbed = scrubText(sample);
  assert.ok(!scrubbed.includes('ABCDE1234F'));
  assert.ok(!scrubbed.includes('4532 8901 2342'));
  assert.ok(!scrubbed.includes('alex@enterprise.corp'));
  assert.ok(!scrubbed.includes('4532 0150 1234 5671'));
});
