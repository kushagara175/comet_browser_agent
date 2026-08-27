# SIH26171 Master Documentation Index

## 🛰️ Project: On-Device Visual Perception Browser Agent for ISRO Portals

This repository contains the complete engineering specification, architecture blueprints, sprint plans, and jury pitch strategy for **SIH26171 (Smart India Hackathon 2026)**.

---

## 📚 Modular Document Directory

| Document | Title & Focus Area | Key Highlights |
|---|---|---|
| [01_PROBLEM_ANALYSIS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/01_PROBLEM_ANALYSIS.md) | **Problem & Domain Context** | ISRO portal bottlenecks, air-gap vs live portal taxonomy, success metrics. |
| [02_SYSTEM_ARCHITECTURE.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/02_SYSTEM_ARCHITECTURE.md) | **System Architecture** | Hybrid Triad (DOM + Task Graph + Action Cache), data flow, and self-healing. |
| [03_VLM_INFERENCE_PIPELINE.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/03_VLM_INFERENCE_PIPELINE.md) | **On-Device VLM Inference** | SmolVLM / Qwen2.5-VL INT4, Ollama/Metal setup, prompt JSON schema, mock server. |
| [04_BROWSER_AUTOMATION_CANVAS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/04_BROWSER_AUTOMATION_CANVAS.md) | **Browser & Canvas Automation** | Playwright + CDP, in-DOM Set-of-Marks JS injection, WebGL smooth drag, HAR replay. |
| [05_ACTION_CACHE_SELF_HEALING.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/05_ACTION_CACHE_SELF_HEALING.md) | **Action Cache & Self-Healing** | SQLite cache schema, pHash visual diffing, modal interceptor, 45s ➔ 8s speedup. |
| [06_FRONTEND_MISSION_CONTROL.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/06_FRONTEND_MISSION_CONTROL.md) | **Mission Control HUD** | React + Vite dual-pane layout, WebSocket telemetry protocol, dark glassmorphism. |
| [07_TEAM_WORKFLOW_HARDWARE_SPLIT.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/07_TEAM_WORKFLOW_HARDWARE_SPLIT.md) | **Team Workflow & Machine Roles** | MacBook Air M2 vs Lenovo IdeaPad split, LAN integration, mock server workflow. |
| [08_SPRINT_ROADMAP_4WEEKS.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/08_SPRINT_ROADMAP_4WEEKS.md) | **4-Week Sprint Roadmap** | Actionable weekly checklist (Aug 23 - Sep 20), milestones, and deliverables. |
| [09_DEMO_PITCH_SCRIPT.md](file:///Users/kushagrasingh/dev/SIH_26209/docs/09_DEMO_PITCH_SCRIPT.md) | **Grand Finale Pitch Script** | 3-minute pitch timeline, cold vs cached demo, jury FAQ defense. |

---

## ⚡ Quick Architecture Overview

```
[User Voice/Text Command]
         │
         ▼
[1. Task-Graph Planner] ────▶ [2. Action Cache Check (SQLite)]
                                      │
                                      ├── HIT  ──▶ [Direct Fast CDP Replay (<8s)]
                                      │
                                      └── MISS ──▶ [3. Hybrid Perception Engine]
                                                        ├── DOM / A11y Tree (Dropdowns)
                                                        └── Set-of-Marks + Local VLM (WebGL Map)
                                                                │
                                                                ▼
                                                   [4. Playwright Action Dispatcher]
                                                                │
                                                                ▼
                                                   [5. State Verifier & Self-Healing (pHash)]
```
