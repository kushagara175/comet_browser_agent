# Copy-Paste Prompts for Gemini or Another Coding Agent

Use the master prompt first, then one phase prompt at a time.

## Master startup prompt

```text
You are working in the existing PrivaPilot repository at SIH_26209.

Read and obey:
- docs/00_PROBLEM_STATEMENT.md
- docs/GPT_PLAN/README.md
- docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md
- docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
- docs/GPT_PLAN/04_PROGRESS_TRACKER.md

Do not implement anything yet. First inspect the repository and report:
1. current git/worktree state,
2. relevant build/test commands,
3. whether generated artifacts appear current,
4. the exact phase you are ready to execute,
5. risks or blockers.

Do not change files until I assign a phase.
```

## Generic phase prompt

```text
Implement Phase <NUMBER>: <NAME> from docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md.

Before editing:
1. Read the full phase and master instructions.
2. Inspect every referenced source/test/script.
3. Check git status and preserve unrelated changes.
4. State the current root cause in 3-6 bullets.
5. List exact files expected to change.
6. Identify protocol, security, privacy, and generated-artifact migration risks.

Requirements:
- Complete the phase, not a superficial subset.
- Fix root causes.
- Keep changes focused and consistent with current style.
- Do not edit dist manually.
- Add focused success, failure, timeout, stale-state, and adversarial tests where relevant.
- Never weaken fail-closed behavior.
- Never invent measurements.
- Never silently downgrade vision/security behavior.
- Update docs only after validation.

Validation:
1. Run focused tests.
2. Run npm run build.
3. Run npm test.
4. Run the benchmark/E2E command required by the phase.
5. Run diagnostics/typecheck.

At completion report:
- root cause addressed,
- files changed,
- behavior changed,
- tests added,
- commands and exact results,
- measured values,
- remaining failures/limitations,
- exit gate PASS or FAIL.

Update docs/GPT_PLAN/04_PROGRESS_TRACKER.md with observed facts only.
Do not begin another phase.
```

## Phase 0 prompt

```text
Implement Phase 0: Truthful baseline and reproducibility.

Focus on real lint/typecheck, source-to-dist freshness, immutable report provenance,
real safe SHA-256 digest, zero-denominator semantics, and synchronizing public claims
with current source/evidence. Do not change product behavior beyond digest/provenance
requirements. Do not delete archived evidence; clearly isolate it.

Exit only after npm install, npm run build, npm run lint, and npm test have been run
and current public status is truthful.
```

## Phase 1 prompt — recommended first implementation phase

```text
Implement Phase 1: Production pixel redaction correctness.

Inspect:
- apps/extension/src/sanitizer/pipeline.ts
- apps/extension/src/sanitizer/mask-renderer.ts
- apps/extension/src/sanitizer/post-redaction-verifier.ts
- apps/extension/src/sanitizer/coordinate-transformer.ts
- apps/extension/src/sanitizer/face-detector.ts
- apps/extension/src/vision/face-model.ts
- apps/extension/src/harness/harness-entry.ts
- apps/extension/src/offscreen/offscreen-main.ts
- packages/protocol/src/coordinates.ts
- scripts/run-browser-benchmark.mjs
- scripts/lib/harness-runner.mjs
- relevant redaction and face tests

Current root defect: production verifies counts, not final pixels. A displaced/no-op
mask can pass. Existing browser evidence reports under-masked face and image regions.

Required:
1. Move pixel verification into a shared production sanitizer module.
2. Use the same implementation in production and browser harness.
3. Return render records keyed by region ID, requested box, and actual box.
4. Reject NaN, infinity, zero-area, invalid-space, and fully off-canvas geometry.
5. Verify opaque overlay pixels.
6. Verify face detail destruction spatially; use verified opaque fallback or block.
7. Fix face coordinate mapping across model input, screenshot, viewport, DPR, scroll,
   aspect ratio, and clipping.
8. Populate fail-closed status truthfully.
9. Guarantee failed verification prevents network-safe context.
10. Preserve and measure safe controls.

Tests must cover correct/displaced masks, unchanged pixels with matching count,
invalid geometry, DPR 1/2, non-4:3, edge clipping, effective/ineffective face blur,
opaque fallback, adjacent safe controls, and no context after failure.

Run focused tests, build, full tests, and browser benchmark. Do not begin Phase 2.
```

## Phase 2 prompt

```text
Implement Phase 2: Redaction-aware protocol and server.

Add a versioned redaction manifest to sanitized context/network payload; centralize
network projection; enforce closed server validation; derive the VLM redaction
prompt from the actual manifest; and make side-panel exact-payload evidence use the
same projection. Never include raw detector values or PII. Add migration and canary
tests. Demonstrate an intercepted real payload and generated prompt.
```

## Phase 3 prompt

```text
Implement Phase 3: Reliable E2E verification and bounded recovery.

Replace the blanket short verification window with action-aware bounded policy.
Add structured closed-schema postconditions, scroll verification, explicit passive
action semantics, failure classification, safe-action re-perception/retry, and no
automatic protected-action replay. Expand E2E into multiple scenarios. The gate is
three consecutive successful 3+ step runs, one stale-layout recovery, and one
expected fail-safe.
```

## Phase 4 prompt

```text
Implement Phase 4: Perception contracts and truthful telemetry.

Create capture-bound DOM/vision perception source interfaces, candidate/result
protocol types, deterministic same-capture fusion, disagreement handling, and real
provider/model/policy telemetry. Migrate current DOM behavior through the new seam
without adding the UI model yet. Preserve existing behavior and privacy boundaries.
```

## Phase 5 prompt

```text
Implement Phase 5: Local decision router and uncertainty gate.

Build a limited deterministic local router for safe obvious actions, a configurable
confidence/ambiguity policy, closed decision routes, and network accounting. Apply
the local gate to server proposals. Confidence 0.01 must not execute; repeated-label
ambiguity must ask/reinspect/abstain; protected actions always confirm; webpage text
must not alter system policy. Demonstrate a local action with zero network use.
```

## Phase 6 prompt

```text
Implement Phase 6: Local actionable-UI visual model.

First perform a short evidence-based model selection spike. Select a legally
redistributable compact model/approach that can detect or classify actionable UI
regions locally in the browser. Bundle model, checksum, attribution, model card,
and reproducible export. Implement explicit provider/failure telemetry, bounded
lazy inference, and DOM-inaccessible visual fixtures. No runtime model CDN fetch.
The gate requires local execution and at least one real DOM-inaccessible detection.
```

## Phase 7 prompt

```text
Implement Phase 7: Visual grounding, fusion, and safe visual execution.

Introduce discriminated DOM/visual action targets bound to capture ID. Prefer safe
visual-to-DOM association. Permit coordinate-only actions only under strict fresh,
visible, unambiguous, safe, reversible conditions with point conflict checks and
postcondition verification. Add DOM-only, vision-only, and fused benchmark modes.
The gate requires non-zero true vision-only grounding, one `both` candidate, and a
safely completed canvas-only action.
```

## Phase 8 prompt

```text
Implement Phase 8: Adaptive perception and resource governance.

Add explicit fast/thorough policies, lightweight scan, ambiguity-driven crop
inspection, bounded full-frame fallback, safe cache invalidation, explicit resource
degradation, and telemetry. Never silently skip vision while claiming fused output.
Benchmark accuracy, p50/p95 latency, resource measures, visual invocation/crop/full-
frame fallback frequency, and abstention for each policy.
```

## Phase 9 prompt

```text
Implement Phase 9: Exact runtime evidence and audit.

Remove hardcoded/default/fabricated side-panel evidence. Use the exact shared network
projection for display and transport. Show actual provider/model/policy/provenance,
confidence/risk, verification, recovery, and payload byte evidence. Expand optional
overlay without contaminating screenshots. Wire structured privacy-safe audit events
into the coordinator with retention, clear, and sanitized export.
```

## Phase 10 prompt

```text
Implement Phase 10 using docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md.

Fix metric validity, remove nominal/hardcoded scored values, use real geometry,
represent not-measured correctly, create independent held-out page/task families,
and measure DOM-only, vision-only, fused, adaptive ablations, task success, wrong and
unsafe actions, abstention, recovery, latency, network usage, redaction, and resource
boundaries. Preserve repeated raw trials in one immutable current-commit run.
```

## Phase 11 prompt

```text
Implement Phase 11: Firefox.

Create Firefox manifest/build/API adapter and a Firefox-compatible DOM canvas host
behind the same sanitizer interface. Do not duplicate detection/redaction logic.
Account for offscreen, sidebar, namespace, background, permission, screenshot, and
provider differences. Label support experimental until a real masked, verified task
completes in Firefox.
```

## Phase 12 prompt

```text
Execute Phase 12: Submission freeze.

Do not add features. Select the final commit, rebuild, run all applicable tests and
benchmarks, generate one immutable evidence directory, synchronize README/docs/PPT
only from measured evidence, scan for secrets and unsupported claims, record the
backup demo, and update the progress tracker. Any product-code change invalidates
and requires regeneration of affected evidence.
```

## Review prompt after any phase

```text
Review the just-completed phase as a hostile technical judge and security reviewer.
Do not edit first. Inspect the diff, source, tests, generated artifacts, and reported
results. Look specifically for privacy bypasses, stale capture actions, silent
fallbacks, false confidence, circular benchmarks, zero-denominator scores, hardcoded
results, source/dist drift, and claims unsupported by measured evidence. Then fix
only verified phase-related defects, rerun validation, and state whether the phase
exit gate still passes.
```
