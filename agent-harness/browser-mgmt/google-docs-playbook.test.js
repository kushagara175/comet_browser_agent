/**
 * @privapilot/tests - Google Docs Playbook & Document Dashboard Perception Test Suite
 *
 * Verifies domain playbook matching for docs.google.com, dashboard vs editor route detection,
 * title rename input grounding, and Directive 26 prompt rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupDomainPlaybook,
  resolvePlaybookIntent,
  GOOGLE_DOCS_PLAYBOOK
} from '../../packages/protocol/dist/index.js';
import { VlmReasoningEngine } from '../../apps/server/dist/engines/vlm-engine.js';

test('Google Docs Playbook: Matches docs.google.com domain and aliases', () => {
  const pb1 = lookupDomainPlaybook('https://docs.google.com/document/u/0/');
  assert.ok(pb1 !== undefined, 'Must match docs.google.com dashboard URL');
  assert.equal(pb1.domain, 'docs.google.com');

  const pb2 = lookupDomainPlaybook('https://docs.google.com/document/d/1abcXYZ/edit');
  assert.ok(pb2 !== undefined, 'Must match docs.google.com editor URL');
  assert.equal(pb2.domain, 'docs.google.com');
});

test('Google Docs Playbook: Distinguishes dashboard route from editor route', () => {
  const routes = GOOGLE_DOCS_PLAYBOOK.routes;
  const dashboardRoute = routes.find((r) => r.name === 'dashboard');
  const editorRoute = routes.find((r) => r.name === 'editor');

  assert.ok(dashboardRoute !== undefined, 'Must define dashboard route');
  assert.ok(editorRoute !== undefined, 'Must define editor route');
  assert.ok(dashboardRoute.path.includes('/document/u/'));
  assert.ok(editorRoute.path.includes('/document/d/'));
});

test('Google Docs Playbook: Grounds Document title rename landmark', () => {
  const res = resolvePlaybookIntent(
    GOOGLE_DOCS_PLAYBOOK,
    'Rename document to Kushagra Schema',
    'https://docs.google.com/document/d/1abcXYZ/edit'
  );

  assert.equal(res.matchedIntent, 'fill_field');
  assert.equal(res.targetPhrase, 'Document title');
  assert.equal(res.targetRole, 'input');
});

test('Google Docs Perception: System prompt contains Directive 26 banning hamburger clicks and enforcing document open', () => {
  const engine = new VlmReasoningEngine({});
  const prompt = engine.buildSystemPrompt();

  assert.ok(
    prompt.includes('26. GOOGLE WORKSPACE & DOCUMENT DASHBOARD DIRECTIVE'),
    'Prompt must contain Rule 26'
  );
  assert.ok(
    prompt.includes('NEVER click the hamburger menu'),
    'Must strictly ban clicking hamburger menu when user wants to edit document'
  );
  assert.ok(
    prompt.includes('YOU MUST PROPOSE kind: "click" on the matching document card/thumbnail'),
    'Must enforce opening document from dashboard first'
  );
});
