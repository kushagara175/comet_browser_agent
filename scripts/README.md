# 🛠️ PrivaPilot Scripts & Automation Suite

Automation, benchmark runners, and production validation harnesses for PrivaPilot.

---

## 📋 Directory Overview

| Category | Script | Description |
| :--- | :--- | :--- |
| **Build & Typecheck** | `scripts/build.js` | Monorepo compiler & bundler (esbuild + tsc) |
| | `scripts/typecheck.js` | Fast monorepo-wide TypeScript type checker |
| | `scripts/check-repo-integrity.mjs` | Truth & integrity guard (freshness, no fake hashes, link check) |
| **Benchmarks & Evaluation** | `scripts/run-benchmarks.js` | Evaluates the 5 official ISRO performance pillars |
| | `scripts/run-browser-benchmark.mjs` | Real Chrome CDP benchmark against ground-truth fixtures |
| | `scripts/run-production-validation.mjs` | Multi-split real-world held-out validation suite |
| | `scripts/verify-redaction.mjs` | Pixel-true verification of redaction masks on canvas |
| | `scripts/compare-models.mjs` | Multi-model latency & token efficiency comparator |
| **End-to-End Testing** | `scripts/run-e2e-extension.mjs` | Live Chrome MV3 extension runner with server gateway |
| | `scripts/run-e2e-matrix.mjs` | Comprehensive matrix test across browser versions & targets |
| **Model & Gateway Testing** | `scripts/test-local-llm.js` | Diagnostic probe for Ollama / LM Studio / OpenRouter |
| | `scripts/test-proxy.js` | Canary leak prevention tester |
| | `scripts/test-external-agent.mjs` | External agent compatibility verification |
| **Harness Library** | `scripts/lib/` | CDP client, Chrome launcher, and harness runner primitives |
