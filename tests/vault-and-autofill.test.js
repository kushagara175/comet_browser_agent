/**
 * Tests for Personal Vault, Semantic Autofill & Bidirectional Scroll Awareness
 *
 * Verifies:
 * 1. Closed schema acceptance of scrollMetrics, verticalOffset, and inViewport.
 * 2. Semantic synonym classification (e.g. "contact" -> phone, "college" -> organization).
 * 3. Domain-scoped credential isolation (passwords never cross domain boundaries).
 * 4. Local zero-knowledge vault CRUD operations (profile and credentials).
 * 5. Scroll metrics computation and element viewport positioning.
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';
import {
  classifyFieldDescriptor,
  matchFieldToVault
} from '../apps/extension/dist/vault/semantic-matcher.js';
import {
  getUserProfile,
  saveUserProfile,
  saveSiteCredential,
  getCredentialsForDomain,
  deleteSiteCredential,
  normalizeDomain,
  getVaultPin,
  verifyVaultPin,
  setVaultPin,
  exportVaultJson,
  importVaultJson,
  DEFAULT_VAULT_PIN,
  _resetInMemoryVault
} from '../apps/extension/dist/vault/vault-store.js';

function createBasePayload(overrides = {}) {
  return {
    protocolVersion: '1.0',
    runId: 'run_vault_test',
    goal: 'Test scroll and autofill features',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      {
        localId: 'el_1',
        role: 'input',
        sanitizedName: 'Contact Number',
        coarseBounds: [0.1, 0.2, 0.3, 0.05],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click', 'type'],
        verticalOffset: 'in_view',
        inViewport: true
      }
    ],
    pageState: {
      title: 'Registration Portal',
      viewport: [1280, 800],
      domain: 'sih.gov.in',
      scrollMetrics: {
        scrollTop: 150,
        scrollHeight: 2400,
        clientHeight: 800,
        maxScrollTop: 1600,
        scrollableBelow: true,
        scrollableAbove: true,
        pixelsBelow: 1450,
        pixelsAbove: 150
      }
    },
    ...overrides
  };
}

// ==========================================
// 1. Schema Validation for Scroll & Viewport
// ==========================================

test('Payload Validator: Accepts valid scrollMetrics and verticalOffset / inViewport', () => {
  const payload = createBasePayload();
  const res = validateSanitizedPayload(payload);
  assert.strictEqual(res.isValid, true, res.errorMessage);
  assert.strictEqual(res.payload.pageState.scrollMetrics.scrollTop, 150);
  assert.strictEqual(res.payload.elements[0].verticalOffset, 'in_view');
  assert.strictEqual(res.payload.elements[0].inViewport, true);
});

test('Payload Validator: Accepts elements scrolled above or below viewport', () => {
  const payload = createBasePayload({
    elements: [
      {
        localId: 'el_top',
        role: 'button',
        sanitizedName: 'Header Login',
        coarseBounds: [0.0, 0.1, 0.05, 0.3],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click'],
        verticalOffset: 'above',
        inViewport: false
      },
      {
        localId: 'el_bottom',
        role: 'button',
        sanitizedName: 'Footer Submit',
        coarseBounds: [0.95, 0.1, 1.0, 0.3],
        state: ['visible', 'enabled'],
        actionCapabilities: ['click'],
        verticalOffset: 'below',
        inViewport: false
      }
    ]
  });
  const res = validateSanitizedPayload(payload);
  assert.strictEqual(res.isValid, true, res.errorMessage);
  assert.strictEqual(res.payload.elements[0].verticalOffset, 'above');
  assert.strictEqual(res.payload.elements[1].verticalOffset, 'below');
});

test('Payload Validator: Rejects invalid scrollMetrics with negative values', () => {
  const payload = createBasePayload({
    pageState: {
      title: 'Portal',
      viewport: [1280, 800],
      scrollMetrics: {
        scrollTop: -10, // Invalid negative
        scrollHeight: 2000,
        clientHeight: 800,
        maxScrollTop: 1200,
        scrollableBelow: true,
        scrollableAbove: false,
        pixelsBelow: 1200,
        pixelsAbove: 0
      }
    }
  });
  const res = validateSanitizedPayload(payload);
  assert.strictEqual(res.isValid, false);
  assert.match(res.errorMessage, /scrollMetrics\.scrollTop must be a non-negative number/);
});

test('Payload Validator: Rejects unknown properties in scrollMetrics (closed schema)', () => {
  const payload = createBasePayload({
    pageState: {
      title: 'Portal',
      viewport: [1280, 800],
      scrollMetrics: {
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 800,
        maxScrollTop: 200,
        scrollableBelow: true,
        scrollableAbove: false,
        pixelsBelow: 200,
        pixelsAbove: 0,
        unknownEvilField: 'malicious'
      }
    }
  });
  const res = validateSanitizedPayload(payload);
  assert.strictEqual(res.isValid, false);
  assert.match(res.errorMessage, /Closed schema violation: Unknown scrollMetrics property/);
});

// ==========================================
// 2. Semantic Field Matching (Synonym Groups)
// ==========================================

test('Semantic Matcher: Correctly maps heterogeneous phone aliases to canonical "phone"', () => {
  const testCases = [
    { associatedLabelText: 'Contact' },
    { associatedLabelText: 'Contact No.' },
    { placeholder: 'Enter your mobile number' },
    { name: 'applicant_tel' },
    { type: 'tel' },
    { rawName: 'Phone Number' }
  ];

  for (const tc of testCases) {
    const classification = classifyFieldDescriptor(tc);
    assert.ok(classification, `Should classify field with descriptor ${JSON.stringify(tc)}`);
    assert.strictEqual(classification.canonical, 'phone');
    assert.ok(classification.confidence >= 0.45);
  }
});

test('Semantic Matcher: Correctly maps heterogeneous organization aliases to canonical "organization"', () => {
  const testCases = [
    { associatedLabelText: 'College Name' },
    { placeholder: 'Enter Institute / University' },
    { name: 'user_org' },
    { autocomplete: 'organization' },
    { rawName: 'Company / Employer' }
  ];

  for (const tc of testCases) {
    const classification = classifyFieldDescriptor(tc);
    assert.ok(classification, `Should classify field with descriptor ${JSON.stringify(tc)}`);
    assert.strictEqual(classification.canonical, 'organization');
    assert.ok(classification.confidence >= 0.45);
  }
});

test('Semantic Matcher: Correctly maps identity slots (fullName, email, address, postalCode)', () => {
  assert.strictEqual(classifyFieldDescriptor({ associatedLabelText: 'Full Name' })?.canonical, 'fullName');
  assert.strictEqual(classifyFieldDescriptor({ type: 'email' })?.canonical, 'email');
  assert.strictEqual(classifyFieldDescriptor({ placeholder: 'Street Address' })?.canonical, 'address');
  assert.strictEqual(classifyFieldDescriptor({ associatedLabelText: 'PIN Code' })?.canonical, 'postalCode');
  assert.strictEqual(classifyFieldDescriptor({ placeholder: 'GitHub Profile Link' })?.canonical, 'githubUrl');
});

// ==========================================
// 3. Domain-Scoped Credential Isolation & Vault
// ==========================================

test('Domain Credential Isolation: Passwords never cross domain boundaries', () => {
  const profile = {
    fullName: 'Alice Kumar',
    email: 'alice@example.com',
    phone: '+91 9876543210',
    organization: 'IIT Madras'
  };

  const sihCredentials = [
    {
      id: 'cred_1',
      domain: 'sih.gov.in',
      usernameOrEmail: 'alice_sih',
      password: 'SuperSecretSIHPassword123!',
      createdAt: Date.now()
    }
  ];

  // 1. On sih.gov.in: password matches
  const passwordDescriptor = { type: 'password', name: 'user_pass', associatedLabelText: 'Password' };
  const sihMatch = matchFieldToVault(passwordDescriptor, profile, sihCredentials, 'sih.gov.in');
  assert.strictEqual(sihMatch.matched, true);
  assert.strictEqual(sihMatch.valueToFill, 'SuperSecretSIHPassword123!');
  assert.strictEqual(sihMatch.canonicalField, 'password');

  // 2. On github.com: SIH password must NOT be supplied (empty credentials list passed for github.com)
  const githubMatch = matchFieldToVault(passwordDescriptor, profile, [], 'github.com');
  assert.strictEqual(githubMatch.matched, false);
  assert.strictEqual(githubMatch.valueToFill, undefined);
  assert.strictEqual(githubMatch.isCredential, true);
  assert.match(githubMatch.reason, /no saved credential exists for this domain/);
});

test('Semantic Matcher: Automatically fills profile phone and college without leaking PII', () => {
  const profile = {
    fullName: 'Alice Kumar',
    email: 'alice@example.com',
    phone: '+91 9876543210',
    organization: 'IIT Madras'
  };

  // Website label: "contact"
  const phoneDescriptor = { associatedLabelText: 'Contact', placeholder: 'Enter contact' };
  const phoneMatch = matchFieldToVault(phoneDescriptor, profile, [], 'example.com');
  assert.strictEqual(phoneMatch.matched, true);
  assert.strictEqual(phoneMatch.valueToFill, '+91 9876543210');
  assert.strictEqual(phoneMatch.canonicalField, 'phone');

  // Website label: "college"
  const collegeDescriptor = { associatedLabelText: 'College', placeholder: 'Your college' };
  const collegeMatch = matchFieldToVault(collegeDescriptor, profile, [], 'example.com');
  assert.strictEqual(collegeMatch.matched, true);
  assert.strictEqual(collegeMatch.valueToFill, 'IIT Madras');
  assert.strictEqual(collegeMatch.canonicalField, 'organization');
});

// ==========================================
// 4. Local Zero-Knowledge Vault Store CRUD
// ==========================================

test('Vault Store: Profile and site credentials persist, update, and isolate properly', async () => {
  _resetInMemoryVault({
    version: 1,
    profile: {
      fullName: 'Kushagra Singh',
      email: 'kushagra@example.com',
      phone: '+91 98765 43210',
      organization: 'SIH Innovation Lab'
    },
    credentials: [],
    updatedAt: Date.now()
  });

  // 1. Initial profile
  const initialProfile = await getUserProfile();
  assert.ok(initialProfile.fullName);

  // 2. Update profile
  await saveUserProfile({
    fullName: 'Kushagra Singh Test',
    phone: '+91 99999 88888',
    organization: 'National AI Mission'
  });
  const updatedProfile = await getUserProfile();
  assert.strictEqual(updatedProfile.fullName, 'Kushagra Singh Test');
  assert.strictEqual(updatedProfile.phone, '+91 99999 88888');
  assert.strictEqual(updatedProfile.organization, 'National AI Mission');

  // 3. Save site credentials for two distinct domains
  await saveSiteCredential({
    domain: 'sih.gov.in',
    usernameOrEmail: 'team_leader',
    password: 'SIHSecureKey#2026'
  });

  await saveSiteCredential({
    domain: 'isro.gov.in',
    usernameOrEmail: 'space_dev',
    password: 'ISROTelemetry#789'
  });

  // 4. Verify domain isolation
  const sihCreds = await getCredentialsForDomain('sih.gov.in');
  assert.strictEqual(sihCreds.length, 1);
  assert.strictEqual(sihCreds[0].usernameOrEmail, 'team_leader');
  assert.strictEqual(sihCreds[0].password, 'SIHSecureKey#2026');

  const isroCreds = await getCredentialsForDomain('https://isro.gov.in/telemetry');
  assert.strictEqual(isroCreds.length, 1);
  assert.strictEqual(isroCreds[0].usernameOrEmail, 'space_dev');

  const unknownCreds = await getCredentialsForDomain('other-site.com');
  assert.strictEqual(unknownCreds.length, 0);

  // 5. Delete credential
  const deleted = await deleteSiteCredential('isro.gov.in', 'space_dev');
  assert.strictEqual(deleted, true);

  const afterDelete = await getCredentialsForDomain('isro.gov.in');
  assert.strictEqual(afterDelete.length, 0);
});

test('Vault Store: Domain normalization handles diverse URL formats', () => {
  assert.strictEqual(normalizeDomain('https://sih.gov.in/problem-statements'), 'sih.gov.in');
  assert.strictEqual(normalizeDomain('http://www.google.com/search?q=test'), 'google.com');
  assert.strictEqual(normalizeDomain('subdomain.example.org:8080/path'), 'subdomain.example.org');
  assert.strictEqual(normalizeDomain('LOCALHOST:3000'), 'localhost');
});

// ==========================================
// 5. PIN Security & Master Lock
// ==========================================

test('Vault PIN Security: Defaults to 1234, verifies correctly, rejects bad PIN', async () => {
  _resetInMemoryVault();
  assert.strictEqual(DEFAULT_VAULT_PIN, '1234');
  const initialPin = await getVaultPin();
  assert.strictEqual(initialPin, '1234');

  // Correct PIN verification
  const valid = await verifyVaultPin('1234');
  assert.strictEqual(valid, true);

  // Whitespace trimmed verification
  const validWithSpaces = await verifyVaultPin(' 1234 ');
  assert.strictEqual(validWithSpaces, true);

  // Incorrect PIN verification
  const invalid = await verifyVaultPin('0000');
  assert.strictEqual(invalid, false);

  const empty = await verifyVaultPin('');
  assert.strictEqual(empty, false);
});

test('Vault PIN Security: Updates master PIN and enforces minimum 4 digits', async () => {
  _resetInMemoryVault();

  // Valid PIN update
  const updated = await setVaultPin('5678');
  assert.strictEqual(updated, true);
  assert.strictEqual(await getVaultPin(), '5678');
  assert.strictEqual(await verifyVaultPin('5678'), true);
  assert.strictEqual(await verifyVaultPin('1234'), false);

  // Rejects invalid PINs < 4 characters
  const tooShort = await setVaultPin('12');
  assert.strictEqual(tooShort, false);
  assert.strictEqual(await getVaultPin(), '5678');

  const emptyPin = await setVaultPin('');
  assert.strictEqual(emptyPin, false);
});

// ==========================================
// 6. Device Backup & Restore (JSON)
// ==========================================

test('Vault Backup & Restore: Exports valid JSON with profile and credentials', async () => {
  _resetInMemoryVault({
    version: 1,
    masterPin: '4321',
    profile: {
      fullName: 'Kushagra Singh Backup Test',
      email: 'kushagra@example.com',
      phone: '+91 98765 43210',
      organization: 'Innovation Lab'
    },
    credentials: [
      {
        id: 'cred_backup_1',
        domain: 'sih.gov.in',
        title: 'SIH Portal',
        usernameOrEmail: 'team_backup',
        password: 'BackupSecurePass2026!',
        createdAt: Date.now()
      }
    ],
    updatedAt: Date.now()
  });

  const jsonBackup = await exportVaultJson();
  assert.ok(jsonBackup && typeof jsonBackup === 'string');

  const parsed = JSON.parse(jsonBackup);
  assert.strictEqual(parsed.app, 'privapilot');
  assert.strictEqual(parsed.exportVersion, 1);
  assert.ok(parsed.exportedAt);
  assert.strictEqual(parsed.vault.profile.fullName, 'Kushagra Singh Backup Test');
  assert.strictEqual(parsed.vault.credentials.length, 1);
  assert.strictEqual(parsed.vault.credentials[0].domain, 'sih.gov.in');
  assert.strictEqual(parsed.vault.masterPin, '4321');
});

test('Vault Backup & Restore: Imports and restores vault state correctly', async () => {
  _resetInMemoryVault();

  const backupData = {
    app: 'privapilot',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    vault: {
      masterPin: '9999',
      profile: {
        fullName: 'Restored User',
        email: 'restored@example.com',
        phone: '+91 11111 22222',
        organization: 'Restored Org',
        city: 'Bengaluru'
      },
      credentials: [
        {
          domain: 'restored-site.org',
          usernameOrEmail: 'restored_user',
          password: 'RestoredPassword#999'
        }
      ]
    }
  };

  const res = await importVaultJson(JSON.stringify(backupData));
  assert.strictEqual(res.success, true);

  const profile = await getUserProfile();
  assert.strictEqual(profile.fullName, 'Restored User');
  assert.strictEqual(profile.email, 'restored@example.com');
  assert.strictEqual(profile.phone, '+91 11111 22222');

  const pin = await getVaultPin();
  assert.strictEqual(pin, '9999');

  const creds = await getCredentialsForDomain('restored-site.org');
  assert.strictEqual(creds.length, 1);
  assert.strictEqual(creds[0].usernameOrEmail, 'restored_user');
  assert.strictEqual(creds[0].password, 'RestoredPassword#999');
});

test('Vault Backup & Restore: Safely rejects corrupted or malformed backup payloads', async () => {
  _resetInMemoryVault();

  // Invalid JSON syntax
  const badSyntax = await importVaultJson('{ invalid json: ');
  assert.strictEqual(badSyntax.success, false);
  assert.ok(badSyntax.error);

  // Missing profile
  const missingProfile = await importVaultJson(JSON.stringify({ vault: { credentials: [] } }));
  assert.strictEqual(missingProfile.success, false);
  assert.match(missingProfile.error, /missing profile/i);

  // Non-array credentials
  const badCreds = await importVaultJson(JSON.stringify({ vault: { profile: { fullName: 'Test' }, credentials: 'not-an-array' } }));
  assert.strictEqual(badCreds.success, false);
  assert.match(badCreds.error, /credentials must be a list/i);
});

// ==========================================
// 7. Sidepanel UI Integrity Check
// ==========================================

test('Sidepanel UI Integrity: Contains menuVaultBtn, PIN lock screen, change PIN, and backup controls', () => {
  const htmlPath = path.resolve('apps/extension/src/sidepanel/sidepanel.html');
  assert.ok(fs.existsSync(htmlPath), 'sidepanel.html exists');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Menu item with PIN badge
  assert.ok(html.includes('id="menuVaultBtn"'), 'menuVaultBtn present in dropdown menu');
  assert.ok(html.includes('vault-menu-badge'), 'vault-menu-badge present');

  // PIN lock screen
  assert.ok(html.includes('id="vaultPinLockScreen"'), 'vaultPinLockScreen present');
  assert.ok(html.includes('id="vaultPinInput"'), 'vaultPinInput present');
  assert.ok(html.includes('id="vaultUnlockBtn"'), 'vaultUnlockBtn present');

  // Unlocked container & Change PIN modal
  assert.ok(html.includes('id="vaultUnlockedContainer"'), 'vaultUnlockedContainer present');
  assert.ok(html.includes('id="vaultLockBtn"'), 'vaultLockBtn present');
  assert.ok(html.includes('id="vaultChangePinBtn"'), 'vaultChangePinBtn present');
  assert.ok(html.includes('id="vaultChangePinModal"'), 'vaultChangePinModal present');

  // Backup & Restore
  assert.ok(html.includes('id="vaultNavBackupBtn"'), 'vaultNavBackupBtn present');
  assert.ok(html.includes('id="vaultBackupSection"'), 'vaultBackupSection present');
  assert.ok(html.includes('id="vaultExportBtn"'), 'vaultExportBtn present');
  assert.ok(html.includes('id="vaultImportBtn"'), 'vaultImportBtn present');
  assert.ok(html.includes('id="vaultImportFileInput"'), 'vaultImportFileInput present');
});
