# 03. On-Device VLM Inference Pipeline — SIH26171

## 1. Local Model Strategy & Tiering

To guarantee air-gapped compliance on consumer hardware (< 16GB RAM / 4GB VRAM), we adopt a staged model approach:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                MODEL TIERING & SELECTION                               │
├─────────────────┬──────────────┬─────────────┬────────────┬────────────────────────────┤
│ Phase           │ Model        │ Params / Q  │ VRAM / RAM │ Role & Benchmarks          │
├─────────────────┼──────────────┼─────────────┼────────────┼────────────────────────────┤
│ 1. Prototype    │ SmolVLM-500M │ 0.5B (INT4) │ ~800 MB    │ Ultra-fast loop validation │
│                 │              │             │            │ Step Latency: ~250-350ms   │
├─────────────────┼──────────────┼─────────────┼────────────┼────────────────────────────┤
│ 2. Production   │ SmolVLM-2.2B │ 2.2B (INT4) │ ~2.1 GB    │ Core workhorse for UI      │
│    Standard     │              │             │            │ Step Latency: ~500-750ms   │
├─────────────────┼──────────────┼─────────────┼────────────┼────────────────────────────┤
│ 3. Complex Map  │ Qwen2.5-VL   │ 3.0B (INT4) │ ~3.2 GB    │ SOTA spatial grounding for │
│    Stretch      │ 3B-Instruct  │             │            │ WebGL canvas region drag   │
└─────────────────┴──────────────┴─────────────┴────────────┴────────────────────────────┘
```

> **Golden Rule:** Never start development on the heaviest model. Get the full loop (Planner ➔ DOM ➔ SoM ➔ VLM ➔ Playwright ➔ Cache) fully functional on SmolVLM-500M/2.2B first. A 500ms responsive agent is a winning demo; a 4-second stalling model loses hackathons.

---

## 2. Local Inference Runtime Setup

### Serving with Ollama (Metal & CUDA acceleration)
Ollama provides zero-cloud local OpenAI-compatible endpoints on `http://127.0.0.1:11434`.

```bash
# Start local Ollama server
ollama serve

# Pull and run SmolVLM / Qwen2.5-VL
ollama run qwen2.5-vl:3b-instruct-q4_K_M
```

### Direct Llama.cpp / Python llama-cpp-python (Air-Gapped Embedding)
For standalone zero-dependency Python packages:
```python
from llama_cpp import Llama
from llama_cpp.llama_chat_format import Llava15ChatHandler

# Initialize local multimodal model with Metal acceleration (n_gpu_layers=-1)
chat_handler = Llava15ChatHandler(clip_model_path="models/mmproj-model-f16.gguf")
llm = Llama(
    model_path="models/qwen2.5-vl-3b-instruct-q4_k_m.gguf",
    chat_handler=chat_handler,
    n_ctx=2048,
    n_gpu_layers=-1, # Offloads 100% to Apple Metal or CUDA
    verbose=False
)
```

---

## 3. Image Preprocessing & Resolution Budget

High-resolution screenshots (1920x1080) explode VLM token counts and destroy sub-second latency targets.

### The Dynamic Cropping / Downscaling Pipeline
1. **Viewport Resolution:** Standardize browser viewport to `1280x720` or `1024x768`.
2. **Downsampling:** Resize full-screen screenshots to max dimension `768px` before inference.
3. **Region-of-Interest (ROI) Cropping:** When interacting with the WebGL map canvas, crop *only* the canvas bounding box, preserving pixel clarity for bounding box prediction without passing the entire browser window.

---

## 4. Structured Prompt Schema & JSON Contract

The model must return deterministic, machine-parseable JSON actions without conversational fluff.

### System Prompt
```text
You are an autonomous browser agent navigating ISRO geospatial portals.
You are given an image with numbered Set-of-Marks badges [1], [2], [3]...
Your current subtask: "{{SUBTASK_DESCRIPTION}}"

Respond ONLY with a JSON object adhering to this schema:
{
  "thought": "Short explanation of target UI element",
  "action": "click" | "type" | "select" | "canvas_drag" | "scroll" | "wait" | "done",
  "target_mark_id": number | null,
  "value": string | null,
  "drag_coords": { "start_x": number, "start_y": number, "end_x": number, "end_y": number } | null
}
```

### Sample Model Output
```json
{
  "thought": "Badge [6] corresponds to Cartosat-2 satellite option in the sensor selection dropdown.",
  "action": "click",
  "target_mark_id": 6,
  "value": null,
  "drag_coords": null
}
```

---

## 5. Mock Model Server for Fast Teammate Development

During development, teammates working on Playwright scripts, frontend HUD, or cache logic do not need to wait for local GPU/model runs. They can run a deterministic mock server:

```python
# mock_vlm_server.py
from fastapi import FastAPI, UploadFile, Form
import json

app = FastAPI()

MOCK_RESPONSES = [
    {"thought": "Clicking Cartosat dropdown", "action": "click", "target_mark_id": 2},
    {"thought": "Selecting August 2024 date range", "action": "type", "target_mark_id": 5, "value": "01-08-2024 to 31-08-2024"},
    {"thought": "Dragging region of interest across Assam", "action": "canvas_drag", "drag_coords": {"start_x": 420, "start_y": 310, "end_x": 580, "end_y": 440}},
    {"thought": "Clicking download button", "action": "click", "target_mark_id": 9}
]

@app.post("/v1/agent/action")
async def get_mock_action(step: int = Form(0)):
    idx = min(step, len(MOCK_RESPONSES) - 1)
    return MOCK_RESPONSES[idx]
```
