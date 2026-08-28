# 02. System Architecture & Core Modules — SIH26171

## 1. Architectural Philosophy: The Privacy-Preserving Client-Server Split

Standard agentic web architectures send raw, sensitive screen data directly to cloud LLMs. Our architecture enforces a strict **Zero-Leakage Privacy Boundary** directly inside the user's browser:

```
                      ┌────────────────────────────────────────────────────────┐
                      │              USER PROMPT & ACTIVE BROWSER TAB          │
                      │        "Search flights, autofill profile & submit"     │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
                                     [1. Viewport & DOM Capture]
                                                  │
                                                  ▼
                                   [2. In-Browser Privacy Engine]
                                   (WebGPU ONNX + DOM + Regex Scrubber)
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │   3. Privacy-Sanitized Payload  │
                                 │ (Redacted Pixels + Masked DOM)  │
                                 └────────────────┬────────────────┘
                                                  │
                                                  ▼ (Secure HTTPS Request - Zero PII)
                                   [4. Centralized Reasoning VLM]
                                   (Qwen2.5-VL / Claude / DeepSeek)
                                                  │
                                                  ▼
                                  [5. Action Command JSON Stream]
                             {"action": "click", "target_selector": "#pay"}
                                                  │
                                                  ▼ (Return to Browser)
                                    [6. Client Action Executor]
                                    (Content Script DOM Dispatcher)
                                                  │
                                                  ▼
                                   [7. Closed-Loop State Verifier]
                                   (pHash Visual Diff & Action Cache)
```

---

## 2. End-to-End System Pipeline

```mermaid
flowchart TD
    UserTab[Active Browser Tab: Chrome / Firefox] --> CaptureEngine[Viewport Capture & DOM Parser]

    subgraph Client_Extension_Sandbox ["Client Browser Extension (Manifest V3)"]
        CaptureEngine --> OffscreenWorker[Offscreen WebGPU Worker]
        
        subgraph Privacy_Filter ["On-Device Privacy & Redaction Pipeline"]
            OffscreenWorker --> BlazeFaceModel["BlazeFace ONNX (WebGPU Face Detection)"]
            CaptureEngine --> DOMSanitizer["DOM Element Inspector (Password / CC / Tel)"]
            CaptureEngine --> RegexEngine["Local Regex / NER Text Redactor"]
            
            BlazeFaceModel --> CanvasObfuscator["Canvas Pixel Obfuscator (Blur & Blackout)"]
            DOMSanitizer --> CanvasObfuscator
            RegexEngine --> CanvasObfuscator
        end

        CanvasObfuscator --> SanitizedArtifacts["Sanitized Context: Redacted Screenshot + Anonymized DOM"]
    end

    subgraph Server_Reasoning_Gateway ["Centralized Reasoning Server (FastAPI / Node)"]
        SanitizedArtifacts -->|HTTPS Payload (No PII)| GatewayRouter[API Gateway & Prompt Formatter]
        GatewayRouter --> CentralVLM["Server VLM (Qwen2.5-VL / Claude 3.5 Sonnet)"]
        CentralVLM --> ActionParser["Structured Action Parser (JSON Schema Validator)"]
    end

    subgraph Client_Execution_Loop ["Client-Side Action Runner"]
        ActionParser -->|Action JSON| ActionDispatcher[Content Script Action Runner]
        ActionDispatcher --> UserTab
        ActionDispatcher --> StateVerifier{State Transition Verified?}
        StateVerifier -->|Success| ActionCache[IndexedDB Action Memory Cache]
        StateVerifier -->|Stall / Modal Popup| SelfHealing[Autonomous Modal Dismissal Engine]
        ActionCache --> NextSubtask[Trigger Next Interaction Step]
    end

    subgraph Visual_HUD ["Mission Control Telemetry HUD"]
        CaptureEngine --> HUD_Left[Left View: Live Raw Viewport]
        CanvasObfuscator --> HUD_Right[Right View: Sanitized Viewport with Redaction Overlays]
        OffscreenWorker --> HUD_Metrics[Live Telemetry: WebGPU RAM, PII Recall, Latency ms]
    end
```

---

## 3. Subsystem Breakdown

### Subsystem 1: Client Browser Extension (Manifest V3)
- **Background Service Worker:** Orchestrates the extension lifecycle and bridges content scripts with the offscreen WebGPU worker.
- **Content Script:** Injects into active webpage DOM to read structural layout, compute element bounding boxes, and dispatch synthetic user events (`click`, `input`, `scroll`).
- **Offscreen Document:** Provides access to the HTML Canvas API and `WebGPU` compute shaders within Chrome's Manifest V3 security model.

### Subsystem 2: In-Browser Vision & Privacy Filter
- **Face & Media Detection:** Runs a quantized BlazeFace model on WebGPU (`ONNX Runtime Web`), producing bounding boxes for all human faces in <30ms.
- **DOM Attribute Sanitization:** Identifies and blanks out all `input[type="password"]`, `autocomplete="cc-number"`, and confidential form values.
- **Canvas Obfuscator:** Applies Gaussian blur over detected face regions and draws solid blackout `#000000` rectangles over sensitive input fields.

### Subsystem 3: Centralized Server Reasoning Gateway
- **FastAPI / Express Server:** Receives the sanitized screenshot and structural DOM tags via HTTPS.
- **VLM Reasoning Prompt:** Formats the request for the central VLM with strict JSON schema instructions.
- **Action Command Output:** Returns deterministic actions:
  ```json
  {
    "action": "click",
    "target_selector": "button#submit-application",
    "target_coords": { "x": 450, "y": 720 },
    "confidence": 0.98,
    "thought": "Form fields are sanitized; clicking submission button"
  }
  ```

### Subsystem 4: Action Cache & Self-Healing
- **Action Memory Cache (IndexedDB):** Caches successful selector and coordinate paths for recurring workflows to provide instantaneous execution.
- **pHash State Verifier:** Verifies perceptual page state changes before and after each action to catch failed clicks or unexpected modal overlays.
