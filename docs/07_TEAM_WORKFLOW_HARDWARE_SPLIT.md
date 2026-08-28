# 07. Team Workflow & Machine Role Split — SIH26171

## 1. Hardware Overview & Feasibility

Unlike heavy, all-local architectures that demand massive local GPU VRAM, this hybrid architecture is lightweight and fully compatible with the team's existing laptops:

```
┌────────────────────────────────────────┬────────────────────────────────────────┐
│ 💻 MacBook Air M2 (16GB Unified RAM)   │ 💻 Lenovo IdeaPad 3 (Standard Laptop)  │
├────────────────────────────────────────┼────────────────────────────────────────┤
│ • Primary Extension & WebGPU Dev       │ • Server API & DOM Redactor Dev        │
│ • Apple Metal-accelerated WebGPU       │ • WebAssembly (WASM) fallback testing  │
│ • React Mission Control HUD Side-Panel │ • FastAPI Gateway & Mock Server        │
│ • Live Grand Finale Demo Machine       │ • Generalization test harness          │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

---

## 2. Machine Role Split

| Machine | Assigned Tasks | Deliverables |
| :--- | :--- | :--- |
| **MacBook Air M2** | **In-Browser ML & Extension Core** | • Manifest V3 background worker & offscreen document.<br>• `ONNX Runtime Web` with WebGPU execution.<br>• BlazeFace face detection & Gaussian blur pipeline.<br>• React + Vite Mission Control HUD side-panel. |
| **Lenovo IdeaPad 3** | **Server API & DOM Engine** | • FastAPI reasoning server gateway.<br>• DOM sensitive field selector engine & regex scrubber.<br>• Content script action executor (`click`, `type`, `scroll`).<br>• IndexedDB Action Cache implementation.<br>• Multi-site generalization test suite. |
| **Cloud Endpoint (Free Tier)** | **Central Reasoning Model** | • Hosted VLM API (OpenAI / Anthropic / Groq / HuggingFace Inference).<br>• Fully compliant with official SIH rules allowing cloud models. |

---

## 3. Collaboration & Mock-Server Workflow

To ensure seamless parallel development without blocking each other:
1. **Mock Server First:** The Lenovo IdeaPad develops against a mock server returning deterministic JSON actions (`/api/v1/reason`), validating client execution without calling cloud APIs.
2. **Standardized JSON Contract:** Both machines adhere to the strict action JSON schema defined in `docs/03_VLM_INFERENCE_PIPELINE.md`.
3. **Local Testing:** Both laptops can test the extension simultaneously in Chrome (`chrome://extensions`) and Firefox (`about:debugging`).
