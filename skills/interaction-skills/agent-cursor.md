---
name: agent-cursor
description: Animated AI Ghost Cursor with smooth cubic Bézier gliding, action badges, and click ripples for browser automation.
version: 1.0.0
---

# PrivaPilot Animated AI Ghost Cursor

## Architectural Concept
When an autonomous agent interacts with a webpage, instant teleportation or silent background DOM mutation can disorient human observers. The PrivaPilot Ghost Cursor provides a continuous, human-observable visual presence (`#privapilot-agent-cursor`) that mirrors the cognitive focus of the vision-language model.

---

## Visual Affordances & Dynamics

1. **Cubic Bézier Gliding Movement**:
   - Rather than jumping between elements, the cursor glides across the viewport using `cubic-bezier(0.22, 1, 0.36, 1)`.
   - Trajectory duration scales gracefully (default $320\text{--}360\text{ ms}$), providing immediate human reassurance without causing execution lag.
   - The cursor tip lands accurately on the interactable center or top-left boundary of the target element.

2. **Action Badges**:
   - Floating luminous pill attached to the cursor pointer indicates the pending operation:
     - `⚡ Click`: Primary click or button triggering.
     - `✍️ Type "snippet..."`: Input filling, search query submission.
     - `📋 Select`: Dropdown or combobox option choice.
     - `👁️ Hover`: Navigational flyout or menu expansion.
     - `📜 Scroll`: Viewport or container panning.
     - `📁 Upload`: File input attachment.

3. **Dispatched Feedback & Click Ripples**:
   - On synthetic click dispatch, a radial shockwave ring (`.privapilot-cursor-ripple`) expands from the pointer tip and fades out over $480\text{ ms}$.
   - On typing dispatch, the badge pulses with an active typing glow.
   - Once the action completes and verifies, the cursor smoothly fades out and parks (`opacity: 0`).

---

## DOM & Privacy Invariants

- **Isolation from VLM Snapshots**:
  The cursor and all associated markup are marked with `data-privapilot-ignore="true"` and `class="privapilot-overlay"`. `ElementExtractor` strictly filters these nodes out, ensuring the VLM never perceives or attempts to interact with the cursor itself.
- **Pass-through Pointer Events**:
  The cursor element is styled with `pointer-events: none !important;` so that it never obstructs or intercepts native or synthetic page events.
