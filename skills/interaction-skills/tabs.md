# Interaction Skill: Tab Management & Orchestration

## Purpose
Enables multi-tab workflows, tab switching, and navigation across related windows without interrupting background agent task state.

## Implementation in PrivaPilot
1. **Manifest Permissions**:
   - Declares `"tabs"` and `"activeTab"` permissions in `apps/extension/manifest.json`.
2. **Tab Selection**:
   - `ActionProposal` supports optional `tabId?: number`.
   - When present, the background coordinator switches focus to the specified tab before perception or action execution via `chrome.tabs.update(tabId, { active: true })`.
3. **Multi-Tab Isolation**:
   - Each tab maintains an isolated session history, ephemeral element ID map, and redaction cache to eliminate state collision.
