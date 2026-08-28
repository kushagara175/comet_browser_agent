# SIH26171 Master Documentation Index

## 🛡️ Project: Privacy-Preserving On-Device Visual Perception Browser Agent
### Organization: Indian Space Research Organisation (ISRO) | Smart Automation | SIH 2026

This repository contains the complete engineering specification, architecture blueprints, sprint plans, and jury pitch strategy for **SIH26171**.

---

## 📚 Modular Document Directory

| Document | Title & Focus Area | Key Highlights |
|---|---|---|
| [01_PROBLEM_ANALYSIS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/01_PROBLEM_ANALYSIS.md) | **Problem & Domain Context** | Privacy paradox in web agents, official 5-metric scoring rubric, unseen finale use cases. |
| [02_SYSTEM_ARCHITECTURE.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/02_SYSTEM_ARCHITECTURE.md) | **System Architecture** | Hybrid Client-Server Split: WebGPU Privacy Filter ➔ Sanitized Payload ➔ Server VLM ➔ Content Script. |
| [03_VLM_INFERENCE_PIPELINE.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/03_VLM_INFERENCE_PIPELINE.md) | **Vision & Reasoning Pipeline** | `ONNX Runtime Web` on WebGPU, BlazeFace face blur, DOM PII masking, server VLM prompt schema. |
| [04_BROWSER_AUTOMATION_CANVAS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/04_BROWSER_AUTOMATION_CANVAS.md) | **Browser Extension Architecture** | Manifest V3 (Chrome/Firefox), offscreen WebGPU worker, DOM action executor, canvas masking. |
| [05_ACTION_CACHE_SELF_HEALING.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/05_ACTION_CACHE_SELF_HEALING.md) | **Action Cache & Privacy Audit** | IndexedDB action cache, pHash visual verification, popup recovery, and cryptographic privacy audit trail. |
| [06_FRONTEND_MISSION_CONTROL.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/06_FRONTEND_MISSION_CONTROL.md) | **Mission Control HUD** | React/Vite side-panel, live **Raw vs Redacted** side-by-side view, WebGPU telemetry, PII counter. |
| [07_TEAM_WORKFLOW_HARDWARE_SPLIT.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/07_TEAM_WORKFLOW_HARDWARE_SPLIT.md) | **Team Workflow & Machine Roles** | MacBook Air M2 (WebGPU extension) vs Lenovo IdeaPad 3 (Server API & WASM fallback) split. |
| [08_SPRINT_ROADMAP_4WEEKS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/08_SPRINT_ROADMAP_4WEEKS.md) | **4-Week Sprint Roadmap** | Weekly milestones from scaffold to multi-site generalization and official submission (Sep 20). |
| [09_DEMO_PITCH_SCRIPT.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/09_DEMO_PITCH_SCRIPT.md) | **Grand Finale Pitch Script** | 3-minute jury pitch script, real-time redaction demo, 5-metric benchmark proof, FAQ defense. |

---

## ⚡ Quick Architecture Overview

```
[User Screen / Active Browser Tab]
          │
          ▼
[1. Viewport Capture & DOM Extraction]
          │
          ▼
[2. On-Device Privacy & Redaction Filter (WebGPU)]
    ├── BlazeFace ONNX ──▶ Gaussian Blur on Faces
    ├── DOM Inspector  ──▶ Solid Blackout on Passwords/Cards
    └── Regex Engine   ──▶ Mask PII Text (Emails/Phones)
          │
          ▼
[3. Sanitized Context Transmission (Zero Sensitive Data)]
          │
          ▼
[4. Centralized Reasoning VLM (Server)] ──▶ Predicts Action JSON: {"action":"click", "target":"#submit"}
          │
          ▼
[5. Client Content Script Executor] ────▶ Executes Action on Live Tab & Verifies State
```
