# Interaction Skill: Drag and Drop

## Purpose
Simulates synthetic HTML5 drag-and-drop actions for reordering lists, dragging items to carts, moving kanban cards, or adjusting slider controls without requiring direct OS-level mouse virtualization.

## Implementation in PrivaPilot
Implemented via `dispatchSyntheticDragAndDrop` in `@privapilot/protocol/src/agent-helpers.ts` and supported by `ActionExecutor` for action kind `'drag_and_drop'`:

```typescript
// 1. Synthetic DataTransfer creation
const dt = new DataTransfer();
dt.dropEffect = 'move';
dt.setData('text/plain', source.id || 'drag_source');

// 2. Dispatch sequence
source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
```

## Security & Verification
- `targetLocalId` and `destinationLocalId` must both be present in the sanitized perception context.
- Dragging actions targeting destructive controls (delete, trash, submit) are classified as `protected` and require user confirmation.
