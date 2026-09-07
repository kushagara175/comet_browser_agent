# One-Week Judge-Ready Execution Prompt

Use this prompt with Gemini/Antigravity after the narrow Chrome MV3 E2E sprint. It converts the full production plan into a deadline-aware, evidence-gated execution sequence.

```text
You are the lead engineer responsible for making PrivaPilot judge-defensible within one week. Work directly in the existing repository and continue autonomously through the ordered gates below.

Repository root: SIH_26209

READ FIRST

1. docs/00_PROBLEM_STATEMENT.md
2. docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md
3. docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
4. docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md
5. docs/GPT_PLAN/04_PROGRESS_TRACKER.md
6. docs/GPT_PLAN/06_PRODUCTION_COMPLETION_AND_REAL_WORLD_PROMPT.md
7. Current git diff and all uncommitted files
8. Current benchmark and E2E artifacts

The official priorities are:

- visual-context accuracy: 25%
- sensitive/PII recall and precision: 20%
- redaction precision: 20%
- client resource utilization: 20%
- end-to-end latency: 15%

Privacy detection and redaction together are 40%. Therefore, do not spend time polishing UI, adding chatbot features, or attempting Firefox while Chrome production privacy can still transmit an under-masked screenshot.

CURRENT TRUTH — DO NOT OVERSTATE IT

- The project has a real Chrome MV3 extension/server integration.
- Unit baseline was reported as 177/177 passing and lint/typecheck clean.
- Three runs of one prepared goal reported success.
- Those artifacts retain only the final `finish` proposal and do not machine-prove the entire click/verify/recapture sequence.
- Browser benchmark currently covers 15/18 sensitive regions (83.3%). Two face regions and one image/high-risk surface are under-masked.
- Production verification is count/string based, not final-pixel based.
- UI actions are currently grounded mainly through DOM-derived candidates. UltraFace is used for privacy redaction, not general actionable-UI grounding.
- Existing visual-context IoU/geometry evidence is not trustworthy until real extracted boxes are retained.
- Firefox is not implemented.
- The working tree is dirty. Preserve required work and never manually edit generated `dist/` files.

NON-NEGOTIABLE RULES

1. Never claim complete, production-ready, fully local, visual-only, or 100% private without exact evidence.
2. Never print or persist raw screenshots, raw PII, full URLs/query strings, cookies, authorization headers, API keys, complete prompts, or complete model output.
3. Never weaken a privacy or safety gate to make E2E pass.
4. Never hardcode demo IDs, selectors, domain names, request IDs, or goal-specific keywords in production logic.
5. Never change benchmark ground truth to match faulty output.
6. Never count `finish` as success without an independently verified structured terminal condition.
7. Never count zero samples as 100% precision or recall.
8. Never call page-context heap the complete extension/browser memory footprint.
9. Never call DOM-derived target selection vision-only.
10. Do not commit or create branches unless the user explicitly asks.
11. Build generated files from source; do not edit `dist/` manually.
12. Preserve failures and expected abstentions in evidence rather than deleting them.

WORKING METHOD

- Complete gates in order.
- After each gate, run focused tests, `npm run build`, `npm test`, and `npm run lint`.
- Run expensive browser/E2E commands when relevant to that gate.
- Update `docs/GPT_PLAN/04_PROGRESS_TRACKER.md` only with observed facts.
- A passed unit test is not enough for browser behavior: use actual Chrome for browser gates.
- If a gate fails, fix the root cause before moving on.
- Make at most two focused attempts on a blocker. If still blocked by a genuine external dependency, document the blocker and continue only with work that does not bypass it.

======================================================================
GATE 0 — BASELINE TRUTH AND SAFE AUDIT
======================================================================

Goal: establish one coherent current baseline before deeper changes.

Tasks:

- Inspect and classify every dirty change as production fix, harness instrumentation, temporary debugging, demo-specific logic, documentation, or generated output.
- Preserve the dedicated MV3 offscreen port and content-script reinjection fixes unless a real reproduction proves they are unnecessary.
- Remove or safely gate raw/default debug logs in server model handling, browser adapter, offscreen document, action executor, demo portal, and E2E harness.
- Replace logs with bounded structured reason codes/counts/durations only.
- Remove broad goal-completion shortcuts based on words such as open, preview, submit, approval, confirm, or cancel.
- Fix stale README/status claims, including obsolete test counts and unsupported Firefox readiness.
- Record dirty state in generated evidence metadata.
- Change result generation to immutable directories under `docs/benchmark-results/runs/<timestamp>-<sha>/`; do not silently overwrite evidence.

Required tests:

- Sensitive canaries, URLs, data URLs, query strings, authorization values, and API-key-like values never appear in diagnostics or artifacts.
- No production success branch depends on demo-specific words or selectors.

Gate passes only if build/tests/lint pass and repository claims match the current implementation.

======================================================================
GATE 1 — PRODUCTION PIXEL-VERIFIED PRIVACY
======================================================================

Goal: no screenshot can be transmitted unless final rendered pixels prove that every assessable detected sensitive region was successfully redacted.

Implement the complete Phase 1 requirements from `docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md`:

- Move reusable pixel-verification logic out of the benchmark harness into production sanitizer code.
- Make production and benchmark use the same verifier.
- Make `MaskRenderer` return a per-region render record: region ID, category, requested box, clamped/rendered box, coordinate space, method, success, and failure reason.
- Reject NaN/infinite/non-positive/fully-off-canvas/invalid-space/degenerate geometry.
- Verify opaque masks from final output pixels.
- Verify face redaction spatially. If blur/pixelation cannot be proven, apply a verified opaque fallback or block transmission.
- Fix screenshot-pixel versus CSS/DPR/model-resize coordinate transforms at the root cause.
- Remove `requiresFailClosedBlock: false` as an unconditional outcome. Derive it from actual detector/verifier state.
- Failed verification must prevent creation of the branded verified sanitized context and must prevent the HTTP request.
- Replace the unrealistic image-PII fixture with legally usable, realistic evidence, or classify the old fixture as invalid and exclude it transparently.

Required focused cases:

- displaced mask,
- correct count but unchanged pixels,
- invalid geometry,
- DPR 1 and 2,
- non-4:3 viewport,
- edge region,
- scroll offset,
- effective and ineffective face redaction,
- opaque fallback,
- adjacent safe-control preservation,
- no network call after failed verification.

Run:

- npm run verify:redaction
- npm run benchmark:browser
- npm run test:e2e

Gate passes only when all assessable committed sensitive regions are covered, safe controls remain evaluated, deliberate corruption fails in production, and E2E still works.

======================================================================
GATE 2 — REDACTION MANIFEST AND EXACT NETWORK EVIDENCE
======================================================================

Goal: the server and evidence UI receive exactly the safe, verified metadata actually sent on the wire.

Tasks:

- Add a closed, versioned `RedactionManifest` to protocol and sanitized payload.
- Include only safe aggregate metadata: category/method counts, total regions, coordinate semantics, placeholder convention, pixel-verification result, uninspectable-surface policy, and local vision attempted/succeeded/provider/model/checksum/duration.
- Never include raw detector values or PII.
- Implement exactly one `toSanitizedNetworkPayload()` projection shared by HTTP transport, intercepted-request tests, E2E metadata, and side-panel display.
- Server rejects screenshots with absent, contradictory, or failed verification metadata.
- Generate the VLM redaction explanation from the manifest and tell the model not to infer hidden values.
- Remove reconstructed run IDs, assumed viewport/provider, recomputed replacement digest, and misleading “exact payload” wording from the side panel.
- Display `Not Run` until local vision actually runs.

Gate evidence:

- Intercept one real request.
- Prove its JSON shape equals the shared projection.
- Prove only a sanitized screenshot is present.
- Prove manifest is present and consistent.
- Prove raw canaries, PII, secrets, and authorization data are absent.

======================================================================
GATE 3 — REAL ACTION TRACE, FALSE-FINISH DEFENSE, AND RECOVERY
======================================================================

Goal: prove an actual assisting browser workflow, not merely model connectivity or a final `finish` response.

Tasks:

- Add an ordered privacy-safe step trace to every run containing capture ID, page generation/fingerprint, safe digest, mask count, screenshot byte count, decision origin, proposal, confidence/risk/freshness decision, execution result, structured verification result, recovery, network use, and timings.
- Do not put screenshot data or sensitive text in traces.
- Introduce a small closed task contract and `ExpectedPostcondition` union for supported operations: dialog visible, route fingerprint changed, allowed attribute changed, value present, selection changed, status changed, scroll changed, and visibility changed.
- A `finish` proposal is accepted only if the current task contract has a verified terminal postcondition or the user explicitly accepts an observation-only result.
- Treat finish/wait/observe separately; do not mark all passive actions automatically verified.
- Add action-aware bounded verification with MutationObserver plus bounded polling/settling.
- Add stale-target recovery for safe reversible actions only.
- Never automatically replay protected actions.
- Revalidate active tab, page generation, target equivalence, and expiry after protected-action approval.
- Add configurable uncertainty handling: execute only a unique fresh safe candidate above threshold; re-observe/intervene for close alternatives; abstain on low confidence; always confirm protected actions.

Required actual Chrome scenarios:

1. Click to open a dialog/drawer, verify it, recapture, then finish.
2. Type non-sensitive text into a search/filter field and verify the resulting state.
3. Select/change a control and verify selection/state change.
4. Delayed dialog or delayed status update.
5. Layout movement causing stale-target detection and bounded safe recovery.
6. Repeated labels causing clarification or safe abstention.
7. Protected submit requiring fresh confirmation.
8. Denied protected action causing safe stop.
9. Low-confidence proposal causing no action.
10. Verification failure preventing false success.

For the original preview scenario, the trace must machine-prove:

- initial state did not already satisfy the goal,
- first proposal was click,
- target was fresh and executable,
- click executed,
- dialog opening was semantically verified,
- a second capture occurred,
- final finish was accepted only because the terminal condition was verified.

Run every scenario through actual Chrome MV3. Preserve expected safe failures as passing safety scenarios. Run three consecutive warm repetitions for the primary success workflow plus one cold run.

======================================================================
GATE 4 — VALID EVALUATION AND UNFAMILIAR PAGES
======================================================================

Goal: generate judge-credible measurements with valid denominators and provenance.

Tasks:

- Stop replacing extracted bounds with `[0,0,0,0]`.
- Missing boxes are failures/not-measured, never IoU 1.
- Separate semantic target identification from spatial grounding.
- Empty categories are N/A, not 100%.
- Remove nominal server latency and hardcoded pass-rate values.
- Record exact Chrome version, OS, CPU, RAM, GPU where observable, viewport, DPR, cold/warm state, dirty state, model checksum/size, actual execution provider, sample count, exclusions, and timeout policy.
- Scope memory honestly by measured process/context; do not imply browser-wide memory if only page heap is measured.
- Create an authorized corpus using saved public pages, automation-permitted sandboxes, synthetic local reproductions, or pages authored by another person.
- Separate development and held-out page families. Once a held-out page informs tuning, move it to development and replace it.
- Include login, search, synthetic checkout, repeated labels, modal, delayed UI, long scroll, responsive/zoom, icon-only, canvas, overlay/occlusion, layout shift, and webpage prompt-injection text.

Measure with explicit denominators:

- PII detection precision/recall/F1 by category,
- pixel redaction coverage,
- safe-region preservation,
- target semantic success,
- spatial grounding success/IoU where valid,
- end-to-end task success,
- incorrect and unsafe action rate,
- abstention/intervention rate,
- recovery success,
- confirmation outcomes,
- local/server/total latency p50 and p95,
- payload bytes,
- network-required step percentage,
- measured memory scope.

Produce one immutable, internally consistent evidence directory from one current source state. Do not mix historical artifacts.

======================================================================
GATE 5 — MINIMUM HONEST LOCAL ACTIONABLE-UI VISION
======================================================================

Attempt this only after Gates 0–4 pass. Preserve the stable DOM-assisted path.

Goal: provide at least one real, locally computed visual contribution to actionable target grounding.

Tasks:

- Add capture-bound perception contracts for DOM candidates, visual candidates, and fused candidates.
- Route existing DOM behavior through the contract first.
- Evaluate a compact browser-compatible actionable-UI detector or classical visual region proposer plus compact local classifier.
- Verify license, model origin, checksum, bundled size, browser provider, cold/warm latency, memory scope, and redistribution rights.
- Bundle assets locally; no runtime CDN or external vision call.
- Fuse same-capture DOM/visual evidence spatially and semantically. Preserve disagreements and lower confidence.
- Prefer DOM execution after safe visual-to-DOM association.
- Permit coordinate-only execution only for a fresh, safe, reversible, high-confidence DOM-inaccessible target with occlusion/conflict checks and postcondition verification.
- Benchmark DOM-only, vision-only, and fused modes using real visual boxes.

Minimum passing proof:

- non-zero measured vision-only grounding,
- at least one fused candidate sourced from both DOM and vision,
- one authorized DOM-inaccessible or canvas control detected locally and safely acted on,
- actual model/provider/duration displayed,
- no raw screenshot sent to an external visual service.

If this gate cannot be completed reliably, stop without destabilizing Gates 0–4 and use this exact honest claim:

“Local visual face perception controls redaction and transmission. Browser-action grounding is currently DOM-assisted; general visual UI grounding is planned and is not claimed as complete.”

======================================================================
GATE 6 — OPTIONAL FIREFOX, FREEZE, AND SUBMISSION TRUTH
======================================================================

- Attempt Firefox only after all Chrome correctness gates pass.
- Keep Firefox experimental until a real run passes.
- Reuse shared privacy code; do not fork or weaken sanitizer behavior.
- Run final build, full tests, lint, browser benchmark, redaction verification, and E2E suite.
- Scan artifacts and logs for secrets/sensitive content.
- Synchronize README, tracker, PPT data, and demo script to the final immutable run.
- Clearly label every claim as MEASURED, TARGET, PLANNED, or NOT MEASURED.
- Record a labelled backup demo video only after final evidence is frozen.

SCOPE CUT ORDER IF TIME RUNS OUT

Cut in this order, from first to cut to last:

1. UI animation/dashboard polish.
2. Broad chatbot features and integrations.
3. Firefox production polish.
4. Adaptive caching and elaborate local routing.
5. Broad actionable-UI model experimentation.

Do not cut:

- production pixel verification,
- fail-closed transmission,
- redaction manifest,
- real action traces,
- false-finish prevention,
- multiple safety scenarios,
- valid benchmark denominators/provenance,
- honest claim boundaries.

REQUIRED FINAL COMMANDS

Run all commands that exist, fixing regressions caused by your work:

npm run build
npm test
npm run lint
npm run benchmark
npm run benchmark:browser
npm run verify:redaction
npm run test:e2e

Do not report a command as passed unless it was executed and exited successfully. If a script does not exist, add it only when it represents a real validation; otherwise report it as unavailable.

FINAL REPORT FORMAT

1. Overall verdict: PASS, PARTIAL, or BLOCKED.
2. Gate-by-gate status with exact evidence paths.
3. Exact source/test/document files changed; list generated artifacts separately.
4. Commands executed and exact outcomes/test counts.
5. Scenario table: initial state, actions, terminal proof, result, expected/actual safety outcome.
6. Privacy table: PII precision/recall, redaction coverage, safe preservation, production pixel gate result.
7. Visual grounding table: DOM-only, vision-only, fused; use NOT MEASURED rather than invented values.
8. Latency/resource/network figures with precise scope.
9. Held-out results and generalization gap.
10. Known failures and honest final claim text.
11. Unsupported claims removed.
12. External blockers.

Completion is not “all tests pass.” Completion requires current, inspectable evidence that the production privacy boundary, real browser action loop, terminal verification, safety behavior, and reported metrics all match what is claimed.
```
