---
name: visual-som-grounding
description: Set-of-Marks (SOM) visual labeling, numeric interactive badge overlays, and canvas/icon grounding adapted from Anthropic Computer Use and OmniParser.
version: 1.0.0
---

# Visual Set-of-Marks (SOM) Grounding Skill

## Architectural Concept
Many interactive elements lack clean semantic tags or ARIA labels (e.g. custom canvas elements, WebGL games, unlabeled SVG icons, dynamic graphs, and visual toolbar buttons). While traditional DOM scrapers fail on these elements, vision-language models excel at visual recognition.

The `visual-som-grounding` skill renders high-contrast, numbered visual pill badges directly over interactive bounding boxes on the page before capturing perception snapshots.

---

## 1. Visual Badge Structure
- Each detected interactive element receives a small, high-contrast overlay pill:
  ```html
  <div class="privapilot-som-mark" data-mark-id="12">12</div>
  ```
- **Styling**:
  - Distinct border and background (e.g. bright cyan `#06b6d4` with high-contrast black/white numerals).
  - Placed at the top-left corner of the element's bounding rect with negative offset so as not to obscure the element's internal text.
  - Sized compactly ($14\text{--}18\text{ px}$ height, $10\text{ px}$ bold font).

---

## 2. VLM Perception & Grounding Loop
1. **Perception**:
   - The screenshot captured by `captureVisibleTab` includes these numbered SOM badges.
2. **Action Proposal**:
   - The VLM can simply output:
     `{"kind": "click", "markId": 12, "reasoning": "Clicking the filter icon marked as [12]"}`
3. **Coordinate Mapping**:
   - Content script looks up `markId === 12` in its live coordinate map, targets the element, and glides the cursor directly to it.
4. **Zero-PII Preservation**:
   - The SOM overlay is rendered AFTER face blurring and PII redaction masks are applied, ensuring absolute privacy compliance.
