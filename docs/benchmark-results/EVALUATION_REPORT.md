# PrivaPilot — Benchmark Evaluation Report
**Problem Statement:** ISRO | Software | SIH26171  
**Product:** PrivaPilot Privacy-Preserving Browser Agent  
**Generated:** 2026-09-06T21:09:19.213Z  
**Split Evaluated:** all (14 Synthetic Web Scenarios)  
**Git SHA:** `bd2de10`  
**Environment:** darwin arm64 (Node v22.22.0)  
**Browser Engine:** Google Chrome / Chromium Headless (CDP Engine)  
**Vision/PII Provider:** UltraFace ONNX (Wasm/CPU) + Local PII Regex/Luhn Engine  
**Command:** `/Users/kushagrasingh/dev/SIH_26209/scripts/run-benchmarks.js`  

---

## 📊 Summary Scorecard vs. Official SIH Criteria

| Evaluation Metric | Weight | Measured Result | Benchmark Target | Verdict |
| :--- | :---: | :---: | :---: | :---: |
| **Visual Context Accuracy** | **25%** | **82.1% Recall / 76.7% Precision** (Median IoU: 1) | > 95% | ❌ FAILED |
| **PII & Sensitive Data Recall** | **20%** | **100% Recall (100% Precision, F1: 100%)** | > 98% Recall / > 95% Precision | ✅ PASSED |
| **Redaction Precision** | **20%** | **94.7% Coverage (1 Under-Masks, Overhead: 0.85x)** | 100% Coverage (0 Under-Masks) | ❌ FAILED |
| **Client Resource Utilization** | **20%** | **~49.8 MB Memory (Node.js test process (RSS + V8 Heap); Heap: 5 MB) / 99.7% CPU** | < 350 MB / < 15% | ❌ FAILED |
| **End-to-End Task Latency** | **15%** | **4782 ms (p50) / 4782 ms (p95)** | < 1200 ms (p50) | ❌ FAILED |

---

## 🔍 Detailed PII Category Breakdown (20% Weight)

| Category | True Positives | False Positives | False Negatives | Recall | Precision | F1 Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `password` | 3 | 0 | 0 | 100% | 100% | 100% |
| `email` | 2 | 0 | 0 | 100% | 100% | 100% |
| `phone` | 1 | 0 | 0 | 100% | 100% | 100% |
| `credit_card` | 2 | 0 | 0 | 100% | 100% | 100% |
| `cvv` | 1 | 0 | 0 | 100% | 100% | 100% |
| `national_id` | 2 | 0 | 0 | 100% | 100% | 100% |
| `token` | 3 | 0 | 0 | 100% | 100% | 100% |
| `face` | 0 | 0 | 0 | N/A | N/A | N/A |
| `high_risk_surface` | 3 | 0 | 0 | 100% | 100% | 100% |

---

## ⏱️ Step Latency Profile ($t_0 \dots t_7$)

- **Client In-Browser Perception ($t_0 \dots t_3$):** 364 ms (p50) / 364 ms (p95)
- **Server Centralized Reasoning ($t_3 \dots t_4$):** 4417 ms (p50) / 4417 ms (p95)
- **Client DOM Action & Verification ($t_5 \dots t_7$):** 1 ms (p50)
- **Total Step Round-Trip (p50):** 4782 ms
- **Total Step Round-Trip (p95):** 4782 ms

---

## ⚠️ Scope of This Harness — What These Numbers Do And Do Not Cover

This suite runs in Node against static HTML fixtures. It calls the shipped detectors
directly, but it has no browser, no layout engine and no ONNX runtime.

**Excluded from every score above:** face. Their ground-truth targets are neither counted as hits nor as misses.

- Face detection (UltraFace ONNX) requires a rendered canvas and the onnxruntime-web WASM/WebGPU runtime. It cannot execute in this Node harness, so face targets are excluded from the scores rather than assumed correct.
- Region geometry is synthetic: a fixture is an HTML string with no layout. PII detections are matched to ground truth by the secret they found, not by position. Positional/IoU accuracy and true redaction coverage of rendered pixels require the browser harness.
- End-to-end latency here is read from live E2E run telemetry (docs/benchmark-results/E2E_EXTENSION_RUN.json). Real client-side perception latency is measured by "npm run benchmark:browser", which runs the shipped pipeline in real Chrome.
- CPU and memory reflect this Node process running the detectors, not the browser extension under real perception load.

Full breakdown of what is verified where: `docs/AUDIT_LOCAL_VS_DEFERRED.md`.

---

## 🔒 Privacy & Security Boundary Gate
- **Canary Leaks Detected:** `0 leaks (4 checked)`
- **Raw Screenshot Uploads Blocked:** `100% (ENFORCED)`
- **Fail-Closed Uninspectable Surface Coverage:** `3/3 (100%)`
- **Safe Interactive Controls Preserved:** `100% (19/19)`
