# PrivaPilot — Phase Status Board

**SIH26171 (ISRO / Department of Space) · Deadline 20 September 2026, 23:59 IST.**
Rewritten 2 September 2026 (second revision) to close the three gaps that stood
between the previous board and *complete* satisfaction of the problem statement.

This file is a *summary*. The authoritative record of what is measured versus
merely claimed is [`AUDIT_LOCAL_VS_DEFERRED.md`](AUDIT_LOCAL_VS_DEFERRED.md) —
update that first, then mirror here. [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md) is
the strategy behind this board. [`00_PROBLEM_STATEMENT.md`](00_PROBLEM_STATEMENT.md)
is authoritative and overrides both.

Phases are **not** day-numbered. They are ordered by dependency and by which
problem-statement clause they satisfy; scheduling is the team's call.

---

## What changed in this revision, and why

The previous board (R0–R8) closed every *explicit* PS sentence. Reviewing it
against the PS line by line surfaced three things it did **not** guarantee:

| Gap | The PS text it touches | Old board | Now |
| :-- | :--- | :--- | :--- |
| UltraFace is a CNN/SSD detector, not a ViT | *"a local **Vision Transformer (ViT)** or equivalent computer vision model"* | leaned on *"or equivalent"* | **R3** ships an actual ViT |
| Vision only acted where the DOM failed, so the 25% metric stayed a DOM result in practice | *"reads the user's screen and takes decisions based on that"* | R3 gated on a canvas-only fixture | **R4** runs vision on every page and reports a **DOM-ablated** score |
| Generalisation was a corpus task, not a measured property | *"Use cases for evaluation will be provided during finale"* | R6 held-out corpus | **R7** reports the dev↔held-out **gap** as a number |

Phases renumbered accordingly. Mapping from the previous board:
`R0→R0 · R1→R1 · R2→R2 · R3→R3+R4 · R4→R5 · R5→R6 · R6→R7 · R7→R8 · R8→R9`.

---

## The structural finding this board is built on

The PS asks for a local vision model that *"**reads** the user's screen and
**takes decision** based on that"*, and for the client to sanitize *"**if it
requires** the visual context to be sent to server."*

The build does neither today.

- UltraFace is wired only into `detectFaceRegions`
  ([`pipeline.ts:68`](../apps/extension/src/sanitizer/pipeline.ts#L68)). It is a
  **redaction sensor, not a perception source**. Screen understanding is 100% DOM
  parsing — which is also how the 25% *"accuracy of visual context from screen"*
  metric is currently answered.
- `coordinator.ts:385` is the single decision path, so **every step transmits**.
  There is no "if".

Where the DOM cannot describe a surface — canvas apps, cross-origin iframes,
closed shadow roots — the surface is masked and the agent is **blind**.

The privacy boundary itself is the strongest part of the project and maps to the
PS almost line for line: branded types make `RawCapture` structurally
untransmittable, sanitization fails closed, the canary gate blocks on leak.
**Do not restructure it.** The gap is above it, in perception and decision.

---

## Delivered

| Phase | Scope | State |
| :-- | :--- | :-- |
| **0** | Repo hygiene, workspace-local `tsc`, cross-platform Chrome resolution, docs consolidated under `docs/` | ✅ |
| **1** | Privacy boundary made real — offscreen document for canvas masking, permissive fallback deleted, fail-closed verification | ✅ `apps/extension/src/offscreen/` |
| **2** | On-device vision model — UltraFace ONNX bundled locally (1.27 MB) with its WASM runtime, WebGPU → WASM fallback, no CDN fetch | ✅ **verified executing** (`wasm`) after R0; face recall still unmeasured, see **R7** |
| **3** | Redaction precision — per-`Range` text geometry, Verhoeff for Aadhaar, Luhn for cards, overlap merging | ✅ `packages/pii-rules/` |
| **4** | Bounded multi-step agent loop — step budget, re-perceive per step, stale-ID recovery, `classifyActionRisk()` confirmation gate | ✅ `coordinator.ts` |
| **5** | Model connection — loopback probing on both `127.0.0.1` and `localhost`, graceful degradation, embedding-model exclusion, `num_ctx` for local Ollama | ✅ hosted Qwen2.5-VL and local Ollama both work |
| **M** | **Measurement** — CDP browser harness (zero dependencies, on Node's built-in `WebSocket`), pixel-true redaction verification, selector-anchored ground truth, real extension end-to-end | ✅ this is what made the numbers below trustworthy |

> **Correction to an earlier board.** Phase 4 was once recorded as "✅ non-circular".
> It was not. The harness matched string literals copied out of the fixtures and
> emitted face boxes hardcoded to the ground-truth coordinates, reporting 100%
> face recall without ever loading the model. That is fixed; the record is kept
> because the failure mode is worth remembering.

---

## Measured — real Chrome, shipped pipeline

Re-measured after **R0**. Three numbers moved, and two of them moved the wrong way
for an honest reason: the vision model had never actually executed before.

| Metric | Weight | Measured | Was | Command |
| :--- | :---: | :--- | :--- | :--- |
| Redaction precision, **pixel-verified** | 20% | **100%** (18/18) | 83.3% | `benchmark:browser` |
| Safe-control preservation | — | **100%** (18/18) | 100% | `benchmark:browser` |
| Visual context accuracy | 25% | 78.6% / 78.6% — **DOM-sourced** | same | `benchmark:browser` |
| Client perception latency | part of 15% | **503 ms p50**, 609 ms p95 | 55 ms | `benchmark:browser` |
| ├ extraction | | 2.3 ms p50 | | `benchmark:browser` |
| └ ONNX inference, **warm** | | **19 ms p50** (17–29 ms) | never ran | `benchmark:browser` |
| Client heap | part of 20% | **8.99 MB** peak | 3.94 MB | `benchmark:browser` |
| Vision model execution | — | **wasm × 14 fixtures** | `heuristic_fallback` × 14 | `benchmark:browser` |
| Faces detected by the model | — | **0** — see below | unmeasurable | `benchmark:browser` |
| PII detection (detector-level) | 20% | 100% / 100%, face excluded | same | `benchmark` |
| Server reasoning | part of 15% | 6–7 s typical with full payload | same | `test:e2e` |

**Why latency and heap got worse.** They did not. The model was never loading: outside
the extension there is no `chrome.runtime.getURL`, the fallback model path resolved
against the *page* URL, the fetch 404'd, and `detectFaces` swallowed the error and
returned `heuristic_fallback` with an empty face list. Every previous run measured a
pipeline with no vision model in it. The 55 ms and 3.94 MB were real measurements of
the wrong thing.

**The 503 ms is dominated by one-time session creation**, which the harness pays on
every fixture because each one gets a fresh page. Warm inference is **19 ms**. The
shipped offscreen document is persistent, so it pays the session cost once per
browser session, not once per step — but that has not been measured end-to-end yet
and must not be quoted as if it had.

**0 faces detected is a real result, and face recall is still unmeasured.** The model
now runs and reports honestly; it finds no faces in the fixtures because the fixture
avatars are drawn SVG, not photographs. Face redaction in `face-gallery` passes on the
DOM avatar signal, not on the model. Measuring face recall needs real face imagery and
belongs to the held-out corpus in **R7**.

Tests: **160/160**. Nothing above may be updated from memory — re-run the command.

## Remaining — ordered by problem-statement alignment

Each phase names the PS clause it satisfies. Every phase has an **exit gate**; do
not advance past a gate that has not been demonstrated.

### R0 · Close the measured defects — ✅ **DELIVERED**
**Satisfies:** correctness of everything already claimed.

**The premise of this phase was wrong, and the investigation is the finding.** The
board recorded "face masks render in the wrong place". They do not. Faces are
redacted by **block pixelation**, and the verifier only recognised opaque fill, so a
correctly pixelated region scored as under-masked. Four real defects came out of
chasing that:

1. **The verifier could not assess pixelation.** Block pixelation replaces each block
   with its own mean, which *preserves* between-block variance and destroys only
   within-block variance — so `1 - residual/raw` barely moves and could not reach the
   0.8 the check demanded. Replaced with **local luminance gradient**, which does
   move, and which ignores the renderer's own `[FACE BLUR]` badge rather than
   counting the label as surviving page detail.
2. **A layout container was being treated as a human face.** The avatar selector
   included `[class*="profile"]`, which matched `<div class="profile-card">` — so the
   whole card was pixelated, destroying both safe buttons inside it. Face candidates
   are now restricted to nodes that actually render picture content.
3. **The ONNX model had never executed, anywhere.** Outside the extension there is no
   `chrome.runtime.getURL`; the fallback path resolved against the page URL, 404'd,
   and `detectFaces` swallowed the error and returned `heuristic_fallback`. Every
   "vision" number before this measured a pipeline with no model in it. The runner
   now accepts an explicit asset base, the fixture server serves the model and the ORT
   wasm, and the benchmark **reports the provider it actually got**.
4. **Two fixtures were unassessable by construction.** `face-gallery`'s avatars were
   flat SVG circles carrying no detail to destroy, and `image-pii` was a 1×1 PNG.
   Both replaced with deterministic high-frequency content; `image-pii` now renders
   its PII as pixels only, which no DOM rule can read.

Also: the `image_text` surface rule matched only `class`, and missed
`class="scanned-id"` entirely. It now matches the same concept vocabulary against
`alt` and `aria-label` too — where an author describes what an image *depicts* —
which is a better signal than a CSS naming convention, though still a word list and
still not a substitute for reading the pixels.

A region whose raw pixels carry no detail is now reported **unassessable** and left
out of the denominator, rather than being scored as a pass. Masking a featureless
area is indistinguishable from leaving it alone, and the old code called that
covered.

**Exit gate — met.** `benchmark:browser` reports **18/18 regions covered** with
**18/18 safe controls preserved**, and `verify:redaction` demonstrates the *product*
rejecting a mask displaced 180 px from its region:

```
=== fail-closed on displaced mask ===
  correct placement  accepted : true
  displaced mask     rejected : true
    reason: Region 'probe_region' (national_id) is not covered by its mask:
            overlay 12.2%, detail removed 51.5%. A mask was rendered but did
            not land on the region.
```

`PostRedactionVerifier` now samples each region **before** masks are drawn and
re-reads it after, so coverage is judged against what was actually there. It shares
`pixel-probe.ts` with the harness — the product enforces the same measurement the
benchmark scores it on.

**Still open, and deliberately not claimed:** face-detection recall. The model runs
and reports truthfully, and finds **0 faces** across all 14 fixtures because the
avatars are drawn SVG rather than photographs. Real face imagery belongs to **R7**.

### R1 · Redaction manifest in the protocol
**Satisfies:** *"the central server … should be **aware for this redaction scheme**
and can process data accordingly."*

`SanitizedNetworkPayload` (`protocol/payload.ts:115`) carries no redaction
information at all — `maskCount` exists in `SanitizedContext` and is dropped at
the network boundary. Add categories present, count per category, the
`[REDACTED: X]` placeholder convention, mask geometry semantics and coverage
confidence. **Generate the server system prompt from the manifest** rather than
hardcoding prose.

**Exit gate:** the server prompt is derived, not hardcoded, and the model's
rationale demonstrably references what was redacted.

*Cheapest alignment win in this list — a literal unmet PS sentence, additive to
the protocol rather than a restructure.*

### R2 · Local decision tier
**Satisfies:** *"**If it requires** the visual context to be sent to server."*

A `DecisionRouter` ahead of the HTTP client. Scroll, dismiss a modal, re-perceive
after a stale ID, and click a control whose label unambiguously matches the goal
are decided **on-device and never transmitted**. Escalate only on low local
confidence. Record the local/remote split in telemetry.

**Exit gate:** a multi-step task completes with **at least one step resolved with
zero network transmission**, visible in the audit log.

*Also the strongest available narrative: not merely "we redact before sending",
but "we often do not send at all."*

---

### R3 · A real Vision Transformer on-device
**Satisfies:** *"a local **Vision Transformer (ViT)** or equivalent computer
vision model."*

UltraFace is an SSD-style CNN. *"Or equivalent"* covers it, but that is a defence,
not an answer — and a judge reading the sentence literally will ask. Ship an
actual ViT and the question stops being a question.

**The model.** A CLIP-family **ViT image tower**, exported to ONNX, quantized
int8, bundled locally exactly as UltraFace is (`assets/models/`, no CDN fetch).
Because the extension already depends on `onnxruntime-web ^1.19.2`, this adds
**zero new runtime dependencies**.

**Why CLIP and not a classifier.** Text embeddings for a fixed vocabulary of UI
affordances — *"a submit button"*, *"a text input field"*, *"a person's face"*,
*"a navigation menu"*, *"a checkbox"* — are computed **once, offline**, by a
dev-only script, and shipped as a static JSON table. At runtime only the **image**
tower runs, so there is no tokenizer, no text encoder, and no vocabulary baked
into the code path. It is open-vocabulary and therefore **site-agnostic by
construction**, which is the rule this project already binds itself to.

**Candidate models, decided by measurement not assertion.** UltraFace is 1.27 MB
and client resource use is 20% of the score, so size is a scoring input, not a
detail:

| Candidate | Vision params | Rough int8 size | Note |
| :--- | :--- | :--- | :--- |
| **TinyCLIP ViT-8M/16** | ~8 M | ~10 MB | start here — genuinely a ViT, closest to the current budget |
| CLIP ViT-B/32 image tower | ~88 M | ~90 MB | accuracy upgrade; only if R6's budget says it fits |

Sizes above are estimates from published parameter counts and **must be verified
against the actual export** before either is committed to. Measure both against
the R6 budget and keep whichever wins on accuracy-per-megabyte.

**Region proposal.** Classical CV in the offscreen canvas — edge density,
connected components, tiling — proposes candidate regions; the ViT labels them.
No second model, no dependency. Describe it exactly that way: *classical region
proposal, transformer semantic labelling.* Do not let it be mistaken for
end-to-end detection.

**Fallback.** If ONNX export proves painful, `transformers.js` is named in the PS
background text as an accepted route and costs nothing rhetorically. Prefer raw
`onnxruntime-web`; do not burn days on it.

**Exit gate:** the side panel truthfully reports the model family, the engaged
execution provider and the inference time (e.g. `TinyCLIP ViT-8M · wasm · N ms`),
and the ViT labels at least one region on a canvas-only fixture that the DOM
cannot describe at all.

### R4 · Vision on every page, not only where the DOM fails
**Satisfies:** *"**reads** the user's screen and **takes decision** based on
that"* — and converts the **25%** metric into an honestly vision-sourced number.

If vision only fires when the DOM is unusable, then on ordinary pages the 25%
metric is still `querySelectorAll`. Close it properly: vision runs on **every**
page, in three roles.

1. **Primary** where no DOM exists — canvas apps, cross-origin iframes, closed
   shadow roots. Today these are masked and the agent is blind.
2. **Corroborator** where the DOM does exist — the DOM claims a button is present;
   vision confirms it is actually *on screen* and not occluded by an overlay,
   scrolled out, or covered by a modal. This is a real accuracy gain the DOM
   cannot produce alone.
3. **PII auditor** — text baked into images or drawn into a canvas is invisible to
   every DOM rule in `pii-rules`. Vision is the only thing that can see it, and it
   feeds the **20%** detection metric on exactly the surfaces the pipeline
   currently handles by blanket-masking.

Introduce a `PerceptionSource` abstraction with DOM and vision implementations
fused into one element list, each `SanitizedElement`
([`payload.ts:79`](../packages/protocol/src/payload.ts#L79)) carrying
`source: 'dom' | 'vision' | 'both'` and a `visionConfidence`. The fusion primitive
already exists one level down (`pii-rules/fusion.ts`) — reuse it, and remember it
over-merged twice during development; scope it per page and keep spatial merging
off by default.

**The number that settles the argument.** Add a harness mode that disables the DOM
perception source entirely and reports visual-context accuracy from **vision
alone**. That single figure is the difference between claiming a vision result and
having one. It is also the best live ablation in the demo: turn the DOM off, watch
the agent keep working.

**Exit gate:** three things, all measured by `benchmark:browser` —
(a) a DOM-ablated visual-context accuracy is reported and is **not zero**;
(b) at least one element on an ordinary DOM-rich fixture is sourced `both` and at
least one is `vision`-only; (c) the agent completes an action on a canvas-only
fixture with no usable DOM.

*Largest and riskiest phase pair in this board, and the closest to the PS's
central claim. Ships behind the `PerceptionSource` seam so DOM stays the default
and vision is additive — a regression here must not take the working pipeline
down with it.*

---

### R5 · Perception policy as a first-class object
**Satisfies:** *"must balance the trade-offs between inference latency and the
accuracy."*

The knobs are scattered constants — face confidence 0.70, NMS IoU 0.35,
native-resolution screenshots, fixed timeouts, and now the ViT's region count and
input scale. A `PerceptionPolicy` selects screenshot scale, send-image-or-not,
model tier, region budget and WebGPU-vs-WASM per run, and records the choice in
telemetry so the trade-off is demonstrable rather than accidental.

**Exit gate:** two named policies (`fast`, `thorough`) produce **measurably
different** latency and accuracy in the browser harness.

### R6 · Client resource governance
**Satisfies:** client resource utilization — **20%**.

Now load-bearing rather than nice-to-have: R3 adds a second model to a client that
currently peaks at 3.94 MB heap. A budget that degrades in a defined order when
exceeded (drop the ViT pass, reduce region count, downscale, widen masks) and
**reports what it dropped** rather than silently skipping. Lazy-load the ViT so
the cost is not paid on pages that never need it.

**Exit gate:** the harness shows graceful degradation under a constrained budget,
with the degradation visible in telemetry; peak heap and model load time are
reported with the ViT enabled.

### R7 · Generalisation, measured
**Satisfies:** *"Use cases for evaluation will be provided during finale."*

The finale pages are unknown. Generalisation is therefore not a corpus chore — it
is the property most likely to decide the round, and it should be **reported as a
number**.

- A held-out corpus authored by whoever did **not** write the detectors — 6–8 real
  public pages, saved, with synthetic PII substituted in.
- Score dev and held-out **separately**, and publish the **gap** between them as a
  first-class figure. Current PII is 100% on fourteen self-authored fixtures and
  should be expected to drop; a team that measures and reports its own overfitting
  is a team whose other numbers are believable.
- Complete the adversarial suite: secret in placeholder/aria-label, secret
  rendered into canvas, detector timeout, stale local ID mid-run, animated page.
- Run the **unseen-page drill** repeatedly, on a page pulled up on the spot, until
  it stops being frightening. Fail-closed is a correct outcome, and rehearse
  saying so out loud.

**Exit gate:** held-out scores and the dev↔held-out gap are reported separately in
the evaluation report, and a 3+ step task completes **live on a page nobody on the
team prepared**.

### R8 · Firefox port
**Satisfies:** *"running in popular browsers (chrome, **Firefox**)."*

Depends on the direct-canvas path actually passing a canvas — without it the port
ships a blind sanitizer. `manifest.firefox.json` with an event page,
`sidebar_action`, no `offscreen`, `browser_specific_settings.gecko.id`, and a
classic/IIFE background bundle.

**Exit gate:** a masked, verified agent run completes in Firefox via
`about:debugging`.

*Carries no rubric weight. It is a stated requirement so it is in scope, but if it
competes with R2, R3 or R4 for attention it should lose. One browser working beats
two half-working.*

### R9 · Freeze and submit

Regenerate all evidence from the real harnesses. Strip every unmeasured claim from
`README.md`, `09_DEMO_PITCH_SCRIPT.md` and the side panel. **Rotate the OpenRouter
key** — it was shared in a chat transcript — and set a spend limit. Record a backup
demo video.

**Exit gate:** every number presented is reproducible on demand by a named command.

---

## Sequencing notes

- **R0 is done.** It also removed the reason to distrust the instrument: the model
  now really runs, and the provider is reported rather than assumed.
- **R2 before R3/R4.** The decision tier is where vision-sourced perception gets
  consumed; building the router first gives the ViT somewhere to land.
- **R3 before R4**, obviously — but keep them separate. R3 can be demonstrated the
  day the model loads; R4 is the harder integration and should not hold R3's proof
  hostage.
- **R6 alongside R3**, not after it. Discovering the model blows the resource
  budget *after* integrating it is the expensive order.
- **R1 can run in parallel** with any of these — it touches the protocol and the
  server prompt, not the client pipeline.
- **R8 is the first thing to cut** if the run tightens.

## Never cut

The offscreen sanitizer · the ViT perception path · pixel-true redaction
verification · the browser harness · the DOM-ablated vision score ·
site-agnostic detection.

The first four are what the rubric scores and what makes the score believable; the
fifth is the only proof that the 25% metric is a vision result; the sixth is what
makes any of it survive contact with a page nobody has seen.

## Rubric being optimised

visual-context accuracy **25%** · PII recall and precision **20%** ·
redaction precision **20%** · client resource use **20%** ·
end-to-end latency **15%**.

## Commands that produce the numbers

```bash
npm run build              # all artifacts, including the harness bundle
npm test                   # unit and integration tests
npm run benchmark          # Node: detector-level PII + detector ablations
npm run benchmark:browser  # real Chrome: redaction, visual context, resources
npm run verify:redaction   # pixel-true mask verification, with safe-control controls
npm run test:e2e           # full extension against a live model
npm run compare:models     # model and payload-size latency sweep
```

No number in this file may be updated from memory or estimate. Re-run the harness
that produced it, or leave it stale and say so.
