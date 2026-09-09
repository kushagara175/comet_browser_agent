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
│   └── SKILL.md                          # Master guide & architectural index
├── interaction-skills/
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
