# 🧪 PrivaPilot Agent Evaluation Harness & Testbed

This directory houses the comprehensive agent evaluation harness, integration testbeds, and adversarial suites for PrivaPilot (SIH26171 | ISRO).

---

## 📁 Architectural Subfolder Layout

```
agent-harness/
├── agent-core/           # Coordinator, multi-step agent loop, thinking monologue, action executor
├── browser-mgmt/         # Browser adapter, DOM interaction, HUD sidepanel, voice, Tavily fallback
├── models-perception/    # UltraFace ONNX INT8 model, face blur, visual perception, focused area crop
├── privacy-sanitizer/    # 3-tier PII rules, Verhoeff/Luhn checksums, canvas offscreen sanitizer
├── server-gateway/       # Closed-schema gateway validator, canary scanner, VLM engine auth
└── benchmarks-eval/      # Official ISRO evaluation metrics, semantic action cache, repo integrity
```

---

## 🏃 Running the Testbed

Run the entire evaluation suite:
```bash
npm test
```

Run specific test subsystems:
```bash
# Agent Core Loop & Thinking Monologue
node --test agent-harness/agent-core/*.test.js

# Browser Management & DOM Control
node --test agent-harness/browser-mgmt/*.test.js

# On-Device Vision & Perception Models
node --test agent-harness/models-perception/*.test.js

# On-Device Privacy Sanitizer & PII Redaction
node --test agent-harness/privacy-sanitizer/*.test.js

# Stateless Reasoning Gateway & Canary Scanner
node --test agent-harness/server-gateway/*.test.js

# Evaluation Benchmarks & Truth Verification
node --test agent-harness/benchmarks-eval/*.test.js
```
