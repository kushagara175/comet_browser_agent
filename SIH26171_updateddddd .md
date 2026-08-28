# SIH26171 — On-Device Visual Perception for Light-Weight Browser Agents
### Project Plan v2 — corrected against the OFFICIAL problem statement text

> **v1 of this plan was based on a third-party prep document that invented details not
> in the real PS (ISRO/Bhuvan/satellite portals, full air-gapped offline requirement,
> WebGL map dragging). This version replaces that with the actual official text and a
> matching architecture. If you find the real PS wording differs anywhere from what's
> quoted below, the official wording always wins — update this file.**

---

## 1. Official Problem Statement (as given)

**Statement ID:** 26171
**Title:** On-device Visual Perception for Light-weight Browser Agents

**Background:**
AI agents with access to visual context/screen state can assist with complex workflows.
Most agentic AI pipelines run server-side, which limits what data a user can safely
share. A local agent deployed in the browser removes the need to send sensitive data to
a server. But local machines have far fewer resources than servers, so only
**non-sensitive data** (screen structure, field layout, etc.) should go to a server for
heavier processing. Modern browser tech (WebGPU, WebAssembly, ONNX Runtime Web,
Transformers.js) now makes it possible to run lightweight ML models client-side. The
goal: combine server-side reasoning power with strict client-side data privacy.

**Description:**
Build a privacy-preserving vision agent that runs in the browser:
- A local Vision Transformer (ViT) or equivalent CV model "reads" the screen and makes
  decisions based on it.
- If visual context needs to be sent to a server, it must first be **sanitized** —
  sensitive/PII data redacted (DOM tags or other methods) *before* any network request.
- Must **dynamically detect and redact** sensitive elements — e.g. blur faces, black out
  passwords, mask PII.
- Only anonymized, unidentifiable data is transmitted to a central server, which is
  aware of the redaction scheme and processes accordingly.
- The server processes the sanitized context and returns **actionable commands** for the
  browser agent to execute.
- Must balance the trade-off between inference latency and accuracy.

**Expected Solution — a working prototype with:**

*Client-side (browser extension/JS — Chrome, Firefox):*
- **Local Vision Processing** — a client-side vision model running in-browser (e.g. via
  WebGPU) that evaluates current screen state.
- **Privacy Preserving Filter** — sanitizes sensitive/personal visual data via local
  bounding-box redaction, semantic obfuscation, masking, etc. Must be clearly
  demonstrated.

*Server-side:*
- **Server Side Integration** — transmits the anonymized visual context to a centralized
  LLM/VLM, which interprets the sanitized data and returns either processed data (to be
  re-ingested by the client) or a UI action ("click the submit button," "scroll down")
  for the client to execute.
- **Participants may use any offline-deployable (open-source/open-weights) model
  server-side. During SIH, a cloud-hosted version of these is allowed.**
- Must demonstrate an end-to-end task assisting the user.

**Evaluation metrics:**

| Metric | Weight |
|---|---|
| Accuracy of visual context extraction from screen | 25% |
| Recall & precision of sensitive/PII data detection | 20% |
| Precision of redaction | 20% |
| Client-side resource utilization | 20% |
| End-to-end task latency | 15% |

---

## 2. Confirmed Official Metadata (from sih.gov.in/sih2026PS, screenshot-verified)

| Field | Confirmed value |
|---|---|
| Problem Statement ID | 26171 |
| Organization | **Indian Space Research Organisation (ISRO)** |
| Department | Department of Space / ISRO |
| Category | Software |
| Theme | **Smart Automation** (not "Miscellaneous" — earlier prep doc was wrong on this) |
| Dataset Link | *"Any open-source data can be used. Use cases for evaluation will be provided during finale."* |
| YouTube Link / Contact Info | Not provided |

**Why this matters — the one line to build your whole strategy around:**

> "Use cases for evaluation will be provided during finale."

You will **not know the actual test website/scenario in advance.** ISRO is deliberately
withholding it until judging. This confirms, as a hard requirement (not just good
practice), that the extension must work generically on arbitrary pages — a solution that
quietly only works on one rehearsed demo site will fail the moment judges hand you a
task on a page you've never seen. Generalization isn't a stretch goal here, it's the
actual test.

This also explains "Any open-source data can be used" — you're free to train/test your
redaction and detection components on any public dataset (e.g. open face-detection
datasets, synthetic PII form data) since there's no official ISRO-provided dataset to
match against.

**ISRO context itself was real** (unlike the invented Bhuvan/satellite specifics) — worth
keeping in mind for problem framing (e.g. "ISRO staff interacting with various internal
web tools") even though no specific ISRO portal is named or guaranteed as the test
target.

---

## 3. What This Actually Means for Us — Key Corrections

- **This is not a fully-offline system.** The client (redaction + local vision) must run
  on-device. The server-side LLM/VLM can be **cloud-hosted during SIH** — the privacy
  requirement is about *never sending raw sensitive data*, not about avoiding the
  internet entirely.
- **The client is a browser extension, not a Python/Playwright script.** It must run
  inside Chrome/Firefox using WebGPU/WebAssembly, via something like **ONNX Runtime
  Web** or **Transformers.js** — not Ollama/llama.cpp on a laptop.
- **Generalization is a hard requirement, confirmed by the portal itself.** The official
  listing states use cases for evaluation are provided *at the finale* — meaning judges
  will hand you a task on a page you haven't seen or rehearsed on. Building anything that
  quietly assumes one specific page structure is a direct risk to your score, not just
  bad practice. Test your pipeline against several unrelated real websites during
  development (not just one polished demo page) to catch this early.
- **Redaction is the actual center of gravity of scoring** — PII detection recall/
  precision (20%) + redaction precision (20%) = 40% of the grade combined. This is
  bigger than raw visual accuracy (25%) alone. Build and polish this first, not last.
- **Latency budget is lighter than before** — since the heavy reasoning model is
  server-side (can be cloud), the client model only needs to be "lightweight enough to
  run in a browser tab," not a full 3B VLM. This is a much smaller, faster model than
  the plan originally assumed.

---

## 4. Best Approach — Corrected Architecture

### Client (browser extension — JS/TS)
1. **Screen state capture** — content script captures the current DOM + optionally a
   screenshot of the viewport.
2. **Local vision model (in-browser, WebGPU via ONNX Runtime Web or Transformers.js)** —
   a small model that identifies UI elements / regions of interest on screen. This does
   **not** need to be a 3B-parameter VLM — a lightweight ViT-based detector or a small
   object-detection model exported to ONNX is enough, since the heavy reasoning happens
   server-side.
3. **Sensitive-data detection & redaction (the core scored component):**
   - **DOM-based signals (cheap, high-precision):** `input[type="password"]`,
     `autocomplete="cc-number"`, form field names/labels suggesting PII (email, SSN,
     phone), etc. — this alone catches a lot with near-zero cost.
   - **Visual signals:** a small local face-detection model (e.g. a lightweight
     BlazeFace-style ONNX model) to blur faces in images/video on the page.
   - **Text-based PII (optional, stretch):** simple regex for emails, phone numbers,
     card numbers, combined with OCR only if needed for image-embedded text.
   - **Redaction methods:** black-box overlay for form fields, gaussian blur for
     faces/images, text masking for PII substrings — applied *before* anything leaves
     the client.
4. **Sanitized payload sent to server** — structured, anonymized description of the
   screen (redacted screenshot and/or redacted DOM summary), never raw sensitive data.

### Server
1. Receives sanitized context.
2. Runs an LLM/VLM to interpret it and decide the next action.
   - **For SIH demo purposes:** a cloud-hosted model API is explicitly allowed per the
     PS text — this significantly de-risks the project since we don't need heavy local
     inference infrastructure for this half of the pipeline.
   - Optionally, also support an offline-deployable open-weights model, to show breadth
     ("works even with model swapped locally") — a stretch goal, not required for MVP.
3. Returns an action command (e.g. `{"action": "click", "target": "#submit-button"}`) or
   processed data back to the client.

### Client executes the returned action
- Extension's content script performs the click/scroll/type via standard DOM APIs.

---

## 5. Tech Stack (corrected)

| Component | Choice |
|---|---|
| Client runtime | Browser extension (Manifest V3), Chrome + Firefox |
| In-browser inference | ONNX Runtime Web or Transformers.js, WebGPU backend (WASM fallback) |
| Local vision model | Small ViT-based UI/element detector, exported to ONNX (lightweight, not 3B params) |
| Face detection (redaction) | Lightweight ONNX face detector (e.g. BlazeFace-class model) |
| PII/text detection | DOM attribute inspection + regex; OCR only if needed for image text |
| Server | Lightweight API server (Node/Python) — receives sanitized context, calls the reasoning model |
| Server-side reasoning model | Cloud-hosted LLM/VLM API for SIH demo (allowed per PS); optionally an offline-deployable open-weights model as a stretch/bonus |
| Comms | HTTPS request from extension to server, sanitized payload only |

---

## 6. Team Hardware — Where Things Actually Run Now

Good news: this architecture is *lighter* on your hardware than the old plan, because
the heavy model lives on the server (which can be cloud-hosted), not on either laptop.

| Machine | Role |
|---|---|
| **MacBook Air M2 (16GB)** | Build/test the browser extension (client-side vision + redaction), runs fine — WebGPU is well supported on Apple Silicon in Chrome |
| **Lenovo IdeaPad 3** | Also fine for extension development — the in-browser model is small (not a 3B VLM), so a GPU-less laptop can still run it via WASM fallback if WebGPU support is limited; also good for building the server API code |
| **Either machine, or free tier cloud** | Server-side: can literally call a cloud LLM API for the SIH demo (per PS rules) — no local GPU inference required for this part at MVP stage |

This means **Google Colab is even less necessary now** — you don't need to prototype a
big local VLM at all for the MVP. If you want the "offline-deployable model" bonus
later, Colab could help test that separately, but it's not on the critical path.

---

## 7. Build Plan (4 Weeks, corrected)

### Week 1 — Foundation
- [ ] Minimal Chrome extension scaffold (Manifest V3) that captures DOM + screenshot of
      current tab
- [ ] Get ONNX Runtime Web or Transformers.js running in the extension with a trivial
      model, confirm WebGPU (or WASM fallback) works on both laptops
- [ ] Stand up a minimal server endpoint that just echoes back a hardcoded action, to
      validate the client↔server round trip end-to-end

### Week 2 — Redaction pipeline (highest-weighted part — 40% of scoring)
- [ ] DOM-based sensitive field detection (password fields, common PII input names)
- [ ] Local face detection + blur on page images
- [ ] Basic PII text masking (regex-based)
- [ ] Demonstrate: raw screenshot vs. redacted screenshot, side by side

### Week 3 — Server reasoning + full loop
- [ ] Wire sanitized context → cloud LLM/VLM API → structured action response
- [ ] Client executes returned actions (click/scroll/type) via content script
- [ ] One full end-to-end task demoed (e.g. fill and submit a form, with a password
      field correctly redacted before the screenshot ever left the browser)
- [ ] **Generalization check:** run the full pipeline against 3–4 real websites you
      never designed for (news site, a login form, a page with photos) — this is a
      direct stand-in for the finale's hidden use case and the cheapest way to catch
      overfitting to your one demo page before judges do

### Week 4 — Polish, benchmarks, submission
- [ ] Measure and report: visual accuracy, PII detection recall/precision, redaction
      precision, client resource usage (CPU/memory in-browser), end-to-end latency —
      these map directly to the 5 scored metrics
- [ ] Record backup demo video
- [ ] Write and submit idea PDF before deadline

**Deadline: 20 September 2026**

---

## 8. Demo Script (corrected)

1. **Hook (0:00–0:30):** State the actual problem: agentic browser assistants need
   screen context, but sending raw screenshots to a server risks leaking passwords,
   faces, PII. Show a page with a password field and a photo with a face.
2. **Live demo (0:30–2:00):**
   - Show the raw screen state.
   - Show the **redacted version** side-by-side before anything is sent — password
     blacked out, face blurred, PII masked. This is your most important visual beat
     given the scoring weight.
   - Show the sanitized payload going to the server, the returned action, and the
     browser executing it (e.g. "click submit") — completing a real task.
3. **Numbers (2:00–2:45):** Report your actual measured metrics against the 5 scoring
   categories — this directly mirrors how judges will grade you.
4. **Close (2:45–3:00):** Emphasize generality explicitly — mention that the pipeline
   was tested on multiple unrelated sites during development, not tuned to one demo page.
   This directly answers the finale's hidden-use-case format and should be said out loud,
   not left implied.

---

## 9. Open Items

- [x] ~~Confirm the exact submitting organization for SIH26171~~ — **confirmed: ISRO**,
      Department of Space, Theme: Smart Automation (see Section 2).
- [ ] Decide whether to pursue the "offline-deployable server model" bonus, or keep
      server-side as cloud-API-only for MVP and revisit if time allows in week 4.
- [ ] Line up 3–4 genuinely unfamiliar test websites ahead of week 3's generalization
      check (Section 7) — pick these now so you're not scrambling for test pages later.
