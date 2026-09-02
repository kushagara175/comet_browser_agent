# PrivaPilot — Phase Status Board

**SIH26171 (ISRO / Department of Space) · Deadline 20 September 2026, 23:59 IST.**
Rewritten 2 September 2026 after the measurement audit.

This file is a *summary*. The authoritative record of what is actually measured
versus merely claimed is [`AUDIT_LOCAL_VS_DEFERRED.md`](AUDIT_LOCAL_VS_DEFERRED.md)
— update that first, then mirror here. [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md)
(31 Aug) is **superseded**: its Phases 0–5 landed in commit `fffe26a` and its
remaining phases are restructured below.

Phases are **not** day-numbered. They are ordered by dependency and by which
problem-statement clause they satisfy; scheduling is the team's call.

---

## The structural finding that reorders everything

[`00_PROBLEM_STATEMENT.md`](00_PROBLEM_STATEMENT.md) asks for a local vision model
that *"**reads** the user's screen and **takes decision** based on that"*, and for
the client to sanitize *"**if it requires** the visual context to be sent to
server."*

The build does neither.

- UltraFace is wired only into `detectFaceRegions` (`pipeline.ts:68`). It is a
  **redaction sensor, not a perception source**. Screen understanding is 100% DOM
  parsing — which is also how the 25% *"accuracy of visual context from screen"*
  metric is currently answered.
- `coordinator.ts:385` is the single decision path, so **every step transmits**.
  There is no "if".

Where the DOM cannot describe a surface — canvas apps, cross-origin iframes,
closed shadow roots — the surface is masked and the agent is **blind**. Vision is
the only thing that could act there, and it is not connected to that job.

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
| **2** | On-device vision model — UltraFace ONNX bundled locally with its WASM runtime, WebGPU → WASM fallback, no CDN fetch | ✅ executes; accuracy still unknown, see **R0** |
| **3** | Redaction precision — per-`Range` text geometry, Verhoeff for Aadhaar, Luhn for cards, overlap merging | ✅ `packages/pii-rules/` |
| **4** | Bounded multi-step agent loop — step budget, re-perceive per step, stale-ID recovery, `classifyActionRisk()` confirmation gate | ✅ `coordinator.ts` |
| **5** | Model connection — loopback probing on both `127.0.0.1` and `localhost`, graceful degradation, embedding-model exclusion, `num_ctx` for local Ollama | ✅ hosted Qwen2.5-VL and local Ollama both work |
| **M** | **Measurement** — CDP browser harness (zero dependencies, on Node's built-in `WebSocket`), pixel-true redaction verification, selector-anchored ground truth, real extension end-to-end | ✅ this is what made the numbers below trustworthy |

> **Correction to the previous board.** Phase 4 was recorded as "✅ non-circular".
> It was not. The harness matched string literals copied out of the fixtures and
> emitted face boxes hardcoded to the ground-truth coordinates, reporting 100%
> face recall without ever loading the model. That is fixed; the record is kept
> because the failure mode is worth remembering.

---

## Measured — real Chrome, shipped pipeline

| Metric | Weight | Measured | Command |
| :--- | :---: | :--- | :--- |
| Redaction precision, **pixel-verified** | 20% | **83.3%** (15/18), 3 under-masked | `benchmark:browser` |
| Safe-control preservation | — | **100%** (18/18) | `benchmark:browser` |
| Visual context accuracy | 25% | 78.6% / 78.6% | `benchmark:browser` |
| Client perception latency | part of 15% | **55 ms p50** harness · **~1.2 s** full extension | `benchmark:browser` · `test:e2e` |
| Client heap | part of 20% | 3.94 MB peak | `benchmark:browser` |
| PII detection (detector-level) | 20% | 100% / 100%, face excluded | `benchmark` |
| Server reasoning | part of 15% | **6–7 s** typical with full payload | `test:e2e` |

Tests: **160/160**. Nothing above may be updated from memory — re-run the command.

---

## Remaining — ordered by problem-statement alignment

Each phase names the PS clause it satisfies. Every phase has an **exit gate**; do
not advance past a gate that has not been demonstrated.

### R0 · Close the measured defects
**Satisfies:** correctness of everything already claimed.

Face masks render but land in the wrong place — 0/2 covered, overlay 5–7%. That is
the first-ever measurement of face redaction and it is a live privacy hole, not a
scoring detail. Give `PostRedactionVerifier` the harness's pixel check so a mask
drawn at the wrong coordinates **fails closed** instead of passing a count
comparison. Fix the `image-pii` fixture, which is a 1×1 PNG and cannot be
assessed. Investigate the semantic-verification failure on the demo-portal e2e.

**Exit gate:** the browser harness reports **18/18 regions covered**, and a
deliberately displaced mask makes the product itself fail closed.

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

*Cheapest alignment win in this list — a literal unmet PS sentence, and additive
to the protocol rather than a restructure.*

### R2 · Local decision tier
**Satisfies:** *"**If it requires** the visual context to be sent to server."*

A `DecisionRouter` ahead of the HTTP client. Scroll, dismiss a modal, re-perceive
after a stale ID, and click a control whose label unambiguously matches the goal
are decided **on-device and never transmitted**. Escalate only on low local
confidence. Record the local/remote split in telemetry.

**Exit gate:** a multi-step task completes with **at least one step resolved with
zero network transmission**, visible in the audit log.

*This is also the strongest available narrative: not merely "we redact before
sending", but "we often do not send at all."*

### R3 · Vision as a perception source
**Satisfies:** *"a local ViT or equivalent CV model **reads the screen and takes
decision**."*

Introduce a `PerceptionSource` abstraction with DOM and vision implementations,
fused into one element list, each `SanitizedElement` carrying provenance
(`dom` | `vision` | `both`). The fusion primitive already exists one level down
(`pii-rules/fusion.ts`). This is the only route to acting on surfaces the DOM
cannot describe.

**Exit gate:** the agent completes an action on a **canvas-only fixture with no
usable DOM**, driven by vision-sourced elements.

*Largest and riskiest, and the closest to the PS's central claim. It is what makes
the 25% metric honestly a vision result.*

### R4 · Perception policy as a first-class object
**Satisfies:** *"must balance the trade-offs between inference latency and the
accuracy."*

The knobs are scattered constants — face confidence 0.70, NMS IoU 0.35,
native-resolution screenshots, fixed timeouts. A `PerceptionPolicy` selects
screenshot scale, send-image-or-not, model tier and WebGPU-vs-WASM per run, and
records the choice in telemetry so the trade-off is demonstrable rather than
accidental.

**Exit gate:** two named policies (`fast`, `thorough`) produce **measurably
different** latency and accuracy in the browser harness.

### R5 · Client resource governance
**Satisfies:** client resource utilization — **20%**.

A budget that degrades in a defined order when exceeded (drop the vision pass,
downscale, widen masks) and **reports what it dropped** rather than silently
skipping.

**Exit gate:** the harness shows graceful degradation under a constrained budget,
with the degradation visible in telemetry.

### R6 · Generalisation and rehearsal
**Satisfies:** *"Use cases for evaluation will be provided during finale."*

A held-out corpus authored by whoever did **not** write the detectors — real
public pages with synthetic PII substituted in, scored separately from dev.
Complete the adversarial suite: secret in placeholder/aria-label, secret rendered
into canvas, detector timeout, stale local ID mid-run, animated page.

**Exit gate:** held-out scores reported separately from dev, and a 3+ step task
completed **live on a page nobody on the team prepared**.

### R7 · Firefox port
**Satisfies:** *"running in popular browsers (chrome, **Firefox**)."*

Depends on the direct-canvas path passing a canvas — without it the port ships a
blind sanitizer. `manifest.firefox.json` with an event page, `sidebar_action`, no
`offscreen`, `browser_specific_settings.gecko.id`, and a classic/IIFE background
bundle.

**Exit gate:** a masked, verified agent run completes in Firefox via
`about:debugging`.

*Carries no rubric weight. It is a stated requirement so it is in scope, but if it
competes with R2 or R3 for attention it should lose. One browser working beats two
half-working.*

### R8 · Freeze and submit

Regenerate all evidence from the real harnesses. Strip every unmeasured claim from
`README.md`, `09_DEMO_PITCH_SCRIPT.md` and the side panel. **Rotate the OpenRouter
key** — it was shared in a chat transcript — and set a spend limit. Record a backup
demo video.

**Exit gate:** every number presented is reproducible on demand by a named command.

---

## Sequencing notes

- **R0 before everything.** Measuring then optimising is the whole point of the M
  phase, and the face defect is a live privacy hole.
- **R2 before R3.** The decision tier is where vision-sourced perception will be
  consumed; building the router first gives R3 somewhere to land.
- **R1 can run in parallel** with either — it touches the protocol and the server
  prompt, not the client pipeline.
- **R7 is the first thing to cut** if the run tightens.

## Never cut

The offscreen sanitizer · the real face model · pixel-true redaction verification ·
the browser harness · site-agnostic detection.

The first four are what the rubric scores and what makes the score believable; the
fifth is what makes it survive contact with a page nobody has seen.

## Rubric being optimised

visual-context accuracy **25%** · PII recall and precision **20%** ·
redaction precision **20%** · client resource use **20%** ·
end-to-end latency **15%**.

## Commands that produce the numbers

```bash
npm run build              # all 11 artifacts, including the harness bundle
npm test                   # 160 unit and integration tests
npm run benchmark          # Node: detector-level PII + detector ablations
npm run benchmark:browser  # real Chrome: redaction, visual context, resources
npm run verify:redaction   # pixel-true mask verification, with safe-control controls
npm run test:e2e           # full extension against a live model
npm run compare:models     # model and payload-size latency sweep
```

No number in this file may be updated from memory or estimate. Re-run the harness
that produced it, or leave it stale and say so.
