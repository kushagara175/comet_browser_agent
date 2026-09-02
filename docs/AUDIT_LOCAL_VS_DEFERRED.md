# Verification Audit — What Is Measured Locally vs. What Is Deferred

**Purpose.** This file records exactly which claims about PrivaPilot are backed by something
that actually executes, and which are not yet verified. It exists so that no number in
`EVALUATION_REPORT.md`, the README, or a demo script is repeated without knowing what produced it.

**Last updated:** 2026-09-02 (Phase 1 complete) · **Baseline commit:** `df79c92`

---

## 0. Phase 1 outcome — the browser harness now exists

Most of what §3 previously listed as undoable is now measured. `npm run benchmark:browser`
renders every fixture in real Chrome and runs the shipped pipeline against it; `npm run test:e2e`
drives the assembled extension through its own message plumbing against a live model.

**First honest browser-measured numbers** (`BROWSER_EVALUATION_REPORT.json`):

| Metric | Weight | Measured in real Chrome |
| :--- | :---: | :--- |
| Redaction precision, **pixel-verified** | 20% | **83.3%** (15/18 regions), 3 under-masked |
| Safe-control preservation | — | **100%** (18/18) — no over-masking of buttons |
| Visual context accuracy | 25% | 78.6% recall / 78.6% precision |
| Client perception latency | part of 15% | **55 ms p50**, 99 ms p95 |
| Client memory | part of 20% | 3.94 MB peak heap |
| End-to-end with model | 15% | **41.7 s** — see §3.5, this is the headline problem |

**Real defects the harness found that no previous test could:**

1. **The extension crashed on any page containing an inline `<svg>`.** `element-extractor.ts:323`
   called `.toLowerCase()` on `el.className`, which is an `SVGAnimatedString` — not a string — on
   SVG elements. The selector on that line explicitly includes `svg`, so this aborted the entire
   DOM snapshot on most modern pages. Fixed by reading the `class` attribute instead.
2. **`captureVisibleTab` was unreachable without a user gesture.** `host_permissions` listed
   specific origins, but Chrome requires the `<all_urls>` host permission or an *activated*
   `activeTab` for screen capture. `activeTab` expires on navigation, so a multi-step run that
   navigated would have failed mid-loop. `host_permissions` is now `<all_urls>` — see §5 for the
   trade-off, which is a deliberate decision, not an oversight.
3. **A mask counted but never drawn is invisible to the product's own verifier.** Demonstrated
   during harness development: `fillRect(NaN,…)` silently no-ops while still incrementing
   `renderedMaskCount`, and the count-based `PostRedactionVerifier` passes it. Phase 2.4 closes this
   by reusing the harness's pixel check inside the product.

**Constraint this file was written under.** The development machine must not run heavy workloads —
no local VLM inference, no headless-browser benchmark sweeps, no ONNX model execution. Everything in
§1 was therefore built and verified with pure Node work only. Everything in §3 is deferred *because
of that constraint or because of a missing capability*, not because it is unimportant.

---

## 1. Fixed and verified locally

All verified by `node --test tests/*.test.js` (159/160 passing) and `node scripts/run-benchmarks.js`,
both of which are pure Node — no browser, no model, no GPU.

### 1.1 The benchmark was not measuring the product

This was the most serious finding. `packages/benchmark/src/runner.ts` did not call the shipped
detectors at all. It reimplemented "detection" as string matching against literals copied out of the
fixtures, then scored those constants:

| Detector | What the harness actually did | Consequence |
| :--- | :--- | :--- |
| DOM semantic | `html.includes('id="darkSecret"') \|\| html.includes('HiddenPass')` | `dom-semantic.ts` never executed |
| Face / vision | `html.includes('face-avatar')` → emit 2 boxes hardcoded to the ground-truth coordinates | **100% face recall reported without ever loading the ONNX model** |
| High-risk surfaces | `html.includes('class="scanned-id"')` → one fixed box | `surface-detector.ts` never executed |
| Masks | synthesized 0.01 outside each synthesized detection | `mask-renderer.ts` never executed |

The `benchmark-honest.test.js` ablation tests passed because disabling a flag skipped the
corresponding hardcoded `if` block — they validated the flag plumbing, not the detectors.

**Fixed.** The harness now parses each fixture into element descriptors
(`packages/benchmark/src/fixture-parser.ts`) and calls the real `analyzeDomElementSensitivity` and
`scanTextForPII`. Surfaces are derived from parsed tags rather than fixture literals. A new test,
*"No detector is driven by fixture-specific literals"*, fails the build if fixture identifiers
reappear in the runner.

### 1.2 Real product bugs this exposed

- **CVV fields were classified as card numbers.** `analyzeDomElementSensitivity` matched
  `autocomplete="cc-csc"` — the standard token for a card security code — against a blanket
  `startsWith('cc-')` rule. Fixed in `packages/pii-rules/src/dom-semantic.ts`; `cc-csc` is now
  checked before the generic rule. Both categories were masked either way, so this was a
  classification and reporting bug, not a leak.
- **No detection fusion.** The sanitizer's "fusion" step only concatenated detector outputs, so one
  secret found by two layers produced two regions and two masks — inflating the over-mask ratio and
  double-reporting every secret. Added `packages/pii-rules/src/fusion.ts`, which collapses
  detections of the same secret and keeps the more specific category. It never drops a region no
  other detection covers, so recall cannot decrease.

### 1.3 Ground-truth corrections

Both are recorded here because "we edited the ground truth and the score went up" is exactly the
pattern that should be challenged. Each is justified by the fixture's own content, not by what the
detector happened to output.

- **Three canary boxes were labelled `national_id`.** Their DOM context in the fixtures is
  `id="custom_token" name="data_ref"`, `Confidential Key:` and `Token:`. None is a national
  identifier; the detector's `token` classification was correct and the label was wrong. Relabelled
  to `token`, and `token` was **added to the scored categories** so the three targets are still
  counted rather than quietly dropped from the denominator.
- **The card expiry field had no ground-truth box.** `payment-portal` already declares `#cardExp`
  as `isSensitive: true` in `groundTruthElements`, and `autocomplete="cc-exp"` is card data that the
  pipeline masks — but with no box, every correct detection of it scored as a false positive. Box
  added.

### 1.4 Measured effect

| Metric | Before | After | Note |
| :--- | :---: | :---: | :--- |
| PII recall | 72.2% | **100%** | face now excluded, not fabricated |
| PII precision | 81.3% | **100%** | |
| password recall | 33.3% | **100%** | was a fixed-coordinate artifact |
| cvv recall | 100%\* | **100%** | \*previously hardcoded; now real |
| national_id recall | 40% | **100%** | mislabelled ground truth |
| Redaction coverage | 88.9% | 94.7% | 1 under-mask remains |

Ablations still respond correctly (text off → 68.4%, DOM off → 73.7%, surfaces off → 84.2%), and
the held-out split matches the dev split.

**Read this result with suspicion.** 100% on 14 fixtures authored by the same team that wrote the
detectors is weak evidence. The dev/held-out split is small and both halves are in-distribution.
This says the detectors work on the cases the team thought of; it says nothing about the unseen
evaluation set. See §3.7.

### 1.5 Model connection (from the prior session)

Gateway/model connection defects fixed and verified against a stubbed Ollama backend: loopback
probing on both `127.0.0.1` and `localhost`, probe timeout raised from 1.2 s, chat endpoint no
longer returns HTTP 500 when no model is present, embedding models excluded from auto-selection,
missing `VLM_MODEL` falls back instead of 404-ing every request.

---

## 2. Buildable locally, but NOT verifiable locally

Code can be written without load; correctness cannot be confirmed without the target environment.

### 2.1 Firefox support — a stated requirement, currently unmet

The problem statement says *"running in popular browsers (chrome, Firefox)"*. There is one Chrome
MV3 manifest. `docs/` describes Firefox as "ready", but nothing Firefox-specific exists.

Blocking API gaps, not just a manifest edit:

| Chrome API used | Firefox status | Work required |
| :--- | :--- | :--- |
| `chrome.offscreen` | **Not implemented** | The entire sanitizer host needs a different home — a hidden extension page or a worker with `OffscreenCanvas` |
| `chrome.sidePanel` | Not implemented | Port to `sidebar_action` |
| `chrome.*` namespace | `browser.*`, promise-based | Namespace shim |
| MV3 service worker | Event pages | Background script differences |

`browser-adapter.ts:291` already has a "Direct Canvas Host Path (Firefox background page)" branch,
so the seam exists. **Verification needs Firefox and `about:debugging` — cannot be done here.**

### 2.2 Client resource utilisation (20% of the score)

Reducing CPU is code work. Confirming the reduction is not: the reported figure must come from the
extension under real perception load. See §3.4.

---

## 3. Cannot be done on this machine

### 3.1 Face detection accuracy — **unmeasured, and now reported as such**

UltraFace RFB-320 needs a rendered canvas and the `onnxruntime-web` WASM/WebGPU runtime. Neither
exists in Node. Face ground-truth targets are excluded from the scores rather than counted as hits
or misses, and `EVALUATION_REPORT.md` now states this in a dedicated section.

**Required:** Chrome with the extension loaded, or a headless CDP harness. The model
(`assets/models/version-RFB-320.onnx`, 1.27 MB) and the full ORT WASM set are already vendored, so
nothing needs downloading — only executing.

### 3.2 WebGPU execution path

`face-model.ts` tries WebGPU and falls back to WASM. Only the fallback is even reachable here, and
neither is executed. Which provider actually runs on the evaluation hardware is unknown.

### 3.3 Redaction precision against real layout (20%)

A fixture is an HTML string with no layout, so all coordinates in the Node harness are synthetic.
PII detections are matched to ground truth **by the secret they found, not by position**. This is
sound for *what* is detected and worthless for *where*. Real mask coverage — the metric that decides
whether a password is actually covered by opaque pixels — requires a rendered page.

**The 1 remaining under-mask is against synthetic geometry and should not be trusted in either
direction until measured in a browser.**

### 3.4 Client CPU and memory (20%)

`~38 MB / ~178% CPU` in the report is *this Node process running regex detectors*. It is not the
browser extension, and the CPU percentage in particular is meaningless as a client-utilisation
figure. It also varies run to run (130.8% → 214.3% → 177.8% across three runs).

### 3.5 End-to-end latency (15%) — server half now measured, client half still not

`1549 ms p50` in the report is still read from `docs/benchmark-results/real-e2e-latencies.json`, a
previously recorded run — not the current one. That is why the figure is byte-identical across
machines and commits. Without that file the runner substitutes `const serverMs = 350`.

**The server half is now real.** Measured 2026-09-02 against the configured backend
(Qwen2.5-VL-72B via OpenRouter), median of 3 runs per model on an identical action-proposal prompt:

| Model | Median | Range | Correct action | Notes |
| :--- | ---: | :--- | :---: | :--- |
| `qwen/qwen2.5-vl-72b-instruct` | **592 ms** | 479–954 ms | 3/3 | configured choice |
| `qwen/qwen3-vl-8b-instruct` | 406 ms | 398–565 ms | 3/3 | fastest |
| `qwen/qwen3-vl-30b-a3b-instruct` | 1029 ms | 674–1234 ms | 2/3 | slower and less reliable |

Text-only reasoning is comfortably inside the 1200 ms target. **Attaching the sanitized screenshot
raises a full `/api/v1/reason` round trip to ~3.6 s** — image transfer and encoding dominate, not
the model. Screenshot size is therefore the lever on this metric, not model choice.

Still deferred: the client half (capture → detect → redact → verify) and the true end-to-end figure,
both of which need the browser harness. The stored 1 ms p50 client perception is not trustworthy.

### 3.6 Visual context accuracy (25% — the heaviest metric)

Currently 82.1% recall / 76.7% precision from a regex HTML parser in the harness, not from the
shipped `element-extractor.ts`, which needs a real DOM. Median IoU of 1 is an artifact of comparing
synthetic boxes to synthetic boxes. **This metric is the largest single weight in the evaluation and
is the least honestly measured.** Wiring the real extractor into a browser harness is the highest-value
remaining work.

### 3.7 Generalisation beyond the 14 authored fixtures

The evaluation use cases are supplied at the finale. Current fixtures are in-distribution for the
rules written against them. Nothing here predicts performance on unseen pages.

### 3.8 Local VLM inference — RESOLVED via hosted endpoint

Running the model locally is still excluded by the load constraint (`qwen2.5vl` is ~6 GB and wants
~8 GB RAM), but this no longer blocks anything.

**Configured and verified working 2026-09-02:** Qwen2.5-VL-72B over OpenRouter, set in `.env`
(gitignored). `modelConnected: true`; `/api/v1/reason` returns schema-valid proposals on the first
attempt with no repair pass; `/api/v1/chat` returns page-aware replies referencing the sanitized
title, elements and mask count.

Qwen2.5-VL is Apache-2.0 open weights and deployable offline via `ollama pull qwen2.5vl`, satisfying
the problem statement's requirement directly — the hosted endpoint is a deployment choice, not a
dependency, and the statement explicitly permits the cloud-hosted form during SIH.

**Key hygiene.** The API key lives only in `.env`. Verified absent from every tracked file
(`git grep sk-or-v1` → no matches). It was shared over a chat transcript, so it should be rotated
on OpenRouter once the finale is over. Never paste it into `.env.example`, a doc, or a commit.

### 3.9 The build itself is currently blocked

`node_modules/` contains only `typescript`, `@types/node` and the workspace links. **`esbuild` and
`onnxruntime-web` are missing**, so `npm run build` exits at its first check and the extension
bundles cannot be regenerated. Server and package `tsc` builds work and were used throughout.

**Consequence:** every extension-side fix in this audit is compiled into
`apps/extension/dist/background/*.js` but **not** into `dist/background/background-main.js`, which
is the esbuild bundle Chrome actually loads. Until `npm install && npm run build` runs, none of the
extension fixes reach the browser.

---

## 4. Known-failing test

`tests/server-strict-boundary.test.js` → *"Server HTTP Integration — Valid Minimized Request & 413
Oversized Body Handling"* fails with `ECONNRESET`. **Pre-existing** — verified failing identically
on unmodified `df79c92`. The server calls `req.destroy()` after writing the 413, racing the client's
read. Fix is to let the response flush before destroying the socket. Not caused by any change here.

---

## 5. Priority order for the remaining work

1. **Browser-based benchmark harness.** Unblocks §3.1, §3.3, §3.4, §3.6 — four metrics totalling
   **80% of the score** — and is the only way to replace synthetic geometry with real numbers.
2. **`npm install && npm run build`.** One command; without it none of the extension fixes ship.
3. **Firefox port.** A stated requirement with nothing behind it.
4. **Adversarial fixtures written by someone who did not write the detectors.** The single best
   defence against the overfitting risk in §1.4 and §3.7.
5. **Hosted model endpoint.** Largest available win on the latency metric, at no local cost.
