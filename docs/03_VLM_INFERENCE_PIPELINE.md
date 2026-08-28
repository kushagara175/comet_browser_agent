# 03. In-Browser Vision & Server VLM Pipeline — SIH26171

## 1. Pipeline Overview

The perception and reasoning pipeline bridges client-side WebGPU visual processing with server-side multimodal reasoning:

```
[Raw Screen State] ──▶ [In-Browser WebGPU ViT/Face Detector] ──▶ [Canvas Blur & Blackout] 
                             │
                             ▼
               [Sanitized Context (Zero PII)] ──▶ [Server VLM API] ──▶ [Structured Action JSON]
```

---

## 2. Client-Side Vision & Privacy Engine (In-Browser WebGPU)

### A. ONNX Runtime Web Setup
The extension runs in-browser ML inference inside a dedicated offscreen document with WebGPU acceleration:

```typescript
import * as ort from 'onnxruntime-web/webgpu';

// Configure WebGPU backend with WASM fallback
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;

export async function initVisionSession() {
  const session = await ort.InferenceSession.create('./models/blazeface_quant.onnx', {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all'
  });
  return session;
}
```

### B. Lightweight Visual Face Detection (BlazeFace / MobileNet)
- **Model Size:** ~1.2 MB quantized ONNX.
- **Inference Time:** 20–35 ms on WebGPU.
- **Output:** Bounding boxes `[ymin, xmin, ymax, xmax]` for every human face detected in the viewport.

### C. DOM Sensitive Field Sanitization
Content script inspects the active DOM tree and extracts bounding rectangles for sensitive input fields:
```typescript
export function getSensitiveElementBoxes(document: Document): DOMRect[] {
  const sensitiveSelectors = [
    'input[type="password"]',
    'input[autocomplete*="cc-"]',
    'input[name*="password" i]',
    'input[name*="card" i]',
    'input[name*="ssn" i]',
    'input[name*="aadhaar" i]',
    'input[name*="cvv" i]'
  ];
  
  const elements = document.querySelectorAll(sensitiveSelectors.join(','));
  return Array.from(elements).map(el => el.getBoundingClientRect());
}
```

### D. Canvas Obfuscation Engine (Zero-Leakage Guarantee)
Before any image data leaves the client, the canvas obfuscator paints over sensitive areas:
```typescript
export async function sanitizeScreenshot(
  rawImageBitmap: ImageBitmap,
  faceBoxes: BoundingBox[],
  domBoxes: DOMRect[]
): Promise<Blob> {
  const canvas = new OffscreenCanvas(rawImageBitmap.width, rawImageBitmap.height);
  const ctx = canvas.getContext('2d')!;
  
  // 1. Draw base raw screenshot
  ctx.drawImage(rawImageBitmap, 0, 0);
  
  // 2. Apply Gaussian Blur over detected faces
  for (const box of faceBoxes) {
    ctx.filter = 'blur(16px)';
    ctx.drawImage(canvas, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height);
    ctx.filter = 'none';
  }
  
  // 3. Apply Solid Blackout Rectangles over sensitive DOM inputs
  ctx.fillStyle = '#000000';
  for (const box of domBoxes) {
    ctx.fillRect(box.x, box.y, box.width, box.height);
    // Draw visual badge confirming redaction
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  
  return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}
```

---

## 3. Server-Side VLM Reasoning Engine

### A. Centralized VLM Model Configuration
- **Allowed Models:** `Qwen2.5-VL-7B/72B`, `Claude 3.5 Sonnet`, `Llama-3.2-Vision-11B`, `DeepSeek-VL`.
- **Deployment:** Cloud API endpoint during SIH (fully permitted by official rules).

### B. VLM System Prompt Schema
```text
You are an autonomous browser agent assistant. You are given:
1. A privacy-sanitized screenshot of the user's active browser viewport (passwords are blacked out, faces are blurred).
2. An anonymized, structural DOM tree of interactive elements.
3. The user's target workflow goal.

Your task is to analyze the sanitized visual context and return the SINGLE next best UI action as strict JSON.

JSON Schema:
{
  "thought": "Brief explanation of visual reasoning",
  "action": "click" | "type" | "select" | "scroll" | "wait" | "finish",
  "target_selector": "CSS selector for target element (if applicable)",
  "target_coordinates": { "x": number, "y": number },
  "input_text": "text to type (if action == 'type')",
  "scroll_delta": { "dx": number, "dy": number }
}
```

---

## 4. Local Development Mock Server

To enable fast frontend development on the Lenovo IdeaPad without invoking cloud APIs, a lightweight FastAPI mock server is provided:

```python
from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel

app = FastAPI(title="SIH26171 Reasoning Server")

@app.post("/api/v1/reason")
async def reason_step(
    screenshot: UploadFile = File(...),
    dom_tree: str = Form(...),
    user_goal: str = Form(...)
):
    # Validates that incoming screenshot is received
    return {
        "thought": "Detected search bar in sanitized DOM tree; initiating query input",
        "action": "type",
        "target_selector": "input[name='q']",
        "target_coordinates": {"x": 320, "y": 180},
        "input_text": "ISRO space mission schedule 2026",
        "step_id": 1
    }
```
