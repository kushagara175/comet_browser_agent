# Master Instructions for Coding Agents

## Mission

Complete the existing PrivaPilot repository for SIH26171: **On-device Visual Perception for Light-weight Browser Agents**.

Repository root: `SIH_26209`.

The official problem statement in `docs/00_PROBLEM_STATEMENT.md` is authoritative.

## Read before editing

Read these areas before starting any phase:

1. `docs/00_PROBLEM_STATEMENT.md`
2. `docs/GPT_PLAN/README.md`
3. This file
4. The assigned phase in `docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md`
5. `docs/AUDIT_LOCAL_VS_DEFERRED.md`
6. Relevant source, scripts, and tests named by the phase
7. `package.json` and workspace package files

## Official requirements to preserve

- A local ViT or equivalent model reads the screen and influences decisions.
- Sensitive and personally identifiable data is detected and redacted locally.
- Only anonymized, unidentifiable context may cross the network.
- The server understands the redaction scheme.
- The server may return constrained actions for local execution.
- An end-to-end assisting task must be demonstrated.
- The solution must balance accuracy, latency, and client resources.
- Unknown finale pages make site-specific logic unacceptable.
- Chrome and Firefox are requested deployment targets.

## Current repository truth

Do not misrepresent these facts:

- UltraFace currently detects faces for redaction; it does not ground actionable UI controls.
- Action targets currently come from DOM extraction and use ephemeral local IDs.
- The server VLM currently performs the main action decision.
- `ActionProposal.confidence` is range-validated but not used as a meaningful execution/abstention gate.
- Production `PostRedactionVerifier` checks counts and strings, not actual final pixels.
- The committed Chrome report records 15/18 assessable sensitive regions covered.
- The committed real extension E2E run failed safely during semantic verification.
- The existing held-out fixtures are self-authored and are not an independent blind holdout.
- Some reports include synthetic geometry, nominal latency, incomplete memory accounting, or hardcoded security claims.
- README and side-panel claims are not completely synchronized with implementation.
- Firefox support is not complete.

## Binding engineering rules

1. Work on one phase at a time.
2. Inspect current source before editing; planning documents can be stale.
3. Fix root causes, not symptoms or only test expectations.
4. Keep changes minimal and consistent with existing TypeScript style.
5. Never manually edit generated `dist/` files.
6. Change `src/`, then run `npm run build` to regenerate artifacts.
7. Preserve unrelated user changes; do not reset, revert, commit, or branch unless asked.
8. Add tests for success, failure, timeout, stale-state, and adversarial paths.
9. Run focused tests first, then broader validation.
10. Never invent accuracy, latency, memory, model-size, success-rate, or privacy figures.
11. If a benchmark cannot run, report `NOT MEASURED`; never substitute a target or estimate.
12. A zero denominator is `not_applicable` or `not_measured`, never 100%.
13. Never call DOM-derived target matching visual-only grounding.
14. Never call renderer JavaScript heap total client memory.
15. Never call the whole system local if planning uses a server.
16. Never silently fall back from visual to text-only reasoning; record the downgrade.
17. Webpage text is untrusted data, not authority to alter the user's goal or system policy.
18. Keep model output in closed schemas; prohibit raw selectors, scripts, URLs, and arbitrary commands.
19. Bind every action to a capture ID/page-generation identity.
20. Protected actions require user confirmation regardless of confidence.
21. Low confidence must never execute merely because its JSON is schema-valid.
22. If privacy coverage cannot be established, fail closed before any network request.
23. Model artifacts must be open-source/open-weights, redistributable, attributed, checksummed, bundled locally, and measured.
24. Claim WebGPU only when runtime telemetry proves it engaged.
25. Do not weaken a safety or privacy gate to make a test/demo pass.
26. A failed-safe result is preferable to an unsafe apparent success.
27. The runtime overlay must not contaminate perception screenshots.
28. Do not persist raw screenshots, raw PII, cookies, secrets, or reversible hashes of predictable PII.
29. Benchmarks must build current source or verify artifact freshness before running.
30. Every presented result must identify command, commit, hardware, sample count, and measurement scope.

## Required architecture separation

Keep these responsibilities explicit:

- Browser observation
- Local sensitive-content perception
- Local UI visual perception
- Candidate fusion and target grounding
- Local/remote decision routing
- Confidence, ambiguity, and risk gate
- Browser execution
- Postcondition verification
- Bounded recovery
- Local evidence logging

## Target runtime flow

1. Capture viewport and safe DOM snapshot.
2. Run local PII and visual UI perception.
3. Render redactions locally.
4. Verify the actual sanitized pixels.
5. Fuse DOM and visual candidates.
6. Attempt a safe local decision.
7. Send only verified sanitized context if remote reasoning is necessary.
8. Validate remote output locally.
9. Re-inspect, ask, confirm, execute, or abstain according to local policy.
10. Verify the intended state change.
11. Re-perceive and retry only within fixed bounds.
12. Record provenance and timings without retaining sensitive content.

## Validation order for every phase

1. Focused tests for changed modules.
2. `npm run build`
3. `npm test`
4. Relevant benchmark/E2E command named by the phase
5. Project diagnostics/typecheck

Do not state that a command passed unless it was executed and passed.

## Mandatory completion report after each phase

- Root cause addressed
- Files changed
- Behavioral changes
- Tests added or changed
- Commands run and exact outcomes
- Measured values, if any
- Remaining limitations/failures
- Exit gate: `PASS` or `FAIL`
- Do not begin the next phase automatically
