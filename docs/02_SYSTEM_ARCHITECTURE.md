# 02. System Architecture & Core Modules — SIH26171

## 1. Architectural Philosophy: The Hybrid Triad

Most competing teams attempt a simplistic reactive loop:
`Screenshot ──▶ Cloud VLM ──▶ Coordinate Click ──▶ Repeat`

This naive approach fails because:
1. High token latency (2-5s per step on big models).
2. Coordinate hallucinations on tiny UI buttons.
3. Zero memory across repeated identical tasks.
4. Total collapse when popups, modals, or slow network transitions occur.

Our architecture implements a **Hybrid Triad**:

```
                       ┌──────────────────────────────────────────────┐
                       │           USER COMMAND (VOICE/TEXT)          │
                       │ "Cartosat-2, Brahmaputra Basin, Aug 2024"    │
                       └──────────────────────┬───────────────────────┘
                                              │
                                              ▼
                                 [1. Task-Graph Planner]
                           (Decomposes into ordered subtasks)
                                              │
                                              ▼
                             ┌───────────────────────────────────┐
                             │    2. Action Cache Check (Hit?)   │
                             └───┬───────────────────────────┬───┘
                                 │ YES (Cache Hit)           │ NO (Cache Miss / Stale)
                                 ▼                           ▼
                        [Direct Fast-Path]          [3. Hybrid Perception]
                        (Execute cached DOM/CDP)      ├── DOM/A11y Tree (Dropdowns)
                                 │                    └── SoM + Local VLM (Canvas)
                                 │                           │
                                 └───────────┬───────────────┘
                                             │
                                             ▼
                                 [4. Playwright Executor]
                                 (Dispatches CDP actions)
                                             │
                                             ▼
                                 [5. Closed-Loop Verifier]
                                 (pHash Diff + Self-Healing)
                                             │
                                             ▼
                                    [Next Subtask / Done]
```

---

## 2. End-to-End System Pipeline

```mermaid
flowchart TD
    UserPrompt([User Prompt: Voice / Text]) --> Orchestrator[Master Task Orchestrator]

    subgraph Planner_Module [Task Decomposition & Memory]
        Orchestrator --> TaskPlanner[Task-Graph Planner]
        TaskPlanner --> SubtaskQueue[Subtask Action Queue]
        SubtaskQueue --> CacheCheck{Action Cache Hit?}
        CacheCheck -->|HIT: Replay Path| FastPathExec[Direct CDP Fast Replay]
        CacheCheck -->|MISS: Reason Path| PerceptionRouter[Hybrid Perception Router]
    end

    subgraph Browser_Environment [Playwright Headed/Headless Chromium]
        DOM[Accessibility Tree & Interactive Elements]
        CanvasView[WebGL / Leaflet Canvas Viewport]
    end

    subgraph Perception_Pipeline [On-Device Perception Layer]
        PerceptionRouter --> IsDOMElement{Is Target in DOM?}
        IsDOMElement -->|YES| DOMPruner[Semantic A11y Tree Pruner]
        IsDOMElement -->|NO: Map/Canvas| SoMEngine[Set-of-Marks Injection Engine]
        DOMPruner --> FastDOMAction[Direct Selector Resolution]
        SoMEngine --> LocalVLM["Local Quantized VLM (SmolVLM / Qwen2.5-VL)"]
        LocalVLM --> BoundingBoxResolver[Coordinate & Badge Matcher]
    end

    subgraph Action_Execution [Action Dispatcher & Verification]
        FastPathExec --> ActionDispatcher[Playwright CDP Action Dispatcher]
        FastDOMAction --> ActionDispatcher
        BoundingBoxResolver --> ActionDispatcher
        ActionDispatcher --> Browser_Environment
        ActionDispatcher --> StateVerifier{State Changed? (pHash/DOM)}
        StateVerifier -->|Verified Success| CacheUpdate[Store In Action Cache]
        StateVerifier -->|Failed / Popup Blocked| SelfHeal[Self-Healing & Popup Dismissal]
        SelfHeal --> LocalVLM
        CacheUpdate --> NextStep[Trigger Next Subtask]
    end

    subgraph HUD_Telemetry [Dual-Pane Mission Control UI]
        Orchestrator --> HUD_Left[Thought Stream, Latency & Cache Telemetry]
        Browser_Environment --> HUD_Right[Live Viewport Mirror with SoM Badges]
    end
```

---

## 3. Subsystem Breakdown

### 1. Task-Graph Planner
- Takes unstructured natural language input.
- Validates parameters (satellite name, sensor type, bounding coordinates, date ranges, cloud cover thresholds).
- Generates a deterministic DAG (Directed Acyclic Graph) of subtasks:
  - `SUBTASK_1`: Portal Navigation & Authentication
  - `SUBTASK_2`: Satellite & Sensor Category Selection
  - `SUBTASK_3`: Temporal & Atmospheric Filter Application
  - `SUBTASK_4`: Spatial Region Selection (Canvas Bounding Box)
  - `SUBTASK_5`: Product Query & Output Download Trigger

### 2. Semantic DOM & A11y Tree Pruner
- Filters raw 10,000+ DOM nodes down to interactive accessibility nodes (role, name, value, bounding box).
- Strips irrelevant SVGs, styling stylesheets, and hidden DOM branches.
- Reduces token context size by ~90%, enabling sub-50ms rule-based element matching for standard HTML controls.

### 3. Set-of-Marks (SoM) Engine
- Injects numbered colored bounding badges (`[1]`, `[2]`, `[3]`) directly into interactive DOM overlays or canvas elements.
- When vision inference is required, the VLM responds with `{"action": "click", "mark_id": 4}` rather than generating raw floating-point pixel coordinates.

### 4. Action Memory Cache
- Maintains a signature-keyed persistent SQLite / JSON store of successful UI paths:
  `Key: hash(portal_id + subtask_type + target_descriptor)`
  `Value: { action_type, selector, normalized_coords, post_state_phash }`
- First run latency: ~45s. Second run latency: **< 8s** (Demonstrating radical speedup).

### 5. Perceptual Diff & Self-Healing Verifier
- Calculates pre-action and post-action perceptual image hashes (`pHash`).
- If hamming distance == 0 (no visual change after action), triggers self-healing:
  1. Check for modal/overlay obstruction (`aria-modal="true"`, dialog divs).
  2. Auto-dismiss banner or click 'Close'.
  3. Re-attempt action with coordinate jitter or alternative selector.
