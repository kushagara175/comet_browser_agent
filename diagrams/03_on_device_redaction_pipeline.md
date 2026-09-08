# Slide 3: On-Device Redaction & Privacy Guard Deep Dive

> **Problem Statement:** SIH26171 — *On-device Visual Perception for Light-weight Browser Agents*  
> **Organisation:** Indian Space Research Organisation (ISRO)  
> **Evaluation Importance:** Directly targets **Metric 2 (PII Recall & Precision - 20%)** and **Metric 3 (Redaction Precision - 20%)** = **40% of Total Score!**

### Key Talking Points for Judges:
- **3-Tier Concurrent Scanning:** Blends neural vision models (UltraFace ONNX for biometrics), structural DOM tree inspectors (passwords, tokens, hidden fields), and heuristic validators (Luhn for credit cards, Verhoeff for Aadhaar).
- **Sub-50ms Latency:** The quantized INT8 ONNX model runs in an isolated Offscreen Document using WebGPU/Wasm, taking only ~25ms on consumer hardware.
- **Tight Box Clamping:** Uses Non-Maximum Suppression (NMS) and exact bounding box clamping with a subtle +4px padding to guarantee zero under-masking while preventing over-masking of clickable buttons.
- **Post-Redaction Pixel Audit:** Analyzes the final canvas buffer for residual high-frequency text edges before generating the cryptographic hash digest.

```mermaid
flowchart LR
    classDef rawInput fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;
    classDef detector fill:#312e81,stroke:#6366f1,stroke-width:2px,color:#e0e7ff;
    classDef merger fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#f5d0fe;
    classDef mask fill:#701a75,stroke:#ec4899,stroke-width:2px,color:#fdf2f8;
    classDef verifier fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef output fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#93c5fd;

    %% INPUTS
    RawRGB["📸 Raw Viewport Buffer<br/>(Client Screen Pixels)"]:::rawInput
    RawDOM["🌳 Raw In-Memory DOM Tree<br/>(Client Webpage Markup)"]:::rawInput

    %% 3-TIER DETECTORS
    subgraph Pipeline ["3-Tier Concurrent Detection Engines"]
        direction TB
        Det1["🧠 Tier 1: UltraFace ONNX<br/>• Quantized INT8 Weights<br/>• WebGPU / Wasm Worker<br/>• Detects Unmasked Faces"]:::detector
        Det2["🏷️ Tier 2: Structural DOM Inspector<br/>• input[type=password]<br/>• autocomplete=cc-*<br/>• aria-hidden tokens"]:::detector
        Det3["🔢 Tier 3: Algorithmic Regex<br/>• Luhn Checksum (Cards)<br/>• Verhoeff Checksum (Aadhaar)<br/>• RFC-5322 Emails & Phone"]:::detector
    end

    RawRGB --> Det1
    RawDOM --> Det2
    RawDOM --> Det3

    %% MERGER
    Merger["📐 Coordinate Normalizer & NMS<br/>• Non-Maximum Suppression<br/>• Viewport Box Clamping<br/>• Padding Margin (+4px)"]:::merger

    Det1 --> Merger
    Det2 --> Merger
    Det3 --> Merger

    %% MASK RENDERER
    MaskEngine["⬛ Pixel Obfuscation Engine<br/>• Faces: 16px Gaussian Blur<br/>• Inputs: Solid #000000 Blackout<br/>• PII Text: Opaque Color Bars"]:::mask

    RawRGB --> MaskEngine
    Merger --> MaskEngine

    %% PIXEL AUDIT GATE
    Audit["🛡️ Post-Redaction Pixel Audit<br/>• Entropy Variance Analysis<br/>• High-frequency Edge Check<br/>• Zero Plaintext Guarantee"]:::verifier

    MaskEngine --> Audit

    %% OUTPUT
    CleanPayload["🔒 Sanitized Context Output<br/>• Redacted Canvas PNG Blob<br/>• Anonymous Tokenized Nodes<br/>• Cryptographic Hash Digest"]:::output

    Audit -->|Audit Passed| CleanPayload
```
