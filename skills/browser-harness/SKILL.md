---
name: browser-harness
description: Comprehensive browser interaction suite and domain playbook engine ported from browser-use/browser-harness for MV3 on-device privacy browser agents.
version: 1.0.0
---

# PrivaPilot Browser Harness & Skill Suite

## Architectural Philosophy
PrivaPilot adapts the interaction and domain skills from `browser-use/browser-harness` to run natively within Chrome Manifest V3 (MV3) without requiring an insecure `--remote-debugging-port` or raw CDP daemon.

Every browser interaction adheres to three inviolable privacy and security invariants:
1. **Zero-PII Leak Guarantee**: On-device multi-layer redaction (Regex + DOM + UltraFace ONNX) masks all credentials, PII, and faces before any VLM inference.
2. **Closed Schema Runtime Boundary**: Actions dispatched from the reasoning server are strictly validated against a closed schema with prohibited script, URL, and selector patterns.
3. **Deterministic Framework Compatibility**: Synthetic event dispatchers bypass framework event interceptors (React 15/16+ fibers, Vue 3 proxies, Angular zones).

---

## Skill Directory Structure

```
skills/
├── browser-harness/
│   ├── SKILL.md                          # Master guide & architectural index
│   └── best-agent-skills.md              # Architectural open-source benchmark & analysis
├── interaction-skills/
│   ├── agent-cursor.md                   # Animated AI Ghost Cursor with Bézier glide
│   ├── execution-shield.md               # In-page user interaction lock & safety barrier
│   ├── structured-extraction.md          # Schema-based table & list extractor with pagination
│   ├── human-in-the-loop.md              # Dynamic slot filling & CAPTCHA/OTP pausing
│   ├── tab-graph-orchestration.md        # Multi-tab state DAG, child tabs & cleanup
│   ├── visual-som-grounding.md           # Set-of-Marks visual badges & canvas grounding
│   ├── human-overshoot-and-cadence.md    # Motor biomechanics, overshoot & variable typing
│   ├── stagehand-primitives.md           # Stagehand act(), extract(), observe() models
│   ├── browser-use-patterns.md           # browser-use DOM pruning & self-healing
│   ├── skyvern-patterns.md               # Skyvern tabular extraction & workflow memory
│   ├── controlled-inputs.md              # React/Vue fiber-safe input filling
│   ├── cookies-and-storage.md            # Session & consent state handling
│   ├── dialogs.md                        # Alerts, modals, banners, overlays
│   ├── drag-and-drop.md                  # Synthetic DataTransfer drag sequences
│   ├── dropdowns.md                      # Native select & ARIA combobox/listbox
│   ├── hover.md                          # Pointer events & flyout menus
│   ├── iframes.md                        # Same-origin & all-frames sub-tree
│   ├── scrolling.md                      # Directional & container scrolling
│   ├── shadow-dom.md                     # Open shadow DOM root traversal
│   ├── tabs.md                           # Multi-tab orchestration & switching
│   └── uploads-and-downloads.md          # Synthetic file upload via DataTransfer
└── domain-skills/
    ├── duckduckgo-google.md              # Search engine query & result extraction
    ├── github.md                         # Code search, PRs, issues, repository metrics
    ├── reddit.md                         # Posts, communities, comments, upvotes
    ├── sih-portal.md                     # SIH 2026 Problem Statements, SPOCs, metrics
    ├── wikipedia.md                      # Encyclopedia lookups & references
    └── youtube.md                        # Video search, playback, metrics
```

---

## Interaction Skills Summary

| Skill | Target Elements | Execution Mechanism | Postcondition |
| :--- | :--- | :--- | :--- |
| `agent-cursor` | Viewport & target DOM elements | Cubic Bézier trajectory + action pill + click ripple | Cursor glided & visual cue rendered |
| `execution-shield` | Viewport / window event loop | Capture-phase event cancellation + Escape emergency release | User input locked during execution |
| `structured-extraction`| Tables, card lists, pagination | Schema-driven DOM mapping + next-button traversal | Structured JSON records extracted |
| `human-in-the-loop`| CAPTCHAs, OTP inputs, 2FA | Amber pulse badge + sidepanel resume prompt | Human input provided & task resumed |
| `tab-graph-orchestration`| Multi-tab DAG | OpenerTabId tracking + child tab scraping & cleanup | Background tab data extracted |
| `visual-som-grounding`| Custom canvas, icon buttons | Numbered Set-of-Marks visual pill overlays | Coordinate grounded without DOM text |
| `human-overshoot-and-cadence`| Mouse trajectories & inputs | 3-8px micro-overshoot + Gaussian typing bursts | Realistic human biomechanics |
| `stagehand-primitives`| Viewport elements | `act`, `extract`, `observe` high-level automation pipeline | Semantic action verified |
| `browser-use-patterns`| DOM nodes & Chrome tabs | Pruned interactive map + coordinate-DOM hybrid | Action dispatched without DOM bloat |
| `skyvern-patterns` | DataTables & multi-step forms | DataTable filter isolation + batch filling | Tabular data extracted / form filled |
| `controlled-inputs` | `<input>`, `<textarea>`, `[contenteditable]` | Native prototype descriptor setter + `InputEvent` + `change` | `value_present` |
| `dropdowns` | `<select>`, `[role="combobox"]`, `[role="listbox"]` | Option index mapping / simulated click selection | `select_changed` |
| `dialogs` | `<dialog>`, `[role="dialog"]`, `.modal` | Close button grounding or synthetic dismiss | `visibility_changed: hidden` |
| `drag-and-drop` | `[draggable="true"]`, sliders | Synthetic `DataTransfer` chain (`dragstart` $\to$ `drop`) | `status_changed` |
| `hover` | Flyout menus, nav dropdowns, tooltips | `mouseenter` $\to$ `mouseover` $\to$ `mousemove` | `status_changed` |
| `uploads` | `<input type="file">` | Synthetic `DataTransfer` items injection | `value_present` |
| `scrolling` | Viewport, scrollable containers | Window / container `scrollBy` / `scrollTo` | `scroll_changed` |
| `iframes` | `<iframe>`, `<frame>` | `all_frames: true` + bounding offset projection | DOM updated |
| `shadow-dom` | Web Components, custom elements | Open `shadowRoot` recursive walker | Elements extracted |
| `tabs` | Chrome tabs | `chrome.tabs.update(tabId, { active: true })` | `url_changed` |

---

## Domain Playbooks Summary

| Domain | Routes | Key Landmarks | Core Metrics |
| :--- | :--- | :--- | :--- |
| `sih.gov.in` | `/signin`, `/problem-statements`, `/know-your-spoc`, `/results` | Search box, DataTable filter, Login, SPOC query | Submissions count, Problem Statements count |
| `github.com` | `/login`, `/search`, `/trending`, `/pulls`, `/issues` | Search bar, New Repo, Star, Fork, Pull requests tab | Stars, Forks, Open issues |
| `youtube.com` | `/`, `/results`, `/feed/subscriptions`, `/feed/trending` | Search box, Subscribe, Like, Play/Pause | Video views, Subscribers |
| `reddit.com` | `/`, `/r/popular`, `/r/all`, `/search`, `/login` | Search bar, Create Post, Upvote, Comments | Upvotes, Comments count |
| `duckduckgo.com` | `/`, `/settings` | Search input, Clear button | Results count |
| `google.com` | `/`, `/search`, `/preferences` | Search input, Google Search, I'm Feeling Lucky | Results count |
| `wikipedia.org` | `/wiki/Main_Page`, `/wiki/Special:Search`, `/wiki/Special:Random` | Search Wikipedia, Contents, Random article | References count |
