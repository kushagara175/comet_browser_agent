# PrivaPilot — SIH26171

**Privacy-Preserving On-Device Visual Perception for Light-Weight Browser Agents**

Indian Space Research Organisation (ISRO) · Software · Smart Automation · Smart India Hackathon 2026

---

A browser extension where a **local vision model reads the screen**, sensitive and personal data is
**detected and redacted on the client**, and only sanitized context crosses the network to a server
VLM that returns a single UI action for the client to execute.

The privacy boundary is the product. Nothing identifiable leaves the browser.

```
┌─ CLIENT (browser extension) ────────────────┐        ┌─ SERVER ──────────────┐
│                                             │        │                       │
│  capture ─▶ local vision + DOM detectors    │        │  open-weights VLM     │
│               │                             │        │        │              │
│               ▼                             │        │        ▼              │
│           redact (mask / blur)              │        │   one action, by      │
│               │                             │        │   local element ID    │
│               ▼                             │        │                       │
│      post-redaction verify ─── FAIL ─▶ block│        │                       │
│               │                             │        │                       │
│               └── SanitizedContext ─────────┼───────▶│                       │
│                                             │        │                       │
│  execute action ◀───────────────────────────┼────────┘                       │
└─────────────────────────────────────────────┘        └───────────────────────┘
```

---

## Status

Honest state of the project. No metric appears here until it has been measured by
`npm run benchmark` against ground truth.

| Area | State |
| :--- | :--- |
| Monorepo build & test suite | ✅ Clean build, 16/16 tests passing |
| Protocol & type-level privacy boundary | ✅ Implemented (`packages/protocol/`) |
| Deterministic PII detectors (DOM + regex) | ✅ Implemented (`packages/pii-rules/`) |
| Server gateway, closed schema, canary scanner | ✅ Implemented (`apps/server/`) |
| **Pixel redaction actually running in-extension** | ⛔ Blocked — sanitizer runs in the MV3 service worker where canvas is unavailable |
| **On-device vision model** | ⛔ Not implemented |
| **Benchmark against real ground truth** | ⛔ Harness derives ground truth from detector output |
| Multi-step agent loop | ⛔ Single step only |

Fixing these is the subject of **[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)**, in that order.

---

## Evaluation rubric

The official scoring, from **[docs/00_PROBLEM_STATEMENT.md](docs/00_PROBLEM_STATEMENT.md)**:

| Metric | Weight |
| :--- | :-: |
| Accuracy of visual context from screen | 25% |
| Recall and precision for detection of sensitive/PII data | 20% |
| Precision of redaction | 20% |
| Client-side resource utilization | 20% |
| Overall end-to-end latency of the provided task | 15% |

> **The evaluation use cases are revealed only at the finale.** Generalization to unseen pages is a
> hard requirement, not a stretch goal. No site-specific selectors anywhere in the pipeline.

---

## Quick start

```bash
npm install
npm run build          # builds all 6 workspace packages in dependency order
npm test               # unit + adversarial test suite
npm run dev:server     # reasoning gateway on :4501 (falls back to mock with no VLM configured)
npm run dev:portal     # synthetic demo portal on :4500
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/`.

To point the server at a real model, set `VLM_ENDPOINT`, `VLM_API_KEY`, and `VLM_MODEL`. With none
set, `VlmReasoningEngine` auto-probes Ollama and LM Studio, then falls back to a deterministic mock —
so the whole system is developable with no model at all.

Requirements: Node.js 20+, a recent Chrome. No discrete GPU needed; WebGPU is an accelerator and
WebAssembly is the correctness path.

---

## Documentation

Start at **[docs/INDEX.md](docs/INDEX.md)**. The four documents that matter most:

| Document | Read it when |
| :--- | :--- |
| **[docs/00_PROBLEM_STATEMENT.md](docs/00_PROBLEM_STATEMENT.md)** | Ever in doubt about scope — this is authoritative and overrides everything else |
| **[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)** | Deciding what to work on next |
| **[docs/AGENT_RULES.md](docs/AGENT_RULES.md)** | Before writing any code — binding rules, every session |
| **[docs/SIH26171_WINNING_EXECUTION_PLAYBOOK.md](docs/SIH26171_WINNING_EXECUTION_PLAYBOOK.md)** | Designing a subsystem — the design source of truth |

---

## Repository layout

```
apps/
  extension/      MV3 browser extension — capture, detect, redact, execute
  server/         stateless reasoning gateway; closed schema + canary scanner
  demo-portal/    synthetic portal with seeded PII, for development and demo
packages/
  protocol/       shared contracts; branded types enforce the privacy boundary
  pii-rules/      DOM semantic analysis + regex detectors (Luhn-validated)
  benchmark/      metric harness for the five official criteria
  test-fixtures/  14 synthetic pages + ground-truth annotations
scripts/          build, benchmarks, CDP-driven end-to-end runs
tests/            unit and adversarial suites
docs/             all project documentation (see docs/INDEX.md)
```

---

## Non-negotiables

Full detail in **[docs/AGENT_RULES.md](docs/AGENT_RULES.md)**.

- The flow is `RawCapture → DetectionReport → SanitizedContext → NetworkPayload`. The HTTP client
  accepts `SanitizedContext` only, enforced at compile time by branded types.
- **Fail closed.** If redaction coverage is uncertain, no screenshot is transmitted. A failing
  sanitizer must never degrade into permissive behavior.
- The server addresses elements by **local ID only**. Any response containing a CSS selector,
  XPath, JavaScript, or URL is rejected.
- Protected actions (submit, pay, delete, send…) require explicit user confirmation. Password, OTP,
  and CAPTCHA entry are hard-blocked.
- **No unmeasured performance claim** goes in the code, the UI, the docs, or the pitch.

---

## License

MIT — see [LICENSE](LICENSE).
