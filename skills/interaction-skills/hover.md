# Interaction Skill: Mouse Hover & Flyout Triggers

## Purpose
Triggers mouse hover states to reveal dropdown navigation menus, interactive tooltips, secondary action buttons, and preview cards that are hidden behind `:hover` CSS pseudoclasses or JavaScript `mouseover` event listeners.

## Implementation in PrivaPilot
Implemented via `dispatchSyntheticHover` in `@privapilot/protocol/src/agent-helpers.ts` and in `ActionExecutor` for action kind `'hover'`:

```typescript
// 1. Focus element
if (typeof targetEl.focus === 'function') targetEl.focus();

// 2. Dispatch pointer sequence
targetEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, composed: true }));
targetEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, composed: true }));
targetEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, composed: true }));
```

## Safety Classification
- Hover actions are classified as `safe` and reversible.
- Hovering elements triggers a postcondition check (`status_changed` or newly revealed elements in the next sanitized capture cycle).
