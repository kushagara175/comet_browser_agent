# Production Completion and Real-World Validation Prompt

Copy the entire code block into Gemini/Antigravity after the two-hour E2E sprint.

```text
You are the lead engineer continuing the PrivaPilot project after a successful narrow Chrome MV3 E2E sprint. Your task is now to turn that demo-path success into a production-quality, judge-defensible browser-agent prototype and validate it end-to-end on multiple authorized, unfamiliar page families.

Repository root: SIH_26209

DO NOT CLAIM THE PROJECT IS COMPLETE UNTIL EVERY REQUIRED GATE IN THIS PROMPT PASSES.

READ FIRST

Read these files before editing:

- docs/00_PROBLEM_STATEMENT.md
- docs/GPT_PLAN/README.md
- docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md
- docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
- docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md
- docs/GPT_PLAN/04_PROGRESS_TRACKER.md
- docs/GPT_PLAN/05_TWO_HOUR_E2E_GEMINI_PROMPT.md
- README.md
- package.json
- all current uncommitted diffs
- all source, tests, and scripts touched by the previous sprint

CURRENT VERIFIED STATE

The previous sprint achieved a narrow real Chrome MV3 E2E pass for:

Goal: "Open the safe preview for the pending request"

Three stored runs report `success: true`, `state: complete`:

- docs/benchmark-results/E2E_EXTENSION_RUN_1.json
- docs/benchmark-results/E2E_EXTENSION_RUN_2.json
- docs/benchmark-results/E2E_EXTENSION_RUN.json

Current unit baseline reported by the sprint: 177/177 passing.
Current browser benchmark: 15/18 sensitive regions covered (83.3%), with 3 under-masked regions.

Do not treat the narrow E2E pass as proof that the whole product is complete.

CRITICAL REVIEW FINDINGS THAT MUST BE ADDRESSED

1. The E2E artifacts preserve only the final `finish` proposal. They do not contain a complete per-step trace proving the initial click, its target, execution result, semantic verification, subsequent observation, and finish decision.
2. `apps/server/src/engines/vlm-engine.ts` currently logs raw model output and compact element names. This is unacceptable as default production behavior and conflicts with privacy/zero-log claims.
3. `apps/extension/src/content/action-executor.ts`, offscreen code, browser adapter, demo portal, and E2E harness contain temporary debug console logging that must be removed, safely gated, or sanitized.
4. Completion logic in `vlm-engine.ts` uses broad demo-shaped keyword heuristics such as submit/approval/cancel/preview/open. This can falsely mark unrelated goals complete and is not a general structured state proof.
5. Similar demo-shaped completion logic was added to `apps/server/src/engines/mock-engine.ts`. The mock may be deterministic for tests, but production success must not depend on portal-specific words.
6. Production post-redaction verification is still count/string based. Browser benchmark pixel verification is not the production transmission gate.
7. Browser benchmark still has 3 real under-masked cases: face-gallery 0/2 and image-pii 0/1.
8. The UI still reconstructs an approximate wire payload and may generate replacement run IDs, viewport values, or digests. It must not call this exact.
9. The server still lacks a complete redaction manifest derived from real detector output.
10. Confidence gating handles only ultra-low confidence. Ambiguity, candidate margin, intervention, and threshold behavior are not measured.
11. Protected-action approval may execute against stale page state unless capture/target freshness is revalidated after user delay.
12. Local UI action grounding remains DOM-based. UltraFace influences redaction, not general visual UI target selection.
13. Current browser visual-context metrics contain known validity weaknesses, including incomplete localization evidence.
14. Current tests and reports are generated from a dirty working tree and several different historical commits. Produce coherent current-run evidence.
15. Firefox is incomplete. It is lower priority than Chrome correctness and should not destabilize a working Chrome submission.

PRIMARY PRODUCT DEFINITION

The production prototype must support this complete path:

User task in extension
→ fresh capture and page-state identity
→ local PII/face/high-risk-surface perception
→ local redaction
→ production pixel verification
→ redaction manifest
→ local safe-action decision when obvious OR sanitized server reasoning when needed
→ local schema/risk/confidence/freshness validation
→ action execution
→ structured semantic verification
→ bounded recovery
→ verified finish or safe abstention
→ privacy-safe evidence trail.

WORK AUTONOMOUSLY

- Continue until all mandatory gates pass or a genuinely external blocker is documented.
- Do not ask routine questions.
- Make small, reviewable steps; validate after each major change.
- Preserve unrelated work.
- Do not commit or branch unless explicitly asked.
- Never manually edit `dist/`; rebuild from source.
- Never print `.env`, API keys, authorization headers, raw screenshots, raw PII, cookies, or full model prompt/output in normal logs.
- Never hardcode demo selectors, element IDs, request IDs, domain names, or goal-specific completion branches in production code.
- Never weaken fail-closed behavior to improve completion rate.
- Never substitute mock success when the real model path is required.
- Never claim full local visual grounding unless a local visual UI model genuinely contributes to target selection and is separately measured.

EXECUTION ORDER

Complete work in the following production priority order. Do not skip ahead to visual-model experimentation while privacy correctness remains below 100% on assessable committed fixtures.

======================================================================
STAGE A — AUDIT AND CLEAN THE NARROW E2E SPRINT
======================================================================

A1. Inspect all uncommitted source and generated diffs.

Classify every modification as:

- required production fix,
- test/harness-only instrumentation,
- temporary debug code,
- demo-specific heuristic,
- generated artifact.

Do not revert required user work. Remove temporary debug behavior after replacing it with safe structured evidence.

A2. Remove unsafe/default debug logging.

Remove or safely gate logs including:

- raw model output,
- complete element names/lists,
- target DOM identifiers/classes when unnecessary,
- full offscreen messages,
- browser URLs,
- arbitrary CDP console forwarding,
- sanitizer exception objects,
- page-specific debug statements.

Production logs may contain only bounded metadata such as:

- run ID,
- reason code,
- counts,
- action kind,
- sanitized local ID,
- duration,
- provider name,
- byte size,
- pass/fail status.

Add tests proving sensitive strings, URLs, data URLs, query strings, API keys, and authorization headers are absent from logs/artifacts.

A3. Remove demo-specific completion shortcuts.

Replace broad heuristics like:

- submit/approval/cancel/preview/open keyword checks,
- inferred drawer state merely from the presence of certain control names,
- hardcoded mock completion for preview goals,

with generic structured page-state evidence.

Introduce sanitized page-state landmarks such as:

- visible dialog/drawer count,
- sanitized visible dialog titles,
- status-region summaries after PII scrubbing,
- route/path fingerprint without transmitting full sensitive URLs,
- enabled/disabled control states,
- action history and verified postcondition summary.

Do not transmit raw DOM or arbitrary text. Use bounded, sanitized summaries.

A4. Add full per-step E2E trace.

Every E2E run artifact must include an ordered step array:

```ts
interface E2EStepTrace {
  step: number;
  captureId: string;
  pageGeneration: string;
  maskCount: number;
  sanitizedScreenshotBytes: number;
  decisionOrigin: 'local' | 'server';
  proposal: ActionProposal;
  riskDecision: string;
  confidenceDecision: string;
  executed: boolean;
  executionResult?: {
    success: boolean;
    staleTarget: boolean;
    reasonCode?: string;
  };
  verification?: {
    verified: boolean;
    reasonCode: string;
    matchedCondition?: string;
    durationMs: number;
  };
  networkRequestMade: boolean;
  timings: Record<string, number>;
}
```

The artifact must prove:

- first proposal was click,
- click was executed,
- dialog opening was verified,
- second capture occurred,
- final proposal was finish,
- finish occurred only after verified state change.

Do not store raw screenshot data or sensitive text in the trace. Store byte size and safe digest only.

A5. Add a false-finish test.

A model returning `finish` before the requested postcondition exists must not automatically produce success. The coordinator must require one of:

- a verified terminal condition from the current task contract,
- a previous verified action whose postcondition satisfies the goal,
- explicit user acceptance for an observation-only task.

Do not attempt unrestricted natural-language theorem proving. Implement a small structured task/postcondition contract for supported task types and abstain outside it.

A6. Validate Stage A.

Run focused tests, build, full tests, lint, and the original E2E task three times. Confirm traces prove every step and production logs contain no sensitive payloads.

======================================================================
STAGE B — PRODUCTION PIXEL REDACTION GATE
======================================================================

Implement Phase 1 from `docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md` completely.

B1. Create a shared production pixel verifier under the sanitizer package. Move reusable pixel algorithms out of the benchmark harness. Production and benchmark must use the same verification implementation.

B2. Change `MaskRenderer` to return per-region render records keyed by region ID, requested box, actual clamped box, method, and success—not only a count.

B3. Reject invalid geometry:

- NaN/infinity,
- non-positive dimensions,
- invalid coordinate space,
- fully off-canvas regions,
- one-pixel output caused by invalid input.

B4. Verify opaque masks by inspecting final output pixels.

B5. Verify face redaction spatially. If blur/pixelation cannot be proven, use a verified opaque fallback or block transmission.

B6. Fix face coordinate mapping rather than changing ground truth to fit output. Test:

- DPR 1 and 2,
- non-4:3 viewports,
- scroll offsets,
- edge faces,
- model resize/aspect mapping,
- screenshot pixel versus CSS viewport space.

B7. Replace invalid `image-pii` evidence with a realistic legally usable image fixture or correctly classify it as not assessable. Do not use a 1x1 image as evidence of image PII redaction.

B8. Make failed pixel verification prevent creation of `SanitizedContext_Verified`, and therefore prevent HTTP transmission.

B9. Required tests:

- correct/displaced mask,
- matching count but unchanged pixels,
- invalid geometry,
- DPR transforms,
- effective/ineffective face redaction,
- opaque fallback,
- safe adjacent control preservation,
- no network call after failure.

B10. Gate:

- `npm run benchmark:browser` reports all assessable sensitive regions covered,
- deliberately displaced mask fails inside production,
- safe controls remain measured and preserved,
- E2E still passes.

Do not claim production pixel verification before this gate.

======================================================================
STAGE C — REDACTION-AWARE NETWORK PROTOCOL AND EXACT UI EVIDENCE
======================================================================

C1. Add a versioned `RedactionManifest` to protocol, sanitized context, and network payload.

It must aggregate safe metadata only:

- category and method counts,
- total regions,
- placeholder convention,
- geometry semantics,
- pixel verification performed/passed,
- uninspectable-surface policy,
- vision attempted/succeeded/model/provider/duration.

Never transmit raw detector values or raw PII.

C2. Create one protocol `toSanitizedNetworkPayload()` function.

Use this exact function for:

- HTTP request body,
- server validation tests,
- side-panel wire-payload display,
- E2E payload trace metadata.

C3. Update server closed-schema validation. Reject missing/contradictory manifest values and require passed pixel verification when sending a screenshot.

C4. Generate the VLM redaction prompt section from the manifest. Tell the model redacted values are unavailable and must not be inferred.

C5. Fix side-panel truthfulness.

Remove:

- generated replacement run IDs,
- assumed viewport,
- fake/recomputed replacement digest,
- added fields not sent on wire,
- the phrase "exact payload" when content is truncated,
- HTTPS claim when using local HTTP.

If screenshot bytes are omitted from display, explicitly say so and display actual byte count/digest.

C6. Display the actual local vision provider. Initial state must be `Not Run`, not `WASM`.

C7. Gate:

Capture a real request and prove displayed projection equals transmitted JSON shape, screenshot is sanitized, manifest is present, and no raw PII/canary/secret appears.

======================================================================
STAGE D — RELIABLE GENERAL BROWSER ACTION LOOP
======================================================================

D1. Structured postconditions.

Extend action protocol with a small closed `ExpectedPostcondition` union:

- dialog became visible,
- URL/path fingerprint changed,
- allowed target attribute changed,
- target value became present,
- select option changed,
- status region changed,
- scroll position changed,
- element visibility changed.

Never accept server-provided selectors or JavaScript.

D2. Verification policy.

Use bounded action-aware timeouts, polling, settling windows, and MutationObserver. Verify scroll and delayed async changes. Do not count arbitrary mutations or readyState as success.

D3. Safe recovery.

For safe reversible actions only:

- re-capture,
- re-ground equivalent semantic target,
- retry within limit,
- record recovery trace.

Protected actions are never auto-replayed.

D4. Fresh confirmation.

Before executing an approved protected action:

- re-check active tab,
- verify capture/page generation is still current,
- verify target still exists and is semantically equivalent,
- require new confirmation after meaningful change/expiry.

D5. Confidence and ambiguity.

Create a configurable local policy. At minimum:

- high confidence + clear unique candidate + safe + fresh → execute,
- medium confidence or close alternatives → re-observe or ask user,
- low confidence → abstain,
- protected → confirm regardless.

Do not claim calibration until benchmarked. Record coverage and incorrect-action behavior at multiple thresholds.

D6. Local safe decisions.

Implement a narrow deterministic local router for safe obvious actions such as scroll, close/dismiss, and exact unique label match. Record whether each step was local or server-driven. This should reduce latency and satisfy the conditional-server narrative.

D7. Gate:

Pass multiple real extension scenarios through actual Chrome:

1. Safe preview click and finish.
2. Search/filter using a non-sensitive text field.
3. Select/change a control if available.
4. Delayed dialog or status update.
5. Stale-target mutation and bounded recovery.
6. Ambiguous repeated labels causing clarification/abstention.
7. Protected submit requiring user confirmation.
8. Denied protected action causing safe stop.
9. Low-confidence proposal causing no click.
10. Verification failure causing no false success.

Preserve complete per-step traces for each.

======================================================================
STAGE E — LOCAL VISUAL UI PERCEPTION
======================================================================

This stage is required for the complete official vision claim, but must not destabilize Stages A-D.

E1. Introduce capture-bound `PerceptionSource`, `PerceptionCandidate`, and fusion contracts for DOM and vision.

E2. Route current DOM behavior through the abstraction first.

E3. Select a compact browser-compatible actionable-UI visual model or an honestly described classical region proposal + compact local classifier. Evaluate license, redistribution, ONNX browser compatibility, size, cold/warm latency, memory, and UI accuracy before integration.

E4. Bundle model, checksum, attribution, model card, and reproducible export. No runtime CDN fetch.

E5. Detect actionable UI regions such as button/input/icon/tab/menu/dialog where feasible. OCR may assist but is not the sole visual system.

E6. Fuse vision with DOM by same-capture spatial/semantic agreement. Preserve disagreements and lower confidence.

E7. Prefer DOM execution when a visual candidate can safely associate with a DOM element. Coordinate-only actions are allowed only for DOM-inaccessible, safe, reversible, high-confidence, fresh targets with strict point conflict checks and postcondition verification.

E8. Add benchmark modes:

- DOM-only,
- vision-only,
- fused.

Vision-only must use real visual output and real geometry, never DOM names or absent-box default success.

E9. Gate:

- non-zero measured vision-only grounding,
- at least one candidate sourced `both`,
- one DOM-inaccessible/canvas control detected and safely acted upon,
- actual provider/model/duration displayed,
- no raw screenshot sent to any external visual service.

If E-stage cannot be completed reliably within the deadline, keep the product stable and state the narrower truthful claim: local visual face perception controls redaction/transmission while action grounding is DOM-assisted. Do not fake visual-only success.

======================================================================
STAGE F — REAL-WORLD AUTHORIZED VALIDATION
======================================================================

Do not test state-changing actions on arbitrary third-party production systems.

F1. Build authorized real-page test corpus.

Use either:

- saved/static snapshots of public pages with synthetic PII,
- local reproductions of common page families,
- public demo/sandbox sites that explicitly permit automation,
- pages created by a different team member.

Never enter real credentials, payment data, or personal information.

F2. Include at least these page families:

- login form,
- search/filter page,
- checkout-like synthetic form,
- dashboard with repeated labels,
- modal/drawer,
- delayed-loading UI,
- long-scroll page,
- responsive/mobile viewport,
- zoomed page,
- icon-only controls,
- canvas control,
- overlay/occlusion,
- stale layout shift,
- webpage prompt-injection text.

F3. Generalization discipline.

The person implementing a detector must not author the whole held-out set. Report dev and held-out separately. If a held-out case is used for tuning, move it to dev and replace it.

F4. Real task metrics.

Measure:

- task success,
- wrong target/action,
- unsafe action,
- abstention/intervention,
- recovery success,
- protected confirmation,
- network-required step percentage,
- bytes sent,
- local/server/total latency,
- pixel redaction and safe-region preservation.

F5. Run at least three warm repetitions per configuration plus one cold run. Preserve failures and timeouts.

F6. Gate:

Produce one immutable run directory for a single current commit containing all raw safe traces, metadata, and summaries. Do not combine historical commit results.

======================================================================
STAGE G — BENCHMARK VALIDITY AND FINAL EVIDENCE
======================================================================

G1. Fix browser grounding geometry. Stop assigning `[0,0,0,0]` to extracted elements.

G2. Missing boxes must not generate IoU 1.

G3. Empty PII categories must be not-applicable/not-measured, not 100%.

G4. Remove nominal `serverMs = 350` from scored reports.

G5. Remove hardcoded privacy pass rates from reporter.

G6. Report memory by process/context and explain scope.

G7. Compare:

- DOM-only,
- vision-only,
- fused,
- adaptive/no-adaptive if implemented,
- verification/no-verification in isolated test mode,
- confidence thresholds,
- local/server routing.

G8. Build current source before every benchmark or enforce artifact hashes.

G9. Generate immutable evidence under:

`docs/benchmark-results/runs/<timestamp>-<sha>/`

Include commit, dirty state, exact browser version, flags, OS, CPU, RAM, GPU, viewport, DPR, model checksum/size, provider, commands, sample counts, raw samples, failures, and network dependencies.

======================================================================
STAGE H — OPTIONAL FIREFOX AND FINAL FREEZE
======================================================================

H1. Attempt Firefox only after Chrome privacy and E2E gates pass.

H2. Use shared sanitizer logic behind a Firefox-compatible canvas host. Do not duplicate core privacy code.

H3. Label Firefox experimental until a real verified run passes.

H4. Final freeze:

- build all artifacts,
- run lint/tests/benchmarks/E2E,
- generate one final evidence directory,
- synchronize README and PPT from measured evidence,
- remove unsupported claims,
- scan for secrets,
- rotate shared API keys,
- record labelled backup video,
- do not change product code without regenerating evidence.

REQUIRED COMMANDS

Run as applicable after focused tests:

```bash
npm run build
npm test
npm run lint
npm run benchmark
npm run benchmark:browser
npm run verify:redaction
npm run test:e2e
```

Create additional scenario commands if needed, but document them in `package.json` and preserve artifacts.

STRICT FINAL DEFINITION OF COMPLETE

The project is complete for submission only when:

1. Current source builds and all tests/lint pass.
2. No raw/sensitive debug logging remains.
3. E2E artifacts contain complete per-step traces, not only final proposal.
4. False `finish` cannot produce success without terminal evidence.
5. Production pixel verification gates transmission.
6. All assessable committed sensitive fixtures are covered or honestly marked unassessable with valid replacement evidence.
7. Redaction manifest reaches and informs the server.
8. Side panel displays actual runtime/provider/payload evidence without fabricated defaults.
9. Safe click/type/select/scroll flows work where supported.
10. Delayed updates and stale targets are handled within bounds.
11. Low-confidence/ambiguous actions do not auto-execute.
12. Protected actions require fresh user confirmation.
13. At least ten E2E scenarios include success and expected safe failure paths.
14. Authorized unfamiliar-page families are tested separately from development pages.
15. Task success, wrong action, abstention, recovery, redaction, latency, resource, network, and payload-size metrics are measured.
16. Local visual UI grounding is either genuinely implemented/measured or explicitly not claimed.
17. Every result comes from one current commit/run with complete provenance.
18. README, demo, and PPT contain only measured/target/planned labels supported by evidence.

PROGRESS REPORTING

After each stage update `docs/GPT_PLAN/04_PROGRESS_TRACKER.md` with observed facts only.

At the end report:

- Stage-by-stage PASS/FAIL
- Exact files changed
- Exact commands and outcomes
- Full current test count
- E2E scenario table with success/failure and reason
- Complete privacy/redaction results
- Model/provider and local visual provider
- Latency/resource/network figures with scope
- Held-out results and gap
- Remaining limitations
- Unsupported claims removed
- External blockers, if any

Do not say "production ready," "fully local," "visual-only," "100% private," or "works on every website" unless the corresponding evidence explicitly supports that exact claim.
```
