<div align="center">

# 🛡️ PrivaPilot

### On-Device Visual Perception for Light-Weight Browser Agents

**A browser agent that can see your screen — and proves it never sends your secrets anywhere.**

[![Problem Statement](https://img.shields.io/badge/SIH-26171-0b5fff?style=flat-square)](docs/00_PROBLEM_STATEMENT.md)
[![Organisation](https://img.shields.io/badge/ISRO-Department%20of%20Space-ff6b35?style=flat-square)](docs/00_PROBLEM_STATEMENT.md)
[![Theme](https://img.shields.io/badge/theme-Smart%20Automation-6f42c1?style=flat-square)](docs/00_PROBLEM_STATEMENT.md)
[![Manifest](https://img.shields.io/badge/Chrome-Manifest%20V3-4285f4?style=flat-square&logo=googlechrome&logoColor=white)](apps/extension/manifest.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.base.json)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[Problem Statement](docs/00_PROBLEM_STATEMENT.md) · [Execution Plan](docs/EXECUTION_PLAN.md) · [Agent Rules](docs/AGENT_RULES.md) · [Full Docs](docs/INDEX.md)

</div>

---

## The problem

AI browser agents are useful precisely because they can see your screen. That is also why you cannot
use them. Sending a screenshot to a cloud model means sending whatever happened to be on screen —
a password field, an Aadhaar number, a colleague's face, a customer's card details.

Running the whole model locally solves privacy but not capability: a laptop cannot host the reasoning
model an agent needs.

## The approach

**Split the work at the privacy boundary.** Perception and redaction run *on the client*, where the
sensitive data already is. Only sanitized, unidentifiable context crosses the network to a server
model, which reasons about it and returns a single UI action to execute.

The client never asks the server what is safe to hide. It decides locally, masks locally, verifies
locally — and refuses to transmit if it cannot be sure.

```
        CLIENT  (browser extension)                        SERVER
  ┌──────────────────────────────────────┐        ┌──────────────────────┐
  │                                      │        │                      │
  │   1  capture viewport + DOM          │        │   open-weights VLM   │
  │             │                        │        │                      │
  │             ▼                        │        │   reasons over the   │
  │   2  detect ── local vision model    │        │   redacted view only │
  │             ── DOM semantics         │        │          │           │
  │             ── text PII regex        │        │          ▼           │
  │             ── risky surfaces        │        │   ONE action, by     │
  │             │                        │        │   local element ID   │
  │             ▼                        │        │                      │
  │   3  redact ── mask / blur pixels    │        │                      │
  │             │                        │        │                      │
  │             ▼                        │        │                      │
  │   4  verify ──▶ uncertain? ─▶ BLOCK  │        │                      │
  │             │                        │        │                      │
  │             └── SanitizedContext ────┼───────▶│                      │
  │                                      │        │                      │
  │   6  execute ◀── 5 validate ◀────────┼────────┘                      │
  │      (confirm if protected)          │                               │
  └──────────────────────────────────────┘        └──────────────────────┘

           ▲ raw pixels never cross this line ▲
```

Step 4 is the part that matters. A pipeline that *usually* redacts is not a privacy product — so the
sanitizer verifies its own output and **fails closed**, transmitting nothing when coverage is
uncertain.

---

## What never leaves the browser

| Never transmitted | Redacted by default | Server may receive |
| :--- | :--- | :--- |
| Passwords, OTPs, PINs | Emails, phone numbers | Local element IDs (`el_4`) |
| Tokens, API keys, cookies | Names, addresses | Roles and sanitized labels |
| Card numbers, CVVs | Faces and profile photos | Normalized bounds |
| Bank accounts | Employee IDs, dates of birth | Enabled / visible state |
| Aadhaar, PAN, government IDs | Sensitive free text | Action capabilities |
| Medical identifiers | Uninspectable surfaces | The redacted screenshot |

The server is told *that* redaction happened and what category each mask covers — never the value.
Audit records store bounding boxes and categories, **never the data or a hash of it** (a hash of a
phone number is trivially reversible).

---

## Project status

Honest state, updated as work lands. **No performance number appears in this repository until
`npm run benchmark` has measured it against ground truth.**

| Component | State |
| :--- | :--- |
| Monorepo build & test suite | ✅ Clean build, 149/149 unit & integration tests passing |
| Protocol & type-enforced privacy boundary | ✅ `packages/protocol/` |
| Deterministic PII detectors (DOM + regex + Luhn + Verhoeff) | ✅ `packages/pii-rules/` |
| Server gateway, closed schema, canary scanner | ✅ `apps/server/` |
| Action risk policy & confirmation gate | ✅ `packages/protocol/src/action.ts` |
| Pixel redaction running inside extension | ✅ Offscreen document canvas host (`apps/extension/src/offscreen/`) |
| On-device vision face model | ✅ UltraFace ONNX (Wasm/CPU with WebGPU fallback) (`packages/pii-rules/src/face-onnx.ts`) |
| Benchmark against authored ground truth | ✅ Non-circular benchmark with dev & held-out splits (`packages/benchmark/`) |
| Bounded multi-step agent loop | ✅ Bounded agent loop with stale recovery and protected pause (`apps/extension/src/background/coordinator.ts`) |
| Browser compatibility | ✅ Chrome Manifest V3 active; Firefox MV3 architecture ready |

Detailed benchmark metrics and test outcomes are tracked in **[`docs/benchmark-results/`](docs/benchmark-results/EVALUATION_REPORT.md)**.

---

## How this is judged

The official rubric, from **[docs/00_PROBLEM_STATEMENT.md](docs/00_PROBLEM_STATEMENT.md)**:

| Metric | Weight | Where it is decided |
| :--- | :-: | :--- |
| Accuracy of visual context from screen | **25%** | element extractor + vision model |
| Recall & precision of sensitive/PII detection | **20%** | fused detectors |
| Precision of redaction | **20%** | mask geometry — tight boxes, not whole containers |
| Client-side resource utilization | **20%** | a small quantized model, not an in-browser VLM |
| End-to-end task latency | **15%** | server round-trip dominates |

> ### ⚠️ The evaluation pages are revealed only at the finale
>
> The problem statement says: *"Use cases for evaluation will be provided during finale."*
>
> **Generalization to unseen pages is a hard requirement, not a stretch goal.** No site-specific
> selectors, no hardcoded IDs, no per-domain branches exist anywhere in the pipeline. Detection is
> semantic — `input[type=password]`, `autocomplete` tokens, ARIA roles, regex, and the vision model.
> The demo portal is a development fixture, never the target.

---

## Quick start

```bash
git clone https://github.com/kushagara175/SIH.git
cd SIH
npm install
npm run build     # builds all 6 workspace packages in dependency order
npm test          # unit + adversarial suites
```

Run the two local services:

```bash
npm run dev:server   # reasoning gateway  -> http://localhost:4501
npm run dev:portal   # synthetic portal   -> http://localhost:4500
```

Load the extension in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**
2. **Load unpacked** and select `apps/extension/`
3. Open the demo portal, then launch the side panel

### Connecting a model

The gateway reads its model configuration from the environment, or from a `.env` file in the repo
root (`npm run dev:server` loads it automatically). Copy `.env.example` to `.env` and edit it —
that avoids the usual shell-syntax trap, since `export FOO=bar` is not valid in PowerShell.

```bash
cp .env.example .env      # then uncomment what you need
```

**Current configuration: Qwen2.5-VL-72B, cloud-hosted via OpenRouter.**

```ini
VLM_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
VLM_API_KEY=sk-or-v1-...          # your key; .env is gitignored, never commit it
VLM_MODEL=qwen/qwen2.5-vl-72b-instruct
```

Qwen2.5-VL is Apache-2.0 open weights and runs offline via `ollama pull qwen2.5vl`, so the hosted
endpoint is a deployment choice rather than a dependency — which is what the problem statement
allows: *"any offline deployable (open-source/open-weights) model … During SIH they can use cloud
hosted version of these."* Measured 592 ms median for an action proposal; see
[AUDIT_LOCAL_VS_DEFERRED.md](docs/AUDIT_LOCAL_VS_DEFERRED.md) §3.5 for the full latency table.

Or set the variables directly:

```bash
# macOS / Linux
export VLM_ENDPOINT="https://<provider>/v1/chat/completions"
export VLM_API_KEY="..."
export VLM_MODEL="qwen2.5-vl"
```

```powershell
# Windows PowerShell
$env:VLM_ENDPOINT="https://<provider>/v1/chat/completions"
$env:VLM_API_KEY="..."
$env:VLM_MODEL="qwen2.5-vl"
```

With nothing set, `VlmReasoningEngine` auto-probes Ollama (`:11434`) and LM Studio (`:1234`) on both
`127.0.0.1` and `localhost`, then falls back to a deterministic mock engine — **so the entire system
is developable with no model at all.** Per the problem statement, a cloud-hosted open-weights model
is permitted during SIH.

### When the extension says it cannot reach the model

The two failures look identical in the side panel, so check which one it is first:

```bash
curl http://localhost:4501/api/v1/model-status   # gateway + model diagnosis
npm run test:llm                                 # full local backend probe
```

| `model-status` says | Meaning | Fix |
| :--- | :--- | :--- |
| connection refused | The gateway is not running | `npm run dev:server` |
| `"modelConnected": false`, provider `mock` | Gateway is up, no model behind it | Start Ollama (`ollama serve`) and `ollama pull qwen2.5vl`, or set `VLM_ENDPOINT` |
| `lastError` mentions a model not found | `VLM_MODEL` names a tag that is not pulled | `ollama pull <that model>`, or unset `VLM_MODEL` to auto-select |
| `"isMultimodal": false` | Only a text model is installed | `ollama pull qwen2.5vl` — screenshots are otherwise not sent |

The side panel also logs a `MODEL` line to the **Audit** tab on open, and marks any reply that did
not come from a real model. After changing extension code, rebuild (`npm run build`) and press
**Reload** on the extension in `chrome://extensions` — the service worker caches the old bundle.

**Requirements:** Node.js 20+ and a recent Chrome. No discrete GPU. WebGPU is an accelerator;
WebAssembly is the correctness path, so the client stays correct without it.

---

## Repository layout

```
apps/
  extension/          MV3 extension - capture, detect, redact, verify, execute
    src/sanitizer/      the privacy boundary: detectors, masking, verification
    src/content/        DOM extraction and action execution
    src/background/     run coordinator and telemetry
    src/sidepanel/      Mission Control HUD - raw vs redacted, side by side
  server/             stateless reasoning gateway; closed schema + canary scanner
  demo-portal/        synthetic portal seeded with PII, for development and demo

packages/
  protocol/           shared contracts; branded types enforce the privacy boundary
  pii-rules/          DOM semantic analysis + regex detectors, Luhn-validated
  benchmark/          harness for the five official metrics
  test-fixtures/      14 synthetic pages + ground-truth annotations

scripts/              build, benchmarks, CDP-driven end-to-end runs
tests/                unit and adversarial suites
docs/                 all documentation - start at docs/INDEX.md
```

---

## Design decisions worth knowing

**The privacy boundary is enforced by the type system.** `RawCapture` and `SanitizedContext` carry
branded fields, so handing raw capture data to the network client is a *compile error*, not something
code review has to catch.

```ts
interface RawCapture       { readonly _brand: 'RawCapture_InternalOnly';   /* ... */ }
interface SanitizedContext { readonly _brand: 'SanitizedContext_Verified'; /* ... */ }
```

**Coordinate spaces are separate types.** Redaction bugs are usually coordinate bugs — a mask drawn
in CSS pixels onto a device-pixel buffer misses its target on any HiDPI screen. `ScreenshotPixelBox`,
`ViewportCssPixelBox`, and `DocumentCssPixelBox` cannot be mixed by accident.

**The server never gets a selector.** Actions are addressed by ephemeral local IDs (`el_btn_1`). A response
containing a CSS selector, XPath, JavaScript, or URL is rejected before it reaches the executor — so
a compromised or prompt-injected model cannot point the client at arbitrary targets. Coordinate-based
actions are treated as experimental fallbacks.

**Uninspectable means unsafe.** Cross-origin iframes, canvas, video, and PDF surfaces are masked
wholesale. Absence of readable DOM text is not evidence that a region is safe.

---

## Testing

```bash
npm test             # 149 unit, integration & adversarial tests
npm run test:canary  # asserts a planted secret never appears in any outbound payload
npm run benchmark    # the five official metrics against authored ground truth
npm run test:e2e     # real Chrome via CDP, measured latencies
```

The adversarial suite encodes attacks the system must survive:

| Case | Required behavior |
| :--- | :--- |
| Secret in a visible text node | masked; never transmitted |
| Server commands typing into a password field | hard blocked |
| Server triggers submit or payment | user confirmation required |
| Canary secret anywhere in URL or body | request rejected at the proxy |
| Payload carries an unknown property | closed-schema violation, rejected |
| Server returns a raw CSS selector | rejected |

---

## Documentation

All documentation lives in **[`docs/`](docs/INDEX.md)** in an explicit hierarchy — when two documents
disagree, the higher one wins.

| Document | Read it when |
| :--- | :--- |
| **[00_PROBLEM_STATEMENT.md](docs/00_PROBLEM_STATEMENT.md)** | Ever unsure about scope. Authoritative; overrides everything |
| **[EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)** | Deciding what to build next |
| **[AGENT_RULES.md](docs/AGENT_RULES.md)** | Before writing any code — binding, every session |
| **[SIH26171_WINNING_EXECUTION_PLAYBOOK.md](docs/SIH26171_WINNING_EXECUTION_PLAYBOOK.md)** | Designing a subsystem |
| [INDEX.md](docs/INDEX.md) | Looking for anything else |

---

## Contributing

Read **[docs/AGENT_RULES.md](docs/AGENT_RULES.md)** first — it is binding, not advisory. Before
opening a change, state its scope, the raw input it touches, the sanitized output it produces, what
is prohibited from logs and network, the test added, and the safe-failure behavior.

Non-negotiable:

- Never bypass `SanitizedContext`, and never add a direct HTTP path from a content script
- Never log raw screen, DOM, or payload values
- Never execute a server-supplied selector, or auto-execute a protected action
- Never let a failed sanitizer degrade into permissive behavior
- **Never state an unmeasured performance claim** — in code, UI, docs, commits, or the pitch

A missed target is reported as **FAILED**, not relabelled. A real number that misses is worth more
than an invented one that hits.

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<sub>Smart India Hackathon 2026 · Problem Statement SIH26171 · Indian Space Research Organisation</sub>
</div>
