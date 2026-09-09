# Interaction Skill: Controlled Inputs (React, Vue, Angular, Svelte)

## Purpose
Enables deterministic text entry into modern Single Page Application (SPA) inputs where standard `element.value = "text"` is intercepted, overwritten, or ignored by reactive virtual DOM state managers (such as React 16+ fibers).

## Implementation in PrivaPilot
Implemented in `@privapilot/protocol` via `setNativeControlledValue` and executed in `ActionExecutor` (`apps/extension/src/content/action-executor.ts`):

```typescript
// 1. Resolve prototype setter to bypass framework interceptor
const proto = isTextArea
  ? window.HTMLTextAreaElement.prototype
  : window.HTMLInputElement.prototype;
const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

if (nativeSetter) {
  nativeSetter.call(element, textToType);
} else {
  element.value = textToType;
}

// 2. Dispatch synthetic bubbling events
element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: textToType }));
element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
```

## Security & Privacy Rules
- Passwords, OTPs, CVVs, tokens, and sensitive personal identifiers are strictly forbidden from automated entry unless explicit user approval is granted (`userApproved: true`).
- Input values are never reflected back into unredacted captures or perception telemetry.
