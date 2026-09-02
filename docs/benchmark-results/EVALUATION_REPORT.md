# PrivaPilot — Benchmark Evaluation Report
**Problem Statement:** ISRO | Software | SIH26171  
**Product:** PrivaPilot Privacy-Preserving Browser Agent  
**Generated:** 2026-09-02T06:17:20.658Z  
**Split Evaluated:** all (14 Synthetic Web Scenarios)  
**Git SHA:** `a88f13b`  
**Environment:** win32 x64 (Node v22.19.0)  
**Browser Engine:** Google Chrome / Chromium Headless (CDP Engine)  
**Vision/PII Provider:** UltraFace ONNX (Wasm/CPU) + Local PII Regex/Luhn Engine  
**Command:** `D:\SIH 2026\SIHPROJECT1\scripts\run-benchmarks.js`  

---

## 📊 Summary Scorecard vs. Official SIH Criteria

| Evaluation Metric | Weight | Measured Result | Benchmark Target | Verdict |
| :--- | :---: | :---: | :---: | :---: |
| **Visual Context Accuracy** | **25%** | **82.1% Recall / 76.7% Precision** (Median IoU: 1) | > 95% | ❌ FAILED |
| **PII & Sensitive Data Recall** | **20%** | **94.1% Recall (94.1% Precision, F1: 94.1%)** | > 98% Recall / > 95% Precision | ❌ FAILED |
| **Redaction Precision** | **20%** | **94.7% Coverage (1 Under-Masks, Overhead: 0.85x)** | 100% Coverage (0 Under-Masks) | ❌ FAILED |
| **Client Resource Utilization** | **20%** | **~41.4 MB Memory / 150% CPU** | < 350 MB / < 15% | ❌ FAILED |
| **End-to-End Task Latency** | **15%** | **385 ms (p50) / 385 ms (p95)** | < 1200 ms (p50) | ⚪ NOT MEASURED |

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
| `face` | 0 | 0 | 0 | 100% | 100% | 100% |
| `high_risk_surface` | 2 | 1 | 1 | 66.7% | 66.7% | 66.7% |

---

## ⏱️ Step Latency Profile ($t_0 dots t_7$)

- **Client In-Browser Perception ($t_0 dots t_3$):** 35 ms (p50) / 35 ms (p95)
- **Server Centralized Reasoning ($t_3 dots t_4$):** 350 ms (p50) / 350 ms (p95)
- **Client DOM Action & Verification ($t_5 dots t_7$):** 0 ms (p50)
- **Total Step Round-Trip (p50):** 385 ms
- **Total Step Round-Trip (p95):** 385 ms

---

## ⚠️ Scope of This Harness — What These Numbers Do And Do Not Cover

This suite runs in Node against static HTML fixtures. It calls the shipped detectors
directly, but it has no browser, no layout engine and no ONNX runtime.

**Excluded from every score above:** face. Their ground-truth targets are neither counted as hits nor as misses.

- Face detection (UltraFace ONNX) requires a rendered canvas and the onnxruntime-web WASM/WebGPU runtime. It cannot execute in this Node harness, so face targets are excluded from the scores rather than assumed correct.
- Region geometry is synthetic: a fixture is an HTML string with no layout. PII detections are matched to ground truth by the secret they found, not by position. Positional/IoU accuracy and true redaction coverage of rendered pixels require the browser harness.
- End-to-end latency here is estimated with a nominal server figure, not measured against a real model. Real client-side perception latency is measured by "npm run benchmark:browser", which runs the shipped pipeline in real Chrome.
- CPU and memory reflect this Node process running the detectors, not the browser extension under real perception load.

Full breakdown of what is verified where: `docs/AUDIT_LOCAL_VS_DEFERRED.md`.

---

## 🔒 Privacy & Security Boundary Gate
- **Canary Leaks Detected:** `0 (PASSED)`
- **Raw Screenshot Uploads Blocked:** `100% (ENFORCED)`
- **Fail-Closed Uninspectable Surface Coverage:** `100% (ENFORCED)`
- **Safe Interactive Controls Preserved:** `100% (19/19)`
