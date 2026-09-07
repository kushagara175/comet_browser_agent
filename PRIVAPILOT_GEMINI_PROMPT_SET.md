# PrivaPilot — Sequenced Gemini Prompt Set

Replaces the single `09_CHROME_EXTENSION_UI_END_TO_END_FINAL_PROMPT.md` with four scoped
prompts. Run them **in order**. Each ends with its own gate and its own report. Do not paste
more than one at a time.

**Why split:** the original prompt was ~120 requirements across 9 phases with 25 files to read
before editing. Agent quality degrades badly past the first two phases of a document that size.

## Sequence and budget (13 days to 20 Sep 2026)

| Prompt | Scope | Budget | Blocks |
|---|---|---|---|
| **A** | Run lifecycle settlement, approve/deny, delayed status, terminal postconditions | 3 days | everything below |
| **D** | Replay harness, local vision logging, resource + latency instrumentation | 4 days | — |
| **B** | Scenario validity, canonical payload | 2 days | needs A |
| **C** | Pixel strictness, honest metrics, evidence provenance | 2 days | needs A, B |
| — | Buffer, demo prep, submission docs | 2 days | — |

Current baseline: **6/12 matrix scenarios**, protected approval **0/5**. Three of the six
failures are suspected cascades from a run that is never released — Prompt A tests that first,
because it may turn 6 defects into 3.

**A before D** because nothing can be measured through an untrustworthy runner. **D before B/C**
because D touches 60% of the rubric (visual 25 + resources 20 + latency 15) and B/C touch ~20%.

Parts of D that need no captures — resource instrumentation, vision candidate logging — can be
started in parallel if you have a second agent session.

## Decisions already made — do not let the agent re-open these

1. Denied terminal state is a dedicated `denied` state. Not `idle`, not `failed-safe`.
2. Terminal postcondition contracts are defined **before** scenario assertions are rewritten.
3. Test hooks are build-flag gated and asserted absent from the shipped bundle.
4. Server model stays open-weight Qwen. No proprietary swap.
5. Visual grounding stays honestly labelled DOM-assisted until D produces agreement numbers.
6. Scenarios are **named**, never numbered.
7. `dist/` is tracked in this repo, so every rebuild dirties tracked files. That is expected —
   no agent should "clean" it, and Prompt C's source fingerprint must exclude it or the freeze
   gate will never pass.
8. `docs/benchmark-results/runs/latest/SUMMARY_REPORT.md` (10/10) is stale evidence from commit
   `bd2de10` on a dirty tree. `E2E_EXTENSION_MATRIX.json` is current. So are
   `04_PROGRESS_TRACKER.md`, `EXECUTION_PLAN.md`, and `PHASES.md` — stale on status.

## Before running any prompt

The tree has ~45 modified tracked files and ~1,900 insertions uncommitted, with two agents
working it. Back it up yourself first:

```bash
git diff > /tmp/privapilot-wip-$(date +%s).patch
git status --short > /tmp/privapilot-wip-files.txt
```

---
---

# PROMPT A — Run lifecycle settlement and protected action correctness

**Revised against the 6/12 matrix result.** The primary defect is now understood to be
active-run release and terminal settlement, not run identity tagging alone. Approval reliability
is 0/5 — deterministic, therefore cheap to isolate.

Paste the block below into Gemini/Antigravity.

```text
You are the lead engineer on PrivaPilot's Chrome MV3 extension. Repository root: SIH_26209.

CURRENT STATE

- npm test: 207 passed, 0 failed. npm run lint: passing.
- Browser redaction: 18/18 sensitive regions covered, 18/18 safe controls preserved.
- docs/benchmark-results/E2E_EXTENSION_MATRIX.json: 6/12 scenarios passed.
- Protected approval reliability: 0/5.

Failing: delayed status, protected approved, protected denied, low-confidence rejection,
sanitizer blocked, gateway offline.

Do NOT trust docs/benchmark-results/runs/latest/SUMMARY_REPORT.md (claims 10/10). It was
generated from commit bd2de10 on a dirty tree against an older 10-scenario matrix. The
top-level E2E_EXTENSION_MATRIX.json is current. docs/GPT_PLAN/04_PROGRESS_TRACKER.md,
docs/EXECUTION_PLAN.md and docs/PHASES.md are likewise stale on status and metrics.

WORKING TREE WARNING

~45 modified tracked files, ~1,900 insertions / 746 deletions, including tracked dist/ output,
plus one untracked doc. Do NOT reset, stash, discard, or overwrite any of it. Inspect first:

  git status --short
  git diff --stat

Do not commit and do not create branches unless explicitly asked. Report the exact list of
files you touch — another agent works in this repository.

SCOPE OF THIS TASK — six work items, in order

  0. Prove or disprove the cascade hypothesis before fixing anything.
  1. Single terminal settlement invariant for the run lifecycle.
  2. Run identity and stale-event rejection.
  3. Protected approval, end to end.
  4. Protected denial settlement.
  5. Delayed-status semantic wait.
  6. Terminal postcondition contracts.

Out of scope in this task: scenario assertion rewrites, payload display projection, metrics
aggregation, pixel verifier, vision work. If you find a defect there, append it to
docs/GPT_PLAN/DEFERRED_FINDINGS.md and move on. Do not fix it here.

READ BEFORE EDITING (this list only — do not read the whole repo)

- docs/benchmark-results/E2E_EXTENSION_MATRIX.json
- apps/extension/src/background/coordinator.ts
- apps/extension/src/background/background-main.ts
- apps/extension/src/sidepanel/sidepanel.js
- apps/extension/src/content/verifier.ts
- packages/protocol/src/action.ts
- packages/protocol/src/payload.ts
- tests/coordinator.test.js
- tests/coordinator-multistep.test.js
- scripts/run-e2e-matrix.mjs
- git status --short and git diff

NON-NEGOTIABLE RULES

1. Fix root causes in the coordinator and event handling. No broad architectural rewrite.
2. Do not claim success from unit tests alone.
3. Do not count a previous run's status or result as the current run.
4. Do not send START_AGENT_RUN directly from the matrix. Use the real #chatInput and the real
   visible #sendBtn. Record what actually happened — never label a form submit as a click.
5. Do not weaken an assertion, a schema, or a fail-closed check to make a scenario pass.
6. No fixed sleeps as the primary synchronization strategy. Use runIds, state transitions,
   events, and bounded polling.
7. Never execute a protected action without a real visible approval interaction AND a fresh
   target revalidation.
8. Preserve the raw/sanitized type boundary. Never transmit raw screenshots, raw DOM text,
   selectors, XPath, secrets, or unredacted PII.
9. Evidence may contain the constrained decision object (schema-bound, PII-free) and a hash of
   raw model output. Raw prompts go only to a gitignored .debug/ directory, excluded from every
   evidence bundle.
10. Never hand-edit dist/. Rebuild it. dist/ is tracked here, so a rebuild dirties tracked
    files — that is expected, do not "clean" it.
11. Preserve failing artifacts. Do not delete a failing run directory.

DECISIONS ALREADY MADE — implement these, do not propose alternatives

- The denied terminal state is a dedicated `denied` state. Not `idle`, not `failed-safe`, not
  `awaiting-reasoning`. Add it to the protocol, coordinator, side panel, and tests.
- Before changing code for any settlement failure, write the intended state contract to
  docs/GPT_PLAN/CONTRACTS.md first. Then fix whichever side disagrees with it. The test
  expectation may be what is wrong. State explicitly which side you changed and why.

======================================================================
WORK ITEM 0 — PROVE OR DISPROVE THE CASCADE
======================================================================

Three of the six failures (low-confidence rejection, sanitizer blocked, gateway offline) are
suspected to be cascading consequences of a run that was never released, not independent
defects. The UI reporting "another agent run is already in progress" supports this.

Before writing any fix:

1. Run each of those three scenarios in COMPLETE ISOLATION, fresh browser profile, one
   scenario per process.
2. Record pass/fail for each in isolation.
3. Report whether the failure count is 6 independent defects or 3.

Do not proceed to Work Item 1 until this is answered in writing. It changes the size of the job.

======================================================================
WORK ITEM 1 — SINGLE TERMINAL SETTLEMENT INVARIANT
======================================================================

Diagnostic first. The approval and denial symptoms are opposite failures of one path:

- Approval ends `idle`   → the run was RELEASED instead of resumed.
- Denial hangs in `awaiting-reasoning` → the run was NEVER released.

Leading hypothesis: the coordinator parks the loop on a stored confirmation resolver (promise
resolver or callback), and the approve/deny handler does not reach it because it is stored
under one identity and looked up under another (actionId vs runId vs capture-scoped id), or the
key is regenerated when the modal re-renders.

Confirm or refute this cheaply BEFORE changing code:
- Log the resolver key at store time and at lookup time. Diff them.
- Report the actual keys observed. If they match, state that and give your next hypothesis.

Then implement the invariant:

Enumerate EVERY terminal exit path in docs/GPT_PLAN/CONTRACTS.md as a table:

  success | failure | sanitizer rejection | low-confidence rejection | confirmation approval |
  confirmation denial | timeout | cancellation | gateway failure | postcondition failure

For each, specify: the terminal state emitted, whether the active run is released, and what the
side panel renders.

Then guarantee, structurally:
- Every path releases the active run exactly once.
- Every path emits exactly one terminal event carrying the matching runId.
- No path can exit without doing both. Prefer a single settlement function that every exit
  routes through, rather than release logic duplicated per branch.

Tests required: approval cleanup; denial cleanup; timeout cleanup; failure cleanup; gateway
failure cleanup; sanitizer rejection cleanup; a sequential run started immediately after a
failed run; a sequential run started immediately after a denied run.

GATE: after a denied or failed run, the very next run starts cleanly with no "run already in
progress" error. Assert this explicitly.

======================================================================
WORK ITEM 2 — RUN IDENTITY AND STALE-EVENT REJECTION
======================================================================

- Generate a unique runId when the UI starts a task; include it in the UI-to-background request.
- Echo that runId in every state change, confirmation request, sanitization event, telemetry
  record, and final result.
- Expose active runId and last-completed runId as data-* attributes on a stable container
  element so the harness reads them without touching internals.
- The coordinator rejects a concurrent start rather than interleaving state.
- A late event carrying an older runId must be dropped, not applied. Add a test that fires a
  stale event after settlement and asserts the current run's state is unchanged.

Matrix runner changes:
- Before submission record: previous runId, previous completed-result identity, previous message
  count, current status.
- Fill the real #chatInput with genuine input and change events.
- Assert #sendBtn is visible, enabled, in send mode; click it via CDP mouse click after a
  hit-target check.
- Wait until ALL of: a different runId is exposed, status has left its previous terminal state,
  and a new user message plus a new agent loading message exist.
- Only then wait for a terminal state carrying that exact runId.
- Reject any result whose runId differs from the expected run.
- Reject completion if no state transition was observed for the current run.

GATE: no scenario completes in under 1 second by inheriting a previous result. Add an
adversarial harness test proving a previous run's terminal badge cannot satisfy a new wait.

======================================================================
WORK ITEM 3 — PROTECTED APPROVAL (currently 0/5)
======================================================================

- Start the protected task through the real input and send button.
- Wait for #actionConfirmModal carrying the current runId.
- Assert the modal is visible and shows the correct action kind, target, and rationale.
- Record: pending action ID, capture ID, page generation, target localId, target semantic
  fingerprint, confirmation creation time.
- Click the real visible #approveActionBtn.
- The UI must not report idle before the approval response resolves.
- Approval must RESUME the same run, not start or release one.
- Revalidate before executing, failing closed on any mismatch, in this order:
    active tab identity unchanged
    confirmation age below expiry
    page generation / fingerprint current
    target still exists
    target semantic identity still matches
    action not already executed
- Execute exactly once. Assert execution count is exactly 1.
- Verify the page actually mutated: #statusReq1044 equals "Approved" and the status message
  indicates approval.
- Emit `complete` only after the protected postcondition verifies, then release the run.

Tests: approve with no pending action; approve after expiry; approve after tab change; approve
after target replacement; duplicate approval click executes once.

GATE: 5 consecutive isolated runs pass. Approval mutates the page exactly once.

======================================================================
WORK ITEM 4 — PROTECTED DENIAL
======================================================================

Current bug: the action is correctly prevented, but the run remains in `awaiting-reasoning`.

- Start a fresh protected task with a distinct runId.
- Wait for its own confirmation modal.
- Click the real visible #denyActionBtn.
- Clear only that run's pending action.
- Emit the `denied` terminal state and RELEASE the run.
- Assert the page state remains exactly "Pending".
- Assert protected execution count is exactly 0.
- Assert no further model call and no automatic retry executes the denied action.
- Assert a late callback from the denied run cannot mutate a subsequent run.

GATE: 5 consecutive isolated runs pass. Denial leaves the page byte-identical, and the
following run starts cleanly.

======================================================================
WORK ITEM 5 — DELAYED-STATUS SEMANTIC WAIT
======================================================================

Current bug: the page stayed at "Syncing..." and the run ended `failed-safe`.

- Do not use an arbitrary short sleep and do not accept "Syncing..." as terminal.
- Use a bounded semantic wait for the exact final "Synchronized" state through the existing
  MutationObserver / postcondition verification path.
- Assert the known baseline initial state before acting.
- Require the exact final state AND the final success status message.
- Record the verification duration, proving the bounded wait actually waited.
- If the bound is genuinely too short for the fixture, raise the bound and say so. Do not
  loosen the assertion.

======================================================================
WORK ITEM 6 — TERMINAL POSTCONDITION CONTRACTS
======================================================================

Remove all broad or unconditional completion logic from
RunCoordinator.verifyTerminalPostcondition() and any local finish path.

- dialog_visible: expected dialog identity/title/landmark AND a verified hidden→visible
  transition within the current run. Remove any fallback to "any visible dialog".
- value_present: expected sanitized value fingerprint present in the target field — not the
  existence of a prior type action.
- select_changed: target identity, previous value, and current expected value.
- visibility_changed: measured before/after transition for the expected target.
- status_changed: expected status landmark AND expected new value/fingerprint.
- scroll_changed: baseline vs current scrollY plus direction match.
- Passive/observation goals need an explicit observation contract or explicit user acceptance.
  Never return unconditional success.

Adversarial tests: wrong dialog opens; unrelated action succeeds; expected field unchanged;
wrong select value; status changes to wrong text; visibility already satisfied before the
action; stale capture used for finish; model proposes finish after an unrelated success.

GATE: no terminal condition is satisfiable from action kind or action history alone.

======================================================================
REGRESSION GATE — after EACH work item, not only at the end
======================================================================

  npm run build && npm test && npm run lint && npm run benchmark:browser

- Unit tests must stay at 207+ passing with zero failures.
- The browser privacy benchmark must stay at 18/18 covered and 18/18 safe controls preserved.
- If privacy regresses, STOP and fix before continuing. You have changed coordinator or
  sanitization event plumbing.

======================================================================
RERUN PROTOCOL — isolated before full matrix
======================================================================

Do not run the full 12-scenario matrix to judge progress. Run in this order:

  1. delayed status                  x1
  2. protected approval              x5
  3. protected denial                x5
  4. low-confidence rejection        x1
  5. sanitizer blocked               x1
  6. gateway offline                 x1
  7. full 12-scenario matrix         only after 1-6 pass

======================================================================
BUDGET AND STOP RULE
======================================================================

Six focused attempts per work item at a failing gate. Then STOP and emit:

  BLOCKED: <work item>
  What I expected: ...
  What actually happens: ...
  Evidence (file paths, exact output): ...
  Narrowest hypothesis: ...
  What I need to proceed: ...

Do not grind. Do not weaken a gate to escape it.

FINAL REPORT

- Verdict: PASS / PARTIAL / BLOCKED.
- Work Item 0 answer: 6 independent defects or 3 plus cascade? With isolation evidence.
- The resolver-key diagnostic result (keys observed at store vs lookup).
- The terminal settlement contract table from CONTRACTS.md.
- Command table with exact exit codes and test counts.
- 5-run approval and 5-run denial reliability tables.
- Adversarial terminal-postcondition test table.
- Proof a previous run's result cannot satisfy a new scenario.
- Proof the next run starts cleanly after a denied and after a failed run.
- Exact list of files touched.
- Anything appended to DEFERRED_FINDINGS.md.
```

---
---

# PROMPT D — Rubric-facing instrumentation

Run after A. This is the highest-scoring work: it touches visual context (25%), client
resources (20%), and latency (15%).

```text
You are the lead engineer on PrivaPilot. Repository root: SIH_26209.

CONTEXT

Scoring rubric: visual context 25%, PII precision/recall 20%, redaction precision 20%, client
resource utilization 20%, end-to-end latency 15%. The privacy pipeline is mature. The three
metrics in this task currently have NO trustworthy measurement at all.

You are building measurement and evidence, not new agent capability. Do not refactor the
sanitizer, the coordinator, or the action executor.

SCOPE — four deliverables

  1. A frozen replay set and offline model benchmark.
  2. Local vision candidate logging with DOM agreement metrics.
  3. An optional coordinate cross-check field in the decision schema.
  4. Per-context resource and latency instrumentation.

DELIVERABLE 1 — REPLAY SET AND OFFLINE MODEL BENCHMARK

Build scripts/build-replay-set.mjs and scripts/run-model-benchmark.mjs.

- Capture 30-50 real tuples from live matrix runs:
    { runId, goal, sanitizedScreenshot, elementList, correctLocalId, expectedAction }
- correctLocalId is human-labelled once and then FROZEN. Store as a versioned JSON fixture
  under fixtures/replay/ with a content hash.
- The benchmark replays each tuple against a configured model endpoint and reports:
    schema-valid response rate
    target-selection accuracy (correct localId chosen)
    wrong-action rate
    premature-finish rate
    correct-abstention rate
    latency p50 / p95 per turn
    cost per completed task
- The benchmark must NOT touch the browser. It is a pure offline harness against the gateway.
- Support at least three model configs via env: current Qwen2.5-VL-72B, one smaller/faster
  Qwen VL, and one configurable third slot.

Rule: never hardcode a model response. Never report a metric with a 0 denominator as a
percentage — mark it N/A.

DELIVERABLE 2 — LOCAL VISION CANDIDATE LOGGING

The problem statement requires a LOCAL vision model to read the screen and inform decisions.
Currently local vision only serves redaction. Close the measurement gap first.

On every capture, emit alongside the DOM candidate list:
- local vision candidates: bounding box, coarse class (button / input / icon / menu / tab /
  dialog), confidence
- for each DOM candidate, the best-matching vision candidate and their IoU
- aggregate per capture: candidate count, matched count, mean IoU, unmatched-DOM count,
  unmatched-vision count (a vision-only candidate is a possible canvas/DOM-inaccessible control)

Write these to the run trace. Add scripts/report-vision-agreement.mjs producing a summary table
across a matrix run.

This does not yet drive decisions. It produces the first honest number for the 25% metric and
identifies whether any DOM-inaccessible control is being detected at all.

DELIVERABLE 3 — COORDINATE CROSS-CHECK FIELD

Add ONE optional field to the action decision schema: a predicted click point in normalized
screenshot coordinates.

- Never execute on the coordinate. Execution stays localId-based. This is non-negotiable.
- Use it only as a confidence signal:
    point falls inside the chosen localId's bounds  → raise confidence
    point falls outside                             → lower confidence, and abstain if the
                                                      result drops below threshold
- Record agreement rate across a full matrix run.

DELIVERABLE 4 — RESOURCE AND LATENCY INSTRUMENTATION

Report separately, never aggregated into one misleading number:
- service worker heap
- offscreen document heap
- page / harness heap
- model asset bytes on disk
- WASM memory if observable
- cold initialization time vs warm inference time
- execution provider actually used (WebGPU or WASM)
- screenshot resolution and encoded payload bytes

The current ~4 MB figure refers to page JS heap scope only. Label every number with its scope
explicitly. An unlabelled memory number is a defect.

For latency, emit per turn: local perception time, sanitization time, network time, server
reasoning time, execution time, verification time, total. Compute p50 and p95 across runs.
Report cold and warm runs separately — never blended.

Add a comparison table across configurations:
  DOM-only | local vision only | DOM + vision | full-frame | adaptive
with columns: accuracy, p50, p95, memory, model size.

REGRESSION GATE — after each deliverable

  npm run build && npm test && npm run lint && npm run benchmark:browser

Privacy benchmark must remain 18/18 and 18/18.

RULES

- Do not fabricate any latency, memory, routing, or accuracy number.
- Do not change the honest claim about visual grounding. It remains DOM-assisted until
  Deliverable 2 produces evidence that vision candidates influence target selection.
- Any test hook you add must be gated behind a build flag, and you must add an assertion that
  the flag is OFF in the shipped bundle.
- Report the exact list of files you touched.

BUDGET AND STOP RULE

Six focused attempts per deliverable, then emit the BLOCKED template with expected vs actual,
evidence paths, narrowest hypothesis, and what you need.

FINAL REPORT

- Replay set size, label provenance, content hash.
- Model comparison table with denominators shown inline.
- Vision/DOM agreement table, including any vision-only candidates found.
- Coordinate cross-check agreement rate.
- Scoped resource table and cold/warm latency percentiles.
- Honest statement of what the local vision model currently does and does not do.
```

---
---

# PROMPT B — Scenario validity and canonical payload

Run after A. Trimmed from the original Phases 3 and 6: the accessibility sweep and the three
UI tab inspections are cut as unscored.

```text
You are the lead engineer on PrivaPilot. Repository root: SIH_26209.

PRECONDITION: run lifecycle settlement, run identity, protected approve/deny, delayed-status
verification, and terminal postcondition contracts are already fixed and gated by Prompt A.
Build on them; do not re-open them. The matrix has 12 scenarios, not 10.

SCOPE — make each matrix scenario substantively valid, and make the transmitted payload
canonical.

NAME the scenarios. Do not number them. The original numbering already collided.

SCENARIO CONTRACTS

DRAWER_OPEN
- Assert drawer hidden before the task.
- Assert a click executed and the REQUESTED drawer is visible — not merely any dialog.
- Terminal proof must bind to that target.

INPUT_INTERACTIONS (merge the former type / select / scroll scenarios into one scenario;
they are already unit-tested and three separate matrix entries waste runtime)
- type: input initially empty, multiple rows visible; assert the exact non-sensitive query was
  typed; assert the expected row is visible and an unrelated row is hidden; assert the recorded
  action was `type`.
- select: initial option differs from target; assert the exact requested option; assert a real
  change event fired and dependent filtered state changed.
- scroll: record baseline scrollY; assert the final position increased by a defined minimum and
  the direction matches the request. A nonzero final position is not sufficient.

DELAYED_STATUS
- Assert the known baseline initial state.
- Drive Refresh Sync through the agent.
- Transitional "Syncing..." MUST NOT satisfy the assertion.
- Require the exact final "Synchronized" state and the final success status message.
- Record verification duration proving bounded delayed verification actually waited.

STALE_TARGET_RECOVERY
- Do NOT mutate the row before perception.
- Add a build-flag-gated deterministic hook that replaces the target AFTER capture and
  grounding but BEFORE execution. Assert the flag is OFF in the shipped bundle.
- Assert the first execution reports staleTarget: true.
- Assert the coordinator re-captures, gets a new capture ID / page generation, semantically
  re-grounds the equivalent target, and retries within the configured bound.
- Assert the second execution succeeds and the requested drawer opens.
- The trace must explicitly show: stale failure, retry count, new capture ID, recovery success.

AMBIGUOUS_REPEATED_LABELS
- Record both repeated controls as unclicked.
- Submit the ambiguous task.
- Require a clarification or confirmation state.
- Assert neither control was clicked.
- A confirmation shown does NOT count as autonomous completion.

PROTECTED_APPROVED / PROTECTED_DENIED
- Already implemented. Assert only; do not modify.

SAFETY_STOP  (this replaces unsupported-goal-only testing)
Implement ONE of these deterministically, and state which you chose:
- Option A: reasoning test mode returns a schema-valid proposal with confidence below
  threshold. Assert zero execution and a structured LOW_CONFIDENCE_REJECTED result.
- Option B: execute a safe action against a page where the expected semantic postcondition
  intentionally does not occur. Assert the verifier fails, no `complete` state is emitted, and
  bounded recovery or stop is recorded.
The mock or injection must be unreachable on the default demo path. Add an assertion proving it.

UNSUPPORTED_GOAL_ABSTENTION
- Keep as its own scenario. It is NOT a substitute for SAFETY_STOP.

SANITIZER_BLOCK
- A sanitizer failure surfaces in the real side-panel error UI.
- Assert exactly zero HTTP requests occurred.

GATEWAY_UNAVAILABLE
- Surfaces as an actionable UI error. Assert no false success state is ever emitted.

CANONICAL PAYLOAD

- Remove all side-panel fallback payload reconstruction.
- The side panel consumes a safe display projection derived directly from the exact canonical
  network payload the background generated. One pipeline:
      SanitizedContext → toSanitizedNetworkPayload() → HTTP body → safe display projection
- No fallback to currentGoalText, generated IDs, assumed viewport, or a replacement digest.
- Distinguish the payload-structure digest from the screenshot digest. Label each correctly.
- Compute screenshot bytes from decoded base64 length, or transmit the exact measured byte
  count as safe metadata.

Add an intercepted-HTTP integration test proving, on the real transmitted request:
- no raw screenshot present
- sanitized screenshot present
- redaction manifest present
- no raw PII canaries
- no cookies or authorization values
- the UI projection matches the transmitted payload, allowing only an explicitly documented
  screenshot omission or replacement
- the server rejects a screenshot lacking passed pixel-verification metadata

This intercepted-request test is the real proof. Do NOT spend time asserting the Privacy
Inspector / Wire Payload / Telemetry tab contents in-browser — defer that to demo prep.

MINIMAL UI CHECK (this is all that is in scope for UI)
At a realistic narrow side-panel width (400px): the confirmation modal is fully visible, and
the approve and deny buttons are not clipped and are clickable. Nothing else.

REGRESSION GATE — after each scenario group

  npm run build && npm test && npm run lint && npm run benchmark:browser

Privacy benchmark stays 18/18 and 18/18.

RULES
- Do not weaken an assertion to make a scenario pass.
- Expected safe failures are safety outcomes, not completed tasks.
- Report the exact list of files you touched.

BUDGET: six attempts per scenario group, then the BLOCKED template.

FINAL REPORT
- Scenario table: name, classification, runId, actual UI interactions, initial state, executed
  actions, page assertion, terminal state, latency, network request count.
- Which SAFETY_STOP option you implemented and the proof it is unreachable in the demo path.
- Intercepted-payload equivalence result.
- Stale-recovery trace excerpt.
- Files touched.
```

---
---

# PROMPT C — Pixel strictness, honest metrics, evidence

Run last.

```text
You are the lead engineer on PrivaPilot. Repository root: SIH_26209.

SCOPE — pixel verifier strictness, metric honesty, evidence provenance. Do not change agent
behaviour, scenario assertions, or the payload pipeline in this task.

PIXEL VERIFICATION

Preserve the current 18/18 result while closing the remaining strictness gaps:
- Validate that the pixel buffer length exactly equals width * height * 4. A wrong-sized
  nonzero buffer must fail.
- Catch getContext() and getImageData() exceptions and return a STRUCTURED failed verification
  result, never an unhandled throw and never a silent pass.
- PostRedactionVerifier must FAIL when sensitive regions exist but no sanitized canvas or pixel
  evidence is supplied.
- Benchmark and production must call the SAME top-level verifier with IDENTICAL thresholds.
  If they currently diverge, that divergence is itself a finding — report it.
- Keep and strengthen the no-network-after-failure integration test: a pixel-verification
  failure must always mean exactly zero HTTP calls.

GATE: every negative case fails closed. Browser benchmark remains 18/18 covered and 18/18 safe
controls preserved.

HONEST METRICS

Rewrite matrix aggregation and scripts/run-production-validation.mjs.

Classify every scenario as exactly one of:
  expected autonomous success | expected user-assisted success | expected safe abstention |
  expected protected denial | expected verification failure

Measure these SEPARATELY, each reported with its denominator inline:
- autonomous task completion = completed autonomous tasks / autonomous tasks attempted
- assisted task completion = completed approved protected tasks / approved protected attempted
- expected safe-failure success = correctly stopped safety scenarios / safety scenarios attempted
- incorrect action rate = wrong actions actually executed / all executed actions
- unsafe action rate = protected actions executed without valid approval / protected proposed
- abstention rate, intervention rate
- stale recovery success
- verification-failure detection
- UI workflow success
- network request count per scenario
- local / server / total latency from ACTUAL traces

Hard prohibitions:
- Never derive incorrect action rate as (1 - scenario pass rate).
- Never count an abstention or a denial as autonomous task completion.
- Never hardcode a latency or routing count.
- Never express a 0/0 privacy result as a percentage. Mark it N/A.
- Never mark a metric passed unconditionally.

EVIDENCE PROVENANCE

- Compute a deterministic source fingerprint over tracked, modified, and untracked relevant
  source files. Exclude generated output, dependencies, secrets, and result directories.
  IMPORTANT: dist/ is tracked in this repo but is generated. It MUST be excluded from the
  source fingerprint, or every rebuild will read as a source change and the freeze gate will
  never pass. Hash dist/ separately as a build artifact.
- Record a dirty-state patch hash.
- Record: built extension hashes, model checksum, fixture hash, matrix hash, browser version
  and flags, viewport and DPR, OS / CPU / RAM, commands, exit codes, timeouts, repetitions,
  failures, network dependencies.
- Fingerprint mismatch handling: during development, WARN and record the mismatch. Hard-refuse
  only in validate:production freeze mode. Do not block ordinary iteration.
- Refuse to overwrite a timestamped run directory.
- `latest` is a convenience pointer or copy. Never describe it as immutable.
- Do not mark a final freeze as passed while the source snapshot cannot be reproduced.

FINAL VALIDATION ORDER

  npm run build
  npm test
  npm run lint
  npm run verify:redaction
  npm run benchmark:browser
  npm run test:e2e
  npm run test:e2e:matrix
  npm run validate:production

Then rerun: protected approval x5, protected denial x5, primary drawer scenario 3 warm and
1 cold, stale-target scenario x3. Emit p50 and p95 across those runs — a rerun count without
percentiles is not a latency measurement.

RULES
- Do not fabricate any metric.
- Firefox remains clearly and explicitly unverified.
- Visual grounding claim: use whatever the Prompt D vision-agreement numbers actually support.
  If vision candidates do not yet influence target selection, the claim stays "DOM-assisted".
- Report the exact list of files you touched.

BUDGET: six attempts per section, then the BLOCKED template.

FINAL REPORT
- Verdict: PASS / PARTIAL / BLOCKED.
- Command table with exact exit codes and test counts.
- Pixel-verifier negative-test table.
- Every action-safety metric with its formula and denominator shown.
- Privacy metrics.
- Source / build / evidence hashes.
- Remaining limitations and the honest final claim.
```

---

## Honest final claim to use in submission material

> PrivaPilot is a privacy-preserving browser agent that detects and redacts sensitive visual
> content locally, verifies the sanitized output before transmission, sends only anonymized
> screen context and sanitized UI structure to a centralized open-weight VLM, and locally
> validates, executes, and verifies bounded browser actions.

Until Prompt D produces evidence that local vision candidates influence target selection, keep
the qualifier attached:

> Current browser-action grounding is DOM-assisted. Local visual models contribute to privacy
> perception and geometric region proposals.

Do not put unsourced quality percentages (e.g. "40–50% visual context") into anything a judge
reads. They will be treated as measurements.
