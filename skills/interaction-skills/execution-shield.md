---
name: execution-shield
description: In-page safety shield and event capture barrier that blocks accidental user interference while active agent actions execute.
version: 1.0.0
---

# PrivaPilot In-Page Execution Safety Shield

## Purpose & Problem Statement
When an AI agent is in the middle of executing a multi-step sequence (e.g. typing a search query, submitting a form, or clicking pagination), inadvertent user mouse clicks, accidental keystrokes, or scrolling can:
1. Steal DOM focus away from the active input.
2. Desynchronize element coordinate maps and target IDs.
3. Trigger unexpected page navigations or premature form submissions.

The **Execution Safety Shield** (`#privapilot-execution-shield`) creates a temporary protective barrier during active action execution cycles.

---

## Technical Mechanism

1. **Capture-Phase Interception**:
   - The shield attaches listeners to `window` with `{ capture: true, passive: false }` across all critical interaction events:
     `click`, `mousedown`, `mouseup`, `dblclick`, `contextmenu`, `keydown`, `keypress`, `wheel`, `touchstart`, `touchend`.
   - Any external user event intercepted during execution is immediately stopped with `e.stopPropagation()`, `e.stopImmediatePropagation()`, and `e.preventDefault()`.

2. **Visual Status Banner**:
   - A floating status pill at the top of the viewport displays:
     `🤖 PrivaPilot Automating Page... [Esc to Pause]`
   - Subtle $0.5\text{px}$ backdrop blur and `cursor: wait` visually signal active automation to the user.

3. **Emergency Escape Hatch**:
   - The user retains ultimate authority: pressing `Escape` immediately releases the shield, dispatches `privapilot-emergency-pause`, and restores full keyboard/mouse control.

4. **Auto-Recovery Watchdog**:
   - An internal unref'd watchdog timer automatically releases the shield after $25\text{ seconds}$ if an unexpected error occurs, guaranteeing the user is never permanently locked out of their tab.
   - All action executions are wrapped in `try { ... } finally { overlay.disableSafetyShield(); }` ensuring automatic unshielding upon completion.
