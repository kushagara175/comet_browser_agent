# PrivaPilot — Execution Plan

**SIH26171 · ISRO / Department of Space · Deadline 20 September 2026, 23:59 IST**
Written 2 September 2026, revised the same day after a line-by-line re-read of the
problem statement. Supersedes
[`archive/EXECUTION_PLAN_2026-08-31.md`](archive/EXECUTION_PLAN_2026-08-31.md).

This document is **strategy**: what we are betting on, what actually decides the
outcome, and how the two of us split it. The task board is
[`PHASES.md`](PHASES.md) — phases R0–R9, each with an exit gate. What is measured
versus merely claimed is [`AUDIT_LOCAL_VS_DEFERRED.md`](AUDIT_LOCAL_VS_DEFERRED.md).
[`00_PROBLEM_STATEMENT.md`](00_PROBLEM_STATEMENT.md) is authoritative and overrides
everything here.

---

## 1. Where we actually stand

The pipeline is built and, as of 2 Sep, genuinely measured for the first time.

| | |
| :--- | :--- |
| **Real** | Offscreen sanitizer, UltraFace ONNX executing, multi-step agent loop, hosted + local model backends, 160/160 tests |
| **Measured in real Chrome** | Redaction 83.3% pixel-verified · safe controls 100% preserved · visual context 78.6% · client perception 55 ms p50 · heap 3.94 MB |
| **Known broken** | Face masks render in the wrong place (0/2 covered) · `PostRedactionVerifier` cannot detect a displaced mask · server reasoning 6–7 s |
| **Structurally missing** | No ViT · vision does not drive decisions · every step transmits · the server is not told what was redacted |

The honest summary: **we built the privacy boundary extremely well and the
perception layer only halfway.** The PS asks for a Vision Transformer that reads
the screen and decides; ours is a CNN face detector wired to redaction only.

---

## 2. What decides selection

Two things, and only one of them is the rubric.

### 2.1 The rubric — 100 points of it

| Metric | Weight | Where we are | Phase |
| :--- | :---: | :--- | :--- |
| Accuracy of visual context from screen | **25%** | 78.6%, answered from the **DOM, not vision** | R3, R4 |
| PII detection recall / precision | **20%** | 100%/100% detector-level, face unmeasured | R0, R4 |
| Precision of redaction | **20%** | 83.3% pixel-verified, 3 under-masked | R0 |
| Client resource utilization | **20%** | 3.94 MB heap, no governance | R6 |
| End-to-end latency | **15%** | 6–7 s server, 55 ms client | R2, R5 |

### 2.2 The part that is not on the scoresheet

Every team drawing SIH26171 will demo a Chrome extension that blurs a face,
blacks out a password, ships a screenshot to a hosted VLM and clicks a button.
The architecture diagram will look like ours. **Differentiation is not the
architecture — it is what we can prove.**

---

## 3. The bet: we are the team that can prove it

Five assets no GPT-4V wrapper can reproduce on demand. Four already exist; the
fifth is what R4 is for.

1. **The privacy boundary is enforced by the type system.** `RawCapture` carries a
   brand that makes it structurally unassignable to the network client. Sending
   raw pixels is not a code-review failure we might catch — it does not compile.
   *Demonstrable live: try it, watch `tsc` reject it.*
2. **It fails closed, and we can trigger it.** If mask coverage is uncertain the
   client transmits nothing. A canary string planted on a page hard-errors if it
   ever reaches a payload. *Demonstrable live: plant the canary, watch the run
   block instead of leak.*
3. **Redaction is verified at the pixel level.** We read the actual output PNG and
   assert every pixel inside a sensitive region belongs to the redaction overlay —
   100% for a password field against 5% for a button that must survive. Nobody
   else will bring this.
4. **The benchmark reports its own failures.** It has a `⚪ NOT MEASURED` verdict
   and a scope section listing what it cannot assess. Ablate a detector and recall
   drops, on demand.
5. **The vision score survives the DOM being switched off.** (R4.) Any team can
   claim their model reads the screen. We will be able to disable DOM perception
   entirely, live, and show the agent still working with a number attached.

**On asset 4, tell the story straight.** We found our own benchmark was fabricating
results — it string-matched fixture literals and emitted face boxes hardcoded to
the ground-truth coordinates, reporting 100% face recall without ever loading the
model. We rebuilt it, and the honest numbers are lower. With an ISRO jury that is
a *strength*: a team that audits itself is a team whose numbers you can trust. Do
not hide it and do not lead with it — have it ready for "how do you know?"

---

## 4. Closing the gap to the problem statement

The PS sentences we do not yet satisfy, in cost order. Detail and exit gates in
[`PHASES.md`](PHASES.md).

| | PS clause | What we do today | Phase |
| :-- | :--- | :--- | :-- |
| 1 | *"server … should be **aware for this redaction scheme**"* | The payload carries no redaction information at all | **R1** — cheapest win |
| 2 | *"**If it requires** the visual context to be sent"* | One code path; every step transmits | **R2** |
| 3 | *"a local **Vision Transformer (ViT)** or equivalent"* | UltraFace is an SSD-style CNN; we rely on "or equivalent" | **R3** |
| 4 | *"**reads the screen and takes decision** based on that"* | Vision detects faces for redaction only; the 25% metric is DOM-sourced | **R4** — biggest, riskiest, most aligned |
| 5 | *"balance the trade-offs between latency and accuracy"* | Scattered constants, no policy | **R5** |

**R3+R4 are what change the pitch.** Until they land we are a DOM agent with a
face blurrer defending a word in the PS. After them we are what the PS literally
describes, with a number to back it.

### The three things that were still open, and how they close

An earlier reading of the old board asked whether following it would *completely*
satisfy the PS. It would not, for three reasons. Each now has a phase:

- **"ViT or equivalent" was a defence, not an answer.** → **R3** ships an actual
  CLIP-family ViT image tower, bundled locally, on the `onnxruntime-web` we
  already depend on. Zero new runtime dependencies.
- **Vision only firing where the DOM failed left the 25% metric DOM-sourced.** →
  **R4** runs vision on every page in three roles (primary, corroborator, PII
  auditor) and reports a **DOM-ablated** accuracy figure.
- **Generalisation was unprovable in advance.** It still is — but **R7** now
  reports the dev↔held-out **gap** as a published number rather than hoping the
  gap is small.

What remains genuinely outside anyone's guarantee: the finale pages are unknown,
and satisfying the PS is not the same as scoring well. R7 shrinks that risk as far
as it can be shrunk; it does not remove it.

---

## 5. Division of labour

Two people, two tracks, one shared interface agreed before either starts: the
`PerceptionSource` contract and the `redactionManifest` shape.

| | **Track A — Perception & Decision** | **Track B — Correctness & Compatibility** |
| :--- | :--- | :--- |
| Owns | R2 decision tier, R3 the ViT, R4 vision everywhere, R5 policy | R0 defect closure, R1 redaction manifest, R6 resource budget, R8 Firefox |
| First move | R2 — the router is where R3/R4's output will land | R0 — the face defect is a live privacy hole |
| Shared | R7 generalisation and rehearsal, R9 freeze and submit |

Track B's R0 and R1 are independent of Track A and can land in any order. R6 must
run **alongside** R3, not after it — finding out the ViT blows the resource budget
after integrating it is the expensive order.

---

## 6. The demo

Six minutes. The goal is not "it works" — every team shows that. The goal is
**"we can prove it, and you can try to break it."**

1. **Let the jury pick the page.** Open something nobody prepared. This is the
   single highest-credibility move available, and it is only possible if R7 is
   done. If we cannot do it live, the pipeline is overfitted and we should fix
   that rather than hide it.
2. **Raw versus redacted, side by side.** The side panel already does this.
3. **Show the wire.** Display the actual JSON payload leaving the machine. Not a
   diagram of it — the bytes.
4. **Try to leak.** Plant the canary, watch the run fail closed and transmit
   nothing. This is the moment the demo is won.
5. **Switch the DOM off.** Disable DOM perception; the ViT carries the page alone.
   This is the moment the *problem statement* is answered.
6. **Complete a real task.** A 3–4 step approval workflow with a confirmation
   prompt on the protected submit step.
7. **Show the scoreboard, failures included.** Then ablate a detector live and show
   the number move.

**Have a recorded backup.** Venue wifi is a single point of failure for a
hosted model.

### 6.1 Questions to have answers ready for

These are the ones that decide rounds. Answer each in two sentences, not ten.

| Question | The answer |
| :--- | :--- |
| *"Is that really a Vision Transformer?"* | Name the model and the parameter count, and show the side panel reporting it live. This is why R3 exists. |
| *"How do we know the vision model is doing anything, and not the DOM?"* | Switch the DOM off and show the number. R4. |
| *"How do you know nothing leaked?"* | The type system rejects it at compile time, and the canary makes it fail closed. Show both. |
| *"Your numbers are from your own fixtures."* | Agree, immediately. Then show the held-out corpus and the dev↔held-out gap we publish ourselves. R7. |
| *"Why is it slow?"* | Client perception is 55 ms; the wait is the server reasoning model, and R2 removes the round trip entirely for simple steps. |
| *"What happens on a page you've never seen?"* | It over-masks and refuses to transmit. That is the designed outcome, not a failure. |
| *"Why not just send the screenshot to GPT-4V?"* | Because the PS forbids it and the user's password is in that screenshot. That is the entire point of the project. |

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
| :--- | :--- | :--- |
| Venue internet fails, hosted model unreachable | Medium | Local Ollama path already works — rehearse the `.env` switch until it takes ten seconds |
| **The ViT blows the client resource budget (20% of score)** | **Medium** | Start at ~10 MB (TinyCLIP ViT-8M), lazy-load it, and run R6 alongside R3 rather than after |
| 6–7 s latency reads as "slow" to judges | High | R2 removes the round trip for simple steps; R5 lets us pick a faster policy live. Narrate it: perception is 55 ms, the wait is the reasoning model |
| An unseen page breaks the agent live | Medium | Fail-closed is the designed outcome and a *good* look — rehearse saying so. R7 reduces the chance |
| R3/R4 destabilise a working pipeline | Medium | Ship behind the `PerceptionSource` seam; DOM stays the default source and vision is additive |
| WebGPU never verified to engage | Medium | It has only ever run on the WASM fallback. Verify headful once and report the provider truthfully — never claim WebGPU we have not seen |
| Face redaction still broken at the finale | Low if R0 lands | R0 is first for exactly this reason — it is a privacy hole, not a scoring detail |
| A judge asks for a number we cannot reproduce | Low | Every figure in our docs names the command that produced it |
| OpenRouter key abuse | Low | Rotate after the finale, set a spend limit now |

---

## 8. Working rules

Binding rules are in [`AGENT_RULES.md`](AGENT_RULES.md). The three that matter
most here:

- **No unmeasured claims.** No performance number enters any document until a
  named command has produced it. A FAILED row is an asset; a fabricated PASSED row
  is what loses the round. We have already had to strip invented figures once.
- **No site-specific anything.** No hardcoded selectors, IDs, or per-domain
  branches in detection, redaction or execution. The finale pages are unknown; a
  detector that needs to know which site it is on is wrong. This is also why R3
  uses an open-vocabulary model rather than a fixed-class classifier.
- **Fail closed.** On an unfamiliar page, refusing to transmit is the correct
  outcome. Over-masking is recoverable in front of a jury; leaking PII is not.

---

## 9. Verification

```bash
npm run build              # all artifacts including the harness bundle
npm test                   # unit and integration tests
npm run benchmark          # detector-level PII + ablations
npm run benchmark:browser  # real Chrome: redaction, visual context, resources
npm run verify:redaction   # pixel-true masking, with safe-control controls
npm run test:e2e           # full extension against a live model
npm run compare:models     # model and payload-size latency sweep
```

Manual gates no automation covers:

1. The outgoing `/api/v1/reason` screenshot is full-size with visible masks — never 1×1.
2. Ablate a detector; the browser harness must report lower recall. If the number
   does not move, the harness is circular again.
3. Disable the DOM perception source entirely; the harness must still report a
   non-zero visual-context accuracy, with the engaged execution provider and model
   family reported truthfully.
4. A 3+ step task completed live on a page nobody on the team has seen.
