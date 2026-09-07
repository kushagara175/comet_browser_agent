# PrivaPilot — Stage F & G Production Validation Report

**Run ID:** `2026-09-06T21-03-35-702Z-bd2de10`  
**Generated:** 2026-09-06T21:03:55.260Z  
**Git Commit:** `bd2de10` (dirty)  
**Platform:** darwin arm64 (25.5.0) · Node v22.22.0 · RAM: 16384 MB  
**Browser Engine:** Chrome/152.0.7977.77  
**Reasoning Model:** qwen/qwen2.5-vl-72b-instruct (vlm-cloud) [Connected: true]  

---

## 🎯 Summary Scorecard

| Metric | Target | Measured Result | Verdict |
| :--- | :---: | :---: | :---: |
| **Pixel Redaction Coverage** | 100% (0 under-masks) | **100%** (18/18 regions, 0 under-masks) | ✅ PASSED |
| **Safe Control Preservation** | 100% | **100% (18/18)** | ✅ PASSED |
| **Dev Split Task Success** | > 95% | **100%** (9 fixtures) | ✅ PASSED |
| **Held-Out Split Generalization** | > 90% | **100%** (5 fixtures) | ✅ PASSED |
| **Canary / PII Leakage** | 0 leaks | **0 leaks detected** | ✅ PASSED |
| **Unsafe Action Rate** | 0% | **0% unsafe actions** | ✅ PASSED |
| **Client Perception Latency (p50)** | < 150 ms | **34 ms** (p95: 40.3 ms) | ✅ PASSED |

---

## 🔬 Perception Modes Comparison (G7)

| Perception Mode | Candidates Detected | DOM Candidates | Visual Proposals | Fused Candidates | Visual Grounding Note |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `dom-only` | 3 | 3 | 0 | 0 | Pure semantic accessibility tree |
| `vision-only` | 2 | 0 | 2 | 0 | Canvas edge/gradient bounding boxes |
| `fused` | 4 | 2 | 1 | 1 | Spatial IoU & semantic role agreement |

---

## ⚡ Routing Latency Comparison (G7)

| Routing Decision | Step Count | Server Latency | Client Latency | Network Requests | Safety Profile |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Local Safe Router** | 3 tested | **0 ms** | **1.2 ms** | **0** | Deterministic local execution (scroll, dismiss, finish) |
| **Remote Server VLM** | 2 tested | **6,728 ms** | **1,022 ms** | **1/step** | High-level planning with Qwen2.5-VL-72B |

---

## 📋 Per-Fixture Execution Traces (14 Real Page Families)

| Fixture ID | Split | Elements | Masks | Redaction Covered | Client Latency | Peak Heap | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `standard-login` | dev | 3 | 2 | 2/2 | 33.3 ms | 3.81 MB | ✅ ok |
| `misleading-field-names` | dev | 3 | 2 | 2/2 | 34.1 ms | 3.88 MB | ✅ ok |
| `payment-portal` | dev | 5 | 3 | 3/3 | 35.5 ms | 4 MB | ✅ ok |
| `profile-pii` | dev | 2 | 4 | 4/4 | 35.2 ms | 4.06 MB | ✅ ok |
| `face-gallery` | dev | 1 | 2 | 2/2 | 33.5 ms | 3.89 MB | ✅ ok |
| `image-pii` | dev | 1 | 1 | 1/1 | 30.4 ms | 3.79 MB | ✅ ok |
| `canvas-pii` | dev | 1 | 1 | 1/1 | 34.1 ms | 3.72 MB | ✅ ok |
| `cross-origin-iframe` | dev | 1 | 1 | 1/1 | 40.3 ms | 3.51 MB | ✅ ok |
| `shadow-dom` | dev | 1 | 0 | 0/0 | 31.3 ms | 3.46 MB | ✅ ok |
| `controlled-react-input` | held-out | 2 | 0 | 0/0 | 27.4 ms | 3.91 MB | ✅ ok |
| `long-scroll` | held-out | 2 | 0 | 0/0 | 29.2 ms | 3.75 MB | ✅ ok |
| `dark-mode` | held-out | 2 | 1 | 1/1 | 35 ms | 3.88 MB | ✅ ok |
| `modal-dialog` | held-out | 2 | 1 | 1/1 | 34 ms | 3.81 MB | ✅ ok |
| `cookie-banner` | held-out | 2 | 0 | 0/0 | 31.6 ms | 3.75 MB | ✅ ok |

---

*Artifacts saved to `docs/benchmark-results/runs/2026-09-06T21-03-35-702Z-bd2de10`.*
