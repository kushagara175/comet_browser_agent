/**
 * PII Detection Rules and Scrubber Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  isValidLuhn,
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

test('Text PII Scanner - Detects Indian & Global Formats', () => {
  const sample = `
    Contact Dr. Sharma at rohan.sharma@isro.ops.local or call +91 98765 43210.
    Identity: PAN ABCDE1234F, Aadhaar 4532 8901 2345.
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
