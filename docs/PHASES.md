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

### R1 · Redaction manifest in the protocol — ✅ **DELIVERED**
**Satisfies:** *"the central server … should be **aware for this redaction scheme**
and can process data accordingly."*

`SanitizedNetworkPayload` carried no redaction information at all — `maskCount`
existed on `SanitizedContext` and was dropped at the network boundary — while the
server's system prompt asserted in fixed prose that PII "has been blacked out". That
sentence was true by assertion: it said the same thing regardless of what the client
had actually done, and stayed true after the client changed.

The scheme is now defined **once**, in
[`protocol/src/redaction.ts`](../packages/protocol/src/redaction.ts), and both sides
read it:

- **`RedactionManifest`** rides on `SanitizedContext` and on the wire payload. It
  carries categories present with a count and method for each, the total regions,
  masks rendered, the in-image conventions (fill colour, `[REDACTED: CATEGORY]`
  label, `[FACE BLUR]` label), the element placeholders actually used, pixel-coverage
  confidence, and the capabilities withheld from sensitive controls.
- **Counts and conventions only.** A manifest carrying labels, values or coordinates
  would re-identify exactly what redaction removed, which defeats the point of
  transmitting it.
- The pipeline's hardcoded placeholder `switch` is gone; `sensitiveElementPlaceholder()`
  is now shared, so the server's prompt can enumerate exactly the placeholders it will
  encounter and the two cannot drift.
- **`describeRedactionScheme(manifest)` generates the prompt section.** The server
  imports it from the protocol package, so what the model is told is derived from what
  the client actually did.
- The manifest is **validated before it reaches the model** — it is interpolated into a
  system prompt, so an unchecked category string is a prompt-injection vector. Category
  names are checked against a known set, counts are bounded, and string fields are
  length-capped. A payload with no manifest is rejected with **HTTP 400**: a client that
  declines to describe its redaction scheme is not processable.

**Exit gate — met, against the live hosted model.** `npm run verify:manifest` sends the
same page twice, differing only in the manifest:

```
=== manifest is required by the protocol ===
  PASS  payload without a manifest -> HTTP 400

=== model reasons about the redacted fields ===
  action    : click -> el_1 (risk safe)
  rationale : Clicking the email field to allow the user to enter their email
              address. The email field is redacted but its role is clear.
  PASS  did not propose typing into a redacted field
  PASS  rationale references the redaction scheme

=== an unredacted page is described differently ===
  rationale : The goal is to sign in, but the current elements suggest a
              search/report functionality...
  PASS  unredacted capture reasoned about without redaction framing
```

The model reasoned about the redacted field's **role** without attempting to recover
its value, and chose `click` rather than `type` because `type` was withheld — the
behaviour the generated prompt asks for. The unredacted control run produced entirely
different reasoning with no redaction framing, which is what shows the prompt is
derived rather than fixed.

*A live-model check is inherently non-deterministic. The rationale wording is reported
as a `WARN` rather than a hard failure; the generated-prompt property itself is pinned
by 11 tests in [`tests/redaction-manifest.test.js`](../tests/redaction-manifest.test.js).*

### R2 · Local decision tier — ✅ **DELIVERED**
**Satisfies:** *"**If it requires** the visual context to be sent to server."*

`coordinator.ts` had one code path and no "if": every step transmitted. A
[`DecisionRouter`](../apps/extension/src/background/decision-router.ts) now sits ahead
of the HTTP client, and when it decides **nothing leaves the machine** — not a
redacted screenshot, not an element list, not the goal string.

Three rules, all site-agnostic:

- **`dismiss-overlay`** — closes a blocking banner or modal. It deliberately excludes
  *accept / agree / allow / reject*: closing an overlay is ours to do locally,
  **answering** one is a choice about the user's data and escalates instead.
- **`unambiguous-label-match`** — clicks the one control the goal names, requiring
  ≥75% of the control's own label to appear in the goal, ≥2 matched words, and a ≥40%
  lead over the runner-up.
- **`scroll-to-reveal`** — scrolls only when the host reports a document taller than
  the scrolled viewport, and only twice before escalating.

**Three things this phase got wrong first, all found by running it:**

1. **The label match was scored backwards.** It measured what fraction of the *goal's*
   words a label accounted for, so the real e2e goal — "Open the safe preview for the
   pending request" — could never match a button reading "Open Safe Preview": half the
   goal's words are on no button. Scoring *label-in-goal* asks the question that
   matters, which is whether this control is the thing the goal names.
2. **The router had no memory.** It re-proposed its own obvious answer every step: the
   goal still named the button, the page had already responded, and the run died on
   semantic verification. It now tracks controls already actioned **by label**, since
   local ids are regenerated on every capture. Having made the obvious move and not
   finished, it is by definition no longer sure — so it escalates.
3. **The scroll rule was a guess.** It first scrolled whenever nothing matched, with no
   evidence any content existed below. `documentHeight` is now reported in the
   client-internal viewport metadata (never transmitted) so the rule fires on evidence.

Two defects outside the router had to be fixed for a multi-step task to complete at all:

- **The server was never told what the agent had already done.** Every step was
  reasoned about as if it were the first, so the model re-proposed the click it had
  just made. `recentActions` now rides on the payload — sanitized labels already
  present in `elements`, so it discloses nothing new.
- **A valid decision was being thrown away over a JSON convention.** Told to return
  `finish`, the model emitted `"targetLocalId": null` alongside it; `typeof null` is
  not `"string"`, so the proposal was rejected and the run fell back to the offline
  reasoner. Null and absent now mean the same thing for optional fields. The
  normalisation only *removes* keys — it never invents or repairs a value.

**Exit gate — met.** `npm run test:e2e`, real extension, real page, live model:

```
  success  : true
  state    : complete
  action   : finish -> page
  rationale: The 'Open Safe Preview' button has already been clicked, and the
             preview drawer is open...

  step 1: LOCAL  unambiguous-label-match      click        0 bytes
  step 2: REMOTE no local rule applies        finish  140444 bytes
  1/2 step(s) resolved on-device, 137 KB transmitted in total
```

Step 1 was answered with **zero bytes transmitted**, and the split is read back out of
the extension's own audit trail rather than asserted. This is also the first end-to-end
run that has ever reached `complete`.

*The transmission split is workload-dependent — 1/2 here is this task on this page, not
a general claim. What is general is that the trail records it per step, so the ratio is
always measured rather than estimated.*

### R3 · A real Vision Transformer on-device — ✅ **DELIVERED**
**Satisfies:** *"a local **Vision Transformer (ViT)** or equivalent computer vision model."*

The project no longer rests on *"or equivalent"*. **CLIP ViT-B/32's vision tower** —
12 transformer layers over 32×32 patches of a 224×224 input, uint8-quantized — runs
on-device through the `onnxruntime-web` the extension already depended on. **Zero new
runtime dependencies, no CDN fetch.**

| | |
| :--- | :--- |
| Model | CLIP ViT-B/32 vision tower, uint8 · 512-d `image_embeds` |
| Size | **84.5 MB** (UltraFace, for comparison, is 1.27 MB) |
| Provider | **`wasm`** on 15/15 fixtures — reported, never assumed |
| Load | 774 ms, once per document |
| Inference | **~195 ms per region**, warm |

**Only the image tower ships.** Classifying against text prompts would need the 64 MB
text encoder plus a BPE tokenizer in the extension. Instead
`npm run generate:prototypes` renders synthetic UI controls in headless Chrome,
embeds them with the same model, and writes an L2-normalized reference table.
Nothing at runtime tokenizes anything.

**Why MobileCLIP-S0 was rejected.** It is 11.8 MB against 84.5 MB, but its tower is a
hybrid conv-transformer — which puts the "is that really a ViT?" argument straight
back. The size is a measured cost, recorded here, and the trade is R6's to revisit.

#### The margin is the signal, not the similarity

CLIP embeddings of UI controls sit in a very tight cone: the two most similar class
prototypes are **0.942** apart on a scale where 1.0 is identical. An absolute cosine
of 0.9 therefore says almost nothing, and only the top1-to-top2 gap carries
information. Measured on held-out renders the prototypes were **not** built from
(n=20):

| abstain margin | labels emitted | precision |
| :--- | :--- | :--- |
| ≥ 0.0000 | 20/20 (100%) | 75% |
| **≥ 0.0162** | **11/20 (55%)** | **100%** ← shipped |
| ≥ 0.0400 | 7/20 (35%) | 100% |

Abstaining is the right trade for an agent that *acts* on these labels: a confident
"this is a button" that is wrong is worse than admitting no idea. The reference set
scores 40/40 and that number is worthless — it is 100% correct by construction and
cannot calibrate anything. **n=20 is a small sample; 100% precision on it is not a
general guarantee**, and R7 is where this gets a real measurement.

#### The bug worth remembering

The first version ran the ViT **after** mask rendering, so it was dutifully
classifying solid `#0f172a` redaction rectangles. Moving the pass before rendering
took confident labels from 1/6 to 14/18. Vision now reads the raw canvas on-device,
before redaction — which is exactly what local vision is *for* — and only category
labels are retained. Embeddings never leave the function; no pixels leave the machine.

**Exit gate — met.** New `canvas-app` fixture: an entire console UI painted into a
`<canvas>`, with **0 interactive DOM elements extracted**.

```
canvas-app   elements 0 | masks 1 | 1/1 regions covered
vision: CLIP ViT-B/32 (vision tower, uint8) · wasm · 6 regions · 2256 ms
  r2c2  chart area        -> chart_or_graph   margin 0.1168
  r2c0  painted PAN text  -> text_block       margin 0.0198
  r0c1                    -> (abstain)        margin 0.0055
```

The side panel reports model family, engaged provider, regions read, labels emitted
and inference time — including `unavailable`, pinned by test.

**Known limitation, stated plainly.** Region proposal is a coarse energy-filtered
grid, not a detector. On `canvas-app` the chart and the text block are identified
correctly, but cells containing a title *and* an input *and* two buttons match no
single-control prototype and come back `table_or_list`. Isolating individual controls
is R4's problem, and this is the honest starting point rather than a solved one.

**Cost is real and unbudgeted.** `canvas-app` alone spends 2256 ms of ViT time, and
client p95 rose to ~3.7 s. That is why **R6 runs alongside, not after.**

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
- **R2 is done**, so R3/R4's vision output has somewhere to land: a vision-sourced
  element carrying provenance is just another candidate the router can rank.
- **R3 before R4**, obviously — but keep them separate. R3 can be demonstrated the
  day the model loads; R4 is the harder integration and should not hold R3's proof
  hostage.
- **R6 alongside R3**, not after it. Discovering the model blows the resource
  budget *after* integrating it is the expensive order.
- **R1 is done.** The manifest shape is now a fixed point for R2: whatever the
  decision tier chooses not to transmit still has to be described.
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
npm run fetch:models       # one-time: download the ViT weights (not committed)
npm run generate:prototypes # regenerate the ViT reference table (needs the weights)
npm run benchmark          # Node: detector-level PII + detector ablations
npm run benchmark:browser  # real Chrome: redaction, visual context, resources
npm run verify:redaction   # pixel-true mask verification, with safe-control controls
npm run verify:manifest    # server is aware of the redaction scheme (live model)
npm run test:e2e           # full extension against a live model
npm run compare:models     # model and payload-size latency sweep
```

No number in this file may be updated from memory or estimate. Re-run the harness
that produced it, or leave it stale and say so.
