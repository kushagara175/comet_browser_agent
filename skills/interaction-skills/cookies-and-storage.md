# Interaction Skill: Cookies & Storage Management

## Purpose
Preserves authentication sessions, cookie consent preferences, and local storage state across agent executions without leaking session secrets or credentials over the network.

## Implementation in PrivaPilot
1. **Zero Raw Cookie Transmission**:
   - PrivaPilot never transmits cookies, `sessionStorage`, or `localStorage` keys over the network to the reasoning server.
   - All HTTP communication uses sanitized semantic descriptors and ephemeral element IDs.
2. **Local Storage Adapter**:
   - `BrowserAdapter.getStorage` and `BrowserAdapter.setStorage` use `chrome.storage.local` to securely persist user preferences, model endpoints, and local telemetry.
3. **Session Re-use**:
   - Running inside the user's authenticated Chrome profile enables seamless task completion on authenticated sites (SIH Portal, GitHub, Google) without needing to automate login flows or store raw passwords.
