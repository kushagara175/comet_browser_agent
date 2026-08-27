# 06. Frontend Mission Control HUD — SIH26171

## 1. UX Philosophy: Dual-Pane "Mission Control"

Hackathon judges spend an average of **2-3 minutes** evaluating a prototype. A command-line script or invisible headless browser makes the AI look like a pre-baked static script. 

To win first place, the UI must provide an unmistakable, visually stunning **Mission Control HUD** built with **React + Vite + Vanilla CSS** and **Lucide Icons**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ISRO BhuvanBot — Autonomous Sovereign Browser Agent (100% Offline | Zero Cloud)      │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│  LEFT PANE: AGENT BRAIN & TELEMETRY      │  RIGHT PANE: LIVE BROWSER VIEWPORT          │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Natural Language Task Input            │ • Real-time Playwright Chromium Mirror      │
│   [🎤 Voice / ⌨️ Text Prompt]            │ • Set-of-Marks Badges Overlay [1] [2] [3]   │
│                                          │ • Animated Laser Crosshair on Clicks        │
│ • Subtask Graph Breakdown                │ • WebGL Canvas Bounding Box Highlight       │
│   ├── [✓] Navigate to Bhuvan Portal      │                                             │
│   ├── [✓] Select Sensor: Cartosat-2      │                                             │
│   ├── [⚡ CACHE HIT] Date Range Applied  │                                             │
│   └── [⏳ ACTIVE] Drag Region on Canvas   │                                             │
│                                          │                                             │
│ • Real-Time Telemetry Cards:             │                                             │
│   ┌───────────────┬───────────────────┐  │                                             │
│   │ Step Latency  │ Local VRAM Usage  │  │                                             │
│   │  540 ms       │  2.8 GB / 16 GB   │  │                                             │
│   ├───────────────┼───────────────────┤  │                                             │
│   │ Model Status  │ Network Outbound  │  │                                             │
│   │ SmolVLM INT4  │ 0.0 KB (Air-Gapped│  │                                             │
│   └───────────────┴───────────────────┘  │                                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. Frontend Component Architecture

```
src/
├── components/
│   ├── HeaderBar.jsx         # System title, air-gapped status pill, live clock
│   ├── LeftPane/
│   │   ├── PromptInput.jsx   # Text input + Whisper voice mic trigger
│   │   ├── TaskGraph.jsx     # Visual step progression with status icons
│   │   ├── ThoughtStream.jsx # Real-time streaming reasoning tokens from local VLM
│   │   └── TelemetryGrid.jsx # Latency gauge, VRAM usage, cache hit indicator
│   └── RightPane/
│       ├── ViewportMirror.jsx# Live canvas/MJPEG stream from Playwright CDP
│       └── ActionOverlay.jsx # Laser crosshair & bounding box animation
├── styles/
│   └── mission_control.css   # Dark glassmorphism, glowing telemetry, neon accents
└── App.jsx
```

---

## 3. WebSocket Real-Time Telemetry Protocol

The agent backend broadcasts step events to the React frontend via local WebSocket (`ws://127.0.0.1:8000/ws`):

```json
{
  "event": "STEP_UPDATE",
  "subtaskId": "SUBTASK_3",
  "subtaskName": "Spatial Region Drag (Assam Basin)",
  "status": "RUNNING",
  "isCacheHit": false,
  "telemetry": {
    "stepLatencyMs": 620,
    "vramUsageMb": 2840,
    "currentAction": "canvas_drag",
    "coordinates": {"x1": 420, "y1": 310, "x2": 580, "y2": 440}
  },
  "thought": "Locating Brahmaputra flood plains on Bhuvan WebGL viewport via visual marks [4] and [8]."
}
```

---

## 4. Design System Tokens (Dark Glassmorphic Theme)

```css
:root {
  --bg-primary: #0a0e17;
  --bg-surface: rgba(18, 26, 43, 0.85);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --accent-cyan: #06b6d4;
  --accent-emerald: #10b981;
  --accent-rose: #f43f5e;
  --accent-amber: #f59e0b;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```
