# 08. 4-Week Sprint Roadmap & Execution Checklist — SIH26171

## 1. Timeline Overview & Milestones

- **Start Date:** 23 August 2026
- **Idea Submission Deadline:** **20 September 2026 (Hard Deadline)**
- **Total Sprint Duration:** 4 Weeks

```
  WEEK 1 (Aug 23 - Aug 30)   WEEK 2 (Sep 01 - Sep 07)   WEEK 3 (Sep 08 - Sep 14)   WEEK 4 (Sep 15 - Sep 20)
┌───────────────────────────┬──────────────────────────┬──────────────────────────┬─────────────────────────┐
│ • Playwright Portal Setup │ • Set-of-Marks In-DOM    │ • Canvas Drag (Assam Box)│ • React Mission Control │
│ • Local Ollama on Mac M2  │ • DOM Pruner & A11y Tree │ • Task-Graph Planner     │ • Latency Benchmarking  │
│ • Static Screenshot Test  │ • First Simple E2E Loop  │ • SQLite Action Cache    │ • Backup Video & Pitch  │
│ • Mock VLM Server         │   (Sensor + Date Select) │ • Self-Healing pHash Diff│ • Idea PDF Submission   │
└───────────────────────────┴──────────────────────────┴──────────────────────────┴─────────────────────────┘
```

---

## 2. Weekly Actionable Checklists

### Week 1 — Foundation & Environment Setup (Aug 23 – Aug 30)
- [ ] Install Ollama and pull `SmolVLM-500M` & `SmolVLM-2.2B` on MacBook Air M2.
- [ ] Benchmark local inference latency with Apple Silicon Metal acceleration (`<600ms` target).
- [ ] Initialize Python Playwright project with headless/headed Chromium launch scripts.
- [ ] Script automated login and navigation to `bhuvan.nrsc.gov.in` and `mosdac.gov.in`.
- [ ] Record Playwright HAR archive of Bhuvan session for the offline fallback mock server.
- [ ] Build `mock_vlm_server.py` on FastAPI for Machine B development.

### Week 2 — Perception & Simple E2E Loop (Sep 01 – Sep 07)
- [ ] Implement `inject_som_badges.js` to overlay numbered badges on all interactable elements.
- [ ] Build Semantic DOM pruner to extract accessibility trees and map badge IDs to DOM selectors.
- [ ] Connect Playwright capture pipeline to local Ollama API endpoint.
- [ ] Complete first full automated subtask: Natural language prompt ➔ Select "Cartosat-2" ➔ Apply Date Range.
- [ ] Implement download event listener to capture and verify downloaded GeoTIFF files.

### Week 3 — Spatial Canvas & Intelligence Layer (Sep 08 – Sep 14)
- [ ] Implement multi-step smooth mouse drag for WebGL/Leaflet canvas region selection.
- [ ] Build Task-Graph Planner to decompose natural language prompts into DAG subtasks.
- [ ] Build SQLite Action Memory Cache to store successful selector and coordinate paths.
- [ ] Implement pHash perceptual diffing to detect stalled pages and failed action dispatches.
- [ ] Add auto-dismissal logic for modal dialogues and cookie banners.
- [ ] Demonstrate repetitive task acceleration: 45s (Cold run) ➔ 8s (Cached run).

### Week 4 — UI Polish, Submission & Pitch Deck (Sep 15 – Sep 20)
- [ ] Build React + Vite dual-pane Mission Control HUD with WebSocket live telemetry.
- [ ] Integrate Whisper-tiny offline voice command transcription.
- [ ] Run automated benchmark suite: Latency, VRAM consumption, task success rate over 50 runs.
- [ ] Record a flawless 4K backup demo video with voiceover (safety buffer for jury presentation).
- [ ] Draft and finalize the official SIH 2026 Idea Submission PDF presentation.
- [ ] **Submit Idea on official SIH Portal before 20 September 2026, 23:59 IST.**
