/**
 * PII Detection Rules and Scrubber Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  isValidLuhn,
  isValidVerhoeff,
  calculateVerhoeffChecksum,
  isValidAadhaar,
  scanTextForPII,
  analyzeDomElementSensitivity,
  scrubText,
  sanitizeElementName
} from '../packages/pii-rules/dist/index.js';

test('Luhn Algorithm - Accurately Validates Real vs Fake Card Numbers', () => {
  // Real test card (Visa Test 4532 0150 1234 5671)
  assert.strictEqual(isValidLuhn('4532015012345671'), true);
  assert.strictEqual(isValidLuhn('4532 0150 1234 5671'), true);
  assert.strictEqual(isValidLuhn('4532-0150-1234-5671'), true);

  // Invalid card number (fails checksum)
  assert.strictEqual(isValidLuhn('4532015012345679'), false);
  assert.strictEqual(isValidLuhn('1234567890123456'), false);
});

test('Verhoeff Algorithm - Accurately Validates Synthetic Aadhaar vs False Positives', () => {
  // Valid synthetic 12-digit Aadhaar numbers with correct Verhoeff checksum
  assert.strictEqual(isValidAadhaar('453289012342'), true);
  assert.strictEqual(isValidAadhaar('4532 8901 2342'), true);
  assert.strictEqual(isValidAadhaar('4532-8901-2342'), true);
  assert.strictEqual(isValidAadhaar('9876 5432 1096'), true); // 98765432109 -> check digit 6
  assert.strictEqual(isValidAadhaar('2345 6789 0124'), true); // 23456789012 -> check digit 4

  // Invalid near-misses (transposed digits or altered check digit)
  assert.strictEqual(isValidAadhaar('4532 8901 2345'), false, 'Wrong check digit must fail');
  assert.strictEqual(isValidAadhaar('4532 8901 2324'), false, 'Transposed digits must fail');
  assert.strictEqual(isValidAadhaar('9876 5432 1098'), false, 'Near-miss check digit must fail');

  // Invalid first digit (0 or 1 cannot be first digit of Aadhaar)
  assert.strictEqual(isValidAadhaar('0123 4567 8901'), false, 'Cannot start with 0');
  assert.strictEqual(isValidAadhaar('1234 5678 9012'), false, 'Cannot start with 1');

  // Arbitrary 12-digit order numbers / invoice references must NOT pass as Aadhaar
  assert.strictEqual(isValidAadhaar('202608311205'), false);
  assert.strictEqual(isValidAadhaar('999999999999'), false);
  assert.strictEqual(isValidAadhaar('234567890128'), false);
});

test('Text PII Scanner - Detects Indian & Global Formats', () => {
  const sample = `
    Contact Dr. Sharma at rohan.sharma@isro.ops.local or call +91 98765 43210.
    Identity: PAN ABCDE1234F, Aadhaar 4532 8901 2342.
    Card: 4532 0150 1234 5671 with CVV: 892.
  `;

  const matches = scanTextForPII(sample);

  const categories = matches.map(m => m.category);
  assert.ok(categories.includes('email'), 'Must detect email');
  assert.ok(categories.includes('phone'), 'Must detect Indian phone number');
  assert.ok(categories.includes('national_id'), 'Must detect PAN and Aadhaar');
  assert.ok(categories.includes('credit_card'), 'Must detect Luhn-valid card');
  assert.ok(categories.includes('cvv'), 'Must detect CVV in context');
});

test('Text PII Scanner - Detects Delivery Addresses, Locations, and PIN Codes', () => {
  const deliverySample = 'Deliver to Kushagra, 211002 - HOME at katra - Allahabad';
  const matches = scanTextForPII(deliverySample);

  assert.ok(matches.length > 0, 'Must detect address matches');
  const categories = matches.map(m => m.category);
  assert.ok(categories.includes('address'), 'Must detect address/location category');

  const scrubbed = scrubText(deliverySample);
  assert.ok(scrubbed.includes('[REDACTED_ADDRESS]'));
  assert.ok(!scrubbed.includes('211002'));
  assert.ok(!scrubbed.includes('katra'));
});

test('DOM Semantic Analyzer - Catches Form Elements and Autocomplete Tokens', () => {
  // 1. Password input
  const pwdDecision = analyzeDomElementSensitivity({
    tagName: 'input',
    type: 'password',
    name: 'user_pass'
  });
  assert.strictEqual(pwdDecision.isSensitive, true);
  assert.strictEqual(pwdDecision.category, 'password');

  // 2. Misleading name but sensitive autocomplete
  const autoDecision = analyzeDomElementSensitivity({
    tagName: 'input',
    type: 'text',
    name: 'query_field',
    autocomplete: 'cc-number'
  });
  assert.strictEqual(autoDecision.isSensitive, true);
  assert.strictEqual(autoDecision.category, 'credit_card');

  // 3. Sensitive Label Context
  const labelDecision = analyzeDomElementSensitivity({
    tagName: 'input',
    type: 'text',
    name: 'custom_input',
    associatedLabelText: 'Enter your Aadhaar Number'
  });
  assert.strictEqual(labelDecision.isSensitive, true);
  assert.strictEqual(labelDecision.category, 'national_id');

  // 4. Safe Non-sensitive button
  const safeDecision = analyzeDomElementSensitivity({
    tagName: 'button',
    name: 'open_preview',
    associatedLabelText: 'Open Safe Preview'
  });
  assert.strictEqual(safeDecision.isSensitive, false);
});

test('Text Scrubber - Replaces Sensitive Data with Clean Token Masks', () => {
  const input = 'Send report to alex@enterprise.local or call +91 9876543210';
  const scrubbed = scrubText(input);

  assert.ok(scrubbed.includes('[REDACTED_EMAIL]'));
  assert.ok(scrubbed.includes('[REDACTED_PHONE]'));
  assert.ok(!scrubbed.includes('alex@enterprise.local'));
  assert.ok(!scrubbed.includes('+91 9876543210'));
});

test('Text PII Scanner - Accurately Detects Indian Landlines, Obfuscated Emails, and City Pincodes', () => {
  const isroFooter = `
    Address: Bengaluru-560 094
    Phone: +91 80 22172294 / 96
    Email: isropr[at]isro[dot]gov[dot]in
  `;

  const matches = scanTextForPII(isroFooter);
  const categories = matches.map(m => m.category);

  assert.ok(categories.includes('address'), 'Must detect Bengaluru-560 094 as address');
  assert.ok(categories.includes('phone'), 'Must detect +91 80 22172294 / 96 as phone');
  assert.ok(categories.includes('email'), 'Must detect isropr[at]isro[dot]gov[dot]in as email');

  const scrubbed = scrubText(isroFooter);
  assert.ok(scrubbed.includes('[REDACTED_ADDRESS]'));
  assert.ok(scrubbed.includes('[REDACTED_PHONE]'));
  assert.ok(scrubbed.includes('[REDACTED_EMAIL]'));
  assert.ok(!scrubbed.includes('22172294'));
  assert.ok(!scrubbed.includes('isropr'));
});

