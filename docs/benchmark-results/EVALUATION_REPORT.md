# PrivaPilot — Benchmark Evaluation Report
**Problem Statement:** ISRO | Software | SIH26171  
**Product:** PrivaPilot Privacy-Preserving Browser Agent  
**Generated:** 2026-08-31T19:58:16.877Z  
**Split Evaluated:** all (14 Synthetic Web Scenarios)  
**Git SHA:** `1548d4a`  
**Environment:** darwin arm64 (Node v22.22.0)  
**Browser Engine:** Google Chrome / Chromium Headless (CDP Engine)  
**Vision/PII Provider:** UltraFace ONNX (Wasm/CPU) + Local PII Regex/Luhn Engine  
**Command:** `/Users/kushagrasingh/dev/SIH_26209/scripts/run-benchmarks.js`  

---

## 📊 Summary Scorecard vs. Official SIH Criteria

| Evaluation Metric | Weight | Measured Result | Benchmark Target | Verdict |
| :--- | :---: | :---: | :---: | :---: |
| **Visual Context Accuracy** | **25%** | **82.1% Recall / 76.7% Precision** (Median IoU: 1) | > 95% | ❌ FAILED |
| **PII & Sensitive Data Recall** | **20%** | **72.2% Recall (81.3% Precision, F1: 76.5%)** | > 98% Recall / > 95% Precision | ❌ FAILED |
| **Redaction Precision** | **20%** | **88.9% Coverage (2 Under-Masks, Overhead: 1.06x)** | 100% Coverage (0 Under-Masks) | ❌ FAILED |
| **Client Resource Utilization** | **20%** | **~48.6 MB Memory / 130.8% CPU** | < 350 MB / < 15% | ❌ FAILED |
| **End-to-End Task Latency** | **15%** | **1549 ms (p50) / 1865 ms (p95)** | < 1200 ms (p50) | ❌ FAILED |

---

## 🔍 Detailed PII Category Breakdown (20% Weight)

| Category | True Positives | False Positives | False Negatives | Recall | Precision | F1 Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `password` | 1 | 2 | 2 | 33.3% | 33.3% | 33.3% |
| `email` | 2 | 0 | 0 | 100% | 100% | 100% |
| `phone` | 1 | 0 | 0 | 100% | 100% | 100% |
| `credit_card` | 1 | 1 | 0 | 100% | 50% | 66.7% |
| `cvv` | 1 | 0 | 0 | 100% | 100% | 100% |
| `national_id` | 2 | 0 | 3 | 40% | 100% | 57.1% |
| `face` | 2 | 0 | 0 | 100% | 100% | 100% |
| `high_risk_surface` | 3 | 0 | 0 | 100% | 100% | 100% |

---

## ⏱️ Step Latency Profile ($t_0 dots t_7$)

- **Client In-Browser Perception ($t_0 dots t_3$):** 1 ms (p50) / 4 ms (p95)
- **Server Centralized Reasoning ($t_3 dots t_4$):** 1548 ms (p50) / 1864 ms (p95)
- **Client DOM Action & Verification ($t_5 dots t_7$):** 0 ms (p50)
- **Total Step Round-Trip (p50):** 1549 ms
- **Total Step Round-Trip (p95):** 1865 ms

---

## 🔒 Privacy & Security Boundary Gate
- **Canary Leaks Detected:** `0 (PASSED)`
- **Raw Screenshot Uploads Blocked:** `100% (ENFORCED)`
- **Fail-Closed Uninspectable Surface Coverage:** `100% (ENFORCED)`
- **Safe Interactive Controls Preserved:** `100% (19/19)`
