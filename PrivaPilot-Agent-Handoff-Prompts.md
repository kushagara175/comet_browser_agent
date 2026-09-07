# PrivaPilot — Coding Agent Handoff Prompts

Six self-contained prompts. **Block A** is shared context — paste it at the top of every session, then paste exactly one task prompt beneath it. Each task prompt assumes a fresh agent with no memory of the others.

Run **P1 + P2 in parallel** (Claude on one, Gemini on the other), then **P3**, then **P4**, then **P5**, then **P6**.

---

## Block A — shared context (prepend to every prompt)

```
You are working on PrivaPilot, a monorepo entry for Smart India Hackathon 2026,
problem statement SIH26171 (ISRO): "On-device Visual Perception for Light-weight
Browser Agents".

WHAT THE PROBLEM STATEMENT REQUIRES
- A local Vision Transformer runs in the browser, evaluates the user's screen, and
  makes decisions. Vision must be decision-bearing, not decorative.
- All sanitisation of sensitive/PII data happens client-side BEFORE any network
  request. Faces, passwords and personal identifiers must be detected dynamically.
- Only anonymised context reaches the server, where an open-source/open-weight
  language or vision model returns executable browser actions.
- Judged on: visual context accuracy 25%, sensitive-data detection recall+precision
  20%, redaction precision 20%, client resource utilisation 20%, end-to-end latency
  15%.

HARD CONSTRAINTS — violating any of these fails the submission
1. NO HARDCODED SELECTORS, no site-specific rules, no per-domain config anywhere in
   the shipped path. Evaluation pages are handed out at the finale and nobody has
   seen them. If you are tempted to write `if (host === '...')`, stop and generalise.
2. Raw PII must never be serialised into a network payload. Not in logs sent
   anywhere, not in telemetry, not in error messages.
3. Every claim must be measurable. If you add a capability, add the measurement for
   it in the same change.
4. Server models must be open-weight. Do not introduce a closed model dependency.

REPO SHAPE
- apps/extension — Chrome MV3 extension (capture, perception, detection, redaction,
  DecisionRouter, DOM execution)
- apps/server — stateless gateway; VLM is Qwen2.5-VL via OpenRouter, mocks when
  VLM_ENDPOINT is unset
- packages/protocol — shared types for the pipeline:
  RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
- docs/PHASES.md — phase roadmap R0..R9

CURRENT STATE
R0-R3 are complete: redaction is 100% pixel-verified, a RedactionManifest travels on
the wire, the DecisionRouter runs on-device, and a CLIP ViT-B/32 vision tower exists.
R4-R9 remain.

HOW TO WORK
- Read the existing code before changing it. Match the conventions already there;
  do not restructure the repo.
- Put shared types in packages/protocol, never duplicated across apps.
- Small commits, each one leaving the extension in a loadable state.
- If a design decision in your task conflicts with what you find in the code, say so
  and stop rather than guessing. State your assumption explicitly.
- Do not add a new framework or heavy dependency without saying why in one line.
```

---

## P1 — R4: vision on every page (DOM-ablated perception + fusion)

> **This is the highest-value task in the project.** Visual context accuracy is 25% of the score and it is the single requirement competing teams are skipping.

```
TASK: R4 — make the local vision model perceive every page, and fuse its output with
the DOM lane.

Today the DOM lane is effectively the primary perception path and the CLIP tower is
secondary. Invert that relationship: both lanes run on every capture, and a fusion
step decides per element which lane to trust.

BUILD

1. SceneGraph type in packages/protocol:
   SceneGraph {
     elements: Array<{
       ref: string            // opaque, e.g. "el_17" — the ONLY element identifier
                              // that may cross the network boundary
       bbox: [x, y, w, h]
       role: string           // button | input | link | text | image | container...
       affordances: string[]  // clickable | typable | selectable | scrollable
       confidence: number
       provenance: 'dom' | 'vision' | 'fused'
       labelHint?: string     // visible label, already PII-screened
     }>
     conflicts: Array<{ ref, domClaim, visionClaim, resolvedTo }>
   }

2. Vision lane runs on EVERY capture, in parallel with the DOM lane, not as a
   fallback. Produce region embeddings and candidate elements from pixels alone.

3. Fusion policy — implement it as explicit, readable, auditable rules. No ML here:
   - DOM wins on: input type, ARIA role, form semantics, tab order, disabled state.
   - Vision wins on: canvas / <img> / shadow-DOM / iframe content, visual salience,
     layout grouping, "which of these is the primary CTA", and anything the DOM
     claims exists but is visually occluded, zero-sized or offscreen.
   - On conflict: keep the higher-confidence lane, drop the other, and append an
     entry to SceneGraph.conflicts. Never silently discard a disagreement.

4. DOM-ablation harness at scripts/ablate.ts (or the repo's existing script
   convention):
   - Runs the full pipeline with the DOM lane disabled.
   - Reports task success rate and element-identification F1 for three modes:
     dom-only, vision-only, fused.
   - Takes a directory of saved page fixtures so it runs offline and repeatably.
   This harness output is our primary evidence of visual competence — treat it as a
   deliverable, not a dev tool.

5. Prove vision catches something the DOM cannot. Add fixtures where the target is a
   form rendered into <canvas> and an identifier baked into an <img>. Vision-only
   must succeed on these; DOM-only must fail. Keep these fixtures in the repo.

ACCEPTANCE
- Vision-only mode completes at least one full end-to-end task on a page not used
  during development.
- On a 20-page held-out fixture set, fused beats both dom-only and vision-only on
  element-identification F1. Print the table.

DELIVERABLE: the code, the fixtures, and the ablation table pasted into your summary.

HARD STOP: if this is not done in 4 days, ship the fusion policy you have and move
on. Do not let R4 consume R6.
```

---

## P2 — R6: resource governance (run in parallel with P1)

```
TASK: R6 — put the client under an enforced resource budget, and make that budget
visible.

Client resource utilisation is 20% of the score and is currently ungoverned. R4 is
landing more vision work in parallel with this, which will make usage worse unless
this lands with it.

BUILD

1. Model tiering, selected at RUNTIME (never compile time):
   - T0: heuristics + DOM only, no model — static, low-risk pages
   - T1: CLIP ViT-B/32 — the default
   - T2: heavier VLM — only when the DecisionRouter escalates AND budget allows
   Tier selection must be observable and forced-overridable for demos.

2. Budgets enforced in code, not documented in a README:
   - max ms per perception frame
   - max MB resident
   - max captures per minute
   Exceeding a budget downgrades the tier. It must NEVER queue unbounded work or
   silently drop into a backlog. Implement backpressure explicitly.

3. Capability detection and graceful fallback: WebGPU -> WASM SIMD+threads -> CPU.
   Assume the finale demo machine has no working WebGPU. The WASM path must be
   tested as a first-class path, not an afterthought — write the test that runs the
   full pipeline with WebGPU forcibly disabled.

4. Debounce perception on meaningful DOM mutation (throttled MutationObserver), not
   on a timer. Cache perception results keyed on (DOM-hash, viewport-hash) so a
   repeat capture of an unchanged page is near-free.

5. Instrumentation panel in the extension side panel, visible after every run:
   live ms/frame, MB resident, active tier, cache hit rate.

ACCEPTANCE
- The extension holds a stated MB ceiling and ms/frame on a mid-range laptop with
  WebGPU disabled. State the numbers you chose and why.
- Tier downgrade is demonstrable live: throttle CPU 6x in DevTools, watch it drop to
  T1 then T0, and keep completing tasks.

DELIVERABLE: the code plus the measured numbers in both WebGPU and WASM modes.
```

---

## P3 — Encrypted vault + TYPE_REFERENCE on the wire

> Small task, disproportionate payoff. It turns "we redact well" into "values never travel", which survives the question *"what if your detector misses one?"*

```
TASK: add a client-side secret vault and a reference-based action type, so the server
can drive fields whose values it has never seen.

Today the server receives sanitised context and returns actions. The remaining
exposure is that any action carrying a VALUE (e.g. type "user@example.com") means
that value was known server-side. Close it.

BUILD

1. Vault in apps/extension:
   - AES-GCM encrypted store in IndexedDB, owned by the background service worker.
   - Key material never leaves the client and is never serialised into any payload.
   - Holds user-supplied secrets keyed by a stable reference id: EMAIL_1, PASSWORD_1,
     PHONE_1, ADDRESS_1, and so on.
   - Simple UI to add/remove entries. No cloud sync, no export.

2. Extend the action schema in packages/protocol:
     { action: 'TYPE_REFERENCE', target: '<opaque element ref>', reference: 'EMAIL_1' }
   alongside the existing CLICK / TYPE / NAVIGATE actions.

3. Reference resolution happens ONLY on the client, at execution time, immediately
   before DOM injection. The resolved value must never be logged in full, never
   returned to the server, and never written outside the vault.

4. When the server asks for a reference the vault does not hold, skip that action,
   log it, and continue the plan. Do not fail the whole task.

5. Enforce the invariant with a test: assert that no network payload the extension
   emits contains any vault value, for every entry in the vault. This test must run
   in CI and must fail loudly.

ACCEPTANCE
- A full autonomous login on a real site completes with the server having received
  zero secret values — provable from the DevTools Network panel.
- The invariant test passes and demonstrably fails if you deliberately leak a value.

DELIVERABLE: the code, the test, and a screenshot of the Network panel showing the
request payload with references only.
```

---

## P4 — Detection breadth and the held-out evaluation set

```
TASK: broaden PII detection to cover everything the problem statement names, then
measure it honestly on data the detectors have never seen.

Two rubric lines depend on this: detection recall+precision (20%) and redaction
precision (20%). Note that OVER-redaction is penalised as hard as under-redaction —
a page blacked out to be safe scores zero on visual context. Precision matters as
much as recall.

BUILD

1. Faces: a small ONNX face detector (BlazeFace/YuNet class) over captured pixels.

2. Passwords: input[type=password] and autocomplete tokens, PLUS a visual
   masked-field detector so custom/canvas widgets are caught. Do not rely on the DOM
   alone here.

3. Personal identifiers: Aadhaar, PAN, phone, email, card number, DOB, postal
   address, personal names. Use validated patterns with checksums where one exists
   (Verhoeff for Aadhaar, Luhn for cards) to protect precision, plus a small NER pass
   for names and addresses.

4. OCR lane over pixels (PP-OCR class ONNX), so PII inside images, canvas and
   shadow DOM is caught. Feed its output into the same DetectionReport.

5. THEN FREEZE THE DETECTORS. Only after freezing, build a held-out evaluation set of
   40-60 pages. Include Indian government, banking and e-commerce layouts, and these
   adversarial cases:
   - PII inside a screenshot image
   - PII rendered into <canvas>
   - PII in SVG <text>
   - a value split across sibling DOM nodes
   - PII in a hover tooltip
   - right-to-left text
   Do not tune the detectors on this set. If you tune, it stops being held-out and
   the numbers become worthless.

ACCEPTANCE
- Recall >= 95% and precision >= 90% on the held-out set, reported with a confusion
  matrix per PII class.
- Zero PII pixels escape on the adversarial subset, verified by the existing
  pixel-verification harness.
- Over-redaction rate reported explicitly as its own number.

DELIVERABLE: the detectors, the evaluation set committed to the repo, and the full
metrics table.
```

---

## P5 — Measurement day: BENCHMARKS.md

> Run this once P1–P4 have landed. Four of the five rubric lines are scored on numbers. This task produces them.

```
TASK: measure the whole system end to end and write docs/BENCHMARKS.md.

You are not improving anything today. You are measuring what exists, honestly,
including where it is bad. A number we can defend beats a number we wish were true.

BUILD

1. Instrument spans across the full loop: capture -> perceive -> detect -> redact ->
   route -> network -> plan -> act.

2. Produce, each with its methodology written next to it:
   - Detection recall and precision per PII class, on the held-out set
   - Redaction precision and the over-redaction rate
   - Element-identification F1 for dom-only / vision-only / fused (the ablation
     table)
   - Peak MB resident and ms per perception frame, in WebGPU and WASM modes
   - End-to-end latency p50 and p95, split by tier, for a locally-resolved task and
     for an escalating task
   - Total bytes transmitted per completed task

3. Write docs/BENCHMARKS.md. For every number: how it was measured, on what hardware,
   with what sample size, and what it excludes. State limitations plainly.

4. List the three weakest numbers and, for each, the single change most likely to
   improve it. Do not implement them — just name them.

ACCEPTANCE: every claim in our deck can point at a line in this file.

DELIVERABLE: docs/BENCHMARKS.md, committed.
```

---

## P6 — Demo, audit UI, and finale packaging

```
TASK: build the presentation layer and make the repo judge-proof.

The pipeline being correct is not the same as a judge being able to SEE that it is
correct. This task is about visible evidence.

BUILD

1. Privacy Audit view in the side panel — a live side-by-side for the active page:
   - LEFT "Local (decrypted)": what the browser actually holds
   - RIGHT "Payload sent": exactly what left the device — reference tokens, EXCLUDED
     passwords, and THE REDACTED SCREENSHOT ITSELF
   The redacted screenshot in the right pane is the important part. Show the image
   that crossed the network boundary, not a description of it.

2. A persistent trust banner: on-device status and a byte counter for raw PII
   transmitted. Count real bytes measured at the network boundary. Never hardcode a
   zero — if something leaks, this must say so.

3. Named-module console logging with per-stage timings, so a judge who opens DevTools
   watches the pipeline narrate itself:
   [Perception] [Privacy-Engine] [Zero-Leakage-Invariant] [Reference-Resolver]
   [DOM-Executor] [Agent-Completion]
   Log element refs and timings. Never log a resolved secret value.

4. Latency + resource panel visible after every run: per-stage ms, MB, active tier.

5. The four-act demo, scripted and rehearsable:
   Act 1 (30s) — autonomous login on a real site from a plain instruction, vault
     driven, byte counter visible.
   Act 2 (60s) — a page where the DOM is a dead end: a form rendered into <canvas>,
     a face, an identifier baked into an image. Complete the task, then show the
     redacted screenshot beside the real screen. This is the act that demonstrates
     on-device vision; it must not be skippable.
   Act 3 (20s) — flip a flag disabling client redaction; the server-side verifier
     refuses the payload. (Build that verifier if it does not exist: the server
     rejects any payload whose RedactionManifest does not cover its own pixels.)
   Act 4 (20s) — the numbers panel and the ablation figure.

6. Judge-proof packaging:
   - Extension installs unpacked, first run works with no network
   - Server starts with one command; mock mode works with no API key
   - Model weights bundled or pre-cached; nothing downloads at demo time
   - README that a stranger can follow start to finish

ACCEPTANCE: someone who did not write this code clones the repo, follows the README,
and reproduces all four acts without asking a question.

KEEP THE UI TO ONE INSTRUCTION BOX AND ONE BUTTON. Resist adding settings.
```

---

## Sequencing note

P1 and P2 are the two that matter and they trade off against each other — vision accuracy costs resources. Run them concurrently on separate agents and reconcile daily; do not let P1 land alone and blow the budget P2 is trying to enforce.

P3 is small and can slot into either agent's idle day. P4 must fully finish before P5 begins, or the held-out numbers are contaminated. P6 last, and only after the feature freeze.
