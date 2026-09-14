---
name: human-overshoot-and-cadence
description: Biomechanical mouse physics, micro-overshoot correction, variable keystroke cadence, and natural hesitation adapted from ghost-cursor.
version: 1.0.0
---

# Human Overshoot, Cadence & Biomechanics Skill

## Architectural Concept
Automated bot scripts are trivial for modern anti-bot systems (Cloudflare, Akamai, Datadome, reCAPTCHA v3) to identify because their movement metrics lack natural human variance:
1. **Robotic Velocity**: Moving at flat constant speeds or mathematical step functions.
2. **Instant Clicks**: Triggering `click` $0\text{ ms}$ after cursor arrival without settling hesitation.
3. **Isochronous Keystrokes**: Typing every character with identical $50\text{ ms}$ gaps.
4. **Zero Path Correction**: Landing on the exact pixel center without the natural human hand overshoot.

The `human-overshoot-and-cadence` skill incorporates realistic motor control physics directly into browser automation.

---

## 1. Biomechanical Primitives

### A. Trajectory Micro-Overshoot & Correction
- On long-distance cursor travels ($> 200\text{ px}$):
  - At $p = 0.90$, the cursor travels past the target by $3\text{--}8\text{ px}$ along the momentum vector.
  - Over the final $10\%$ of time, a corrective micro-glide brings the pointer back onto the target center.
  - Mimics human neuromuscular deceleration and corrective eye-hand coordination.

### B. Settling Hesitation (Hover-Before-Click)
- Rather than dispatching `mousedown` the instantaneous millisecond the cursor arrives:
  - Adds a subtle $45\text{--}90\text{ ms}$ resting pause.
  - Simulates the biological latency between visual target acquisition and physical finger press.

### C. Human Keystroke Cadence & Burstiness
- When typing strings:
  - Standard characters: Random Gaussian distribution centered at $42\text{ ms} \pm 14\text{ ms}$.
  - Frequent bigrams (`th`, `er`, `in`, `on`): Rapid bursts ($18\text{--}28\text{ ms}$).
  - Spaces and punctuation (`.`, `,`, `Enter`): Natural cognitive pause ($90\text{--}140\text{ ms}$).
  - Capitalized characters: Micro-hesitation simulating the Shift key hold ($65\text{--}95\text{ ms}$).
