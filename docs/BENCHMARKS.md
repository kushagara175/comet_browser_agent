# PrivaPilot Benchmark Suite & Perception Ablations

This document tracks empirical evaluation results across perception, detection, and privacy pipelines.

All numbers in this report are produced under the **canonical spatial matching rule**: strict spatial $\text{IoU} \ge 0.50$, zero name matching, and zero `conceptHint` text fallback. Any figure predating this rule has been removed.

See the raw ablation generator in [scripts/ablate.js](file:///d:/SIH%202026/SIHPROJECT1/scripts/ablate.js) and the full markdown output in [ABLATION_REPORT.md](file:///d:/SIH%202026/SIHPROJECT1/docs/benchmark-results/ABLATION_REPORT.md).

---

## 1. Canonical Spatial Matching Rule & Ground-Truth Resolution

### A. The Canonical Matching Rule
1. **Strict Spatial $\text{IoU} \ge 0.50$**: Candidate elements match ground-truth controls solely if their normalized bounding boxes overlap with $\text{IoU} \ge 0.50$.
2. **Zero Name Matching**: Element name, selector text, placeholder, and `conceptHint` substrings are completely excluded from matching.
3. **Identical Rule Across All Modes**: DOM-only, Vision-only, and Fused modes are evaluated identically under this bipartite spatial criterion.

### B. Ground-Truth Box Resolution
- **Total Ground-Truth Elements in Dev Split**: 31 elements across 17 fixtures.
- **Selector-Resolved Bounding Boxes**: **28 elements** across 15 standard web forms were resolved from their DOM selectors and CSS layout geometry.
- **Hand-Authored Physical Bounding Boxes**: **3 elements** in DOM-blind fixtures (`canvas-form` and `image-identifier`) had hand-authored coordinate bounds.

### C. Prior Score Correction (The Old Proposer Scored Zero)
- Under strict spatial matching, the previous 12x8 uniform-grid proposer scored **0 / 31 (0.0%) spatial recall**.
- The previously reported vision-only recall of 9.7% (3/31) was an artifact of `nameMatch` on `conceptHint` text, not spatial overlap ($\text{IoU} < 0.20$).
- The true prior spatial baseline for the vision lane was **zero**.

---

## 2. Two-Bucket Decomposed Ablation Matrix (Dev Split, 17 Fixtures)

> [!WARNING]
> **CORPUS STATUS: DEV SPLIT (CONTAMINATED / CALIBRATION ONLY)**  
> All 17 fixtures evaluated below were authored in the same repository alongside the perception rules and fusion logic. These numbers represent calibration baselines, NOT held-out generalization figures.

> [!NOTE]
> **Bucket Sample Size Disclosure:**  
> - **Bucket A (DOM-visible controls)**: 28 elements across 15 standard HTML web forms.  
> - **Bucket B (DOM-blind controls)**: 3 elements across 2 fixtures (`canvas-form` and `image-identifier`).  
> **A Bucket B of three elements is not evidence of statistical significance.** While vision recovers DOM-blind controls where DOM scores 0% by construction, a broader held-out benchmark is strictly required.

### A. Bucket B — DOM-Blind Elements (3 elements: `<canvas>`, `<img>` seals)
*DOM-only scores 0.0% here by construction. This is the sole domain where local vision provides differentiated value.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 2 | 0 | 2 | 3 | 0.0% | 0.0% | **0.0%** | 0% |
| **Vision-only** (Pixel ViT) | 13 | 1 | 12 | 3 | 7.7% | 33.3% | **12.5%** | 33% |
| **Fused Multimodal** (R4) | 9 | 1 | 8 | 3 | 11.1% | 33.3% | **16.7%** | 33% |

### B. Bucket A — DOM-Visible Elements (28 elements: standard DOM inputs, buttons, links)
*Standard DOM-reachable controls. Vision verifies visual affordances but adds zero recall.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 30 | 26 | 4 | 28 | 86.7% | 92.9% | **89.7%** | 93% |
| **Vision-only** (Pixel ViT) | 26 | 23 | 3 | 28 | 88.5% | 82.1% | **85.2%** | 82% |
| **Fused Multimodal** (R4) | 30 | 26 | 4 | 28 | 86.7% | 92.9% | **89.7%** | 93% |

### C. Blended Overall Score (31 elements total)
*Corpus average combining Bucket A and Bucket B.*

| Perception Mode | Emitted (TP+FP) | TP | FP | GT (TP+FN) | Precision (%) | Recall (%) | Element F1 (%) | Task Success (%) | Node/WASM Latency | Browser/WebGPU Latency* |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DOM-only** (Baseline) | 32 | 26 | 6 | 31 | 81.3% | 83.9% | **82.5%** | 84% | +0.7 ms | +0.7 ms |
| **Vision-only** (Pixel ViT) | 39 | 24 | 15 | 31 | 61.5% | 77.4% | **68.6%** | 77% | +701.8 ms | +158.8 ms |
| **Fused Multimodal** (R4) | 39 | 27 | 12 | 31 | 69.2% | 87.1% | **77.1%** | 87% | +761.2 ms | +171.3 ms |

*\*WebGPU latency is an estimated projection based on shader execution times; see Appendix.*

> [!NOTE]
> **Proposal Accounting Identity ($TP + FP = \text{Total Emitted}$):**  
> Every proposal emitted by any lane lands in exactly one bucket derived strictly from its physical location prior to bipartite matching. The identity $TP + FP = \text{Emitted}$ holds identically across all modes and buckets. Correcting proposal attribution reduced Vision Bucket A precision from the non-credible $100.0\%$ artifact to an honest $88.5\%$.

---

## 3. Batch Curve Profiling & Optimal maxBatch

Profiling the ONNX Runtime WASM execution provider revealed significant degradation at larger batch sizes due to single-threaded WebAssembly memory arena thrash and cache pressure when processing contiguous `[N, 3, 224, 224]` float32 tensors:

| Batch Size ($N$) | Cold Pass (ms/crop) | Warmed Pass (Total ms) | Warmed Pass (ms/crop) | vs. $N=1$ Baseline |
| :---: | :---: | :---: | :---: | :---: |
| **$N=1$** | 164.9 ms | 97.8 ms | 97.8 ms | Baseline |
| **$N=2$** | 330.9 ms | 182.9 ms | 91.5 ms | -6.4% faster |
| **$N=4$** | 168.4 ms | **332.2 ms** | **83.0 ms** | **-15.1% (Global Optimum)** |
| **$N=8$** | 201.6 ms | 757.0 ms | 94.6 ms | -3.3% faster |
| **$N=16$** | 238.1 ms | 2362.4 ms | 147.7 ms | **+51.0% degradation** |

### Configuration Decision
- **`maxBatch` is set to 4** across `VitEncoder` and `VisionPerceptionLane`.
- Setting `maxBatch = 16` had degraded per-crop throughput by over 50% relative to $N=4$ due to arena allocation overhead.

---

## 4. Proposal Stage & Deadline Enforceability

### A. Proposal Recall ($\text{IoU} \ge 0.50$ Spatial Coverage)
- **Before (12x8 Uniform Grid)**: **0.0%** (0 / 31 controls covered).
- **After (Sobel Edge Contours + UI Priors)**: **80.6%** (25 / 31 controls covered).
- **After (Fused Candidate Intake)**: **93.5%** (29 / 31 controls covered).

### B. Deadline Enforceability & Execution Budgeting
- The non-preemptible execution quantum in WebAssembly is **one forward batch** (~332 ms warmed).
- **Budget Decoupling (Tier 1 vs. Tier 2)**:
  - **Tier 1 (Routine / DOM-Visible)**: 1 batch allowance at `maxBatch = 4` (up to 4 crops), ~300 ms ceiling.
  - **Tier 2 (Escalated / DOM-Blind)**: Up to 8 batches at `maxBatch = 4` (up to 32 crops), 1000 ms ceiling.
  - **Escalation Rate**: Exactly 2 of 17 fixtures ($11.8\%$) trigger Tier 2. An escalated 1 s ceiling on those pages amortizes to:
    $$\text{Amortized Added Latency} = (0.882 \times 0.4\text{ ms}) + (0.118 \times 800\text{ ms}) \approx 94.7\text{ ms/page}$$

---

## 5. Client-Resource Footprint & Trigger Policy

### A. Trigger Policy Change: Navigation + Throttled Mutation
- **Previous Specification**: "Always on, every capture" (~60 captures/minute continuous polling).
- **Corrected Specification**: Triggered strictly on **navigation** plus **significant DOM mutation** via `DomMutationTracker` (debounced at 250 ms, maxWait 1000 ms).
- **Browsing Workload Impact**:
  - Idle browsing: **0 captures/minute**.
  - Typical active browsing session: **4 to 8 captures/minute** (an 87% to 93% reduction in client CPU/WASM utilization).

### B. Page-Type Classification Status
- Page-type classification claims (`login_view`, `dashboard`, `canvas_workspace`) have been **retracted from the report and SceneGraph** pending empirical evaluation on a dedicated classification benchmark with reported confusion matrices.

---

## 6. Critical Architecture & Security Disclosures

1. **WASM Linear Memory Residency**:
   - Model artifact on disk: **84.5 MB** (`clip-vit-base-patch32-vision-uint8.onnx`).
   - WASM ArrayBuffer linear memory allocation: **+177.8 MB**.
   - Harness process peak RSS: **562 MB** (Node.js runtime + ONNX C++ memory arena; extension-context heap is unmeasured via `performance.measureUserAgentSpecificMemory()`).
2. **Surface Router Characterization**:
   - Multimodal fusion registered exactly **3 conflicts** across the 17-fixture corpus, all occurring on canvas text where DOM won due to ViT classifying textual regions as `empty_space`.
   - On the remaining 14 standard DOM fixtures, fusion operates as a surface router rather than performing deep conflict reconciliation.
3. **Headline Accuracy Position**:
   - Fused overall blended F1 (**77.1%**) trails DOM-only (**82.5%**) because visual edge proposals on standard DOM backgrounds add false positives (precision drops from 81.3% to 69.2%).
   - **Defensible Position**: Local vision is a **targeted capability for DOM-blind surfaces** (where DOM scores 0%), NOT a general accuracy booster for standard HTML forms.

---

## 7. Retracted Claims Register

To maintain full empirical auditability and prevent invalidated assumptions from returning, the following claims have been officially retracted from all PrivaPilot documentation:

1. **Extension Isolated Heap (~25–35 MB)**:
   - *Retraction Rationale*: An unmeasured assumption that conflated the V8 JavaScript heap with WebAssembly linear memory allocations.
   - *Current Status*: Extension-context memory is unmeasured via `performance.measureUserAgentSpecificMemory()`. Measured WASM linear memory allocation is **+177.8 MB** resident ArrayBuffers.
2. **WASM Multi-Crop Batching Speedup**:
   - *Retraction Rationale*: Assumptions that larger batch sizes ($N=8, 16$) yield linear speedups failed under measurement; $N=16$ suffered a **+51% degradation** due to single-threaded WebAssembly memory arena thrash and cache misses.
   - *Current Status*: Batch size is strictly pinned to **$N=4$** (measured global optimum).
3. **Strict 300 ms Crop-Granularity Deadline**:
   - *Retraction Rationale*: Assuming a 300 ms deadline could preempt inference mid-crop. WebAssembly runtime calls are synchronous and non-preemptible once invoked.
   - *Current Status*: Execution quantum is **one forward batch** (~332 ms warmed). Deadline checks evaluate at batch boundaries. Tier 2 escalation receives an expanded 1000 ms ceiling across up to 8 batches.
4. **Page-Type Classification Accuracy**:
   - *Retraction Rationale*: Unsubstantiated claims regarding page-type categorization (`login_view`, `dashboard`, `canvas_workspace`) were not backed by empirical confusion matrices on held-out benchmarks.
   - *Current Status*: Page-type classification claims are excluded from the report and SceneGraph until measured on an independent held-out dataset.

---

## Appendix: WebGPU Latency Projection

WebGPU hardware acceleration is available in browser contexts with compatible GPU drivers:
- Projected ViT forward pass at $N=4$: **~28 ms/crop** (~112 ms total batch).
- Projected end-to-end frame latency: **~106.5 ms** (vs. 472.7 ms on CPU/WASM).
- *Disclaimer: WebGPU figures are analytical projections based on shader execution times and require hardware-in-the-loop benchmarking.*
