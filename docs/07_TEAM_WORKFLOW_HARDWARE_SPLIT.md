# 07. Team Workflow & Machine Role Split — SIH26171

## 1. Hardware Split & Work Breakdown

To maximize velocity across team members without GPU contention, we decouple the AI inference engine from the browser automation and UI engineering:

```
┌────────────────────────────────────────┐     ┌────────────────────────────────────────┐
│      MACHINE A: MACBOOK AIR M2         │     │      MACHINE B: LENOVO IDEAPAD 3       │
│      (16GB Unified Memory / Metal)     │     │      (Windows / Linux / 8-16GB RAM)    │
├────────────────────────────────────────┤     ├────────────────────────────────────────┤
│ • Local VLM Host (Ollama / SmolVLM /   │     │ • Playwright Automation Scripts        │
│   Qwen2.5-VL INT4)                     │     │ • Set-of-Marks In-DOM Injector         │
│ • Quantized Model Benchmark Suite      │     │ • Task-Graph Planner Logic             │
│ • Local LLM / Whisper Audio Service    │     │ • Action Memory Cache (SQLite)         │
│ • Final Integration & Live Pitch Host  │     │ • React Mission Control HUD            │
└───────────────────┬────────────────────┘     └───────────────────┬────────────────────┘
                    │                                              │
                    └─────────────── Local Wi-Fi / Hotspot ────────┘
                                    REST & WebSocket API
                                    (Or Local Mock Server)
```

---

## 2. Decoupled Development Workflow

### Phase 1: Zero-Dependency Mocking on Machine B
Teammates on the Lenovo laptop do **not** need to wait for Machine A's model server to be running.
- Use `mock_vlm_server.py` (FastAPI) on Machine B to return instant deterministic JSON actions.
- Build the entire Playwright script, dropdown navigation, canvas drag functions, and React HUD using the mock server.

### Phase 2: LAN Integration
When Machine A's local Ollama endpoint is ready:
1. Connect both laptops to the same phone hotspot or offline router.
2. Machine B configures: `VLM_ENDPOINT = "http://192.168.1.X:11434/v1"`
3. Verify live visual perception over LAN.

### Phase 3: Final Consolidation on Machine A (Demo Day)
Before the Grand Finale:
- Pull the completed Playwright scripts and React build directly onto the **MacBook Air M2**.
- Run everything locally on `localhost` (MacBook M2 hosts both Ollama + Browser Agent + React UI).
- Result: **100% single-laptop, sovereign, zero-network-dependency live demo.**

---

## 3. Git Repository Branching & Directory Strategy

```
SIH_26209/
├── docs/                     # Modular documentation & architecture specs
├── src/
│   ├── core/                 # Orchestrator & Task Graph Planner
│   ├── perception/           # Set-of-Marks, A11y pruner, VLM client
│   ├── automation/           # Playwright browser controller & canvas drag
│   ├── memory/               # SQLite Action Cache & pHash verifier
│   └── ui/                   # React + Vite Mission Control HUD
├── mocks/                    # Mock portal HARs & mock VLM response servers
├── benchmarks/               # Latency, VRAM, and success rate scripts
└── README.md
```
