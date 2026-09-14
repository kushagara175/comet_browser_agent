---
name: stagehand-primitives
description: Stagehand-inspired AI browser primitives (act, extract, observe) mapped to Manifest V3 on-device privacy pipelines.
version: 1.0.0
---

# Stagehand-Inspired Automation Primitives for PrivaPilot

## Architectural Background
Browserbase's **Stagehand** revolutionized AI web automation by consolidating browser control into three core developer-friendly primitives:
1. `act(instruction)`: Perform an atomic, natural language action.
2. `extract(instruction, schema)`: Extract structured, typed data from the visible viewport.
3. `observe(instruction)`: Find interactive targets and identify feasible actions without mutation.

PrivaPilot inherits and adapts these three primitives directly into Chrome Manifest V3 without requiring CDP, Playwright, or external headless servers.

---

## 1. The `act` Primitive (Natural Language to DOM Dispatch)
In PrivaPilot:
- The user instruction (e.g. *"search for problem statement 171"* or *"click the submit button"*) is processed by the reasoning engine (`vlm-engine.ts`).
- Semantic element resolution maps the instruction to a `targetLocalId`.
- Framework-safe event synthesis (`action-executor.ts`) dispatches the action with React/Vue fiber bypasses.
- Before execution, the **Ghost Cursor** glides to the target element, and the **Execution Safety Shield** protects the viewport.

---

## 2. The `extract` Primitive (Structured Semantic Extraction)
In PrivaPilot:
- High-density data structures (e.g. DataTables on `sih.gov.in`, Wikipedia infoboxes, GitHub issue lists) are extracted directly from the DOM using `ElementExtractor` and `SemanticStateVerifier`.
- Any PII (names, phone numbers, Aadhaar numbers, card numbers) is redacted on-device before extraction payloads leave the browser context.

---

## 3. The `observe` Primitive (Read-only Viewport Perception)
In PrivaPilot:
- Captures sanitized DOM snapshots and Set-of-Marks (SOM) visual overlays.
- Emits candidate interactive elements with bounding boxes and ARIA roles for agent evaluation without mutating the target webpage.
