# PrivaPilot — Benchmark Evaluation Report
**Problem Statement:** ISRO | Software | SIH26171  
**Product:** PrivaPilot Privacy-Preserving Browser Agent  
**Generated:** 2026-08-28T14:05:49.939Z  
**Fixtures Evaluated:** 14 Synthetic Web Scenarios  

---

## 📊 Summary Scorecard vs. Official SIH Criteria

| Evaluation Metric | Weight | Measured Result | Benchmark Target | Verdict |
| :--- | :---: | :---: | :---: | :---: |
| **Visual Context Accuracy** | **25%** | **100% Recall / 100% Precision** | > 95% | ✅ PASSED |
| **PII & Sensitive Data Recall** | **20%** | **100% Recall (100% Precision)** | > 98% | ✅ PASSED |
| **Redaction Precision** | **20%** | **100% Coverage (0 Under-Masks)** | 100% Coverage | ✅ PASSED |
| **Client Resource Utilization** | **20%** | **~62.4 MB Memory / 5.8% CPU** | < 350 MB / < 15% | ✅ PASSED |
| **End-to-End Task Latency** | **15%** | **531 ms (p50) / 565 ms (p95)** | < 1200 ms | ✅ PASSED |

---

## 🔍 Detailed PII Category Breakdown (20% Weight)

| Category | True Positives | False Positives | False Negatives | Recall | Precision |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `password` | 3 | 0 | 0 | 100% | 100% |
| `email` | 2 | 0 | 0 | 100% | 100% |
| `phone` | 1 | 0 | 0 | 100% | 100% |
| `credit_card` | 1 | 0 | 0 | 100% | 100% |
| `cvv` | 0 | 0 | 0 | 100% | 100% |
| `national_id` | 3 | 0 | 0 | 100% | 100% |
| `face` | 1 | 0 | 0 | 100% | 100% |
| `high_risk_surface` | 3 | 0 | 0 | 100% | 100% |

---

## ⏱️ Step Latency Profile ($t_0 dots t_7$)

- **Client In-Browser Perception ($t_0 dots t_3$):** 161 ms
- **Server Centralized Reasoning ($t_3 dots t_4$):** 362 ms
- **Client DOM Action & Verification ($t_5 dots t_7$):** 45 ms
- **Total Step Round-Trip (p50):** 531 ms
- **Total Step Round-Trip (p95):** 565 ms

---

## 🔒 Privacy & Security Boundary Gate
- **Canary Leaks Detected:** `0 (PASSED)`
- **Raw Screenshot Uploads Blocked:** `100% (ENFORCED)`
- **Fail-Closed Uninspectable Surface Coverage:** `100% (ENFORCED)`
