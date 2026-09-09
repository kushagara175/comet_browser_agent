# Interaction Skill: File Uploads & Downloads

## Purpose
Enables programmatic assignment of file payloads to `<input type="file">` elements using synthetic `DataTransfer` injection without requiring OS native file picker automation.

## Implementation in PrivaPilot
Implemented via `dispatchSyntheticFileUpload` in `@privapilot/protocol/src/agent-helpers.ts` and in `ActionExecutor` for action kind `'upload_file'`:

```typescript
// Synthetic File & DataTransfer instantiation
const file = new File([fileSpec.content], fileSpec.fileName, {
  type: fileSpec.mimeType || 'application/pdf',
  lastModified: Date.now()
});

const dt = new DataTransfer();
dt.items.add(file);
inputElement.files = dt.files;

// Notify framework
inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
```

## Security & Verification
- File uploads are classified as `protected` by default to prevent unauthorized document submission or credential leak.
- File names are strictly validated against directory traversal (`..`, `/`, `\`) and executable script patterns.
- Postcondition verification confirms `value_present` on the target input element.
