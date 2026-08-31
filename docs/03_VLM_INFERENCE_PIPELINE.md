# 03. In-Browser Vision & Server Reasoning Pipeline — SIH26171

## 1. Pipeline Overview

The perception and reasoning pipeline bridges client-side visual processing with server-side multimodal reasoning:

```
[Raw Screen State] ──▶ [In-Browser ONNX UltraFace Detector] ──▶ [Canvas Blur & Blackout] 
                             │
                             ▼
               [Sanitized Context (No Plaintext PII)] ──▶ [Server Reasoning API] ──▶ [Structured Action Proposal JSON]
```

---

## 2. Client-Side Vision & Privacy Engine (In-Browser Offscreen Host)

### A. ONNX Runtime Web Setup
The extension runs in-browser ML inference inside an isolated offscreen document using WebAssembly SIMD (with WebGPU execution provider fallback where supported):

```typescript
import * as ort from 'onnxruntime-web';

// Configure Wasm multi-threading and SIMD
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;

export async function initVisionSession(modelBytes: Uint8Array) {
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm', 'webgpu'],
    graphOptimizationLevel: 'all'
  });
  return session;
}
```

### B. Lightweight Visual Face Detection (UltraFace ONNX)
- **Model Size:** ~1.2 MB quantized ONNX.
- **Backend:** ONNX Runtime Web (Wasm / WebGPU provider).
- **Output:** Bounding boxes `[ymin, xmin, ymax, xmax]` for human faces detected in the viewport.

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

### D. Canvas Obfuscation Engine (Fail-Closed Privacy Sanitization)
Before any image data leaves the client, the canvas obfuscator paints over sensitive areas:
```typescript
export async function sanitizeScreenshot(
  rawCanvas: HTMLCanvasElement,
  faceBoxes: BoundingBox[],
  domBoxes: DOMRect[]
): Promise<string> {
  const ctx = rawCanvas.getContext('2d')!;
  
  // 1. Apply Gaussian Blur over detected faces
  for (const box of faceBoxes) {
    ctx.filter = 'blur(16px)';
    ctx.drawImage(rawCanvas, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height);
    ctx.filter = 'none';
  }
  
  // 2. Apply Solid Blackout Rectangles over sensitive DOM inputs
  ctx.fillStyle = '#000000';
  for (const box of domBoxes) {
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
  
  return rawCanvas.toDataURL('image/png');
}
```

---

## 3. Server-Side Reasoning Engine

### A. Centralized Reasoning Model Configuration
- **Supported Engines:** `Qwen2.5-VL`, `Claude 3.5 Sonnet`, `Llama-3.2-Vision`, or local Ollama / LM Studio instances.
- **Deployment:** Centralized server gateway during SIH (fully permitted by official rules).

### B. Reasoning System Prompt Schema
```text
You are an autonomous browser agent assistant. You are given:
1. A privacy-sanitized screenshot of the user's active browser viewport (passwords blacked out, faces blurred).
2. An anonymized list of interactive elements with ephemeral local IDs (e.g. "el_btn_1", "el_input_2").
3. The user's target workflow goal.

Your task is to analyze the sanitized visual context and return the SINGLE next best UI action as strict JSON.

JSON Schema:
{
  "actionId": "string",
  "kind": "click" | "type" | "select" | "scroll" | "wait" | "finish",
  "targetLocalId": "ephemeral local ID of target element (e.g. el_btn_1)",
  "textToType": "string (if kind == 'type')",
  "confidence": number (0.0 to 1.0),
  "risk": "safe" | "protected" | "blocked",
  "rationale": "Brief explanation of proposed action",
  "expectedState": "Expected semantic postcondition description"
}
```

*Note:* CSS selectors and raw script execution are strictly prohibited and rejected by the client coordinator. Coordinate clicking is experimental.

