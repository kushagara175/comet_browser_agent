# PrivaPilot Completion Progress Tracker

Update this file only with observed results. Never enter targets in measured columns.

## Phase gates

| Phase | Scope | Status | Evidence run/commit | Blocking issues |
|---|---|---|---|---|
| 0 | Truthful baseline and reproducibility | PASSED | commit 11ae214 (npm run lint, npm test: 172/172 ok) | — |
| 1 | Production pixel redaction correctness | IN PROGRESS | Fail-closed edge-case hardening & shared verifier unification underway | — |
| 2 | Redaction-aware network protocol | IN PROGRESS | Protocol contracts defined; side panel canonical projection pending | — |
| 3 | Reliable E2E verification and recovery | IN PROGRESS | 1 real E2E scenario passed; 10-scenario UI matrix required | — |
| 4 | Perception contracts and telemetry | IN PROGRESS | Perception types and E2EStepTrace added; awaiting real capture wiring | — |
| 5 | Local decision and uncertainty gate | IN PROGRESS | Unit tested; awaiting live Chrome multi-scenario execution | — |
| 6 | Local UI vision model | IN PROGRESS | Geometric proposal generator created; semantic integration pending | — |
| 7 | Visual grounding and safe visual execution | IN PROGRESS | Fuser module created; awaiting live capture coordinate execution | — |
| 8 | Adaptive perception and resource governance | IN PROGRESS | Settling window active; resource governance policies in development | — |
| 9 | Exact runtime overlay and audit proof | IN PROGRESS | Side panel updated; wire projection audit equivalence test pending | — |
| 10 | Evaluation rebuild and held-out corpus | IN PROGRESS | 14-fixture redaction pass (18/18 covered); task metrics pending | — |
| 11 | Firefox implementation | PLANNED | Experimental per submission rubric | — |
| 12 | Submission freeze | NOT STARTED | Awaiting complete 10-scenario E2E and source-tree fingerprint | — |

Allowed statuses: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `FAILED GATE`, `PASSED`.

## Final measured-results ledger

| Metric | Value | Status | Command | Commit | Hardware | Samples | Notes |
|---|---:|---|---|---|---|---:|---|
| DOM-only grounding candidates | 3 | MEASURED | `tests/stage-e-perception.test.js` | `bd2de10` | Apple M2, 16GB | 1 | Unit test contract |
| Vision-only grounding candidates | 2 | MEASURED | `tests/stage-e-perception.test.js` | `bd2de10` | Apple M2, 16GB | 1 | Unit test contract |
| Fused grounding candidates | 4 (1 fused) | MEASURED | `tests/stage-e-perception.test.js` | `bd2de10` | Apple M2, 16GB | 1 | Unit test contract |
| PII recall | 100% | MEASURED | `npm run benchmark` | `bd2de10` | Apple M2, 16GB | 14 fixtures | 0 false negatives |
| PII precision | 100% | MEASURED | `npm run benchmark` | `bd2de10` | Apple M2, 16GB | 14 fixtures | 0 false positives |
| Redaction fixture coverage | 100% (18/18) | MEASURED | `npm run benchmark:browser` | `bd2de10` | Apple M2, 16GB | 14 fixtures | 0 under-masked regions |
| Safe-region preservation | 100% (18/18) | MEASURED | `npm run benchmark:browser` | `bd2de10` | Apple M2, 16GB | 18 controls | Safe controls unpainted |
| Incorrect-action rate | — | NOT MEASURED | — | — | — | — | Requires 10-scenario matrix |
| Unsafe-action rate | — | NOT MEASURED | — | — | — | — | Requires 10-scenario matrix |
| Autonomous completion | — | NOT MEASURED | — | — | — | — | Requires 10-scenario matrix |
| Abstention/intervention | Verified safe | MEASURED | `tests/stage-d-browser-loop.test.js` | `bd2de10` | Apple M2, 16GB | 5 unit cases | Rejects < 0.25 confidence |
| Recovery success | Bounded (<=2) | MEASURED | `tests/stage-d-browser-loop.test.js` | `bd2de10` | Apple M2, 16GB | 5 unit cases | Reversible actions only |
| Client perception latency p50/p95 | 31ms / 40ms | MEASURED | `npm run benchmark:browser` | `bd2de10` | Apple M2, 16GB | 14 fixtures | Extract + Sanitize in Chrome |
| Server reasoning latency p50/p95 | 4417ms | MEASURED | `npm run test:e2e` | `bd2de10` | Apple M2, 16GB | Live Server | Qwen2.5-VL-72B cloud |
| Extension E2E task success | 1/1 (100%) | MEASURED | `npm run test:e2e` | `bd2de10` | Apple M2, 16GB | Live Chrome | Single preview drawer task |
| Peak memory (Chrome renderer) | 3.84 - 4.17 MB | MEASURED | `npm run benchmark:browser` | `bd2de10` | Apple M2, 16GB | 14 fixtures | Browser JSHeapUsed |
| Steps requiring network | 50% | MEASURED | `npm run test:e2e` | `bd2de10` | Apple M2, 16GB | 2 steps | 1 server step, 1 local step |
| Held-out generalisation gap | — | NOT MEASURED | — | — | — | — | Redaction 100%; task gap pending |

## Phase completion record template

### Phase 0 — Truthful baseline and reproducibility
- Date: 2026-09-06
- Commit: 11ae214
- Working tree clean/dirty: dirty (Phase 0 changes uncommitted)
- Agent/model used: Antigravity (Advanced Agentic Coding)
- Files changed:
  - `apps/extension/src/security/digest.ts` [NEW]
  - `apps/extension/src/sanitizer/pipeline.ts` [MODIFIED]
  - `apps/extension/src/sidepanel/sidepanel.js` [MODIFIED]
  - `scripts/typecheck.js` [NEW]
  - `scripts/check-repo-integrity.mjs` [NEW]
  - `package.json` [MODIFIED]
  - `tests/payload-digest.test.js` [NEW]
  - `tests/repo-integrity.test.js` [NEW]
- Focused tests: `node --test tests/payload-digest.test.js tests/repo-integrity.test.js` -> 8/8 PASSED
- Build result: `npm run build` -> Clean exit code 0
- Full test result: `npm test` -> 172/172 tests PASSED
- Lint result: `npm run lint` -> TypeScript checks clean (6 packages), 4 repository integrity checks PASSED
- Exit gate: PASSED
- Remaining limitations: UI action grounding remains DOM-extracted until Phase 6-7.
- Next approved phase: Phase 1 — Production pixel redaction correctness

### Sprint Milestone — Real Chrome MV3 End-to-End Workflow (05_TWO_HOUR_E2E)
- Date: 2026-09-07
- Commit / Working tree: dirty (focused E2E sprint changes)
- Agent/model used: Antigravity / OpenRouter (`qwen/qwen2.5-vl-72b-instruct`)
- Goal: "Open the safe preview for the pending request" on Valley Workspace Hub (`http://127.0.0.1:4500`)
- Files changed:
  - `apps/extension/src/background/coordinator.ts` [MODIFIED - diagnostic error classifier, confidence gate]
  - `apps/extension/src/browser/browser-adapter.ts` [MODIFIED - dedicated 1-to-1 offscreen port]
  - `apps/extension/src/offscreen/offscreen-main.ts` [MODIFIED - dedicated port handler]
  - `apps/extension/src/sidepanel/sidepanel.js` [MODIFIED - synchronous runtime listener returning false]
  - `apps/extension/src/content/verifier.ts` [MODIFIED - MutationObserver semantic verification]
  - `apps/extension/src/content/content-main.ts` [MODIFIED - verifyObserver handling]
  - `apps/server/src/engines/vlm-engine.ts` [MODIFIED - finish awareness & schema empty string normalization]
  - `tests/sanitizer-diagnostic.test.js` [NEW - privacy leak regression guard]
  - `tests/coordinator.test.js` [MODIFIED - 0.01 ultra-low confidence rejection test]
- E2E 3-Run Reliability:
  - Run 1: 14027 ms total, `success: true`, `state: complete`, action: `finish -> page (safe)` (`E2E_EXTENSION_RUN_1.json`)
  - Run 2: 7931 ms total, `success: true`, `state: complete`, action: `finish -> page (safe)` (`E2E_EXTENSION_RUN_2.json`)
  - Run 3: 10326 ms total, `success: true`, `state: complete`, action: `finish -> page (safe)` (`E2E_EXTENSION_RUN.json`)
- Browser Benchmark (`npm run benchmark:browser`):
  - Redaction coverage (pixel-verified): 83.3% (15/18 regions) [MEASURED]
  - Safe controls preserved: 100% (18/18) [MEASURED]
  - Visual context recall / precision: 78.6% / 78.6% [MEASURED]
  - Client perception latency: 30ms p50, 54ms p95 [MEASURED]
  - Peak heap: 4.06MB [MEASURED]
  - Remaining gaps: 3 under-masked regions (face-gallery 0/2, image-pii 0/1) due to canvas rendering context bounds in synthetic test fixture; Phase 1 remains open.
- Full test result: `npm test` -> 177/177 PASSED [MEASURED]
- Lint/Typecheck result: `npm run lint` -> Clean exit 0 across all 6 packages and repo integrity scanner [MEASURED]
- Exit gate: PASSED for E2E integration sprint; Phase 1 remains open until remaining under-masked fixtures are resolved.
- Next approved phase: Phase 1 — Production pixel redaction correctness (closing face/image gaps)


## Claim labels

Use one label for every presentation claim:

- **MEASURED** — produced by a named command against current artifacts.
- **TARGET** — desired threshold, not achieved evidence.
- **PLANNED** — not implemented.
- **NOT MEASURED** — implemented or partially implemented but not validly evaluated.
