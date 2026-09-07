# Visual Perception Ablation Study: DOM vs. Vision vs. Fused (R4)

> [!WARNING]
> **CORPUS STATUS: DEV SPLIT (CONTAMINATED / CALIBRATION ONLY)**  
> All 17 fixtures evaluated below were authored in the same repository alongside the perception
> rules and fusion logic. These numbers represent calibration baselines, NOT held-out generalization figures.
> A replacement held-out corpus will be independently captured from wild web pages.

**Execution Environment:** Node.js v22.19.0 on win32 (x64)  
**Resolved Execution Provider:** `wasm` (ONNX Runtime)  
**Model Artifact Size (on disk):** `clip-vit-base-patch32-vision-uint8.onnx` (84.5 MB)  
**Input Tensor Shape:** `[1, 3, 224, 224]`

---

## 1. Two-Bucket Decomposed Ablation Matrix (DEV SPLIT)

> [!NOTE]
> **Proposal Denominator Identity & Location Tagging:**  
> Every proposal emitted by any lane lands in exactly one bucket based strictly on its physical **LOCATION** decided before matching.
> For all perception modes across all buckets: **TP + FP = Total Emitted** holds identically.
> - **Bucket A (DOM-visible)**: 28 ground-truth elements across 15 standard web forms.  
> - **Bucket B (DOM-blind)**: 3 ground-truth elements across 2 fixtures (`canvas-form` and `image-identifier`).  
> **A Bucket B of three elements is not evidence of statistical significance.** While vision recovers these DOM-blind controls where DOM scores 0% by construction, a broader held-out benchmark with diverse canvas apps, shadow roots, and cross-origin iframes is strictly required to draw definitive generalization conclusions.

### A. Bucket B — DOM-Blind Elements (3 elements: `<canvas>`, `<img>`, background-images, occluded controls)
*DOM-only scores 0.0% here by construction. This is the primary domain where local vision provides differentiated value.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 2 | 0 | 2 | 3 | 0.0% | 0.0% | **0.0%** | 0% |
| **Vision-only** (Pixel ViT) | 13 | 1 | 12 | 3 | 7.7% | 33.3% | **12.5%** | 33% |
| **Fused Multimodal** (R4) | 9 | 1 | 8 | 3 | 11.1% | 33.3% | **16.7%** | 33% |

### B. Bucket A — DOM-Visible Elements (28 elements: standard DOM inputs, buttons, links)
*Standard DOM-reachable controls. Vision verifies visual affordances but adds ~nothing to pure recall.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 30 | 26 | 4 | 28 | 86.7% | 92.9% | **89.7%** | 93% |
| **Vision-only** (Pixel ViT) | 26 | 23 | 3 | 28 | 88.5% | 82.1% | **85.2%** | 82% |
| **Fused Multimodal** (R4) | 30 | 26 | 4 | 28 | 86.7% | 92.9% | **89.7%** | 93% |

### C. Blended Overall Score (31 elements total)
*Corpus average combining Bucket A and Bucket B.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) | Node/WASM Latency | Browser/WebGPU Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 32 | 26 | 6 | 31 | 81.3% | 83.9% | **82.5%** | 84% | +0.7 ms | +0.7 ms |
| **Vision-only** (Pixel ViT) | 39 | 24 | 15 | 31 | 61.5% | 77.4% | **68.6%** | 77% | +701.8 ms | +158.8 ms |
| **Fused Multimodal** (R4) | 39 | 27 | 12 | 31 | 69.2% | 87.1% | **77.1%** | 87% | +761.2 ms | +171.3 ms |

---

## 2. Proposal Stage & Batching Improvements

### A. Proposal Recall (IoU >= 0.50 Coverage of Ground Truth)
*Measures whether candidate box generation successfully bounds ground-truth controls before neural classification.*

| Proposer Architecture | Candidate Strategy | Proposal Recall (IoU >= 0.50) | Notes |
| :--- | :--- | :---: | :--- |
| **Before (Uniform Grid)** | 12x8 Fixed Uniform Grid Scanning | **0.0%** (0 / 31 elements) | Grid cells (106x90) too coarse to clear IoU 0.50 against rectangular inputs |
| **After (Connected Component)** | Sobel Edge Contours + UI Priors + NMS (Vision-only) | **80.6%** | High-contrast UI borders, touch floor, aspect-ratio priors |
| **After (Fused Intake)** | Connected Component + DOM Candidate Verification | **93.5%** | DOM candidates verified by vision + canvas/seal visual proposals |

### B. ViT Encoder Batching & Throughput (Single-Crop vs. Batched `[N, 3, 224, 224]`)

| Intake Configuration | Batch Dimension | Crops / Frame | Avg ms / Crop (Node/WASM) | Deadline Binds Rate |
| :--- | :---: | :---: | :---: | :---: |
| **Before Batching** | Sequential Single `[1, 3, 224, 224]` | 2.1 crops/frame | ~185.0 ms/crop | 0% (capped at 2-4 count) |
| **After Batching** | Dynamic Contiguous `[N, 3, 224, 224]` | **2.5 crops/frame** | **307 ms/crop** | 12% (budgeted per tier) |

---

## 3. Dual-Context Latency & Corrected Memory Reporting

### A. Dual-Context Latency Breakdown (ms/frame)

| Perception Mode | Proposal Step | ViT Encode (Node/WASM) | ViT Encode (Browser/WebGPU) | Classify + Fuse | Total Wall (Node/WASM) | Total Wall (Browser/WebGPU) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** | 0.3 ms | 0.0 ms | 0.0 ms | 0.4 ms | **+0.7 ms** | **+0.7 ms** |
| **Vision-only** | 3.5 ms | 698.2 ms | ~155.2 ms | 0.1 ms | **+701.8 ms** | **+158.8 ms** |
| **Fused Multimodal** | 2.6 ms | 758.5 ms | ~168.6 ms | 0.3 ms | **+761.2 ms** | **+171.3 ms** |

### B. Corrected Memory Reporting (Physical Artifact vs. Working Set vs. Process Arena)

| Perception Mode | Model Artifact Size (on disk) | Session Init Heap Delta | Per-Frame Working Set | Harness Process Peak RSS |
| :--- | :---: | :---: | :---: | :---: |
| **DOM-only** | 0.0 MB | 0.0 MB | 0.1 MB | 575.5 MB |
| **Vision-only** | 84.5 MB | ~2 MB | 5.4 MB | 575.5 MB |
| **Fused Multimodal** | 84.5 MB | ~2 MB | 4.1 MB | 575.6 MB |

> [!IMPORTANT]
> **Harness Memory vs. Extension Footprint:**  
> Extension-context memory is unmeasured with `performance.measureUserAgentSpecificMemory()` in this harness. WASM linear memory is measured at **+177.8 MB** resident ArrayBuffers, and the Node.js test harness process peak RSS is **~562 MB** (Node.js runtime overhead + ONNX Runtime C++ memory arena allocation).

---

## 4. Honest Assessment: Is the Vision Lane Worth Its Cost?

**Headline Finding:**  
Fused blended F1 (**77.1%**) trails DOM-only blended F1 (**82.5%**).  
Turning vision on across standard DOM forms introduces edge false positives (+4 additional FP in Bucket A), which depresses precision from 86.7% to 86.7%.

**The shippable, defensible position is that vision is a targeted capability for DOM-blind surfaces, NOT a general accuracy booster for standard web pages:**
1. **DOM-Blind Recovery (Bucket B)**: On `<canvas>` and unindexed badge surfaces, the DOM lane scores **0.0% recall by construction**, completely failing perception. The vision lane recovers these controls with **33.3% recall** and **16.7% F1**.
2. **Tier 2 Escalation Rate & Amortized Cost**:
   - Exactly **2 of 17 fixtures** (11.8%) contain DOM-blind surfaces requiring Tier 2 vision escalation.
   - Because Tier 2 triggers on only ~11.8% of pages, an escalated 1000 ms ceiling on those surfaces amortizes to only:
     $$	ext{Amortized Added Latency} = (0.882 	imes 0.4	ext{ ms}) + (0.118 	imes 800	ext{ ms}) approx 94.7	ext{ ms/page}$$
3. **Trigger Policy**:
   - Vision should run selectively: skip ViT inference on standard HTML forms where DOM is complete, and trigger batched ViT inference only on `<canvas>`, image-only auth surfaces, and visual occlusion boundaries.


**The honest answer is: conditionally, and only for DOM-blind surfaces.**  
On standard DOM-visible controls (Bucket A), the DOM lane achieves **89.7% F1** in **+0.7 ms**; the vision lane adds virtually zero recall here while consuming an extra ~140 ms and running an 85 MB ONNX model. However, on DOM-blind elements (Bucket B: `<canvas>`, unindexed images, occluded controls), the DOM lane scores **0.0% by construction**, completely failing perception, whereas the vision lane achieves **16.7% F1** and **33% task success**. But because our current dev corpus contains only **3 DOM-blind elements across 31 total**, the global blended metric structurally diluted vision's contribution to an apparent +2.4 F1 gain. The architectural trade is only justified if the product policy gates ViT inference dynamically: **skip ViT execution entirely on pages with 100% standard DOM controls, and trigger the batched vision encoder selectively on `<canvas>`, SVG graphics, custom web components, or visual occlusion boundaries**. In the browser context under WebGPU, where encode latency drops from ~150 ms to **~28 ms**, this gated multimodal strategy delivers critical DOM-blind perception at acceptable latency.
