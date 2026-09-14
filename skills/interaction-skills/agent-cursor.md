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

1. **Human-Realistic Bézier Gliding Movement**:
   - Rather than jumping or teleporting, the cursor glides across the viewport along a natural human curved trajectory using Ken Perlin's quintic Smootherstep velocity curve ($S_2(p) = 6p^5 - 15p^4 + 10p^3$).
   - Trajectory duration scales organically according to Fitts's Law ($220 + \text{dist} \times 0.36\text{ ms}$, bounded between $260\text{--}440\text{ ms}$).
   - **Dynamic Live Element Tracking**: Recalculates `el.getBoundingClientRect()` on every animation frame so the cursor tracks elements accurately even during page scrolls or layout reflow.
   - **Subpixel Hotspot Tip Offset**: Automatically compensates for SVG pointer tip coordinates (Arrow: tip at $(2.5, 1.7)$; Hand: index finger at $(7.1, 2.1)$; Caret: I-beam center at $(7.5, 8.25)$) so the active tip lands precisely on the interactive center or text insertion baseline.

2. **Minimalist Vector Action Badges (Zero Fake Emojis)**:
   - High-contrast floating badge with clean inline monochrome SVG icons:
     - `CLICK`: Crosshair target ring
     - `TYPE`: Text pen tool with string preview snippet
     - `SELECT`: Minimal dropdown chevron
     - `HOVER`: Concentric vision iris
     - `SCROLL`: Vertical momentum vector
     - `UPLOAD`: Arrow pointing to tray
     - `DRAG`: Grip handle bars

3. **Dispatched Feedback & Click Ripples**:
   - On synthetic click dispatch, an authentic physical press down (`scale(0.82) translate(1px, 1px)`) is followed by an expanding radial shockwave ring (`.privapilot-cursor-ripple`).
   - On typing dispatch, the badge border pulses with a cyan luminous glow.
   - Once the action completes, the cursor rests naturally on screen, fading out gracefully after an extended idle delay ($15\text{ s}$).

---

## DOM & Privacy Invariants

- **Isolation from VLM Snapshots**:
  The cursor and all associated markup are marked with `data-privapilot-ignore="true"` and `class="privapilot-overlay"`. `ElementExtractor` strictly filters these nodes out, ensuring the VLM never perceives or attempts to interact with the cursor itself.
- **Pass-through Pointer Events**:
  The cursor element is styled with `pointer-events: none !important;` so that it never obstructs or intercepts native or synthetic page events.
