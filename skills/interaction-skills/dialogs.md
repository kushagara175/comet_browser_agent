# Interaction Skill: Dialogs, Modals, and Consent Banners

## Purpose
Enables autonomous detection, focus trapping, and resolution of modal dialogs, cookie consent notices, and confirmation prompts that impede page interaction.

## Implementation in PrivaPilot
1. **Modal Awareness & Context**:
   - `SanitizedPageState.visibleDialogCount` and `dialogTitles` signal active modals.
   - `SanitizedElement.isInsideDialog` prioritizes interactive elements contained inside the top-most dialog.
2. **Dismissal & Confirmation**:
   - Explicit dismissal goals (`"dismiss cookie banner"`, `"close modal"`) resolve to click proposals targeting dismissal controls with postcondition `{ kind: 'visibility_changed', state: 'hidden' }`.
   - Native `window.alert`, `window.confirm`, and `window.prompt` are intercepted or handled via Chrome Extension scripting.
