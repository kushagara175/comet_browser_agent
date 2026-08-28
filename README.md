# SIH26171 — On-Device Visual Perception for Light-Weight Browser Agents
### Privacy-Preserving In-Browser Vision Agent with Centralized Reasoning (ISRO | Smart Automation | SIH 2026)

---

## 🚀 Quick Documentation Links

- 📖 **[Master Documentation Index](file:///Users/kushagrasingh/dev/SIH_26209/docs/INDEX.md)**
- 📋 **[01. Problem Analysis & Official Evaluation Rubric](file:///Users/kushagrasingh/dev/SIH_26209/docs/01_PROBLEM_ANALYSIS.md)**
- 🏗️ **[02. System Architecture & Core Modules](file:///Users/kushagrasingh/dev/SIH_26209/docs/02_SYSTEM_ARCHITECTURE.md)**
- 🧠 **[03. In-Browser Vision & Server VLM Pipeline](file:///Users/kushagrasingh/dev/SIH_26209/docs/03_VLM_INFERENCE_PIPELINE.md)**
- 🌐 **[04. Browser Extension Architecture & Automation](file:///Users/kushagrasingh/dev/SIH_26209/docs/04_BROWSER_AUTOMATION_CANVAS.md)**
- ⚡ **[05. Action Memory Cache & Privacy Audit Trail](file:///Users/kushagrasingh/dev/SIH_26209/docs/05_ACTION_CACHE_SELF_HEALING.md)**
- 🖥️ **[06. Mission Control HUD & Telemetry Dashboard](file:///Users/kushagrasingh/dev/SIH_26209/docs/06_FRONTEND_MISSION_CONTROL.md)**
- 👥 **[07. Team Workflow & Machine Role Split](file:///Users/kushagrasingh/dev/SIH_26209/docs/07_TEAM_WORKFLOW_HARDWARE_SPLIT.md)**
- 🗓️ **[08. 4-Week Sprint Roadmap & Checklists](file:///Users/kushagrasingh/dev/SIH_26209/docs/08_SPRINT_ROADMAP_4WEEKS.md)**
- 🏆 **[09. Grand Finale Pitch & Demo Script](file:///Users/kushagrasingh/dev/SIH_26209/docs/09_DEMO_PITCH_SCRIPT.md)**

---

## 📄 Source & Planning Documents

- 📌 **[Official PS Source (Verified)](file:///Users/kushagrasingh/dev/SIH_26209/SIH26171_updateddddd%20.md)** — Official SIH 26171 problem statement text with verified metadata and corrected architecture plan
- 🗺️ **[Master Project Plan v2](file:///Users/kushagrasingh/dev/SIH_26209/claude_plan.md)** — Detailed architecture, tech stack, hardware split, 4-week roadmap, and demo pitch.

---

## ⚡ Core Technical Pillars (Winning Moat)

1. **On-Device WebGPU Vision Engine:** In-browser inference via `ONNX Runtime Web` / `Transformers.js` accelerated by WebGPU (with WASM fallback) running lightweight models directly in the extension offscreen worker.
2. **Dual-Layer Privacy Redaction (40% of SIH Score):**
   - **DOM Layer:** Deterministic, zero-cost masking of passwords, credit cards, emails, and sensitive input fields.
   - **Visual Layer:** Computer vision face detection (BlazeFace ONNX) applying Gaussian blur and canvas blackout bounding boxes before any screenshot leaves the client.
3. **Hybrid Client-Server Reasoning:** Transmits only sanitized, unidentifiable visual and DOM context to a centralized VLM (Qwen2.5-VL / Claude) which returns structured UI action JSON.
4. **Deterministic Action Runner:** Content scripts execute UI actions (`click`, `type`, `select`, `scroll`) on live webpages with closed-loop verification.
5. **Action Memory Cache & Self-Healing:** Local IndexedDB cache replays repeated workflows in `<200ms` without redundant server calls.
6. **Dual-Pane Mission Control HUD:** Real-time extension side-panel rendering **Raw Viewport vs Redacted Viewport** side-by-side with live WebGPU telemetry and privacy audit logs.

---

## 📊 Official SIH Evaluation Scorecard

| Evaluation Metric | Weight | Technical Implementation |
| :--- | :---: | :--- |
| **Accuracy of visual context from screen** | **25%** | Structured DOM tree + high-fidelity sanitized visual screenshot |
| **Recall & precision for sensitive/PII detection** | **20%** | WebGPU face detection + DOM regex + input type analyzer (>98% recall) |
| **Precision of redaction** | **20%** | Clean pixel blackout & Gaussian blur without distorting interactive UI layout |
| **Client-side resource utilization** | **20%** | Lightweight WebGPU memory footprint (<350MB VRAM, <15% CPU load in tab) |
| **Overall end-to-end task latency** | **15%** | Sub-second client sanitization + fast server round-trip (<1.2s total per step) |
