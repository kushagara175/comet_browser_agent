/**
 * R2 - the local decision tier.
 *
 * Most of these tests assert the router DECLINES. That is the point: deciding
 * locally is an optimisation, deciding wrongly is a bug, and a router that fires
 * when it is unsure would trade a privacy win for an accuracy loss. The escalation
 * cases are the safety property; the local cases are the feature.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DecisionRouter } from '../apps/extension/dist/background/decision-router.js';

function el(localId, sanitizedName, overrides = {}) {
  return {
    localId,
    role: 'button',
    sanitizedName,
    coarseBounds: [0.1, 0.1, 0.2, 0.05],
    state: ['visible', 'enabled'],
    actionCapabilities: ['click'],
    ...overrides
  };
}

function ctx(goal, elements, extra = {}) {
  return {
    goal,
    sanitized: { elements, runId: 'run_1', pageState: { title: 'T', viewport: [1280, 800] } },
    step: 1,
    consecutiveLocalScrolls: 0,
    ...extra
  };
}

const VIEWPORT_NO_SCROLL = {
  viewportWidth: 1280, viewportHeight: 800, screenshotWidth: 1280, screenshotHeight: 800,
  devicePixelRatio: 1, scrollX: 0, scrollY: 0, documentHeight: 800, captureTimestamp: 0
};
const VIEWPORT_MORE_BELOW = { ...VIEWPORT_NO_SCROLL, documentHeight: 4000 };

// --- Rule 1: dismissing an overlay -----------------------------------------

test('Router - closes a single unambiguous overlay control locally', () => {
  const d = DecisionRouter.route(ctx('Read the article', [el('el_1', 'Close'), el('el_2', 'Continue reading')]));
  assert.equal(d.source, 'local');
  assert.equal(d.rule, 'dismiss-overlay');
  assert.equal(d.proposal.targetLocalId, 'el_1');
  assert.equal(d.proposal.kind, 'click');
});

test('Router - two dismissal controls are ambiguous, so it escalates', () => {
  const d = DecisionRouter.route(ctx('Read the article', [el('el_1', 'Close'), el('el_2', 'Dismiss')]));
  assert.equal(d.source, 'remote');
});

test('Router - never consents on the user behalf', () => {
  // "Accept all" / "Agree" express a choice about the user's data. Closing an
  // overlay is ours to do locally; answering one is not.
  for (const label of ['Accept all cookies', 'Agree', 'Allow all', 'Reject all']) {
    const d = DecisionRouter.route(ctx('Read the article', [el('el_1', label), el('el_2', 'Some other control')]));
    assert.equal(d.source, 'remote', `"${label}" must not be clicked by the local tier`);
  }
});

// --- Rule 2: unambiguous label match ---------------------------------------

test('Router - clicks a control that unambiguously matches the goal', () => {
  const d = DecisionRouter.route(
    ctx('Open the telemetry dashboard', [
      el('el_1', 'Telemetry Dashboard'),
      el('el_2', 'Account settings'),
      el('el_3', 'Help')
    ])
  );
  assert.equal(d.source, 'local');
  assert.equal(d.rule, 'unambiguous-label-match');
  assert.equal(d.proposal.targetLocalId, 'el_1');
});

test('Router - two equally good matches escalate rather than guess', () => {
  const d = DecisionRouter.route(
    ctx('Open the telemetry dashboard', [
      el('el_1', 'Telemetry Dashboard'),
      el('el_2', 'Telemetry Dashboard (legacy)')
    ])
  );
  assert.equal(d.source, 'remote');
  assert.match(d.escalationReason, /ambiguous/);
});

test('Router - a weak match escalates', () => {
  const d = DecisionRouter.route(
    ctx('Reconcile the quarterly settlement ledger', [el('el_1', 'Ledger'), el('el_2', 'Home')])
  );
  assert.equal(d.source, 'remote');
});

test('Router - never targets a redacted control', () => {
  // The placeholder describes a category, not a match. Treating "[PASSWORD FIELD]"
  // as a label match would be the router acting on the redaction itself.
  const d = DecisionRouter.route(
    ctx('password field', [el('el_1', '[PASSWORD FIELD]'), el('el_2', 'Cancel')])
  );
  assert.equal(d.source, 'remote');
});

test('Router - ignores disabled and hidden controls', () => {
  const d = DecisionRouter.route(
    ctx('Open the telemetry dashboard', [
      el('el_1', 'Telemetry Dashboard', { state: ['visible', 'disabled'] }),
      el('el_2', 'Telemetry Dashboard', { state: ['enabled'] })
    ])
  );
  assert.equal(d.source, 'remote');
});

// --- Rule 3: scrolling on evidence -----------------------------------------

test('Router - scrolls only when the document is provably taller than the viewport', () => {
  const elements = [el('el_1', 'Unrelated control'), el('el_2', 'Another unrelated control')];

  const noEvidence = DecisionRouter.route(
    ctx('Reconcile the quarterly settlement ledger', elements, { viewport: VIEWPORT_NO_SCROLL })
  );
  assert.equal(noEvidence.source, 'remote', 'a short page must not be scrolled');

  const withEvidence = DecisionRouter.route(
    ctx('Reconcile the quarterly settlement ledger', elements, { viewport: VIEWPORT_MORE_BELOW })
  );
  assert.equal(withEvidence.source, 'local');
  assert.equal(withEvidence.rule, 'scroll-to-reveal');
  assert.equal(withEvidence.proposal.kind, 'scroll');
  assert.equal(withEvidence.proposal.scrollDirection, 'down');
});

test('Router - stops scrolling and escalates after the bound', () => {
  const d = DecisionRouter.route(
    ctx('Reconcile the quarterly settlement ledger', [el('el_1', 'Unrelated control')], {
      viewport: VIEWPORT_MORE_BELOW,
      consecutiveLocalScrolls: 2
    })
  );
  assert.equal(d.source, 'remote');
});

test('Router - without viewport metadata it will not scroll', () => {
  const d = DecisionRouter.route(ctx('Reconcile the quarterly settlement ledger', [el('el_1', 'Unrelated')]));
  assert.equal(d.source, 'remote');
});

// --- General safety ---------------------------------------------------------

test('Router - escalates when there is nothing to act on', () => {
  assert.equal(DecisionRouter.route(ctx('Do something', [])).source, 'remote');
  assert.equal(
    DecisionRouter.route(ctx('Do something', [el('el_1', 'Label', { actionCapabilities: [] })])).source,
    'remote'
  );
});

test('Router - never proposes a consequential action kind', () => {
  // Typing, submitting and declaring the task finished are the actions where being
  // wrong costs the user something. The router may only ever click or scroll.
  const cases = [
    ctx('Close', [el('el_1', 'Close')]),
    ctx('Open the telemetry dashboard', [el('el_1', 'Telemetry Dashboard'), el('el_2', 'Help')]),
    ctx('Anything unmatched', [el('el_1', 'Unrelated')], { viewport: VIEWPORT_MORE_BELOW })
  ];
  for (const c of cases) {
    const d = DecisionRouter.route(c);
    if (d.source === 'local') {
      assert.ok(['click', 'scroll'].includes(d.proposal.kind), `unexpected local kind ${d.proposal.kind}`);
      assert.equal(d.proposal.risk, 'safe');
      assert.equal(d.proposal.textToType, undefined);
    }
  }
});

test('Router - a local proposal carries no goal text that could leak', () => {
  // The rationale is shown to the user locally, but it must not become a channel
  // for the goal string to reach the server if a later phase ever forwards it.
  const d = DecisionRouter.route(
    ctx('Open the telemetry dashboard for patient 4532-8901-2342', [
      el('el_1', 'Telemetry Dashboard'),
      el('el_2', 'Help')
    ])
  );
  if (d.source === 'local') {
    assert.doesNotMatch(d.proposal.rationale, /4532/);
  }
});
