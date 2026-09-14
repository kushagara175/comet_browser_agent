---
name: tab-graph-orchestration
description: Multi-tab state graph tracking, parent-child tab linking, background tab scraping, and clean tab disposal adapted from browser-use.
version: 1.0.0
---

# Tab Graph Orchestration Skill

## Architectural Concept
Real-world workflows frequently spawn multiple browser tabs (e.g. clicking external documentation links, opening problem statement PDFs in new tabs, or comparing results across search engines). Without tab tracking, agents lose context of which tab holds the primary workflow versus auxiliary research tabs.

The `tab-graph-orchestration` skill maintains a directed acyclic graph (DAG) of tabs in Chrome MV3.

---

## 1. Tab Graph Architecture
- **Root Tab**: The tab where the user initiated the workflow.
- **Child Tabs**: Tabs spawned via `target="_blank"`, `window.open()`, or agent navigation actions.
- **Node Metadata**:
  ```typescript
  interface TabNode {
    tabId: number;
    parentTabId: number | null;
    url: string;
    title: string;
    purpose: 'primary' | 'reference' | 'download' | 'auth';
    createdAt: number;
    status: 'active' | 'background' | 'closed';
  }
  ```

---

## 2. Core Capabilities

### A. Automatic Child Tab Interception
- When an action triggers `chrome.tabs.onCreated`:
  - Automatically links `openerTabId` as `parentTabId`.
  - Injects PrivaPilot content scripts into the newly created tab as soon as `status === 'complete'`.

### B. Context Preservation Across Switching
- When switching between tabs (`chrome.tabs.update(childTabId, { active: true })`):
  - Captures the DOM and cursor state of the parent tab.
  - Activates the child tab, runs perception, and extracts requested information.

### C. Graceful Tab Clean-up
- Once information is extracted from a child tab:
  - Automatically closes the child tab (`chrome.tabs.remove(childTabId)`).
  - Switches focus back to the parent tab.
  - Updates the VLM's context with the extracted snippet without polluting the browser window with 20 dangling tabs!
