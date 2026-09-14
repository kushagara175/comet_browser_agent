---
name: browser-use-patterns
description: Core architectural patterns inherited from browser-use (DOM pruning, coordinate-DOM hybrid, self-healing retries).
version: 1.0.0
---

# browser-use Patterns Adapted for On-Device MV3

## Architectural Background
`browser-use` is an industry-leading open-source web agent framework. PrivaPilot replicates its most powerful patterns directly within Chrome Manifest V3:

---

## 1. Aggressive Interactive Tree Pruning
- **Problem**: Raw DOM trees contain tens of thousands of static nodes (`<div>`, `<span>`, CSS formatting elements) that overwhelm LLM context windows.
- **browser-use Approach**: Prune the DOM to only include elements that possess interactive event listeners, ARIA roles, or visible text.
- **PrivaPilot Implementation**:
  - `ElementExtractor` filters non-interactive containers, invisible/clipped elements, and hidden branches.
  - Form inputs, buttons, links, comboboxes, and open Shadow DOM trees are indexed into a compact numbered map (`el_1`, `el_2`, ...).
  - Overhead is reduced from $2\text{ MB}$ of raw HTML to $< 25\text{ KB}$ of sanitized JSON.

---

## 2. Dynamic Self-Healing Element Grounding
- If a target element's local ID becomes stale or detached due to dynamic client re-rendering (e.g. React reconciliation or ASP.NET postback):
  - PrivaPilot performs an immediate live snapshot re-extraction.
  - Matches targets by semantic text, role, or action rationale.
  - Continues the action sequence smoothly without crashing the multi-step run.

---

## 3. Multi-Tab Navigation Safeguards
- When an action attempts to navigate to a new domain or open an external tab (e.g. searching on Wikipedia or Google from an existing web portal):
  - Automatically identifies whether the current page context allows inline navigation or requires opening a separate Chrome tab (`chrome.tabs.create`).
  - Preserves user focus and keeps the previous workflow state intact in `RunCoordinator`.
