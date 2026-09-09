import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupDomainPlaybook,
  resolvePlaybookIntent,
  extractMetricsWithPlaybook,
  SIH_PLAYBOOK
} from '../packages/protocol/dist/index.js';

test('Domain Playbooks: lookupDomainPlaybook matches sih.gov.in hostnames and aliases', () => {
  assert.equal(lookupDomainPlaybook('https://sih.gov.in/signin')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('https://www.sih.gov.in/problem-statements')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('sih.gov.in')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('https://portal.sih.gov.in/dashboard')?.domain, 'sih.gov.in');

  // Unknown domain returns undefined
  assert.equal(lookupDomainPlaybook('https://unknown-portal.org/page'), undefined);
  assert.equal(lookupDomainPlaybook(''), undefined);
});

test('Domain Playbooks: resolvePlaybookIntent grounds SPOC landmark', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'find college SPOC details', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'click_landmark');
  assert.equal(res.targetPhrase, 'Know Your SPOC');
  assert.equal(res.targetRole, 'link');
  assert.ok(res.confidence >= 0.9);
});

test('Domain Playbooks: resolvePlaybookIntent grounds SIH Login landmark', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'click sih login', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'click_landmark');
  assert.equal(res.targetPhrase, 'SIH Login');
  assert.ok(res.confidence >= 0.9);
});

test('Domain Playbooks: resolvePlaybookIntent grounds Problem Statement search input', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'search for PS 171', 'https://sih.gov.in/problem-statements');
  assert.equal(res.matchedIntent, 'fill_field');
  assert.equal(res.targetPhrase, 'Search Problem Statement');
  assert.equal(res.targetRole, 'input');
});

test('Domain Playbooks: resolvePlaybookIntent grounds route navigation to problem statements', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'go to problem statements', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'navigate');
  assert.equal(res.targetUrl, 'https://sih.gov.in/problem-statements');
});

test('Domain Playbooks: resolvePlaybookIntent identifies current route and avoids duplicate navigation', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'go to problem statements', 'https://sih.gov.in/problem-statements');
  // Already on route
  assert.equal(res.matchedIntent, 'none');
  assert.ok(res.rationale.includes('Already on route'));
});

test('Domain Playbooks: extractMetricsWithPlaybook extracts submission numbers from context text', () => {
  const rule = SIH_PLAYBOOK.metricsRules.find(r => r.metricId === 'total_submissions');
  assert.ok(rule, 'Submission rule must exist in SIH playbook');

  const text = 'Dashboard Overview: Smart India Hackathon 2026. Total Submissions: 12,850 completed nominations.';
  const extracted = extractMetricsWithPlaybook(text, rule);

  assert.ok(extracted, 'Should extract metric match');
  assert.equal(extracted.value, '12,850');
  assert.equal(extracted.label, 'total_submissions');
});
