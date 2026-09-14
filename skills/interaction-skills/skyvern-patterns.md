---
name: skyvern-patterns
description: Skyvern-inspired computer-use patterns for complex table parsing, form workflows, and goal recovery.
version: 1.0.0
---

# Skyvern Patterns Adapted for On-Device MV3

## Architectural Background
`skyvern` is an open-source automation engine known for handling unstructured, messy web interfaces, complex workflows, and visual recovery without fragile hardcoded selectors.

---

## 1. Complex Data Extraction (DataTables & Tabular Data)
- Many complex government and enterprise portals (such as `sih.gov.in`) employ client-side and server-side DataTables with pagination, filters, and dynamic DOM replacement.
- **Pattern**:
  - Filter and search operations must be executed directly on client-side filter inputs without triggering parent form postbacks (`form.requestSubmit()` interception).
  - Target row extraction captures all visible column values (ID, Category, Organization, Submissions, Actions) into structured key-value maps.

---

## 2. Multi-Action Batching
- Form filling sequences that require multiple fields to be populated before clicking submit are grouped into atomic batches (`kind: "batch"`).
- Synthetic typing events bypass React controlled component setters using native prototype property descriptors.

---

## 3. Goal Memory & Retry Resilience
- When user input is brief or colloquial (e.g. *"do again"*, *"retry"*, *"redo"*):
  - Instead of discarding context and falling back to passive chat, the agent recalls `this.lastGoal` from persistent session memory.
  - The reasoning loop re-executes the intended web operation without dropping into a dead end.
