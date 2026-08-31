# 06. Mission Control HUD & Telemetry Dashboard — SIH26171

## 1. UI/UX Design Philosophy

The Mission Control HUD is packaged directly as a **Chrome Manifest V3 Side-Panel** (with vanilla WebGL shader animations, live dual-pane preview, and verified telemetry):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SIH26171 MISSION CONTROL HUD (SIDE-PANEL)                       │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ 👁️ RAW VIEWPORT (CLIENT ONLY)              │ 🛡️ SANITIZED PAYLOAD (SENT TO SERVER)       │
│                                           │                                            │
│   ┌───────────────────────────────────┐   │   ┌───────────────────────────────────┐    │
│   │ [User Photo]   Password: *******  │   │   │ [BLURRED FACE]  Password: ██████  │    │
│   │ Card: 4532 **** **** 8921         │   │   │ Card: ████████████████            │    │
│   └───────────────────────────────────┘   │   └───────────────────────────────────┘    │
├───────────────────────────────────────────┴────────────────────────────────────────────┤
│ 📊 LIVE TELEMETRY (DYNAMICALLY MEASURED FROM BENCHMARK HARNESS)                         │
│ ├── Peak Memory: measured via process.memoryUsage() / CDP Performance.getMetrics       │
│ ├── Step Latency: measured t0..t7 breakdown (Client Perception vs Server Reasoning)    │
│ └── PII Recall & Coverage: evaluated against authored test fixtures                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core UI Components

### A. Dual-Pane Viewport Mirror
- **Left Mirror (Raw State):** Displays the unredacted tab view strictly inside local memory (never transmitted).
- **Right Mirror (Sanitized State):** Shows the canvas with **blacked-out passwords, red bounding boxes, and blurred faces** in real time, proving that only anonymized pixels are dispatched over the wire.

### B. Live Telemetry Metric Badges (Direct 1:1 Mapping to SIH Rubric)
- **Visual Accuracy Badge (25% weight):** Displays current interactive element count and bounding box IoU score.
- **PII Recall & Redaction Precision (40% weight):** Live counter showing detected sensitive fields (e.g. `🛡️ 3 Masks Applied: [Password, Avatar Face, Email]`).
- **Resource Monitor (20% weight):** Displays memory footprint and CPU load.
- **Latency Tracker (15% weight):** Step breakdown timer showing Client Perception Time ($t_0 \dots t_3$) vs Server Reasoning Time ($t_3 \dots t_4$) vs DOM Verification ($t_5 \dots t_7$).

### C. Agent Action Rationale Stream
Displays the proposed action rationale and risk classification:
> `[00:01.240] Rationale: "Search input located. Redacted personal query tokens. Proposing submit click."`

---

## 3. Technology Stack & Component Structure

- **Platform:** Chrome Extension Manifest V3 Sidepanel (`src/sidepanel/`).
- **Styling:** CSS variables, responsive design, and WebGL waves animation.
- **State Management:** Background coordinator message port (`chrome.runtime.sendMessage`).

