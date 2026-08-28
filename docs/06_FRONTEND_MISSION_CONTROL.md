# 06. Mission Control HUD & Telemetry Dashboard — SIH26171

## 1. UI/UX Design Philosophy

The Mission Control HUD is packaged directly as an **Extension Side-Panel / Popup (React + Vite + TailwindCSS)**. It gives judges an immediate visual demonstration of on-device visual perception and privacy redaction in real time:

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
│ 📊 LIVE TELEMETRY & OFFICIAL SIH BENCHMARK METRICS                                      │
│ ├── WebGPU RAM: 218 MB (Target: <350MB)   ├── PII Detection Recall: 99.2%             │
│ ├── Step Latency: 780 ms (Target: <1.2s)  ├── Redaction Precision:  98.8%             │
│ └── Client CPU Load: 8.4% (WASM/GPU)      └── Privacy Audit Status: 100% VERIFIED ZERO │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core UI Components

### A. Dual-Pane Viewport Mirror
- **Left Mirror (Raw State):** Displays the unredacted tab view strictly inside local memory.
- **Right Mirror (Sanitized State):** Shows the canvas with **blacked-out passwords, red bounding boxes, and blurred faces** in real time, proving that only anonymized pixels are dispatched over the wire.

### B. Live Telemetry Metric Badges (Direct 1:1 Mapping to SIH Rubric)
- **Visual Accuracy Badge (25% weight):** Displays current DOM parsing depth and bounding box IoU score.
- **PII Recall & Redaction Precision (40% weight):** Live counter showing detected sensitive fields (e.g. `3 PII elements masked: [Password, Avatar Face, Email]`).
- **Resource Monitor (20% weight):** Displays WebGPU buffer memory and JavaScript heap allocation.
- **Latency Tracker (15% weight):** Step breakdown timer showing Client Sanitization Time (ms) vs Server VLM Reasoning Time (ms).

### C. Agent Thought Stream
Displays the real-time reasoning chain emitted by the central VLM:
> `[00:01.240] Thinking: "Search input located. Redacted personal query tokens. Dispatching submit click."`

---

## 3. Technology Stack & Component Structure

- **Framework:** React 18 + Vite + TypeScript.
- **Styling:** Modern dark-mode glassmorphism with TailwindCSS.
- **State Management:** Zustand store synced with `chrome.storage.local` and background message port.
- **Icons:** `lucide-react` (Shield, Eye, Cpu, Zap, Activity, CheckCircle).

```
src/sidepanel/
├── components/
│   ├── DualPaneInspector.tsx   // Side-by-side Raw vs Sanitized canvas viewer
│   ├── TelemetryDashboard.tsx  // Live meters for WebGPU RAM, CPU, Latency
│   ├── ThoughtStream.tsx       // Real-time agent action logs
│   └── AuditExportModal.tsx    // Export JSON/CSV privacy verification report
├── store/
│   └── useAgentStore.ts        // Global telemetry & execution state
└── SidePanelApp.tsx            // Main layout container
```
