# Verified Production Gaps and Remediation Prompt

This prompt follows an independent source-and-runtime audit after the claimed Stages A–H completion. Copy the complete code block into Gemini/Antigravity.

```text
You previously reported that PrivaPilot completed Stages A–H. An independent audit reran the code and found that build/tests/lint and the 18/18 Chrome redaction fixture result are real, but several production-completion claims are unsupported. Fix the implementation and evidence. Do not write another completion report until the actual gates below pass.

Repository root: SIH_26209

FIRST READ

- docs/00_PROBLEM_STATEMENT.md
- docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
- docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md
- docs/GPT_PLAN/04_PROGRESS_TRACKER.md
- docs/GPT_PLAN/06_PRODUCTION_COMPLETION_AND_REAL_WORLD_PROMPT.md
- docs/GPT_PLAN/07_ONE_WEEK_JUDGE_READY_EXECUTION_PROMPT.md
- current git diff
- current source and tests named below

INDEPENDENTLY VERIFIED GOOD RESULTS

- `npm run build` passes.
- `npm test` passes 198/198.
- `npm run lint` passes.
- `npm run verify:redaction` passes its current two-fixture check.
- `npm run benchmark:browser` reports 18/18 assessable sensitive regions covered and 18/18 safe controls preserved on 14 local fixtures.
- `npm run test:e2e` executes one real Chrome MV3 task and currently succeeds in approximately 5.5 seconds.
- The latest E2E artifact contains a useful two-step click/verification/final-finish trace.

Do not regress these results.

AUDIT FINDINGS THAT INVALIDATE THE CURRENT “ALL STAGES PASSED” CLAIM

1. `npm run validate:production` does not execute browser-agent tasks. It loads 14 synthetic fixtures, extracts/sanitizes them, and defines success from redaction coverage. Therefore its “dev task success,” “held-out task success,” “incorrect-action rate,” “unsafe-action rate,” and “generalization gap” labels are invalid.
2. Three held-out fixtures have zero assessable sensitive regions and currently pass trivially.
3. Only one real Chrome agent scenario exists in `scripts/run-e2e-extension.mjs`. The required ten real Chrome success/safety scenarios were not run.
4. The E2E opens `sidepanel.html` but bypasses its controls by directly sending `START_AGENT_RUN`. The user-facing task input, run button, status rendering, confirmation controls, and error display are not browser-tested.
5. `VisualCandidateGenerator` is not wired into the real capture/coordinator/action path. The current production comparison constructs visual proposals by hand. Candidate counts are not grounding accuracy, and edge rectangles are not semantic actionable grounding.
6. No real DOM-inaccessible/canvas target was visually selected and safely executed.
7. `pixel-verifier.ts` has fail-open paths: missing/unreadable 2D context can return success, and an all-zero pixel buffer can be considered covered. Test-only accommodations must not exist in production behavior.
8. Browser harness verification still has separate logic instead of using the complete production verifier as the single source of truth.
9. The side panel reconstructs a payload instead of using the exact canonical network projection and can synthesize fallback identity fields.
10. Final finish validation still depends partly on broad goal keyword checks, any prior successful action, or generic dialog visibility rather than a task-specific structured terminal contract.
11. Evidence is generated from a dirty working tree under historical HEAD `bd2de10`. `latest` is replaceable, files are writable/untracked, and there is no source-tree/artifact hash. Do not call this immutable evidence.
12. Firefox has no verified implementation or run. Keep it PLANNED/EXPERIMENTAL.
13. Phase 8 adaptive perception/resource governance is not established merely by MutationObserver use and a page-context heap measurement.
14. Phase 12 final freeze has not passed while source is dirty and unsupported tracker/report claims remain.

MANDATORY WORK ORDER

======================================================================
1. CORRECT ALL CLAIMS BEFORE MORE FEATURES
======================================================================

Update `docs/GPT_PLAN/04_PROGRESS_TRACKER.md` and generated-report terminology immediately:

- Phase 1: IN PROGRESS until strict fail-closed pixel behavior and shared production verifier pass.
- Phase 2: IN PROGRESS until side panel uses the canonical projection and intercepted-wire equivalence passes.
- Phase 3: IN PROGRESS until real Chrome scenario coverage exists.
- Phase 4: IN PROGRESS if trace/telemetry contracts exist but are incomplete.
- Phase 5: IN PROGRESS until uncertainty behavior is measured in real Chrome.
- Phase 6: IN PROGRESS or NOT MEASURED; geometric proposals are not a validated local UI model.
- Phase 7: NOT PASSED until visual proposals affect real target grounding/execution.
- Phase 8: NOT STARTED or IN PROGRESS, not PASSED based on settling windows.
- Phase 9: IN PROGRESS until exact payload/UI/browser evidence passes.
- Phase 10: IN PROGRESS; label existing 14-fixture result `redaction fixture pass`, not `task success`.
- Phase 11: PLANNED.
- Phase 12: NOT STARTED until a final clean reproducible evidence snapshot exists.

Replace these current ledger claims with NOT MEASURED unless new valid evidence is produced:

- 0% incorrect-action rate across 14 fixtures,
- 0% unsafe-action rate across 14 fixtures,
- 100% autonomous completion without an explicit denominator,
- 0% held-out task generalization gap,
- vision-only/fused grounding success inferred from candidate counts,
- recovery success inferred only from unit tests.

Do not delete the valid 18/18 redaction-fixture measurement. Relabel it precisely.

======================================================================
2. MAKE PIXEL VERIFICATION STRICTLY FAIL CLOSED
======================================================================

Inspect:

- apps/extension/src/sanitizer/pixel-verifier.ts
- apps/extension/src/sanitizer/post-redaction-verifier.ts
- apps/extension/src/sanitizer/pipeline.ts
- apps/extension/src/harness/harness-entry.ts
- tests/production-pixel-verification.test.js

Required changes:

- If a readable 2D context or required pixel data is unavailable, verification fails and transmission is blocked.
- An all-zero/empty/uninitialized pixel buffer must never imply successful coverage in production.
- Put test mocks behind explicit injected test adapters; production defaults remain fail-closed.
- Production and benchmark must call one shared top-level verification implementation with the same thresholds and region semantics.
- Add an integration test intercepting the HTTP client and proving zero request attempts after verification failure.
- Add negative tests for unavailable context, unreadable pixels, zero-filled pixels, displaced masks, wrong-size pixel buffers, and unverifiable blur.
- Preserve opaque fallback for faces when blur destruction cannot be proven.

Gate:

- focused tests pass,
- 18/18 browser fixture coverage remains,
- deliberate corruption fails in the production pipeline,
- HTTP request count remains zero after failure.

======================================================================
3. MAKE THE SIDE PANEL USE THE ACTUAL NETWORK PROJECTION
======================================================================

Inspect:

- packages/protocol/src/payload.ts
- apps/extension/src/background/http-client.ts
- apps/extension/src/sidepanel/sidepanel.js
- apps/extension/src/sidepanel/sidepanel.html
- tests/sidepanel-hud.test.js

Required changes:

- Use one canonical `toSanitizedNetworkPayload()` output for HTTP transmission and UI evidence.
- Pass a safe display projection generated from the exact canonical payload; do not independently reconstruct it in the UI.
- Never synthesize fallback run IDs, capture IDs, digests, viewport values, provider values, or goals.
- If a value is unavailable, display `Not available`.
- If screenshot bytes are omitted from display, retain the exact field name, byte count, digest, and explicit omission marker.
- Add an intercepted-request test proving the displayed field structure and transmitted structure agree, excluding only explicitly documented redacted display values.

======================================================================
4. REPLACE HEURISTIC FINISH WITH TASK-SPECIFIC TERMINAL CONTRACTS
======================================================================

Inspect:

- apps/extension/src/background/coordinator.ts
- apps/extension/src/content/verifier.ts
- packages/protocol/src/action.ts
- apps/server/src/engines/vlm-engine.ts
- apps/server/src/engines/mock-engine.ts

Required changes:

- Define a closed supported task contract at run start.
- Every supported goal maps to one or more structured terminal postconditions, not keyword matching at finish time.
- Bind postconditions to capture/page generation and safe semantic target identity.
- A previous successful unrelated action does not authorize finish.
- A generic visible dialog does not prove the requested dialog is visible.
- Unsupported free-form goals must abstain or ask for clarification rather than inventing success.
- Add adversarial false-finish tests: wrong dialog, unrelated click, stale capture, ambiguous label, unsupported goal, and model claiming success immediately.

======================================================================
5. BUILD A REAL UI-DRIVEN CHROME E2E MATRIX
======================================================================

Replace the one-scenario-only architecture in `scripts/run-e2e-extension.mjs` with a parameterized scenario runner. Do not remove the existing successful scenario.

Each scenario must:

- install/load the actual MV3 extension,
- open the actual side-panel page,
- fill the real task input,
- click the real run control,
- observe visible status/result UI,
- interact with confirmation UI when applicable,
- inspect actual page state,
- preserve a privacy-safe ordered trace,
- assert expected success or expected safe failure.

Do not start runs by directly calling `START_AGENT_RUN`, except in a separate lower-level plumbing test clearly labelled as such.

Implement these ten real Chrome scenarios on authorized local pages:

1. Click and verify dialog/drawer.
2. Type non-sensitive search text and verify filtering/result state.
3. Select a non-sensitive option and verify selected state.
4. Scroll and verify changed scroll position.
5. Delayed modal/status mutation and bounded verification.
6. Target moves after observation; stale target is detected and safely re-grounded once.
7. Repeated labels remain ambiguous and cause clarification/abstention with no click.
8. Protected action opens real confirmation UI; approve after freshness check and execute once.
9. Protected action denied in UI; task stops safely with no protected execution.
10. Forced verification failure or low confidence; no false success and no unsafe action.

Add at least one browser test for extension UI error presentation and one for sanitizer-block presentation.

Artifact requirements per scenario:

- scenario ID and goal,
- initial-state assertion,
- UI interactions performed,
- ordered step trace,
- decisions and origin,
- target and freshness checks,
- execution and postcondition result,
- expected versus actual terminal state,
- privacy metadata without screenshot contents or PII,
- timings and network count.

Run three consecutive warm repetitions plus one cold run for the primary scenario. Preserve all failures.

Only these real action results may feed task success, incorrect-action, unsafe-action, intervention, and recovery metrics.

======================================================================
6. REBUILD PRODUCTION VALIDATION WITH HONEST METRICS
======================================================================

Fix `scripts/run-production-validation.mjs`:

- Keep the 14-fixture sanitization/redaction section, but call it exactly that.
- A fixture with zero assessable regions is N/A for redaction coverage, not an automatic successful task.
- Do not calculate task success from `underMasked === 0`.
- Do not hardcode local latency, server latency, action counts, confidence outcomes, canary success, wrong-action rate, unsafe-action rate, or screenshot-block results.
- Import measured E2E scenario records and derive action metrics from them.
- Fail report generation when required source artifacts are missing or from another source fingerprint.
- Separate unit-tested behavior, browser-fixture measurements, and real extension E2E measurements in the report.

Required report sections:

A. Privacy fixture metrics.
B. Real extension task metrics.
C. Expected safe-failure metrics.
D. UI workflow results.
E. DOM/vision/fused grounding metrics.
F. Resource measurements with exact scope.
G. Known limitations.

======================================================================
7. MAKE LOCAL VISUAL PERCEPTION REAL OR REDUCE THE CLAIM
======================================================================

Current edge/gradient candidate generation is not semantic UI grounding by itself.

Required implementation for a PASS:

- Wire `VisualCandidateGenerator.extractProposals()` into the actual same-capture perception path.
- Candidate generation must consume real captured pixels, not hand-authored proposal arrays.
- Record visual proposals and actual provider/duration in the run trace.
- Add semantic evidence using a compact local classifier and/or local OCR where practical; geometry-only role guessing must be labelled `region proposal`, not UI understanding.
- Fuse screenshot-derived proposals with DOM candidates in the real coordinator path.
- Demonstrate a real disagreement reducing confidence or causing abstention.
- Demonstrate one authorized DOM-inaccessible/canvas safe control detected from pixels and safely acted upon with coordinate freshness, occlusion/conflict checks, and postcondition verification.
- Replace candidate-count comparison with labelled ground truth: precision, recall, and IoU for DOM-only, vision-only, and fused modes.

If you cannot achieve this without destabilizing privacy/E2E, do not fake it. Use this exact final claim:

“Local visual face perception and geometric region proposals support privacy filtering. Browser-action grounding remains DOM-assisted; semantic vision-only UI grounding is not yet complete.”

======================================================================
8. CREATE REPRODUCIBLE EVIDENCE, NOT A REPLACEABLE `latest` CLAIM
======================================================================

- Generate a unique timestamped run directory and refuse overwrite.
- Record git SHA and dirty state.
- For dirty state, create a deterministic source-tree fingerprint or patch hash and include it in every artifact.
- Hash built extension artifacts, model files, fixture definitions, and major result files.
- Record exact commands, exit codes, browser version/flags, OS, CPU/RAM, viewport/DPR, model/provider/checksum, network dependencies, sample counts, timeout policy, repetitions, exclusions, and failures.
- `latest` may be a convenience copy/pointer but must never be called immutable.
- Do not mark final freeze passed while the tree is dirty and claims are inconsistent.

======================================================================
9. FIREFOX
======================================================================

Do not mark Firefox passed. Either:

A. Build a Firefox-specific manifest/host path and run a real Firefox test, or
B. Keep Firefox explicitly `PLANNED / EXPERIMENTAL / NOT VERIFIED`.

Do not let Firefox work destabilize Chrome.

REQUIRED VALIDATION

Run and report exact output for:

npm run build
npm test
npm run lint
npm run verify:redaction
npm run benchmark:browser
npm run test:e2e
npm run validate:production

Add a separate command for the full real Chrome scenario matrix if `test:e2e` is kept as the primary single scenario.

STRICT FINAL REPORT RULES

- Never say all stages passed merely because 198 unit tests passed.
- Never call sanitization fixture success task success.
- Never call candidate counts grounding accuracy.
- Never claim UI works unless browser automation used its visible controls.
- Never claim immutable evidence unless overwrite prevention and source/artifact identity are demonstrated.
- Never claim Firefox passed without a Firefox run.
- Never claim production pixel safety while any verifier branch can fail open.

At the end provide:

1. Corrected phase table.
2. Real Chrome scenario table with denominators.
3. UI interaction evidence.
4. Privacy fixture results.
5. Production fail-closed negative-test results.
6. Actual task success/wrong action/unsafe action/abstention/recovery metrics.
7. Real screenshot-derived DOM/vision/fused metrics or the narrower honest claim.
8. Exact commands and outcomes.
9. Evidence source fingerprint and hashes.
10. Remaining limitations.

Do not stop at generating files. Run the actual browser workflows and inspect the generated traces before declaring a gate passed.
```
