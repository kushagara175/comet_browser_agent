# SIH 2026 — Phase Status Board

**Two independent entries, one deadline: 20 September 2026, 23:59 IST.**
Written 2 September 2026 · 18 days remaining.

This file is a *summary*. The authoritative documents are
`SIHPROJECT1/docs/EXECUTION_PLAN.md` and the Roadmap section of
`SIHPROJECT2/README.md` — update those first, then mirror here.

| | SIHPROJECT1 | SIHPROJECT2 |
| :--- | :--- | :--- |
| Name | PrivaPilot | MuleShield AI |
| Problem statement | SIH26171 (ISRO) | SIH26184 (MHA / I4C) |
| Stack | TypeScript monorepo, Chrome MV3 | Python / FastAPI + React |
| Repo | `kushagara175/SIH` · `main` | `hotshot0104/SIH2026` · `sameer` |
| Phases | 0–7, code phases largely landed | 1–5.2 landed, Phase 6 open |
| Remaining | Latency, Firefox, hardening, submission | Deck + 3-minute video |

---

## SIHPROJECT1 — PrivaPilot (SIH26171)

Plan written 31 Aug 2026 and day-numbered from there. Every phase has an **exit
gate**; do not advance past a gate that has not been demonstrated.

| Phase | Scope | Days | Exit gate | State |
| :-- | :--- | :-- | :--- | :-- |
| **0** | Repo hygiene — `git init`, workspace-local `tsc`, cross-platform `CHROME_PATH`, strip unmeasured claims, consolidate docs under `docs/` | 1 | Build and tests run clean from a fresh clone | ✅ mostly done; a few unticked items remain (E2E `CHROME_PATH`, claim-stripping sweep) |
| **1** | Make the privacy boundary real — offscreen document for canvas masking, delete the permissive fallback, real blur, honest telemetry | 1–4 | The outgoing `POST /api/v1/reason` body carries a **full-size** PNG with visible masks. A 1×1 image means Phase 1 is not done. | ✅ offscreen sanitizer running (`apps/extension/src/offscreen/`) |
| **2** | Real on-device vision model — bundled quantized face detector, no CDN, no runtime weight fetch | 4–8 | A 3-face fixture yields 3 blurred boxes from the model alone, with the engaged execution provider reported in the side panel | ✅ UltraFace ONNX, Wasm/CPU with WebGPU fallback |
| **3** | Redaction precision — per-`Range` text geometry, viewport clipping, drop the aspect-ratio face heuristic, real same-origin tests for `<canvas>` / `<iframe>`, Verhoeff for Aadhaar, merge overlapping boxes | 6–9 | Over-mask ratio measurably drops on the `profilePii` fixture | ✅ detectors landed in `packages/pii-rules/` |
| **4** | Honest benchmark harness — ground truth only from `GROUND_TRUTH_DATA`, a **held-out** corpus, real browser rendering via CDP, real resource metrics, a reporter that cannot print a fake PASS | 8–12 | Commenting out the Aadhaar rule must *lower* reported recall. If the number does not move, the harness is still circular. | ✅ non-circular, dev + held-out splits |
| **5** | Bounded multi-step agent loop — 8–12 step budget, re-perceive every step, stale-ID recovery, real postcondition verification, native-setter typing for React inputs, `classifyActionRisk()` confirmation gate | 10–14 | A 3+ step task completes end to end with a confirmation prompt on submit | ✅ `apps/extension/src/background/coordinator.ts` |
| **6** | Server, latency, demo — cut the 1.4–4.0 s server round-trip (~94% of end-to-end), hosted open-weights VLM, playbook §6.1 system prompt, raw-vs-redacted split view, 3–4 step demo task | 13–17 | The same task rehearsed live on a page nobody on the team prepared | 🔶 chat, Ollama negotiation and the mission-control HUD landed; latency work and the unseen-page rehearsal are outstanding |
| **7** | Firefox port, adversarial suite, regenerate benchmark results, backup demo video, submit | 17–20 | Every playbook §8.3 adversarial case has a passing test | ⬜ open — Firefox MV3 architecture ready, port not done |

**Current signal:** clean build, 149/149 unit and integration tests passing,
Chrome MV3 active.

**Cut order if time runs short:** 1. Firefox port → 2. local OCR for image and
canvas PII → 3. action memory cache → 4. multi-step loop beyond 3 steps.

**Never cut:** the offscreen sanitizer, the real face model, the honest
benchmark, or generic site-agnostic detection. The first three are what the
rubric scores; the fourth is what makes the score survive contact with a page
nobody has seen.

**Rubric being optimised:** visual-context accuracy 25% · PII recall and
precision 20% · redaction precision 20% · client resource use 20% ·
end-to-end latency 15%.

---

## SIHPROJECT2 — MuleShield AI (SIH26184)

Each phase carries the test count that was green when it closed.

| Phase | Scope | State |
| :-- | :--- | :-- |
| **1** | Synthetic dataset generator — 2,500 complaints, 622,304 transactions, 1,000 ATMs across 79 cities, embedded fraud rings | ✅ 84/84 |
| **2a** | Graph intelligence — NetworkX BFS traversal (<185 ms), 2-layer GraphSAGE on 15 behavioural features (F1 0.9051), sub-graph embeddings (<0.39 s) | ✅ 49/49 |
| **2b** | XGBoost ATM prediction v2 — search zone 87.3% containment, Top-3 ranking 0.5621, countdown 11.88 min MAE, 25.8 ms inference | ✅ 53/53 |
| **3** | FastAPI backend — ingestion, graph, embedding and prediction endpoints plus the `/ws/feed` broadcaster | ✅ 51/51 |
| **4** | Tactical command dashboard — triage queue, GIS map, forensic graph, 1-click interception | ✅ live on 5173 |
| **4.5** | Hardening — live complaints run the full pipeline, real velocity and fund-splitting detections, GraphSAGE classification head, bank-affinity features repaired, offline-safe fonts and basemap fallback | ✅ 275/275 |
| **4.6** | Leakage removal and honest re-baselining — mule status fixed before any transaction exists, 29,998 legitimate transactions, choice-model ground truth, complaint-level splits, 2% label noise, every metric reported against its naive baseline | ✅ 275/275 |
| **5** | Compliance remediation — clause-by-clause audit (7 BLOCKER / 11 MAJOR / 8 MINOR), server-side auth on 13 endpoints, CORS allowlist, forward hotspot forecast, `/risk` drill-down, alert engine with retry and dead-lettering | ✅ 401 passing, 1 deliberate skip |
| **5.1** | Regeneration and load verification at the PS-stated 8,000 complaints/day — found 5 defects that 397 passing tests could not: a timezone bug hiding every fresh complaint from the forecast, 17 unlocked sqlite reads producing 43 × HTTP 500, an alert-id allocator that could discard a real alert, a convergence rule raising 685 alerts in one pass, and a stale alert inbox | ✅ |
| **5.2** | Evidence documentation — SHA-256 at collection re-checked on every read (409 on mismatch), a per-case hash chain, no delete (withdrawal is a status with an actor and a reason), BSA 2023 s.63 certificate | ✅ 47 tests |
| **6** | **Live simulation demo and SIH presentation pitch** | ⬜ **open — the only remaining phase** |

**Current signal:** 481 tests passing.

**Blocking a real deployment**

- Merge `sameer` into `main` — six commits of Phase 1–6 work live only on the branch.
- The Dockerfile was written 30 Aug but **never built** (Docker Desktop was down).
  Unverified: the CPU-only torch index URL, `libgomp1` for XGBoost, and how long
  `generate_data.py` takes inside the image.
- A fresh clone needs `python scripts/generate_data.py` first — the two large
  CSVs are gitignored.

**Before demoing:** regenerate with `--mule-concentration 0.8` (the default 0.0
reproduces the old flat corpus) and copy the existing CSVs aside first — they are
not byte-reproducible, because complaint timestamps come from an unseeded
`datetime.now()`.

**Scope is frozen (30 Aug).** Do not chase the model: Top-1 sits on the Bayes
bound for this generator, so a number that improves is more likely a leak than a
gain. Before adding anything to this repo, check it beats spending the same hour
on the pitch.

---

## What actually decides the remaining 18 days

1. **MuleShield Phase 6** — the deck and the video are entirely untouched and are
   not in the repo. Largest single gap across both projects.
2. **PrivaPilot Phase 6 latency** — the server round-trip is ~94% of end-to-end
   against ~140 ms of client work. It is the only lever that moves the 15% metric.
3. **PrivaPilot unseen-page rehearsal** — the demo portal proves the story but not
   the claim. If a live public page is too fragile to attempt, that is a signal
   the pipeline is overfitted, not a reason to hide it.
4. **PrivaPilot Phase 7** — Firefox is cuttable; the adversarial suite, the
   regenerated benchmark results and a backup video are not.

No number in this file may be updated from memory or estimate. Re-run the
harness that produced it, or leave it stale and say so.
