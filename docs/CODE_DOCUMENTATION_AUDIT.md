# PrivaPilot — Code-to-Documentation Truth Audit Report

> **Audit Date:** September 15, 2026  
> **Auditor Role:** Senior Software Architect, Technical Documentation Engineer, and Presentation Information Designer  
> **Primary Directive:** The current executable code is the sole source of truth.

---

## 1. Executive Summary

A comprehensive, code-first architectural audit was conducted across the PrivaPilot repository. Every claim regarding runtime architecture, model backends, network boundaries, test counts, hardware splits, and security guarantees was audited against the live TypeScript/JavaScript implementation.

Discrepancies identified included:
1. **Server Framework Misattribution:** Existing diagrams and reference documents claimed the reasoning gateway ran on **Express**. The executable code in `apps/server/src/index.ts` strictly uses standard Node.js **`node:http`** with zero external web framework dependencies.
2. **Experimental vs. Production Perception:** Source files for `visual-candidate-generator.ts` and `perception-fuser.ts` were previously documented as core runtime components. Inspection proved they are only invoked in benchmark evaluations and unit tests (`tests/stage-e-perception.test.js`); the active production loop relies on `ElementExtractor` and `UltraFaceModelRunner`.
3. **Stale Test Metrics:** Outdated documents cited "140+" or "198/198" tests. The active automated test suite now comprises **339 passing unit and integration tests** across 40 test suites.
4. **Personal Vault Encryption at Rest:** Comments and documents described the vault as "encrypted at rest" or "zero-knowledge encrypted." The code in `vault-store.ts` stores plain JSON directly in `chrome.storage.local` without WebCrypto encryption. The privacy protection is **local sandbox isolation**, not cryptographic encryption at rest.
5. **Firefox Browser Compatibility:** Documents claimed Firefox was "ready." In reality, only Chrome Manifest V3 is implemented and verified; Firefox remains an unverified, planned requirement.

---

## 2. File-by-File Audit & Correction Matrix

| File Audited | Previous Issue / Stale Claim | Concrete Evidence from Code | Changes Made / Recommended | Confidence | Remaining Uncertainty |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`apps/server/src/index.ts`** | Documented as Express in `docs/` and `diagrams/` | Line 11: `import http from 'node:http';` Zero express packages in `package.json`. | Updated architecture docs and diagrams to state native Node.js `node:http`. | 100% | None |
| **`apps/extension/src/vault/vault-store.ts`** | Stored data claimed as "encrypted" in code comments and docs | Line 107, 136: `chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault })` without cipher transformation. | Qualified vault as "domain-scoped local JSON storage; encryption at rest is planned." | 100% | None |
| **`apps/extension/src/vision/perception-fuser.ts`** | Listed as core perception pipeline component | Only imported in `tests/stage-e-perception.test.js` and `scripts/run-production-validation.mjs`. Not imported in `coordinator.ts` or `pipeline.ts`. | Classified as "Experimental / Benchmark Evaluation Only" in master architecture. | 100% | None |
| **`apps/extension/src/vision/visual-candidate-generator.ts`** | Claimed as active in production candidate generator | Only imported in `tests/stage-e-perception.test.js` and `scripts/run-production-validation.mjs`. Not wired to coordinator. | Classified as "Experimental / Edge-Proposal Research" in master architecture. | 100% | None |
| **`apps/extension/src/background/audit-logger.ts`** | Claimed as persistent active audit trail in coordinator | Line 258 of `coordinator.ts`: assigned to `this.auditLogger` in constructor; no methods ever called. | Documented that live telemetry is broadcast dynamically via messages; persistent audit file writing is inactive. | 100% | None |
| **`README.md`** | Reported "198/198 tests passing"; unqualified visual proposer & Firefox readiness claims | `npm test` executes 339 tests across 40 suites. No Firefox manifest exists in repo. | Updated test count to 339, qualified perception modules, and clarified Firefox status. | 100% | None |
| **`docs/02_SYSTEM_ARCHITECTURE.md`** | Mentioned "Centralized Reasoning Server (Node / Express)" and "Firefox Ready" | Server is `node:http`. Manifest is Chrome MV3 only. | Removed Express references; updated architecture diagram to `node:http`; corrected Firefox status. | 100% | None |
| **`docs/03_VLM_INFERENCE_PIPELINE.md`** | Claimed Gaussian blur on canvas; listed Claude/Sonnet as direct providers | `mask-renderer.ts` uses solid `#0f172a` overlay rectangles with category borders; `vlm-engine.ts` uses OpenAI-compatible wire. | Aligned mask rendering documentation with `#0f172a` overlays; clarified OpenAI-compatible provider adapter. | 100% | None |
| **`docs/04_BROWSER_AUTOMATION_CANVAS.md`** | Claimed "Firefox Manifest V3 architecture ready" | `manifest.json` is Chrome-specific (`side_panel`, `offscreen`). No Firefox manifest. | Marked Firefox as planned future enhancement; documented Chrome MV3 as sole verified target. | 100% | None |
| **`docs/05_ACTION_CACHE_SELF_HEALING.md`** | Described persistent action cache and audit trail | `coordinator.ts` performs live re-perception and ephemeral token regeneration per cycle. | Emphasized fresh ephemeral IDs and live re-perception; qualified audit trail status. | 100% | None |
| **`docs/06_FRONTEND_MISSION_CONTROL.md`** | Described legacy dual-pane layout | `sidepanel.html` implements Gemini-style dark UI with Chat, Inspector, Wire Payload, Telemetry, and Vault tabs. | Updated documentation to reflect modern Gemini-style HUD and available tabs. | 100% | None |
| **`DIAGRAMS.md` & `diagrams/README.md`** | Labelled Zone 3 as `(Node / Express)` | Native `node:http` implementation in `apps/server/src/index.ts`. | Corrected to `Node.js HTTP Reasoning Gateway (:4501)` and linked master architecture. | 100% | None |
| **`diagrams/01_4zone_system_architecture.md`** | Labelled Zone 3 as `(Node / Express)` | `node:http` implementation. | Updated Zone 3 label to `Node.js HTTP Reasoning Gateway`. | 100% | None |
| **`diagrams/02_algorithmic_execution_dag.md`** | Contained differential cache hit fast-path node as active production | Production coordinator executes multi-step perception per cycle; differential action cache was an exploratory prototype. | Clarified fast-path as local safe action contract resolution (`tryResolveLocalSafeAction`). | 100% | None |
| **`diagrams/04_compact_1page_ppt_master.md`** | Node 3 referred to Express | `node:http` implementation. | Updated to `Node.js HTTP Gateway`. | 100% | None |

---

## 3. Features Added to Documentation

1. **Dual Chat Modes:** Formally documented **General Chat** (bypasses page context entirely; 512KB payload limit; no screenshot) vs. **Page-Aware Chat** (scrubs sensitive DOM elements into anonymized text; zero screenshot transmission).
2. **Model Status Diagnosis Endpoint:** Documented `GET /api/v1/model-status` which allows the Chrome extension to distinguish between "Gateway Offline" and "Gateway Online with Mock Reasoner".
3. **Local Safe Action Resolution:** Documented `tryResolveLocalSafeAction()` in the coordinator, which allows local safe commands (e.g. scroll down, back navigation) to execute deterministically in 1 step without invoking server inference.
4. **Restricted Surface Firewall:** Documented the security policy that halts requests immediately on `chrome://`, `chrome-extension://`, `file://`, and `devtools://` surfaces (`blocked-local-only`).
5. **Real Test Count Baseline:** Documented the verified baseline of **339 automated unit tests** across 40 test suites.
6. **Ground-Truth Browser Benchmark Evidence:** Documented the exact measured metrics from real Chrome CDP execution: 100% pixel redaction coverage (18/18 regions), 0 under-masks, 31ms p50 latency, 4.17MB peak heap.

---

## 4. Claims Removed or Qualified

1. **Removed:** All claims that the reasoning server is built on **Express**. (Replaced with native Node.js `node:http`).
2. **Qualified:** Claims of **"encrypted at rest" Personal Vault**. (Clarified that the vault is strictly isolated within `chrome.storage.local`, but stored as plaintext JSON; cryptographic encryption at rest is planned).
3. **Qualified:** Claims that **Visual Candidate Generator** and **Perception Fuser** are active in the browser loop. (Clarified that they are currently experimental research modules evaluated in benchmarks).
4. **Qualified:** Claims of **Firefox readiness**. (Clarified that while the browser adapter has a structural branch, no Firefox manifest or test harness is currently implemented).
5. **Qualified:** Claims of **persistent audit logging**. (Clarified that telemetry is streamed live to the sidepanel HUD via messages, but file-based audit persistence is not actively invoked by the coordinator).

---

## 5. Duplicate Documents Consolidated

- **`DIAGRAMS.md` and `diagrams/README.md`:** Confirmed to be identical byte-for-byte duplicates. Canonicalized both to point to the new single source of truth: [`diagrams/06_CODE_ALIGNED_MASTER_ARCHITECTURE.md`](../diagrams/06_CODE_ALIGNED_MASTER_ARCHITECTURE.md).
- **Architecture Overview:** Slices `01` through `05` in `diagrams/` are now positioned as modular slide components supporting the unified master architecture in `06_CODE_ALIGNED_MASTER_ARCHITECTURE.md`.

---

## 6. Experimental & Inactive Components Identified

1. **`apps/extension/src/vision/visual-candidate-generator.ts`:**
   - *Implementation:* Edge detection and connected-component bounding box generator.
   - *Status:* Inactive in production coordinator; used only in `tests/stage-e-perception.test.js`.
2. **`apps/extension/src/vision/perception-fuser.ts`:**
   - *Implementation:* Bounding box IoU fusion matching DOM elements with visual candidates.
   - *Status:* Inactive in production coordinator; used only in benchmark comparison scripts.
3. **`apps/extension/src/background/audit-logger.ts`:**
   - *Implementation:* Local storage audit record manager.
   - *Status:* Instantiated in coordinator constructor, but call sites are omitted in production loop.

---

## 7. Security & Privacy Findings

1. **Personal Vault Storage at Rest:**
   - *Finding:* User credentials (including passwords) in `apps/extension/src/vault/vault-store.ts` are persisted as plain JSON under `privapilot_personal_vault_v1` in `chrome.storage.local`.
   - *Risk:* Anyone with filesystem access to the local Chrome profile directory can inspect stored credentials.
   - *Mitigation:* While data never leaves the device over the network, future iterations should encrypt this blob with AES-256-GCM using WebCrypto, derived from the user's master PIN.
2. **Restricted Browser Surface Protection:**
   - *Finding:* The coordinator properly intercepts `chrome://*` and fails closed before perception.
   - *Verification:* Verified active in runtime (`SCENARIO_11_SANITIZER_BLOCKED_LOCAL`).

---

## 8. Recommended Future Code Improvements (Non-Breaking)

1. **Wire WebCrypto into VaultStore:** Implement `crypto.subtle.encrypt` / `decrypt` using PBKDF2 key derivation from `masterPin` before writing to `chrome.storage.local`.
2. **Connect PerceptionFuser for Pure Canvas Apps:** For HTML5 canvas-rendered web apps (where standard DOM elements are absent), wire `VisualCandidateGenerator` and `PerceptionFuser` into `SanitizerPipeline` as a fallback perception tier.
3. **Activate AuditLogger:** Call `this.auditLogger.log()` inside `coordinator.ts:completeWithResult()` to persist completed run records for compliance auditing.
4. **Create Firefox Manifest:** Add `apps/extension/manifest.firefox.json` with background scripts replacing service worker and offscreen document to achieve genuine cross-browser support.
