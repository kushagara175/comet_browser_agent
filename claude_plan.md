# SIH26171 — On-Device Visual Perception for Light-Weight Browser Agents
### Project Plan v1

---

## 1. Problem Statement (summary)

**Organization:** ISRO
**Category:** Software | Miscellaneous
**Type:** Ministry-specific PS (fixed problem, not open student innovation)

ISRO scientists, disaster-management teams, and defense analysts use geospatial portals
(Bhuvan, MOSDAC, VEDAS, Bhoonidhi) daily to pull satellite imagery and data. This is slow
and repetitive:

- **Manual navigation is heavy** — 10+ nested dropdowns (satellite → sensor → band →
  resolution), date pickers, cloud-cover filters, and a WebGL/Leaflet canvas map where
  regions must be drawn by hand. A single query can eat 30–60 minutes.
- **No cloud AI allowed** — ISRO and defense systems run on secure/air-gapped networks.
  Screenshots of internal portals cannot be sent to external AI APIs (ChatGPT, Gemini,
  Claude, etc.) for security/compliance reasons.
- **Standard automation tools fail** — Selenium/Puppeteer/RPA only work on HTML DOM.
  Bhuvan's map is a WebGL canvas with no clickable HTML elements — you need an AI that
  visually sees the screen and predicts click/drag coordinates.
- **Hardware is constrained** — target machines are consumer laptops, not GPU servers.
  Model must be small (~≤3B params), run in <4GB VRAM, and act in <800ms per step.

**What we're building:** An autonomous, on-device AI browser agent that takes a natural
language command (e.g. *"Download Cartosat-2 imagery for Brahmaputra Basin, Aug 2024,
cloud cover below 10%"*) and completes it end-to-end on the live portal — filling
dropdowns, drawing map regions, and downloading the file — **without any external cloud
AI dependency.**

### Important clarification on "offline"

"Offline" does **not** mean the browser has no internet access. The portal is a live
website — the browser needs a normal connection to it, and downloads are real files
pulled from ISRO's live backend (satellite queries can't be pre-scraped; there are near
infinite date/region/sensor combinations, and imagery is generated per-query).

"Offline" means: **the AI reasoning layer (the model deciding what to click) runs
locally on the same machine and never sends screenshots to an external cloud API.**
That's the actual security requirement being solved.

---

## 2. Best Approach — Chosen Architecture

**Hybrid DOM-first execution + Task-graph planner + Action memory cache**

We are deliberately combining three ideas instead of building "just a VLM clicking a
screenshot loop" (which is what most competing teams will build):

| Layer | What it does | Why it's here |
|---|---|---|
| **Task-graph planner** | Breaks a fuzzy natural-language command into an explicit ordered subtask graph *before* any clicking starts (select satellite → set date range → set cloud filter → draw region → download) | Real agentic depth — plannable, debuggable, replanable on failure. This is what most teams *won't* bother building. |
| **Memory cache** | After a subtask succeeds, its action sequence is cached. Next time a similar subtask is requested, try the cached path first; fall back to the model only on a cache miss or UI change | Directly answers ISRO's own stated pain point — "repetitive" work gets faster over time. Gives a concrete, demoable number: e.g. "45s → 8s on repeat." |
| **DOM-first hybrid execution** | Most of the portal (dropdowns, buttons, filters) is real HTML — read it via the accessibility tree, don't waste model calls on it. Only fall back to the vision model + Set-of-Marks tagging for genuinely non-DOM elements (the WebGL map) | Keeps the pipeline fast and reliable — small failure surface, realistic latency budget, less that can go wrong live. |
| **Self-healing loop** | After every action, verify the page actually changed (pHash/diff). If not — check for a popup, dismiss it, retry; or fall back to coordinate click | Live demos fail on unexpected popups/UI hiccups more than anything else — this is cheap insurance. |

**Explicitly rejected approaches (and why):**
- ❌ **Pre-scrape the whole website into a database and run offline from that** — doesn't
  work; satellite queries are generated live per-request, not static pages, and the UI
  itself is dynamic JS/canvas behavior, not scrapeable content.
- ❌ **Pure-vision-only agent (no DOM at all)** — most "impressive" on paper, but slower
  and more failure-prone; too risky for a 3-minute live jury demo.
- ❌ **Multi-portal generalization as a core feature** — good stretch goal *after* the
  core loop is solid, not something to build first. A live failure on a second untested
  portal is worse than not attempting it.

---

## 3. Tech Stack

| Component | Choice |
|---|---|
| Local VLM | Qwen2.5-VL-3B-Instruct (INT4 quantized) or SmolVLM-2.2B |
| Inference runtime | Ollama / llama.cpp (local, no cloud) |
| Browser automation | Playwright + Chrome DevTools Protocol |
| Visual grounding | Set-of-Marks (SoM) tagging engine + OpenCV |
| DOM parsing | Accessibility tree / semantic DOM pruner |
| Frontend HUD | React + Vite (dual-pane: reasoning tree + live browser) |
| Voice input (optional) | Whisper-tiny (offline) |
| Audit trail | JSON session logs + Playwright trace recorder |

---

## 4. Build Plan (4 Weeks)

### Week 1 — Foundation
- [ ] Playwright script connects to the real target portal, takes screenshots, extracts DOM/accessibility tree
- [ ] Local VLM running via Ollama, answering basic "what should I click" questions on a static screenshot
- [ ] Confirm exact official SIH26171 wording on the SIH portal (see Section 6)

### Week 2 — Core loop
- [ ] DOM-first action executor working (click, type, select_dropdown, scroll)
- [ ] Set-of-Marks tagging engine overlays numbered badges on interactive elements
- [ ] One full simple task working end-to-end (e.g. satellite + date range selection, no map yet)

### Week 3 — Hard parts + intelligence layer
- [ ] WebGL/canvas map bounding-box drag working (coordinate-based, VLM-predicted)
- [ ] Task-graph planner: decomposes a natural language command into ordered subtasks
- [ ] Memory cache: store successful action sequences, retrieve on repeat tasks
- [ ] Self-healing loop: pHash diff check, popup detection/dismissal, retry logic

### Week 4 — Polish + submission
- [ ] Dual-pane Mission Control HUD (React) — reasoning tree + live browser view
- [ ] Benchmark: step latency, VRAM usage, task success rate
- [ ] Record a backup demo video (in case live Wi-Fi/hardware fails at finale)
- [ ] Write and submit idea PDF before deadline

**Deadline: 20 September 2026**

---

## 5. 3-Minute Demo Script (Grand Finale)

1. **0:00–0:45 — Hook.** Explain the constraint: ISRO can't send internal screenshots to
   cloud AI providers. State that reasoning happens locally on this laptop, live.
2. **0:45–2:00 — Live demo.** Speak/type a command. Show dual-pane HUD: left = plan tree
   + latency, right = live browser as it fills dropdowns, drags map region, downloads
   the file.
3. **2:00–2:30 — The differentiator.** Run a second, similar query and show the cache
   hit — dramatically faster than the first run. This is the concrete "before/after"
   number: e.g. *"45 seconds the first time. 8 seconds now."*
4. **2:30–3:00 — Numbers + close.** State latency/VRAM/success-rate benchmarks. Close on
   real-world impact: hundreds of scientist-hours saved weekly, sovereign/offline-safe
   deployment.

---

## 6. Open Item — Verify Before Building

The prep document this plan is based on includes some framing (e.g. "0/500 submissions,
98.5% win probability") that reads like third-party promotional material rather than
official SIH data. **Before committing engineering time, pull the actual SIH26171
problem statement text from the official SIH 2026 portal** to confirm exact scope —
specifically whether all named portals (Bhuvan, MOSDAC, VEDAS, Bhoonidhi) are in scope,
and whether the WebGL canvas requirement is explicitly stated or inferred.

---

## 7. Quick Reference — What Makes This Different From Other Teams

Most teams solving this PS will likely build: *screenshot → VLM → click → screenshot →
click*, a reactive loop with no planning and no memory.

This plan adds two things most teams will skip because they're extra upfront work:
1. **Explicit planning** before execution (agentic depth, not just reactive automation)
2. **Memory that makes repeat tasks faster** (directly proves understanding of the
   "repetitive work" pain point ISRO stated in the problem)

Both are cheap to explain to judges and hard to fake live — which is exactly what makes
them a good bet for standing out.
## Model & Tooling Plan

### 1. Model Selection (phased, not fixed)

| Phase | Model | Why |
|---|---|---|
| Prototype | SmolVLM-500M (INT4) | Fastest to get pipeline working end-to-end; low RAM/VRAM footprint; proves the loop before optimizing accuracy |
| Iteration | SmolVLM-2.2B (INT4) | Step up in accuracy once the pipeline works; still comfortably fits M2 Air's 16GB unified memory |
| Stretch (only if time/accuracy demands it) | Qwen2.5-VL-3B (INT4) | Best visual grounding for the WebGL map drag; heavier — only adopt if latency budget still holds |

Rule: never jump straight to the biggest model. Get the full loop (planner → DOM → SoM → VLM → executor → cache) working on the smallest model first. A working small model beats a stalling big one on demo day.

### 2. Serving the Model

- Runtime: **Ollama** (wraps llama.cpp, easiest local serving + Metal acceleration on the Mac)
- Runs locally on the MacBook Air M2 — `ollama serve` exposes it on `localhost:11434`
- Teammate's IdeaPad hits the same model over LAN (`http://<mac-local-ip>:11434`) during dev/testing — **not** during the actual demo (keep the live demo fully local on one machine to avoid a network dependency judges could flag)
- Never call out to Colab, OpenAI, Claude, Gemini, or any cloud endpoint from the live pipeline — that breaks the core "offline AI reasoning" claim

### 3. Tool Stack & How They Connect

- **Playwright** — browser control, screenshots, DOM/accessibility tree extraction, executing clicks/drags/downloads
- **DOM-first routing** — every action first checks if it can be resolved via accessibility tree (buttons, dropdowns, filters). Only the canvas/map falls through to vision.
- **Set-of-Marks (SoM)** — numbered overlay badges injected into the screenshot before it goes to the VLM, so the model answers "which numbered element" instead of raw pixel coordinates (avoids coordinate hallucination)
- **Task-Graph Planner** — a lightweight local call (can even be a smaller/faster local LLM, or rule-based decomposition to start) that turns a natural-language request into an ordered subtask list before any clicking begins
- **Action Cache** — key: task-type signature (e.g. `select_satellite+select_date_range`) → value: last known successful DOM path / coordinates. Checked before every subtask; VLM only invoked on cache miss or cache-hit-but-verify-failed
- **Self-healing loop** — after every action, screenshot again, diff against expected state; on mismatch, try DOM fallback → vision fallback → replan, in that order

### 4. Machine Role Split

| Machine | Role |
|---|---|
| MacBook Air M2 (16GB) | Runs Ollama + VLM, final integration, live demo |
| Lenovo IdeaPad 3 | Playwright scripts, planner logic, cache logic, HUD frontend — developed against **mocked model responses** (hardcoded JSON like `{"action":"click","target_id":4}`), synced to real model only when testing against the Mac |

### 5. Build Order (maps to weekly plan)

1. Playwright connects + screenshots + DOM extraction (no model yet)
2. Wire Ollama + smallest model; get one full simple task (satellite + date select) working via DOM-first + SoM fallback
3. Add planner (decompose command → subtasks) and cache (log + replay successful paths)
4. Add canvas/map drag via VLM coordinate output (hardest part, done last)
5. Self-healing polish, HUD showing plan tree + cache hit/miss, benchmark numbers (first-run vs cached-run latency), backup demo video

### 6. Open Item
Confirm exact SIH26171 problem statement wording on the official portal before locking model size / latency targets — this plan assumes the "≤3B params, offline AI reasoning" framing from the prep doc holds.