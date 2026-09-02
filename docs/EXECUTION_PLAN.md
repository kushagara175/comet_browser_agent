# PrivaPilot — Execution Plan

**SIH26171 · ISRO / Department of Space · Deadline 20 September 2026, 23:59 IST**
Written 2 September 2026. Supersedes
[`archive/EXECUTION_PLAN_2026-08-31.md`](archive/EXECUTION_PLAN_2026-08-31.md).

This document is **strategy**: what we are betting on, what actually decides the
outcome, and how the two of us split it. The task board is
[`PHASES.md`](PHASES.md) — phases R0–R8, each with an exit gate. What is measured
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
| **Structurally missing** | The local vision model does not drive decisions · every step transmits · the server is not told what was redacted |

The honest summary: **we built the privacy boundary extremely well and the
perception layer only halfway.** The PS asks for a vision model that reads the
screen and decides; ours detects faces for redaction and nothing else.

---

## 2. What decides selection

Two things, and only one of them is the rubric.

### 2.1 The rubric — 100 points of it

| Metric | Weight | Where we are | Phase |
| :--- | :---: | :--- | :--- |
| Accuracy of visual context from screen | **25%** | 78.6%, and answered from the **DOM, not vision** | R3 |
| PII detection recall / precision | **20%** | 100%/100% detector-level, face unmeasured | R0 |
| Precision of redaction | **20%** | 83.3% pixel-verified, 3 under-masked | R0 |
| Client resource utilization | **20%** | 3.94 MB heap, no governance | R5 |
| End-to-end latency | **15%** | 6–7 s server, 55 ms client | R2, R4 |

### 2.2 The part that is not on the scoresheet

Every team drawing SIH26171 will demo a Chrome extension that blurs a face,
blacks out a password, ships a screenshot to a hosted VLM and clicks a button.
The architecture diagram will look like ours. **Differentiation is not the
architecture — it is what we can prove.**

---

## 3. The bet: we are the team that can prove it

Four assets no GPT-4V wrapper can reproduce on demand. All four already exist.

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
| 3 | *"local ViT … **reads the screen and takes decision**"* | Vision detects faces for redaction only | **R3** — biggest, riskiest, most aligned |
| 4 | *"balance the trade-offs between latency and accuracy"* | Scattered constants, no policy | **R4** |

**R3 is the one that changes the pitch.** Until it lands we are a DOM agent with a
face blurrer; after it we are what the PS describes. It also unlocks the surfaces
where we are currently blind — canvas apps, cross-origin iframes, closed shadow
roots — which is the honest answer to "what happens on a page without a helpful
DOM?"

---

## 5. Division of labour

Two people, two tracks, one shared interface agreed before either starts: the
`PerceptionSource` contract and the `redactionManifest` shape.

| | **Track A — Perception & Decision** | **Track B — Correctness & Compatibility** |
| :--- | :--- | :--- |
| Owns | R2 local decision tier, R3 vision as perception, R4 policy | R0 defect closure, R1 redaction manifest, R5 resource budget, R7 Firefox |
| First move | R2 — the router is where R3's output will land | R0 — the face defect is a live privacy hole |
| Shared | R6 generalisation and rehearsal, R8 freeze and submit |

Track B's R0 and R1 are independent of Track A and can land in any order. R3
should not begin until R2's router exists, or it has nowhere to plug in.

---

## 6. The demo

Five minutes. The goal is not "it works" — every team shows that. The goal is
**"we can prove nothing leaked."**

1. **Let the jury pick the page.** Open something nobody prepared. This is the
   single highest-credibility move available, and it is only possible if R6 is
   done. If we cannot do it live, the pipeline is overfitted and we should fix
   that rather than hide it.
2. **Raw versus redacted, side by side.** The side panel already does this.
3. **Show the wire.** Display the actual JSON payload leaving the machine. Not a
   diagram of it — the bytes.
4. **Try to leak.** Plant the canary, watch the run fail closed and transmit
   nothing. This is the moment the demo is won.
5. **Complete a real task.** A 3–4 step approval workflow with a confirmation
   prompt on the protected submit step.
6. **Show the scoreboard, failures included.** Then ablate a detector live and
   show the number move.

**Have a recorded backup.** Venue wifi is a single point of failure for a
hosted model.

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
| :--- | :--- | :--- |
| Venue internet fails, hosted model unreachable | Medium | Local Ollama path already works — rehearse the `.env` switch until it takes ten seconds |
| 6–7 s latency reads as "slow" to judges | High | R2 removes the round trip entirely for simple steps; R4 lets us pick a faster policy live. Narrate it: perception is 55 ms, the wait is the reasoning model |
| An unseen page breaks the agent live | Medium | Fail-closed is the designed outcome and a *good* look — rehearse saying so. R6 reduces the chance |
| R3 destabilises a working pipeline | Medium | Ships behind the `PerceptionSource` seam; DOM stays the default source and vision is additive |
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
  detector that needs to know which site it is on is wrong.
- **Fail closed.** On an unfamiliar page, refusing to transmit is the correct
  outcome. Over-masking is recoverable in front of a jury; leaking PII is not.

---

## 9. Verification

```bash
npm run build              # 11 artifacts including the harness bundle
npm test                   # 160 unit and integration tests
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
3. Disable the DOM avatar heuristic; a 3-face fixture must still produce 3 boxes
   from the model alone, with the engaged execution provider reported truthfully.
4. A 3+ step task completed live on a page nobody on the team has seen.
