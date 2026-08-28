# 08. 4-Week Sprint Roadmap & Checklists — SIH26171

## 📅 Timeline Overview (Aug 23 — Sep 20, 2026)

```
Week 1: Extension & WebGPU Scaffold ──▶ Week 2: Privacy & Redaction (40%) ──▶ Week 3: VLM & Generalization ──▶ Week 4: Benchmarks & Submission
```

---

## Week 1: Foundation & Extension Scaffold (Aug 23 – Aug 30)
- [ ] Initialize TypeScript repository with Manifest V3 extension boilerplate.
- [ ] Configure `ONNX Runtime Web` with WebGPU in an offscreen document.
- [ ] Implement active tab viewport capture via `chrome.tabs.captureVisibleTab`.
- [ ] Stand up basic FastAPI server gateway and mock response endpoint.
- [ ] **Milestone 1:** Extension captures screenshot and receives a mock action response.

---

## Week 2: Privacy & Redaction Pipeline — 40% Weight (Aug 31 – Sep 6)
- [ ] Implement DOM-based sensitive field detector (passwords, credit cards, emails).
- [ ] Integrate quantized BlazeFace ONNX model for WebGPU face detection.
- [ ] Build canvas obfuscator: Gaussian blur for faces + solid black rectangles for passwords.
- [ ] Implement text regex scrubber for PII tokens (phones, Aadhaar, SSN).
- [ ] Build Dual-Pane HUD view: Raw screen vs Redacted screen side-by-side.
- [ ] **Milestone 2:** Side-by-side proof of zero PII leakage demonstrated on test forms.

---

## Week 3: Server Reasoning, Execution & Generalization (Sep 7 – Sep 13)
- [ ] Connect sanitized payload to central VLM (Qwen2.5-VL / Claude 3.5 Sonnet).
- [ ] Build content script DOM action executor (`click`, `type`, `select`, `scroll`).
- [ ] Implement IndexedDB Action Memory Cache for fast-path subtask replay.
- [ ] Implement closed-loop state verifier (pHash visual diffing).
- [ ] **Multi-Site Generalization Check:** Test full end-to-end workflow on 4 arbitrary, unseen websites (e-commerce, government registration, news portal, finance dashboard).
- [ ] **Milestone 3:** Autonomous end-to-end task execution working seamlessly across multiple sites.

---

## Week 4: Benchmarking, Polish & Submission (Sep 14 – Sep 20)
- [ ] Benchmark and record all 5 official SIH evaluation metrics:
  - Visual Context Accuracy (%)
  - PII Detection Recall & Precision (%)
  - Redaction Precision (%)
  - Client-Side Resource Utilization (WebGPU RAM / CPU %)
  - End-to-End Task Latency (ms)
- [ ] Polish Mission Control HUD side-panel and privacy audit log exporter.
- [ ] Record a high-definition backup demo video for the Grand Finale.
- [ ] Write and submit official Idea PDF before **20 September 2026**.
- [ ] **Milestone 4:** Full project submission completed.
