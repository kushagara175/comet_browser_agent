# PrivaPilot (SIH26171) — Execution Plan

**Deadline:** 20 September 2026, 23:59 IST · **Plan written:** 31 August 2026 · **Days remaining: 20**

> Source of truth for design decisions remains [`SIH26171_WINNING_EXECUTION_PLAYBOOK.md`](SIH26171_WINNING_EXECUTION_PLAYBOOK.md).
> Binding working rules are in [`AGENT_RULES.md`](AGENT_RULES.md) — read that before any coding session.

---

## 1. Where the project actually stands

### What works (verified 31 Aug 2026)

| Check | Result |
| :--- | :--- |
| `npm install` | 11 packages, 0 vulnerabilities |
| `npm run build` | All 6 workspace packages compile clean (TypeScript 7.0.2, strict) |
| `npm test` | **16 / 16 pass** in ~143 ms |

Genuinely strong assets to build on, not replace:

- **`packages/protocol/`** — the type-level privacy boundary. `_brand` fields make `RawCapture`
  structurally unassignable to a network client; coordinate spaces are separate types
  (`ScreenshotPixelBox` vs `ViewportCssPixelBox`), designing out the classic mask-misalignment bug.
- **`packages/pii-rules/`** — real regex detectors with Luhn validation and overlap suppression.
- **`apps/server/`** — closed-schema validation, canary scanner, header scrubbing, and a VLM adapter
  that auto-probes Ollama → LM Studio → cloud → mock.
- **`SIH26171_WINNING_EXECUTION_PLAYBOOK.md`** — a self-aware, well-reasoned spec.

### What is broken — audit findings

| # | Defect | Rubric impact |
| :-: | :--- | :--- |
| 1 | `SanitizerPipeline.sanitize()` is called from the **MV3 service worker** (`coordinator.ts:123`), where `document`/`Image` do not exist. It falls through to the fallback at `pipeline.ts:107`, emits a **1×1 transparent PNG** as the "sanitized screenshot", and sets `renderedCount = allRegions.length` so `PostRedactionVerifier` passes on a fake. **No pixel is ever masked in the real extension.** | 20% redaction — currently 0 |
| 2 | **No on-device vision model exists.** Zero `onnxruntime-web`, `transformers.js`, or WebGPU in the tree. `face-detector.ts` is aspect-ratio + CSS-class heuristics. `README.md` claims "BlazeFace ONNX"; `sidepanel.html:60` prints "enabled (WebGPU)". | 25% + 20% resting on a claim |
| 3 | `benchmark/src/runner.ts` pushes to `detections` **and** `groundTruth` inside the same loop with identical values — 100%/100% is mathematically guaranteed regardless of code quality. `GROUND_TRUTH_DATA` exists but is never imported. Memory `62.4 MB` and CPU `5.8%` are hardcoded literals in `latency-profiler.ts`. | all 5 metrics unevidenced |
| 4 | `EVALUATION_REPORT.md` reports **2292 ms measured against a <1200 ms target** and marks it **"✅ PASSED"**. | credibility with an ISRO jury |
| 5 | Systematic over-masking: `text-detector.ts` masks the whole **parent element** rect per match; any 32–500 px image with 0.6–1.4 aspect ratio is called a face; every `<canvas>` and `<iframe>` is unconditionally `isCrossOriginOrUninspectable`. | 20% redaction precision |
| 6 | `coordinator.startRun()` performs **one** capture → action → execute cycle. No agent loop, so no end-to-end task completion — which the PS explicitly requires. | demo viability |
| 7 | No `.git` directory. **Nothing is version-controlled.** | total loss risk |

### Official evaluation rubric — what we are optimising

| Metric | Weight | Current state |
| :--- | :-: | :--- |
| Accuracy of visual context from screen | 25% | extractor exists, unmeasured |
| Recall & precision for sensitive/PII detection | 20% | good rules, circular benchmark |
| Precision of redaction | 20% | **not running at all** |
| Client-side resource utilization | 20% | hardcoded fake numbers |
| Overall end-to-end task latency | 15% | honestly measured; server is 94% of it |

---

## 2. Phase 0 — Repo hygiene · Day 1 (~2h)

Cheap, unblocks everything.

- [ ] `git init`, add `.gitignore` coverage for `dist/` and `node_modules/`, initial commit. **Do this first.**
- [ ] `scripts/build.js` — replace `npx tsc` with the workspace-local `node_modules/.bin/tsc`, so a
      missing install can never silently fetch the decoy `tsc@2.0.4` package from npm (this is what
      made the build appear broken).
- [ ] `scripts/run-e2e-chrome.js` — `CHROME_PATH` is hardcoded to `/Applications/Google Chrome.app/…`,
      so it only runs on macOS. Resolve per-platform (macOS / Windows / Linux) with a `CHROME_PATH`
      environment-variable override.
- [ ] `README.md` — every link points at `file:///Users/kushagrasingh/dev/SIH_26209/docs/…`: wrong PS
      number, absolute macOS paths, broken everywhere. Convert to relative paths.
- [ ] Strip unmeasured claims: `README.md` (`<350MB VRAM`, `<15% CPU`, `>98% recall`, `<1.2s`) and
      `apps/extension/src/sidepanel/sidepanel.html:60` ("Face & avatar blur filters **enabled (WebGPU)**").
      Replace with "measured — see `docs/benchmark-results/`" until a real number exists.
- [ ] Move `docs/benchmark-results/EVALUATION_REPORT.*` into `docs/benchmark-results/archive/`.
      These are not evidence and must never be cited.

---

## 3. Phase 1 — Make the privacy boundary real · Days 1–4 · **P0, blocks everything**

The single most important fix. Until it lands, the product does not do what it claims.

### 1.1 Offscreen document for sanitization
Chrome MV3 service workers have no DOM, so canvas masking cannot run there.

- [ ] Add `"offscreen"` to `permissions` in `apps/extension/manifest.json`.
- [ ] Create `apps/extension/src/offscreen/offscreen.html` + `offscreen-main.ts`.
- [ ] `coordinator.ts` stops calling `SanitizerPipeline.sanitize()` directly — it creates/reuses the
      offscreen document, posts `{ rawCapture, snapshot, goal }`, and awaits a `SanitizedContext`.
- [ ] Route this through the existing `BrowserAdapter` (`apps/extension/src/browser/browser-adapter.ts`)
      via a new `runInSanitizerHost(payload)` method. Playbook §4.1 requires Chrome-specific code stay
      behind the adapter so Firefox can swap in a background page later.

### 1.2 Delete the permissive fallback
- [ ] Remove the `else` branch at `pipeline.ts:107`. With no canvas available it must **throw**, the
      coordinator transitions to `blocked-local-only`, and the UI shows the playbook §3.2 message.
      Fail closed — never permissive.
- [ ] `renderedCount` must be what `MaskRenderer` actually drew, never assumed from `allRegions.length`.
- [ ] Add a test asserting sanitization **without** a canvas throws instead of returning a payload.

### 1.3 Real blur
- [ ] `mask-renderer.ts` implements `gaussian_blur` as a flat `rgba(180,180,180,0.95)` fillRect.
      Replace with `ctx.filter = 'blur(Npx)'` over a re-drawn source region, or downscale→upscale
      pixelation. Either is defensible; the current one is not a blur and must not be called one.
- [ ] Keep opaque masks for everything else (playbook §3.5).

### 1.4 Honest telemetry
- [ ] `coordinator.ts` sets `t2 = Date.now()` immediately after `t1`, and `t5` immediately after `t4`,
      so the detection and validation buckets are empty while the real work happens inside `sanitize()`.
      Return real `t_detect` / `t_render` / `t_verify` marks from the sanitizer and thread them through
      `RunTelemetry`.

> **Exit gate.** Load the unpacked extension in Chrome against `apps/demo-portal`. The outgoing
> payload's `screenshot` must be a full-size PNG with visible masks over the password field, email,
> phone, employee ID, and avatar. **If it is a 1×1 image, Phase 1 is not done.**

---

## 4. Phase 2 — Real on-device vision model · Days 4–8 · **P0**

The PS requires "a client-side vision model running in the browser (e.g., via WebGPU) that evaluates
the current screen state." Playbook §4.4 is right that the MVP should be **one bundled quantized face
detector**, not a generic ViT bolted on to satisfy a keyword. Follow that.

- [ ] Add `onnxruntime-web` to `apps/extension`. **Bundle the `.wasm` artifacts and the model file
      locally** — no CDN, no runtime weight fetch. An extension that downloads its model over the
      network undercuts the entire privacy argument.
- [ ] Create `apps/extension/src/vision/face-model.ts` — loads a quantized face detector
      (BlazeFace / UltraFace-320 ONNX, ~1–2 MB) inside the Phase 1 offscreen document.
- [ ] Execution providers in order `webgpu` → `wasm`. Per playbook §4.1, **correctness must not depend
      on WebGPU**: WASM is the correctness path, WebGPU is the accelerator. Log which provider actually
      engaged and surface it in the side panel — a truthful telemetry line, unlike the current hardcoded one.
- [ ] Rewrite `apps/extension/src/sanitizer/face-detector.ts` to consume real model boxes. Keep the DOM
      avatar heuristic as a **union** fallback (playbook §5.1: union, never intersection) so recall
      never regresses below today's.
- [ ] Run the model on the captured screenshot bitmap in the offscreen document — not on `<img>` elements.
- [ ] Fail-closed: if the model fails to load or times out, mask all image elements wholesale and record
      the degradation. Never silently skip.

> **Exit gate.** A fixture page with three photographed faces produces three blurred boxes from the
> model alone, verified with the DOM heuristic disabled.

---

## 5. Phase 3 — Redaction precision · Days 6–9 · 20% of score

Over-masking reads as "safe" but scores badly and looks crude to a judge.

- [ ] **`text-detector.ts` — the biggest single win.** It masks `node.boundingClientRect`, which is the
      **parent element's** rect, once per match over the same box. Replace with per-match geometry:
      build a `Range` over the matched substring offsets already returned by `scanTextForPII`, then use
      `range.getClientRects()`.
- [ ] **`element-extractor.ts`** — text nodes are collected with no viewport clipping, so off-screen text
      produces masks at off-screen coordinates. Clip to the viewport.
- [ ] **`face-detector.ts`** — drop the blanket "any 32–500 px image with 0.6–1.4 aspect ratio is a face"
      rule once the real model lands. Keep only explicit avatar/profile signals.
- [ ] **`element-extractor.ts` surfaces** — every `<canvas>` and `<iframe>` is hardcoded
      `isCrossOriginOrUninspectable: true`. Test same-origin accessibility first; mask the full rect only
      when genuinely uninspectable (playbook §3.6).
- [ ] **`regex-patterns.ts`** — add the **Verhoeff checksum** for Aadhaar. `AADHAAR_REGEX` currently
      matches any 12-digit run starting 2–9 and will collide with order numbers and phone strings.
      Verhoeff removes most false positives and directly lifts the precision metric. Mirror the existing
      `luhn.ts` pattern.
- [ ] Use the existing `mergeBoundingBoxes()` in `packages/protocol/src/coordinates.ts` to unify
      overlapping regions before rendering. It exists and is tested — do not write a second one.

---

## 6. Phase 4 — Honest benchmark harness · Days 8–12 · gates every number you quote

`packages/benchmark/src/runner.ts` must be rewritten. Today it derives ground truth from detector
output, so it cannot fail.

- [ ] Ground truth comes **only** from `packages/test-fixtures/src/ground-truth.ts` (`GROUND_TRUTH_DATA`),
      which already has real annotations and is currently unused. Extend it to all 14 fixtures.
- [ ] Render each fixture in a **real browser** — extend the already-CDP-based `scripts/run-e2e-chrome.js`
      — and run the actual client pipeline against it. No string-matching on raw HTML.
- [ ] **Visual context (25%)** — element recall/precision, role accuracy, median IoU against annotated
      actionable elements. `accuracy-metrics.ts` currently compares an array to itself.
- [ ] **PII (20%)** — box-level TP/FP/FN at IoU ≥ 0.5 against `groundTruthBoxes`, per category.
- [ ] **Redaction (20%)** — ground-truth area coverage, **plus** an over-mask ratio (masked ÷ ground-truth
      area) and a safe-element-preservation count. Report both; over-masking must be visible as a cost.
- [ ] **Resource (20%)** — real measurement via CDP `Performance.getMetrics` and `performance.memory`.
      Delete the hardcoded `62.4` / `5.8` from `latency-profiler.ts`.
- [ ] **Latency (15%)** — keep the honest `real-e2e-latencies.json` approach; report p50/p95 split into
      client and server.
- [ ] **The reporter must not lie.** `reporter.ts` needs a real verdict function: `measured <= target`,
      no exceptions. A FAILED row in your own report buys credibility; a fake PASSED row is what loses
      the round.
- [ ] Store every result alongside its git SHA and the exact command that produced it.

---

## 7. Phase 5 — Multi-step agent loop · Days 10–14

The PS requires "An end-to-end task assisting the user should be demonstrated."

- [ ] Wrap the existing cycle in a loop with a **step budget** (8–12) and goal-completion detection via
      the `finish` action kind already in `ActionProposal`.
- [ ] Re-capture and re-sanitize before **every** step (playbook §6.4). Element IDs are ephemeral.
- [ ] Stale-ID handling: if `elementMap.get()` misses, do not act — re-perceive (playbook §8.3).
- [ ] `SemanticStateVerifier.verifyOutcome()` currently falls through to
      `document.readyState === 'complete'`, i.e. it always returns true. Implement real postconditions
      per playbook §6.3 — target/landmark mutation, visibility or enabled-state change, URL change —
      with a bounded timeout. Image diff only as corroboration.
- [ ] `ActionExecutor.execute()` sets `.value` directly on `type`; React's synthetic event system ignores
      that. Use the native setter
      (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set`) before
      dispatching `input`. The `controlledReactInput` fixture already exists to test this.
- [ ] Reuse `classifyActionRisk()` in `packages/protocol/src/action.ts` for the confirmation gate — it
      works and is tested. Do not reimplement.

---

## 8. Phase 6 — Server, latency, demo · Days 13–17

- [ ] **Latency.** The server round-trip is **1.4–4.0 s** — ~94% of end-to-end, against ~140 ms of client
      work. This is the only lever that matters. In order: a smaller/faster hosted open-weights VLM;
      downscale the sanitized screenshot before sending; send DOM-only context when there is no visual
      ambiguity; cache repeated `(goal, page-signature)` → action.
- [ ] **Hosting.** Use a **cloud-hosted open-weights** model (Qwen2.5-VL via Groq / Together / OpenRouter)
      — explicitly PS-permitted during SIH, and it removes any dependency on the build machine's GPU.
      `apps/server/src/engines/vlm-engine.ts` already handles the adapter logic: just set `VLM_ENDPOINT`,
      `VLM_API_KEY`, `VLM_MODEL`. Document the self-host path for the "offline deployable" requirement.
- [ ] **System prompt** must state the playbook §6.1 clauses: redactions are intentional; never ask for
      unredacted content; choose one action; use local IDs only; express uncertainty; request confirmation
      for protected actions; return schema-valid JSON only.
- [ ] **Side panel.** The raw-vs-redacted split view is the demo's whole argument. Wire it to real Phase 1
      data and show the live network payload so a judge can see exactly what left the machine.
- [ ] **Demo task.** Extend the existing `apps/demo-portal` "Valley Workspace Hub" — it already carries a
      password, email, phone, employee ID and avatar — into a 3–4 step approval workflow. Do not build a
      new fixture from scratch.

---

## 9. Phase 7 — Firefox, hardening, submission · Days 17–20

- [ ] Firefox port behind the existing `BrowserAdapter`. `chrome.offscreen` does not exist there — use a
      background page/worker. **If it has not landed cleanly by Day 19, cut it** and say so honestly.
      One browser working beats two half-working.
- [ ] Complete the playbook §8.3 adversarial suite. Four cases exist in `tests/adversarial.test.js`; add:
      secret in input value, secret in placeholder/aria-label, secret in canvas, detector timeout,
      stale local ID, animated page.
- [ ] Regenerate `docs/benchmark-results/` from the real harness. Whatever it says is what you present.
- [ ] Record a backup demo video.
- [ ] Submit before **20 September 2026, 23:59 IST**.

### Cut order if time runs short
1. Firefox port
2. Local OCR / text-region detection for image and canvas PII (playbook already calls this stretch)
3. Action memory cache
4. Multi-step loop beyond 3 steps

**Never cut:** the offscreen sanitizer, the real face model, the honest benchmark.

---

## 10. Machine requirements

The architecture is deliberately light on the build machine: the heavy model lives on the server, and
the in-browser model is a 1–2 MB quantized detector, not a VLM. Any modern laptop can run the whole
client side and all development.

**Minimum for development and the live demo**

| Requirement | Why |
| :--- | :--- |
| Node.js 20+ and npm | Monorepo build, tests, server, demo portal |
| A recent Chrome or Chromium (WebGPU-capable) | Extension host; WebGPU accelerates the face detector |
| ~8 GB RAM | Chrome + extension + local dev server concurrently |
| ~5 GB free disk on the drive Chrome caches to | ONNX weights and `node_modules` |
| An up-to-date GPU driver | Stale drivers are the usual cause of WebGPU silently falling back |

**Not required:** a discrete GPU, and any local hosting of the server-side VLM. A 7B-class VLM needs
roughly 6–8 GB of VRAM; the PS explicitly permits a cloud-hosted open-weights model during SIH, so
Phase 6 uses one. WASM remains the correctness path if WebGPU is unavailable on the build machine.

**Before demo day:** close other applications, confirm WebGPU is active at `chrome://gpu`, and note in
the side panel which execution provider actually engaged — never claim WebGPU without checking.

---

## 11. Verification

Run after each phase; all must pass before moving on.

```bash
# from the repository root
npm install
npm run build          # all 6 packages compile clean
npm test               # 16 existing + new phase tests
npm run test:canary    # canary must never appear in any payload
npm run benchmark      # after Phase 4: real numbers, honest verdicts
npm run test:e2e       # after the Phase 0 platform fix
```

Manual gates automation cannot cover:

1. **Phase 1** — load the unpacked extension, run against `npm run dev:portal` (localhost:4500), open
   DevTools → Network on the service worker, inspect the `POST /api/v1/reason` body. The `screenshot`
   field must be a full-size PNG with visible masks. Save it and confirm the password, email, phone,
   employee ID and avatar are covered. **If it is a 1×1 image, Phase 1 is not done.**
2. **Phase 2** — disable the DOM avatar heuristic, load a 3-face fixture, confirm the model alone produces
   3 boxes. Confirm the side panel reports the execution provider that actually engaged.
3. **Phase 3** — visually diff masked output before/after on `profilePii`; the over-mask ratio must drop.
4. **Phase 4** — deliberately break a detector (comment out the Aadhaar rule) and confirm the benchmark
   **reports lower recall**. If the number does not move, the harness is still circular.
5. **Phase 5** — complete a 3+ step task on the demo portal end to end, with a confirmation prompt
   appearing on the submit step.
6. **Phase 7** — every playbook §8.3 adversarial case has a passing test.
