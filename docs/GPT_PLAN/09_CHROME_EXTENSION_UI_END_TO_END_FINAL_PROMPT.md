# Chrome Extension UI End-to-End Finalization Prompt

Copy the complete code block below into Gemini/Antigravity. This prompt focuses only on making the real Chrome MV3 extension, custom side-panel UI, privacy pipeline, browser actions, confirmation workflow, verification, and evidence work together reliably.

```text
You are the lead engineer responsible for finishing PrivaPilot’s actual Chrome MV3 extension end to end. Work directly in the existing repository until the real user-facing extension workflow is reliable and honestly validated.

Repository root: SIH_26209

PRIMARY OBJECTIVE

Make this exact real-browser flow work through the visible extension UI:

User opens PrivaPilot side panel
→ enters a browser task in the real input
→ clicks the real send button
→ UI visibly enters a new-run state
→ extension captures the active tab
→ local detectors inspect PII/faces/high-risk surfaces
→ screenshot is redacted locally
→ final pixels are verified fail-closed
→ only canonical sanitized payload is shown and transmitted
→ local router or configured VLM proposes an action
→ action schema, target, confidence, ambiguity, risk, and freshness are checked locally
→ protected actions show the real confirmation modal
→ approved actions execute only after a fresh target check
→ denied actions never execute
→ resulting page state is semantically verified
→ safe stale targets can be re-observed and retried within limits
→ false completion is rejected
→ final result, trace, privacy evidence, and telemetry appear in the real side-panel UI
→ reproducible browser evidence is stored.

Do not optimize for a report saying “10/10.” Optimize for tests that genuinely prove each behavior.

READ BEFORE EDITING

- docs/00_PROBLEM_STATEMENT.md
- docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md
- docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
- docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md
- docs/GPT_PLAN/04_PROGRESS_TRACKER.md
- docs/GPT_PLAN/06_PRODUCTION_COMPLETION_AND_REAL_WORLD_PROMPT.md
- docs/GPT_PLAN/08_VERIFIED_PRODUCTION_GAPS_AND_REMEDIATION_PROMPT.md
- package.json
- current git status and diff
- scripts/run-e2e-extension.mjs
- scripts/run-e2e-matrix.mjs
- scripts/run-production-validation.mjs
- apps/extension/src/sidepanel/sidepanel.html
- apps/extension/src/sidepanel/sidepanel.js
- apps/extension/src/background/background-main.ts
- apps/extension/src/background/coordinator.ts
- apps/extension/src/browser/browser-adapter.ts
- apps/extension/src/content/content-main.ts
- apps/extension/src/content/action-executor.ts
- apps/extension/src/content/verifier.ts
- apps/extension/src/sanitizer/pipeline.ts
- apps/extension/src/sanitizer/pixel-verifier.ts
- packages/protocol/src/action.ts
- packages/protocol/src/payload.ts
- apps/demo-portal/src/index.html
- apps/demo-portal/src/app.js
- latest E2E and benchmark artifacts

INDEPENDENTLY REPRODUCED BASELINE

A fresh independent run produced:

- `npm run build`: PASS
- `npm test`: PASS, 204/204
- `npm run lint`: PASS
- Chrome privacy fixtures: 18/18 sensitive regions covered and 18/18 safe controls preserved
- `npm run test:e2e:matrix`: FAIL, 8/10, exit code 1

The two observed matrix failures were:

1. `SCENARIO_08_PROTECTED_ACTION_APPROVED`
   - Expected terminal state: `complete`
   - Actual state: `idle`
   - Protected page state did not change to approved.

2. `SCENARIO_09_PROTECTED_ACTION_DENIED`
   - Expected terminal state: `idle`
   - Actual state: `failed-safe`

The runner also has a serious stale-result race:

- After submitting a new task, `waitForSidepanelSettled()` can immediately accept the previous scenario’s terminal badge/result.
- Several scenarios complete in approximately 404 ms, showing that some passes may be previous-result reuse rather than new runs.
- The runner must wait for a new run identity or a definite transition out of the previous settled state before accepting completion.

Additional known weaknesses:

- `driveSidepanelTask()` dispatches a form submit event but records `click_send_btn`; it must use the actual visible button.
- Scenario 5 accepts both `Synchronized` and transitional `Syncing...`; it must require the final delayed state.
- Scenario 6 mutates the row before perception; it does not create a stale target between observation and execution.
- Scenario 10 tests unsupported-goal rejection, not the required low-confidence or semantic-verification failure case.
- Scenario 9 only checks “not approved”; it must prove exact unchanged pending state and zero protected executions.
- Matrix privacy booleans are constants rather than observations.
- Matrix traces omit important execution, freshness, network, and verification details.
- Production aggregation treats expected safe abstentions as successful task completions and derives incorrect-action rate from scenario failures.
- Visual UI grounding remains DOM-assisted. Preserve the honest claim unless real screenshot-derived semantic grounding is implemented.
- Firefox is unverified and is not part of this Chrome completion task.

NON-NEGOTIABLE RULES

1. Do not claim success based only on unit tests.
2. Do not count a previous run’s status or result as the current run.
3. Do not directly send `START_AGENT_RUN` from the E2E matrix. Use the actual UI input and send button.
4. Do not label a form `submit` dispatch as a button click.
5. Do not weaken page assertions to make scenarios pass.
6. Do not add fixed sleeps as the primary synchronization strategy. Use run IDs, state transitions, events, and bounded polling.
7. Do not hardcode successful model responses in the test harness.
8. Do not bypass the sanitizer, HTTP client, coordinator, executor, verifier, or confirmation UI.
9. Do not execute protected actions without a real visible user approval interaction and a fresh target check.
10. Do not transmit or persist raw screenshots, PII, cookies, credentials, authorization headers, or complete model prompts/output in evidence.
11. Do not fabricate network, latency, privacy, or action metrics.
12. Never manually edit `dist/`; rebuild it.
13. Preserve failures in artifacts.
14. Do not commit or create branches unless explicitly requested.
15. Continue autonomously until all mandatory Chrome gates pass or a genuine external blocker is isolated and documented.

======================================================================
PHASE 1 — REPAIR THE MATRIX SYNCHRONIZATION CONTRACT
======================================================================

The matrix cannot be trusted until each scenario is tied to a unique run.

Implement a robust run identity visible to both the coordinator and UI:

- Generate a unique `runId` when the UI starts a task.
- Include the run ID in the UI-to-background request.
- Return and broadcast that same run ID in state changes, confirmation requests, sanitization events, telemetry, and final results.
- Store the active and last-completed run IDs in safe UI state, preferably `data-*` attributes or a dedicated bounded status object.
- Ensure the coordinator rejects accidental concurrent starts rather than mixing state.

Fix matrix synchronization:

1. Before submission, record:
   - previous run ID,
   - previous completed-result identity,
   - previous message count,
   - current status.
2. Fill the real `#chatInput`.
3. Dispatch genuine input/change events.
4. Verify `#sendBtn` is visible, enabled, and in send mode.
5. Click the actual `#sendBtn` using a real CDP mouse click or element `.click()` only after visibility and hit-target checks.
6. Wait until:
   - the UI exposes a different run ID,
   - status leaves its previous terminal state,
   - a new user message and new agent loading message exist.
7. Only then wait for a terminal state associated with that exact run ID.
8. Reject a result whose run ID differs from the expected current run.
9. Reject completion if no state transition for the current run was observed.
10. Record actual interactions accurately; never say `click_send_btn` when dispatching a form event.

Add explicit test/harness assertions for:

- side panel readiness returning true,
- run button visibility and enabled state,
- unique run ID created,
- old result cannot satisfy new scenario,
- new run enters capturing/reasoning/executing/confirmation as appropriate,
- final result belongs to the same run.

Gate:

- No scenario may complete in a few milliseconds by inheriting the previous result.
- Warm repetitions must each have distinct run IDs and complete traces.

======================================================================
PHASE 2 — FIX PROTECTED APPROVE AND DENY END TO END
======================================================================

Reproduce both failures independently before changing code.

For approval:

- Start the protected task through the real task input and send button.
- Wait for the real `#actionConfirmModal` associated with the current run.
- Assert the modal is visible and contains the correct action kind, target, and rationale.
- Record the pending action ID, capture ID/page generation, target local ID, semantic target identity, and confirmation creation time.
- Click the actual visible `#approveActionBtn`.
- Ensure the UI does not report idle before the approval response completes.
- In `approvePendingAction()` revalidate:
  - active tab identity,
  - confirmation age below expiry,
  - current page generation/fingerprint,
  - target still exists,
  - target semantic identity still matches,
  - action has not already executed.
- Execute exactly once.
- Verify exact page state: `#statusReq1044` equals `Approved`, status message indicates approval, and execution count is one.
- Continue the loop only when appropriate and finish only after the protected postcondition is verified.
- Return and render a final result tied to the same run ID.

For denial:

- Start a fresh protected task with a distinct run ID.
- Wait for its own confirmation modal.
- Click the real visible `#denyActionBtn`.
- Clear only that run’s pending action.
- Return a deterministic denied terminal state. Choose one consistent state (`idle` or a dedicated `cancelled/denied`) and use it across protocol, coordinator, UI, and tests.
- Assert exact page state remains `Pending`.
- Assert protected execution count remains zero.
- Assert no further model call or automatic retry executes the denied action.
- Ensure stale callbacks from the previous approved/denied run cannot alter the current UI.

Add focused unit/integration tests for:

- approve with no pending action,
- approval after expiry,
- approval after tab change,
- approval after target replacement,
- duplicate approval click,
- denial clears pending action,
- denial performs zero protected executions,
- late callback after denial cannot change the result.

Gate:

- Scenarios 8 and 9 each pass five consecutive isolated runs.
- Approval modifies the page exactly once.
- Denial leaves the page exactly unchanged.

======================================================================
PHASE 3 — MAKE ALL TEN SCENARIOS SUBSTANTIVELY VALID
======================================================================

Keep these ten scenario categories, but correct their setup and assertions.

Scenario 1 — Dialog/drawer

- Assert drawer hidden before task.
- Submit through UI.
- Assert click executed.
- Assert the requested drawer—not merely any dialog—is visible.
- Assert terminal proof is bound to that target.

Scenario 2 — Search/filter

- Assert input initially empty and multiple rows visible.
- Assert exact non-sensitive query typed.
- Assert expected row visible and unrelated row hidden.
- Assert recorded action was `type`, not merely terminal success.

Scenario 3 — Select

- Assert initial option differs from target.
- Assert exact requested option selected.
- Assert a real change/input event occurred and relevant filtered state changed.

Scenario 4 — Scroll

- Record baseline `scrollY` before action.
- Assert final scroll position increased by a defined minimum and direction matches request.
- Do not merely check that final scroll position is nonzero.

Scenario 5 — Delayed status

- Assert initial state is `Completed` or the known baseline.
- Click `Refresh Sync` through the agent.
- Observe transitional `Syncing...` if available.
- Wait for and require exact final `Synchronized` state and final success status message.
- Record verification duration showing bounded delayed verification actually waited.
- `Syncing...` must not pass.

Scenario 6 — Genuine stale-target recovery

- Do not mutate before perception.
- Add a deterministic test hook that replaces the target after capture/grounding but before execution.
- Confirm first execution reports `staleTarget: true`.
- Confirm coordinator re-captures, receives a new capture/page generation, semantically re-grounds the equivalent target, and retries no more than the configured bound.
- Assert second execution succeeds and requested drawer opens.
- Trace must explicitly show stale failure, retry count, new capture ID, and successful recovery.

Scenario 7 — Ambiguous repeated labels

- Record both repeated controls as unclicked before task.
- Submit ambiguous task.
- Require clarification or confirmation state.
- Assert neither control was clicked.
- If confirmation is shown, do not count it as autonomous completion.

Scenario 8 — Protected approval

- Implement Phase 2 requirements.

Scenario 9 — Protected denial

- Implement Phase 2 requirements.

Scenario 10 — Low confidence or verification failure

Replace unsupported-goal-only testing with a deterministic real safety injection:

Option A:
- Reasoning test mode returns a valid action proposal with confidence below threshold.
- Assert zero execution and structured `LOW_CONFIDENCE_REJECTED` result.

Option B:
- Execute a safe action against a page where the expected semantic postcondition intentionally does not occur.
- Assert verifier fails, no `complete` state is emitted, and bounded recovery/stop is recorded.

Keep unsupported-goal abstention as an additional scenario 11 if useful, but do not use it as a substitute for Scenario 10.

Add two additional UI-focused scenarios:

11. Sanitizer block appears in the actual side-panel error UI; zero HTTP requests occur.
12. Reasoning gateway unavailable appears as an actionable UI error without false success.

Gate:

- All required scenarios pass on their exact assertions.
- Expected safe failures count as safety outcomes, not completed tasks.
- Every scenario contains initial state, interaction, action, execution, verification, and terminal evidence appropriate to that scenario.

======================================================================
PHASE 4 — HARDEN TERMINAL POSTCONDITIONS
======================================================================

Remove broad or unconditional completion logic from `RunCoordinator.verifyTerminalPostcondition()` and related local finish paths.

Required behavior:

- `dialog_visible`: require the expected dialog identity/title/landmark and a verified transition from hidden/absent to visible for the current run.
- `value_present`: require the expected sanitized value fingerprint or approved exact non-sensitive value in the target field, not merely a previous type/click action.
- `select_changed`: require target identity, previous value, and current expected value.
- `visibility_changed`: require a measured before/after visibility transition for the expected target.
- `status_changed`: require the expected status landmark and expected new safe value/fingerprint, not any previous action.
- `scroll_changed`: compare baseline and current scroll values and direction.
- Passive/observation tasks must have a specific observation contract or explicit user acceptance; do not return unconditional success.
- Remove fallback from expected dialog to any visible dialog.

Add adversarial tests:

- wrong dialog opens,
- unrelated action succeeds,
- expected field unchanged,
- wrong select value chosen,
- status changes to wrong text,
- visibility was already satisfied before action,
- stale capture used for finish,
- model proposes finish after an unrelated successful action.

Gate:

- No terminal condition is inferred solely from action kind or existence of action history.

======================================================================
PHASE 5 — COMPLETE STRICT PIXEL VERIFICATION
======================================================================

Preserve current 18/18 result while fixing remaining strictness:

- Validate pixel buffer length exactly equals `width * height * 4`.
- Catch `getContext()` and `getImageData()` exceptions and return a structured failed verification result.
- `PostRedactionVerifier` must fail when regions exist but no sanitized canvas/pixel evidence is supplied.
- Make benchmark and production call the same top-level verifier with identical thresholds.
- Add wrong-sized nonzero pixel-buffer test.
- Keep no-network-after-failure integration test.

Gate:

- All negative cases fail closed.
- Browser benchmark remains 18/18 with safe controls preserved.

======================================================================
PHASE 6 — EXACT PAYLOAD AND UI INSPECTOR
======================================================================

- Remove side-panel fallback payload reconstruction.
- Side panel must consume a safe display projection derived directly from the exact canonical network payload generated by the background.
- Do not fall back to `currentGoalText`, generated IDs, assumed viewport, or replacement digest.
- Distinguish payload-structure digest from screenshot digest. Label each correctly.
- Calculate screenshot bytes correctly from decoded base64 length or transmit the exact measured byte count as safe metadata.
- Add an intercepted HTTP test comparing transmitted keys/values with the UI projection, allowing only explicitly documented screenshot omission/replacement.

Add real Chrome UI checks that open and inspect:

- Privacy Inspector tab,
- Wire Payload tab,
- Telemetry tab.

Assert:

- no raw PII appears,
- provider is truthful,
- mask count matches run trace,
- payload digest matches its documented scope,
- screenshot content is not rendered as raw JSON,
- byte count is accurate,
- no fabricated fields appear.

======================================================================
PHASE 7 — HONEST METRICS AND REPRODUCIBLE EVIDENCE
======================================================================

Rewrite matrix aggregation and `run-production-validation.mjs` metrics:

Classify each scenario as one of:

- expected autonomous success,
- expected user-assisted success,
- expected safe abstention,
- expected protected denial,
- expected verification failure.

Measure separately:

- autonomous task completion = completed autonomous success tasks / autonomous success tasks attempted,
- assisted task completion = completed approved protected tasks / approved protected tasks attempted,
- expected safe-failure success = correctly stopped safety scenarios / safety scenarios attempted,
- incorrect action rate = wrong actions actually executed / all executed actions,
- unsafe action rate = unsafe/protected actions executed without valid approval / all protected actions proposed,
- abstention rate,
- intervention rate,
- stale recovery success,
- verification-failure detection,
- UI workflow success,
- network request count per scenario,
- local/server/total latency from actual traces.

Never derive incorrect action rate as `1 - scenario pass rate`.
Never count abstention or denial as autonomous task completion.
Never hardcode latency or routing counts.
Never treat 0/0 privacy regions as a pass percentage; mark N/A.
Never mark every metric passed unconditionally.

Evidence provenance:

- Compute a deterministic source fingerprint including tracked, modified, and untracked relevant source files.
- Exclude generated outputs, dependencies, secrets, and benchmark result directories from the source hash.
- Record dirty-state patch hash.
- Record built extension hashes, model checksum, fixture hash, matrix hash, browser version/flags, viewport/DPR, OS/CPU/RAM, commands, exit codes, timeouts, repetitions, failures, and network dependencies.
- Refuse to import a matrix whose source fingerprint differs from current source.
- Refuse overwrite of timestamped run directories.
- Call `latest` a convenience pointer/copy, never immutable.
- Do not mark final freeze passed while the tree/source snapshot cannot be reproduced.

======================================================================
PHASE 8 — CUSTOM UI PRODUCTION CHECK
======================================================================

Ensure the custom side-panel UI is usable, not only technically present.

Test in real Chrome at realistic side-panel dimensions:

- initial loading/connection state,
- task input and send button,
- loading and state transitions,
- normal successful result,
- protected confirmation modal,
- denial result,
- ambiguity result,
- low-confidence/verification-failure result,
- sanitizer-block result,
- gateway-offline result,
- privacy inspector,
- wire payload view,
- telemetry view,
- long content scrolling,
- keyboard focus order,
- Enter-to-submit and button click,
- accessible labels for buttons, tabs, status, and modal,
- no clipped controls or hidden confirmation actions.

Use DOM assertions and screenshots saved only if they contain no sensitive data. Add a concise UI E2E artifact with dimensions and assertions. Do not redesign the whole UI unless a usability failure requires it.

======================================================================
PHASE 9 — FINAL VALIDATION
======================================================================

Run in this order:

npm run build
npm test
npm run lint
npm run verify:redaction
npm run benchmark:browser
npm run test:e2e
npm run test:e2e:matrix
npm run validate:production

Then rerun:

- protected approval scenario five times,
- protected denial scenario five times,
- primary preview scenario three warm times and one cold time,
- stale-target scenario three times.

The final result is PASS only if:

1. Every command exits zero.
2. Current unit count passes with zero failures.
3. Pixel verification is strictly fail-closed.
4. 18/18 current privacy fixtures remain covered.
5. Actual send button is clicked and each scenario has a unique run ID.
6. No scenario can reuse a previous terminal state/result.
7. All required scenario assertions are substantive.
8. Protected approval works exactly once and denial executes zero times.
9. Genuine stale-target recovery is visible in the trace.
10. Delayed verification waits for the final state.
11. Low-confidence or verification failure produces a real safe stop.
12. UI error, confirmation, inspector, payload, and telemetry states are browser-tested.
13. Task metrics are derived from actual actions and outcomes.
14. Evidence identifies the exact tested source and build.
15. Firefox remains clearly unverified unless separately tested.
16. Visual grounding remains honestly labelled DOM-assisted unless real screenshot-derived semantic execution is demonstrated.

FINAL REPORT FORMAT

- Overall verdict: PASS, PARTIAL, or BLOCKED.
- Command table with exact exit codes and test counts.
- Scenario table including classification, unique run ID, actual UI interactions, initial state, executed actions, page assertion, terminal state, latency, and network count.
- Five-run approval and denial reliability results.
- Stale-recovery traces.
- Pixel-verifier negative-test table.
- Exact payload equivalence result.
- UI state/viewport/accessibility checks.
- Privacy metrics.
- Action safety metrics with formulas and denominators.
- Source/build/evidence hashes.
- Remaining limitations and honest final claim.

Do not merely produce a walkthrough. Inspect the generated traces and fail the run when evidence contradicts a claim.
```
