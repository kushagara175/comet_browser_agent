# PrivaPilot — SIH26171 Build Plan (R4 → Finale)

**Problem statement:** SIH26171 — *On-device Visual Perception for Light-weight Browser Agents*
**Organisation:** ISRO / Department of Space · Category: Software · Theme: Smart Automation
**Plan date:** 7 Sep 2026 · **Working deadline:** 20 Sep 2026, 23:59 IST
**Status assumed:** R0–R3 complete (100% pixel-verified redaction, RedactionManifest on the wire, on-device DecisionRouter, CLIP ViT-B/32 vision tower)
**Includes:** teardown of the reference build in *"Final Lap SIH-2026 171"* (Chandan Meher), reconstructed frame-by-frame from the video

> ⚠️ **Deadline check.** Your working deadline is 20 Sep. The public PS listing shows a submission deadline of **30 Sep 2026**. Verify on the official SIH portal. This plan assumes 20 Sep.
>
> ⚠️ Written without repo access. Items marked **[verify]** are assumptions about PrivaPilot's code.

---

## 1. What the PS actually asks for

| Requirement | Non-negotiable |
|---|---|
| A **local Vision Transformer** evaluates the user's screen and **makes decisions** | Vision must be on-device and *decision-bearing*, not decorative |
| Sanitisation happens **before** any network request, via DOM tags or comparable techniques | Redaction is client-side and provable |
| Dynamic detection of faces, passwords, personal identifiers | Must generalise to unseen pages |
| Server runs **open-source / open-weight** models on anonymised context | Closed models are a rubric risk |
| Server returns **actionable responses** ("click submit", extracted data) | The agent must act, not describe |
| **End-to-end task demonstration** | The demo is a graded artefact |

**Weights:** visual context accuracy 25% · sensitive-data detection recall+precision 20% · redaction precision 20% · client resource utilisation 20% · end-to-end latency 15%.

Evaluation pages are handed out at the finale. **No hardcoded selectors anywhere in the shipped path.**

---

## 2. Teardown of the reference build in the video

The video is a 3:22 screen recording of a working Chrome MV3 extension called **"Browser Agent — SIH26171 Privacy-Preserving Agent"**. It's a well-executed prototype and the best available read on what the competition looks like. Here is what it actually does, reconstructed from the on-screen console and DevTools.

### 2.1 UI

A side panel with three tabs — **Run Agent**, **Privacy Audit**, **IndexedDB Vault** — and an `● ON-DEVICE` badge in the header.

- **Run Agent:** one free-text box ("Natural Language Instruction") + a single **Run Automated Agent** button. That's it. No settings, no site config.
- **Persistent trust banner:** `✓ Privacy Status: Airtight` / `0 BYTES LEAKED`, with the resting subtitle *"Ready to resolve references locally without sending raw values."*
- **After a run**, the same banner reports: *"Agent executed 3 actions (3 protected fields resolved on-device, 0 fields filled, 1 clicks). 0 bytes of raw PII left this device."*
- **On-Device Latency Breakdown** panel, four numbers, always visible after a run:
  `Local NER Model: 14ms · Redaction Engine: 1ms · Cloud VLM Reasoning: 13ms · DOM Action Injector: 497ms`
- **Privacy Audit tab:** a live side-by-side for the active page —
  - *Local Browser (Decrypted)*: `Enter your email: <real address>` · `Password: ******** (Blocked)`
  - *Cloud VLM Payload*: `Enter your email: <EMAIL_1>` · `Password: EXCLUDED`

### 2.2 Pipeline, from their own console log

```
[IndexedDB-Vault]        Database 'BrowserAgent_SecretStore_v1' active in background service worker.
[Browser-Agent]          Starting On-Device Agent Workflow
[User-Task]              "go to ilovepdf.com and login"
[Agent-Navigator]        Navigating active tab to https://ilovepdf.com/login...
[Secret-Store]           Loaded 15 on-device secrets from vault
[Perception]             Discovered 10 interactive elements on active page (3ms).
[Privacy-Engine]         Shielded 2 sensitive fields with abstract tokens (1ms)
[Zero-Leakage Invariant] 0 bytes raw PII transmitted. Passwords strictly excluded.
[Remote-VLM]             Transmitting abstract payload to Backend (POST http://localhost:3000/api/reason)...
[Remote-VLM]             VLM Reasoning Plan Received (5ms)
[Reference-Resolver]     Resolved EMAIL_1 on-device (IndexedDB AES-GCM) → "amr***"
[Reference-Resolver]     Resolved PASSWORD_1 on-device (IndexedDB AES-GCM) → "Amr****"
[Reference-Resolver]  ⚠  No secret found for FIELD_1, skipping
[DOM-Executor]           Clicking "loginBtn"
[Agent-Completion]    ✅ Task completed successfully with zero privacy leakage!
```

Second run on a different site: *Discovered 30 interactive elements (14ms)*, same flow, ends `Clicking "agent-element-14"`.

### 2.3 Wire protocol (from the Network panel)

Server response, `POST localhost:3000/api/reason`:

```json
{
  "response_type": "action",
  "actions": [
    { "action": "TYPE_REFERENCE", "target": "email",            "reference": "EMAIL_1" },
    { "action": "TYPE_REFERENCE", "target": "password",         "reference": "PASSWORD_1" },
    { "action": "TYPE_REFERENCE", "target": "agent-element-29", "reference": "FIELD_1" },
    { "action": "CLICK",          "target": "agent-element-14" }
  ]
}
```

**Two full end-to-end tasks: 2 requests, 1.1 kB transferred.** They showed that counter on screen.

### 2.4 The one idea worth stealing outright — `TYPE_REFERENCE`

The server never sends a *value*; it sends an instruction to type **the thing behind reference `EMAIL_1`**. The client resolves that reference against an AES-GCM-encrypted IndexedDB vault of the user's own saved secrets and injects it into the DOM. The server can drive a password field it has never seen and cannot ever see.

This makes "0 bytes of raw PII left the device" **literally, checkably true** rather than a claim about redaction quality — and it survives the hardest judge question, *"what if your detector misses something?"*, because values never travel in the first place.

If PrivaPilot doesn't already have this, **add it. It is a 1–2 day build and it is the strongest privacy argument available for this PS.** [verify whether your opaque `el_17` refs already cover the *value* side, or only the *element* side]

### 2.5 Where the reference build is weak — this is your opening

| Their gap | Evidence from the video | Rubric cost |
|---|---|---|
| **No vision at all.** "Perception" is a DOM walk. | *"Discovered 10 interactive elements (3ms)"* — a ViT cannot run in 3ms; a `querySelectorAll` can. Their only model is a *"Local NER Model: 14ms"*, i.e. text. | **The entire 25% visual-context line**, plus the PS's central requirement of a local Vision Transformer |
| **No pixel redaction.** Only DOM-text token substitution. | Audit panel compares DOM strings; no screenshot appears anywhere | Redaction precision (20%) is only half-covered |
| **Faces never handled.** | Not mentioned once; no image path exists | PS names faces explicitly |
| **The cloud VLM is almost certainly not a VLM.** | *"Cloud VLM Reasoning: 5ms / 13ms"* against `localhost:3000` — no vision-language model returns a 4-step plan in 5ms. It's a mock or a rule engine. | Fails "open-weight model processing anonymised **visual** context" if a judge probes it |
| **No resource governance.** | No memory/CPU figure anywhere | The full 20% client-resources line is unevidenced |

**Read this correctly.** They have built a beautiful, honest-looking *privacy* demo with **no perception**. You have built real perception with weaker demo theatre. The finale is won by whoever closes their own gap faster — and yours (make vision visible and measured) is a build problem you're already mid-way through, while theirs (build vision from zero in two weeks) is much harder.

Do not, however, mistake their polish for fluff. The audit panel, the byte counter and the named-module console log are cheap to build and they are exactly what a judge remembers. **Copy the theatre. Keep your substance.**

---

## 3. Where you stand, scored against the rubric

| Rubric line | Weight | Current state (R0–R3) | Gap |
|---|---|---|---|
| Visual context accuracy | 25% | CLIP ViT-B/32 tower exists; DOM still primary **[verify]** | **Largest gap — and your biggest differentiator.** Vision must run on every page and demonstrably contribute. This is R4. |
| Sensitive-data detection | 20% | Detector pipeline + on-device DecisionRouter | Needs measured recall/precision on a held-out set |
| Redaction precision | 20% | 100% pixel-verified redaction, RedactionManifest on the wire | **Strongest area.** Add over-redaction measurement; add reference-based value protection (§2.4) |
| Client resource utilisation | 20% | Ungoverned **[verify]** | **Second largest gap.** R6. |
| End-to-end latency | 15% | Unmeasured **[verify]** | Needs p50/p95 and an enforced budget |

**Strategic read:** 45% sits in visual context + client resources, and those two pull against each other — a bigger vision model buys accuracy and costs resources. R4 and R6 must be built as one trade-off. The other 35% is mostly **measurement work**: you probably already perform acceptably, but an unmeasured claim scores as an unproven claim.

---

## 4. Target end-state architecture

```
┌─────────────────────── CLIENT (MV3 extension) ────────────────────────┐
│                                                                       │
│  Capture        captureVisibleTab + DOM snapshot                      │
│                 → RawCapture { pixels, domTree, viewport, url_hash }  │
│                                                                       │
│  Perception     ┌── DOM lane: roles, ARIA, input types ─────────────┐ │
│  (parallel)     └── Vision lane: local ViT → region embeddings ─────┘ │
│                            ↓ Fusion (R4)                              │
│                 → SceneGraph { elements, roles, affordances,          │
│                                confidence, provenance }               │
│                                                                       │
│  Detection      PII detectors over BOTH lanes:                        │
│                   • regex + checksum + NER on DOM text                │
│                   • OCR on pixels (canvas / img / shadow DOM)         │
│                   • face detector on pixels                           │
│                   • input-type & autocomplete heuristics              │
│                 → DetectionReport { regions, class, confidence }      │
│                                                                       │
│  Redaction      Pixel blackout + DOM token substitution               │
│                 → SanitizedContext + RedactionManifest                │
│                                                                       │
│  Vault (NEW)    AES-GCM IndexedDB secret store, service-worker owned  │
│                 Values NEVER serialised into any payload              │
│                                                                       │
│  DecisionRouter LOCAL_ACT | ESCALATE | REFUSE                         │
│                                                                       │
│  Governor (R6)  Frame budget, model tier, backpressure, memory        │
│                 ceiling, WebGPU→WASM fallback                         │
│                                                                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ NetworkPayload — refs only, no values
                                ▼
┌────────────────── SERVER (stateless gateway) ─────────────────────────┐
│  Verifier: reject any payload whose manifest doesn't cover its pixels │
│  VLM: open-weight (Qwen2.5-VL) → ActionPlan                           │
│  → [{ action:"TYPE_REFERENCE", target:"el_17", reference:"EMAIL_1" }, │
│     { action:"CLICK",          target:"el_29" }]                      │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
       Client resolves el_* → element, EMAIL_1 → vault value, acts
```

**Three invariants to defend to judges:**

1. **The server never sees a selector or a raw string.** Elements cross as opaque refs only the client can resolve.
2. **The server never sees a secret value.** `TYPE_REFERENCE` + local vault. Redaction becomes defence-in-depth, not the only line.
3. **Redaction is verified, not asserted.** A server-side verifier rejects an unsanitised payload — two hours of work, and a demo moment you can trigger live.

---

## 5. Remaining phases

### R4 — Vision on every page (DOM-ablated perception + fusion) · **highest value**

**Why:** 25% of the score, the PS's central requirement, and — per §2.5 — the axis on which you beat the field.

**Deliverables**
- Vision lane runs on every capture, not as a fallback.
- **DOM-ablation harness:** run the pipeline with the DOM lane disabled and measure surviving task accuracy. That number *is* your evidence of visual competence. Put it on a slide.
- **Fusion policy**, explicit and auditable:
  - DOM wins on: input type, ARIA role, form semantics, tab order.
  - Vision wins on: canvas / `<img>` / shadow-DOM / iframe content, visual salience, layout grouping, "which is the primary CTA", anything DOM claims exists but is visually occluded.
  - Conflict → drop the lower-confidence lane, log the conflict into the manifest.
- Vision must catch a class of element DOM cannot. **Showcase canvas-rendered text and image-embedded PII** — that is precisely where the reference build returns nothing.

**Acceptance criteria**
- Vision-only mode completes ≥1 full end-to-end task on a page the team has never seen.
- On a 20-page held-out set, fusion beats both DOM-only and vision-only on element-identification F1.

**Effort:** 3–4 days. Start now.

---

### R6 — Resource governance · **parallel with R4**

**Deliverables**
- **Model tiering**, selected at runtime: T0 heuristics/DOM only · T1 CLIP ViT-B/32 · T2 heavier VLM on escalation when budget allows.
- **Budgets enforced in code**: max ms/frame, max MB resident, max captures/min. Over budget → downgrade a tier, never queue unbounded work.
- **Capability detection and fallback:** WebGPU → WASM SIMD threads → CPU. Assume the finale machine has no working WebGPU.
- **Debounce** on meaningful mutation (throttled MutationObserver), not on a timer.
- **Instrumentation panel** in the side panel: live ms/frame, MB, active tier, cache hit rate. The reference build shows four latency numbers and it reads as rigour; show resource numbers too and you go one better.

**Acceptance criteria**
- Stated MB ceiling and ms/frame held on a mid-range laptop with WebGPU disabled.
- Tier downgrade demonstrable live (throttle CPU in DevTools → drops to T1/T0 and keeps working).

**Effort:** 2–3 days, overlapping R4.

---

### R5/R7 — Detection breadth, the vault, and measurement

**Deliverables**
- **Encrypted vault + `TYPE_REFERENCE`** (§2.4). AES-GCM in IndexedDB, owned by the service worker, key never leaves the client. Add `TYPE_REFERENCE` to the action schema in `packages/protocol`. **Priority: do this before the detector breadth work** — it is small and it upgrades your whole privacy story.
- Detector coverage:
  - **Faces:** BlazeFace/YuNet-class ONNX on pixels.
  - **Passwords:** `input[type=password]`, `autocomplete` tokens, **plus** a visual masked-field detector so custom widgets are caught.
  - **Personal identifiers:** Aadhaar, PAN, phone, email, card, DOB, address, names — validated regex with checksums (Verhoeff for Aadhaar, Luhn for cards) to protect precision, plus a small NER pass for names/addresses.
  - **OCR lane** on pixels so PII inside images and canvas is caught. This is also what makes R4's vision lane earn its keep.
- **Held-out evaluation set:** 40–60 pages built *after* detectors are frozen. Include Indian government/banking/e-commerce layouts and adversarial cases: PII in a screenshot, in a `<canvas>`, in SVG `<text>`, split across DOM nodes, in a tooltip, RTL text.
- **Report recall *and* precision.** Over-redaction is penalised as hard as under-redaction — a blacked-out page scores zero on visual context. Track the over-redaction rate explicitly.

**Acceptance criteria:** recall ≥95%, precision ≥90% on the held-out set, confusion matrix in the deck; zero PII pixels escaping on the adversarial subset.

**Effort:** 2 days (vault ~1, detectors + eval set ~2, overlapping).

---

### R8 — Latency budget

- Instrumented spans: capture → perceive → detect → redact → route → network → plan → act.
- p50/p95 for the full loop, per tier, with and without WebGPU.
- Optimisations by payoff: perception cache keyed on DOM-hash + viewport-hash; parallel detect/perceive; streamed server response; downscaled capture for T1.

**Target:** p95 ≤2.5s for an escalating task, ≤400ms for a locally-resolved one. Note the reference build's `DOM Action Injector: 497ms` — DOM execution, not inference, is the real latency floor. Budget accordingly and don't over-optimise the model path.

**Effort:** 1–2 days.

---

### R9 — Finale package

Demo task (§7), deck, architecture diagram, metrics one-pager, 3-minute video, README with a one-command run. **Judge-proof setup:** weights bundled or pre-cached, unpacked-extension install, local server, offline/mock mode for venue Wi-Fi failure.

---

## 6. Day-by-day, 7 → 20 Sep

| Days | Track A (you) | Track B (Gemini / second agent) |
|---|---|---|
| **7–8 Sep** | R4: vision lane on every page; SceneGraph schema in `packages/protocol` | R6: capability detection, tier scaffold, instrumentation panel |
| **9–10 Sep** | R4: fusion policy + conflict logging | R6: budget enforcement, downgrade path, debounce |
| **11 Sep** | R4: DOM-ablation harness; first vision-only task run | **Vault + `TYPE_REFERENCE`** end to end |
| **12–13 Sep** | R5: face + masked-field detectors; checksum-validated identifiers | Held-out evaluation set (freeze detectors first); OCR lane wired in |
| **14 Sep** | **Measurement day.** Detection, redaction, latency, resource benchmarks end to end → committed `BENCHMARKS.md`. | Server-side sanitisation verifier |
| **15–16 Sep** | Fix what the numbers exposed. Re-measure. | Privacy Audit panel + named-module console logging (§8); demo hardening on 3 unseen sites |
| **17 Sep** | **Feature freeze.** Bug fixes only. | Deck + architecture diagram + metrics one-pager |
| **18 Sep** | Full dry run, clean machine, WebGPU off, fresh clone | Demo video recording |
| **19 Sep** | Second dry run with a teammate driving from the README alone | Buffer |
| **20 Sep** | Submit by 18:00 IST. Not 23:00. | — |

**14 Sep is the load-bearing line.** Four of five rubric items are scored on numbers. Arrive without them and you argue from adjectives against a team with a table.

---

## 7. The end-to-end demo

Take the reference build's structure — it is well designed — and add the thing they cannot do.

**Act 1 — parity (30s).** Autonomous login on a real site from a plain instruction ("go to \<site\> and log in"), driven by the vault. Show the byte counter. This matches their demo exactly.

**Act 2 — the differentiator (60s).** A page where the DOM is a dead end: a form rendered into `<canvas>`, a profile photo, an ID number baked into an image. Their agent finds nothing. Yours reads the screen, redacts the face and the ID in pixels, and completes the task. **Then show the redacted screenshot that actually left the browser, side by side with the screen.** This is the moment that wins the redaction 20% and the visual-context 25% in the same breath.

**Act 3 — the invariant (20s).** Flip a flag disabling client redaction; show the server verifier refusing the payload. Twenty seconds, demonstrates defence in depth.

**Act 4 — the numbers (20s).** The instrumentation panel: latency breakdown, memory, active tier, and the ablation figure.

---

## 8. Presentation features to build (cheap, high-return)

Straight from the reference build, because they work:

- `● ON-DEVICE` badge and a persistent **`0 BYTES LEAKED`** counter — count real bytes, not a hardcoded zero.
- **Privacy Audit tab**: side-by-side *Local (decrypted)* vs *Payload sent*, live for the active page. Extend theirs by including the **redacted screenshot**, which they have nothing to put in.
- **Named-module console logging** with per-stage timings (`[Perception]`, `[Privacy-Engine]`, `[Zero-Leakage Invariant]`, `[Reference-Resolver]`, `[DOM-Executor]`). A judge who opens DevTools sees your whole pipeline narrate itself. Cheap, and it reads as engineering maturity.
- **Latency + resource panel** always visible after a run.
- One instruction box, one button. Resist adding settings.

---

## 9. Technical decisions to lock now

| Decision | Recommendation | Rationale |
|---|---|---|
| Client inference runtime | ONNX Runtime Web (WebGPU EP, WASM fallback) for detectors; Transformers.js for the tower | ORT gives explicit EP control and better memory behaviour across many small models |
| Vision tower | Keep CLIP ViT-B/32 as T1; consider a small VLM (SmolVLM-class) as T2 only if ablation proves the tower is the bottleneck | Don't swap the tower this late |
| Server VLM | Qwen2.5-VL via OpenRouter — **open-weight, matches the PS**; keep the mock path | Say "open-weight" explicitly in the deck; judges check |
| OCR | PP-OCR-class ONNX in-browser | Needed for image/canvas PII and for the ablation story |
| Face detection | BlazeFace/YuNet-class ONNX | Tiny, fast, no licensing friction |
| Secrets | AES-GCM in IndexedDB, service-worker owned, `TYPE_REFERENCE` on the wire | Makes zero-leak literally true |
| Wire format | Opaque element refs and value refs only | No selectors, no strings, nothing re-identifiable |

**No new framework after 13 Sep.** Everything past the freeze goes to measurement and rehearsal.

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Finale eval pages break generalisation | High | Ban selectors in review; test on 3 sites nobody on the team chose |
| No WebGPU on the demo machine | Medium | WASM fallback tested *as the default path* |
| Venue network blocks OpenRouter | Medium | Local open-weight model or recorded fallback; mock mode already exists |
| Over-redaction tanks visual context | Medium | Measure precision; tune thresholds; bbox-level redaction, never whole regions |
| R4 balloons and eats R6 | High | Hard-stop R4 on 11 Sep; ship the fusion policy you have |
| Judges are charmed by a polished no-vision demo | Medium | Act 2 of the demo exists precisely to make the difference visible in ten seconds |

---

## 11. Submission checklist

- [ ] Extension installs unpacked; first run works offline
- [ ] Server starts with one command; mock mode works with no API key
- [ ] `BENCHMARKS.md`: detection recall/precision, redaction precision, over-redaction rate, resource ceiling, latency p50/p95 — with methodology
- [ ] `docs/PHASES.md` current through R9
- [ ] Architecture diagram matching shipped code, not the aspirational version
- [ ] Demo video ≤3 min covering all four acts
- [ ] Deck: PS restated → architecture → the three invariants → metrics table → demo → open-weight compliance statement
- [ ] Fresh-clone dry run by someone who didn't write the code
- [ ] Submitted by 18:00 IST on deadline day

---

## Sources

- Video: *Final Lap SIH-2026 171* — Chandan Meher ([youtu.be/5jYGbTEDsIo](https://youtu.be/5jYGbTEDsIo)); §2 reconstructed from its frames
- [SIH 2026 PS Viewer — SIH26171](https://sih2026-ps-viewer.vercel.app/ps/SIH26171)
- [SIH 2026 Problem Statements Explorer](https://sih2026.vuce.in/)
- [Transformers.js v3 — WebGPU support](https://www.huggingface.co/blog/transformersjs-v3)
- [PaddleOCR-based ONNX OCR for browser/Node](https://github.com/gutenye/ocr)
