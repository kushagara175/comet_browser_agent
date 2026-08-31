# 07. Team Workflow & Machine Roles — SIH26171

## 1. Hardware Feasibility

Unlike heavy all-local architectures that demand large GPU VRAM, this hybrid architecture is
lightweight: the reasoning model lives on the server, and the in-browser model is a 1–2 MB quantized
detector. Any modern laptop can run the full client side and all development.

**Baseline requirement for every development machine**

| Requirement | Why |
| :--- | :--- |
| Node.js 20+ and npm | Monorepo build, tests, server, demo portal |
| A recent Chrome or Chromium | Extension host; WebGPU accelerates the local detector |
| ~8 GB RAM | Chrome + extension + local dev server concurrently |
| ~5 GB free disk | ONNX weights and `node_modules` |
| Up-to-date GPU driver | Stale drivers are the usual cause of WebGPU silently falling back |

**Not required:** a discrete GPU, or any local hosting of the server-side reasoning model.

WebGPU is an accelerator, not a dependency. WebAssembly is the correctness path, so a machine without
usable WebGPU can still develop and run every part of the client. Whichever provider actually engages
must be reported truthfully in the side panel — never claim WebGPU without verifying it at
`chrome://gpu`.

---

## 2. Role Split

Roles are assigned by **workstream**, not by a specific machine, so any team member can pick up any
lane and no single laptop is a critical dependency.

| Workstream | Scope | Deliverables |
| :--- | :--- | :--- |
| **A — In-browser perception & privacy** | Extension client core | • MV3 background worker and offscreen document.<br>• `ONNX Runtime Web` with WebGPU → WASM provider fallback.<br>• Quantized face detection and the blur/mask canvas pipeline.<br>• Mission Control side-panel (raw vs redacted split view). |
| **B — Server API & DOM engine** | Reasoning gateway and deterministic detectors | • Reasoning server gateway and prompt templates.<br>• DOM sensitive-field analyzer and regex scrubber.<br>• Content-script action executor (`click`, `type`, `select`, `scroll`).<br>• Action cache and the generalization test suite. |
| **C — Evidence** | Benchmarks and adversarial tests | • Ground-truth corpus and the benchmark harness.<br>• Resource and latency measurement.<br>• Playbook §8.3 adversarial test suite. |
| **Cloud endpoint** | Central reasoning model | • Hosted open-weights VLM (Qwen2.5-VL via Groq / Together / OpenRouter).<br>• Permitted by the official SIH rules, which allow a cloud-hosted version of an offline-deployable open-weights model during SIH. |

---

## 3. Collaboration & Mock-Server Workflow

To keep workstreams unblocked:

1. **Mock server first.** Workstream B develops against the deterministic mock engine at
   `POST /api/v1/reason`, validating client execution without any cloud API call.
   `apps/server/src/engines/vlm-engine.ts` falls back to it automatically when no endpoint is configured.
2. **Standardized JSON contract.** Every workstream adheres to the `SanitizedNetworkPayload` and
   `ActionProposal` schemas in `packages/protocol/`. The protocol package is the contract — change it
   deliberately, never incidentally.
3. **Local testing.** Any machine can load the extension in Chrome (`chrome://extensions`) and,
   once the Firefox port lands, in Firefox (`about:debugging`).
4. **Demo machine.** Nominate the demo laptop in the final week and rehearse on that exact machine.
   Confirm its WebGPU status and record a backup video from it.
