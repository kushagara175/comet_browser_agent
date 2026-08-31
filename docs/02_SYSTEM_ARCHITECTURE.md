# 02. System Architecture & Core Modules — SIH26171

## 1. Architectural Philosophy: The Privacy-Preserving Client-Server Split

Standard agentic web architectures send raw, sensitive screen data directly to cloud LLMs. Our architecture enforces a strict **Fail-Closed Privacy Boundary** directly inside the user's browser:

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
                                   (Wasm/WebGPU ONNX + DOM + Regex)
                                                  │
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │   3. Privacy-Sanitized Payload  │
                                 │ (Redacted Pixels + Ephemeral IDs)│
                                 └────────────────┬────────────────┘
                                                  │
                                                  ▼ (Secure HTTPS Request - No Plaintext PII)
                                   [4. Centralized Reasoning VLM]
                                   (Qwen2.5-VL / Claude / DeepSeek)
                                                  │
                                                  ▼
                                  [5. Action Command JSON Stream]
                             {"kind": "click", "targetLocalId": "el_btn_1"}
                                                  │
                                                  ▼ (Return to Browser)
                                    [6. Client Action Executor]
                                    (Content Script DOM Dispatcher)
                                                  │
                                                  ▼
                                   [7. Closed-Loop State Verifier]
                                   (Explicit Postcondition Checks)
```

---

## 2. End-to-End System Pipeline

```mermaid
flowchart TD
    UserTab[Active Browser Tab: Chrome MV3 Active / Firefox Ready] --> CaptureEngine[Viewport Capture & DOM Parser]

    subgraph Client_Extension_Sandbox ["Client Browser Extension (Manifest V3)"]
        CaptureEngine --> OffscreenWorker[Offscreen Document Canvas Host]
        
        subgraph Privacy_Filter ["On-Device Privacy & Redaction Pipeline"]
            OffscreenWorker --> UltraFaceModel["UltraFace ONNX (Wasm / WebGPU Fallback)"]
            CaptureEngine --> DOMSanitizer["DOM Element Inspector (Password / CC / Tel)"]
            CaptureEngine --> RegexEngine["Local Regex / Luhn / Verhoeff Redactor"]
            
            UltraFaceModel --> CanvasObfuscator["Canvas Pixel Obfuscator (Blur & Blackout)"]
            DOMSanitizer --> CanvasObfuscator
            RegexEngine --> CanvasObfuscator
        end

        CanvasObfuscator --> SanitizedArtifacts["Sanitized Context: Redacted Screenshot + Ephemeral Local IDs"]
    end

    subgraph Server_Reasoning_Gateway ["Centralized Reasoning Server (Node / Express)"]
        SanitizedArtifacts -->|HTTPS Payload (No Raw PII)| GatewayRouter[API Gateway & Prompt Formatter]
        GatewayRouter --> CentralVLM["Server Reasoning Engine (VLM / LLM)"]
        CentralVLM --> ActionParser["Closed-Schema Action Proposal Validator"]
    end

    subgraph Client_Execution_Loop ["Client-Side Action Runner"]
        ActionParser -->|Action Proposal JSON| ActionDispatcher[Content Script Action Runner]
        ActionDispatcher --> UserTab
        ActionDispatcher --> StateVerifier{Semantic Postcondition Verified?}
        StateVerifier -->|Success| MultiStepLoop[Coordinator Multi-Step Loop]
        StateVerifier -->|Stale Target / Failure| SafeRecovery[Bounded Re-perception Retry / Fail-Safe]
    end

    subgraph Visual_HUD ["Mission Control Telemetry HUD"]
        CaptureEngine --> HUD_Left[Left View: Live Raw Viewport (Local Only)]
        CanvasObfuscator --> HUD_Right[Right View: Sanitized Viewport with Redaction Masks]
        OffscreenWorker --> HUD_Metrics[Live Telemetry: Measured Latencies, PII Categories]
    end
```

---

## 3. Subsystem Breakdown

### Subsystem 1: Client Browser Extension (Manifest V3)
- **Background Service Worker (`coordinator.ts`):** Orchestrates the multi-step perception loop, manages ephemeral local IDs, enforces client safety policy, and coordinates user confirmation for protected actions.
- **Content Script (`action-executor.ts`, `verifier.ts`):** Injects into active webpage DOM to read structural layout, compute element bounding boxes, dispatch synthetic user events using native prototype setters, and verify explicit semantic postconditions.
- **Offscreen Document (`offscreen-main.ts`):** Hosts the HTML5 Canvas API and ONNX Runtime Web environment within Chrome's Manifest V3 security model.

### Subsystem 2: In-Browser Vision & Privacy Filter
- **Face & Media Detection:** Runs a quantized UltraFace ONNX model on WebAssembly (with WebGPU execution provider fallback where supported), detecting human faces locally.
- **DOM Attribute Sanitization:** Identifies and blanks out all `input[type="password"]`, `autocomplete="cc-number"`, and confidential form values.
- **Canvas Obfuscator:** Applies solid blackout `#000000` rectangles over sensitive input fields and blur masks over detected face regions.

### Subsystem 3: Centralized Server Reasoning Gateway
- **Express Server Gateway:** Receives the sanitized screenshot and structural DOM elements via HTTPS with closed JSON schema validation and canary scanning.
- **Action Command Output:** Returns deterministic actions addressed strictly by ephemeral local IDs:
  ```json
  {
    "actionId": "act_101",
    "kind": "click",
    "targetLocalId": "el_btn_submit",
    "confidence": 0.98,
    "risk": "protected",
    "rationale": "Form fields are sanitized; proposing submission click",
    "expectedState": "Confirmation dialog becomes visible"
  }
  ```
- *Note:* Actions are addressed by ephemeral local IDs. Raw CSS selectors and arbitrary code execution are rejected at the client boundary. Coordinate clicking is experimental and used only as an ungrounded fallback.

### Subsystem 4: Closed-Loop State Verifier & Safety Matrix
- **Semantic State Verifier:** Verifies explicit postconditions (modal visibility, navigation changes, landmark mutations, input value updates) with `MutationObserver` timeout.
- **Client Risk Classifier:** Automatically pauses on `protected` actions (`submit`, `pay`, `delete`) and blocks `blocked` actions (`type` into credentials).

