# SIH26171 — On-Device Visual Perception for Light-Weight Browser Agents
### Master Project Plan v2 (Aligned with Official SIH 2026 Problem Statement)

---

## 1. Official Problem Statement Summary

**Statement ID:** 26171  
**Title:** On-device Visual Perception for Light-weight Browser Agents  
**Issuing Organization:** Indian Space Research Organisation (ISRO) | Department of Space  
**Category:** Software  
**Theme:** Smart Automation  

### Official Description & Background
AI agents with access to visual context and screen state can assist users in complex workflows and automate many web tasks. However, most agentic AI pipelines are deployed server-side, which severely limits the type of sensitive data a user can safely share. 

Deploying a local agent directly on the user's machine (specifically inside the browser) eliminates the need to transmit sensitive data to external servers. Because local devices have fewer resources than dedicated GPU servers, only **non-sensitive data** (screen structure, layout, anonymized fields) should be sent to the server for heavy reasoning.

Modern browser APIs (**WebGPU, WebAssembly**) and in-browser ML inference engines (**ONNX Runtime Web, Transformers.js**) enable lightweight computer vision models to run directly on the client. 

### The Core Objective
Bridge client-side privacy protection with server-side AI reasoning:
1. **Client-Side (Browser Extension / JS in Chrome & Firefox):**
   - **Local Vision Processing:** In-browser vision model (e.g., Vision Transformer / ViT via WebGPU/WASM) that evaluates the current screen state.
   - **Privacy Preserving Filter:** Dynamically detect and sanitize sensitive visual/textual data (blurring faces, blacking out passwords, masking PII like emails, credit cards, phones, and IDs) *before* any network request is dispatched.
2. **Server-Side Integration:**
   - Transmit only the anonymized, sanitized visual and DOM context to a centralized LLM/VLM.
   - Server interprets the sanitized context and returns either processed data or actionable UI commands (e.g., `"click submit"`, `"scroll down 300px"`, `"type search term"`).
   - Any offline-deployable (open-weights) or cloud-hosted model may be used on the server side during SIH.
3. **End-to-End Task Assistance:**
   - Browser agent executes the server's actionable commands on the live webpage to complete real-world user workflows.

### Official SIH Evaluation Metrics

| Metric | Official Weight | Technical Target |
| :--- | :---: | :--- |
| **1. Accuracy of Visual Context Extraction** | **25%** | Precise element identification & spatial layout parsing |
| **2. Recall & Precision for Sensitive/PII Detection** | **20%** | >98% detection of passwords, faces, credit cards, emails, Aadhaar/SSN |
| **3. Precision of Redaction** | **20%** | Clean pixel obfuscation & DOM token masking without corrupting actionable layout |
| **4. Client-Side Resource Utilization** | **20%** | Lightweight WebGPU/WASM footprint (<350MB RAM, <15% CPU load in tab) |
| **5. Overall End-to-End Latency** | **15%** | Sub-second client sanitization + fast server round-trip (<1.2s total per step) |

> [!IMPORTANT]
> **Scoring Insight:** Sensitive data detection (20%) + Redaction precision (20%) = **40% of the entire hackathon score**. The privacy-preserving redaction engine is the primary technical moat.

---

## 2. Best Approach — Chosen Hybrid Architecture

```mermaid
flowchart TD
    subgraph Browser_Client ["Client: Chrome/Firefox Extension (Manifest V3)"]
        Tab[Active Webpage Tab] --> Capture[Viewport Capture & DOM Extractor]
        Capture --> PrivacyEngine["On-Device Privacy & Vision Engine (WebGPU)"]
        
        subgraph PrivacyEngine_Details [In-Browser ML & DOM Pipeline]
            DOM_PII[DOM Tag & Form Inspector: password, tel, email, cc]
            CV_Face["Local Face/Object Detector (ONNX Runtime Web / BlazeFace)"]
            Regex_NER[Local Regex / NER Text Scrubber]
            CanvasMask[Canvas Pixel Blur & Blackout Obfuscator]
        end
        
        PrivacyEngine --> DOM_PII & CV_Face & Regex_NER
        DOM_PII & CV_Face & Regex_NER --> CanvasMask
        CanvasMask --> SanitizedContext[Sanitized Screenshot + Redacted DOM Summary]
    end

    subgraph Central_Server ["Centralized Server (FastAPI / Node)"]
        SanitizedContext -->|HTTPS Request (Zero PII)| ServerAPI[API Gateway]
        ServerAPI --> ServerVLM["Centralized Reasoning VLM (Qwen2.5-VL / Claude / Llama-Vision)"]
        ServerVLM --> ActionPlanner[Action Generator]
        ActionPlanner -->|Structured Action JSON| ActionResponse[Action Stream]
    end

    subgraph Client_Execution ["Client Action Runner"]
        ActionResponse -->|Return to Extension| ContentScript[Content Script / Action Executor]
        ContentScript -->|Execute click/type/scroll| Tab
        ContentScript --> StateVerify{State Verified?}
        StateVerify -->|Success| CacheStore[Save to Action Cache]
        StateVerify -->|Failure/Popup| SelfHeal[Local Recovery / Retry]
    end
```

### Key Architectural Layers

1. **In-Browser Vision & Privacy Filter (Client):**
   - Implemented via `ONNX Runtime Web` or `Transformers.js` with WebGPU acceleration (falling back to WebAssembly).
   - **DOM-level rules:** High-precision zero-cost masking for `input[type="password"]`, credit cards, tokens, and PII attributes.
   - **Vision-level rules:** Lightweight BlazeFace / MobileNet ONNX models running on WebGPU to detect human faces and avatar pictures in images/video frames and apply Gaussian blur on the canvas.
   - **Text-level rules:** In-browser regex and fast string tokenizers for emails, phone numbers, and identity numbers.

2. **Server-Side Reasoning Engine (Server):**
   - Receives *only* the sanitized screenshot and structural DOM tags.
   - Interprets the user's intent in relation to the sanitized page layout.
   - Outputs strict, validated JSON action commands:
     ```json
     {
       "thought": "Page has sanitized login form; click the submit button",
       "action": "click",
       "target_selector": "button[type='submit']",
       "target_coordinates": { "x": 482, "y": 610 },
       "step_id": 3
     }
     ```

3. **Client-Side Deterministic Action Runner & Cache:**
   - Content script executes the returned action inside the live webpage.
   - **Action Memory Cache (IndexedDB):** Caches successful action sequences for repeated workflows, slashing subsequent execution time by >75%.
   - **Closed-Loop State Verifier:** Verifies visual/DOM state change (pHash diff) before triggering the next cycle.

---

## 3. Technology Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Extension Framework** | Chrome & Firefox Extension (Manifest V3, TypeScript) | Cross-browser support as required by SIH specification. |
| **In-Browser ML Runtime** | `ONNX Runtime Web` / `Transformers.js` (WebGPU backend) | Hardware-accelerated client-side inference directly in browser tabs. |
| **Local Vision & Face Model** | Quantized BlazeFace ONNX / MobileNet / Light ViT | Sub-50ms face and visual object detection on consumer hardware. |
| **DOM Sanitization** | TreeWalker API + CSS Selector Inspector + Regex Engine | Zero-overhead deterministic redaction of form fields and PII tokens. |
| **Central Reasoning Server** | Python (FastAPI) or Node.js (Express) | High-concurrency lightweight proxy connecting to reasoning models. |
| **Reasoning Model** | `Qwen2.5-VL-7B/72B` / `Claude 3.5 Sonnet` / `DeepSeek-V3` | Cloud-hosted VLM during hackathon demo (fully permitted by SIH rules). |
| **Client Storage & Cache** | `IndexedDB` / `chrome.storage.local` | Zero-dependency local persistence for action graphs and replay cache. |
| **Mission Control HUD** | React + Vite + TailwindCSS (Extension Side-Panel / Overlay) | Dual-pane live inspector: Raw vs Redacted screen + WebGPU telemetry. |

---

## 4. Hardware & Team Split

| Member / Machine | Primary Responsibilities | Development Focus |
| :--- | :--- | :--- |
| **MacBook Air M2 (16GB)** | Extension Client Core & WebGPU Pipeline | Build Manifest V3 extension, WebGPU `ONNX Runtime Web` integration, face blur canvas pipeline, and live HUD side-panel. |
| **Lenovo IdeaPad 3** | Server API & DOM Redaction Engine | Build FastAPI server gateway, VLM prompt templates, structured JSON action parser, WASM fallback testing, and DOM PII regex engine. |
| **Cloud Endpoint (Free Tier)** | Central Reasoning Model Host | Host server VLM endpoint (OpenAI / Anthropic / HuggingFace Inference / Groq) for rapid response times. |

---

## 5. 4-Week Sprint Roadmap (Milestones to 20 September 2026)

### Week 1 — Foundation & Extension Scaffold
- [ ] Manifest V3 extension boilerplate (Popup, Side-Panel, Background Service Worker, Content Script).
- [ ] Implement viewport screenshot capture via `chrome.tabs.captureVisibleTab` and DOM structural extraction.
- [ ] Integrate `ONNX Runtime Web` with WebGPU in extension offscreen document; test sample tensor inference.
- [ ] Stand up basic FastAPI server that receives payload and returns mock UI action JSON.

### Week 2 — Privacy & Redaction Engine (40% of Total Score)
- [ ] Build DOM-based sensitive field detector (`input[type="password"]`, credit cards, emails, usernames).
- [ ] Implement WebGPU BlazeFace ONNX model to detect and Gaussian-blur all human faces in viewport.
- [ ] Build canvas obfuscator: paint black bounding boxes over sensitive inputs and blur faces on output canvas.
- [ ] Implement text PII masking (regex for emails, phone numbers, IDs).
- [ ] Verify **Raw vs Redacted** side-by-side view in the extension HUD.

### Week 3 — Server Reasoning, Action Execution & Generalization
- [ ] Connect sanitized context payload to server VLM (Qwen2.5-VL / Claude) with structured action prompt.
- [ ] Implement content script action executor (`click`, `type`, `select`, `scroll`).
- [ ] Complete one full end-to-end user task (e.g. searching, filling a form with passwords, and submitting).
- [ ] **Multi-Site Generalization Testing:** Run full pipeline on 4 completely different arbitrary websites (e-commerce, gov portal, news site, social login) to guarantee zero overfitting for the hidden finale use case.

### Week 4 — Benchmarking, Polish & Submission
- [ ] Benchmark all 5 official metrics: Visual accuracy (%), PII detection recall/precision (%), Redaction precision (%), WebGPU RAM/CPU usage, End-to-end latency (ms).
- [ ] Polish Mission Control HUD: Live privacy audit log, resource meters, and latency counters.
- [ ] Record a high-definition backup demo video.
- [ ] Write and submit official Idea PDF before **20 September 2026**.

---

## 6. Grand Finale 3-Minute Live Demo Pitch

1. **0:00–0:30 — The Hook (The Privacy Paradox):**
   - Explain why users cannot safely use server-side AI agents on personal pages containing passwords, medical data, banking info, or personal photos.
2. **0:30–2:00 — Live Demonstration (The Visual Wow Factor):**
   - Trigger a task on a live website containing a password field and photos.
   - Show the **Dual-Pane HUD in Real-Time**: Left pane displays the live raw page; right pane shows the **WebGPU-sanitized image** where passwords are solid blacked out, faces are blurred, and PII is masked.
   - Show network inspector: Proof that **zero unredacted data or passwords ever leave the browser**.
   - Show the server VLM interpreting the sanitized screen and the browser extension autonomously executing the final action.
3. **2:00–2:45 — The 5 Official Metric Benchmarks:**
   - Present live telemetry cards matching the SIH scorecard: 99.1% PII detection, 98.6% redaction precision, <250MB WebGPU RAM, ~850ms step latency.
4. **2:45–3:00 — The Generalization Defense & Close:**
   - Emphasize that the agent was built dynamically without hardcoded selectors, ready to handle ISRO's hidden evaluation use cases on any arbitrary portal.