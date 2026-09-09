# Interaction Skill: Iframes & Sub-Frame Perception

## Purpose
Perceives interactive controls, form elements, and sensitive regions embedded inside `<iframe>` and `<frame>` elements (such as payment gateways, authentication widgets, or sandboxed content).

## Implementation in PrivaPilot
1. **Manifest Configuration**:
   - `apps/extension/manifest.json` specifies `"all_frames": true` in `content_scripts`.
   - Content scripts initialize independently within each frame context while communicating securely with the background coordinator.
2. **Coordinate Offset Mapping**:
   - Same-origin sub-frames are processed by `ElementExtractor.processDocumentLevel` with bounding client offsets cumulative to the main window viewport.
3. **Cross-Origin Security Boundary**:
   - Uninspectable cross-origin frames are marked as `uninspectable` and trigger fail-closed redaction if they contain sensitive or non-transparent visual surfaces.
