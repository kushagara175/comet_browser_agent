---
name: best-agent-skills
description: Comprehensive reference guide for premier open-source browser automation agent repositories, interaction skills, and design patterns.
version: 1.0.0
---

# Top Open-Source Browser Agent Skills & Architecture Guide

This document catalogs the state-of-the-art open-source browser automation agent repositories, dissects their architectural strengths, and details how PrivaPilot synthesizes their core primitives into an on-device, privacy-preserving Chrome extension.

---

## 1. Premier Open-Source Browser Agent Repositories

| Framework / Repository | Community & Language | Primary Strength | Key Skills & Primitives to Inherit |
| :--- | :--- | :--- | :--- |
| **`browser-use`**<br>([browser-use/browser-use](https://github.com/browser-use/browser-use)) | ⭐ 30k+<br>Python / Playwright | **Autonomous Web Navigation & Tab Orchestration**: Vision + pruned DOM hierarchy tree extraction, step-by-step reasoning loops. | • Multi-tab switching & URL history tracking<br>• Dynamic element pruning (reducing DOM to interactive nodes)<br>• Clean structured action schemas (`click_element`, `input_text`, `scroll_at`) |
| **`stagehand`**<br>([browserbase/stagehand](https://github.com/browserbase/stagehand)) | ⭐ 10k+<br>TypeScript / Playwright | **High-Level Agent Primitives & Self-Healing Selectors**: Simplified 3-verb API (`act`, `extract`, `observe`) with declarative Zod schemas. | • Native full-fidelity event bubbling (`focus` -> `keydown` -> `input` -> `change` -> `keyup` -> `blur`)<br>• Self-healing semantic fallback when selectors break<br>• Clean TypeScript extraction schemas |
| **`ghost-cursor`**<br>([Xetera/ghost-cursor](https://github.com/Xetera/ghost-cursor)) | ⭐ 2k+<br>Node.js / Puppeteer | **Human-Realistic Mouse Physics & Bézier Trajectories**: Replaces robotic mouse teleportation with organic human trajectories. | • Fitts's Law velocity profiles (swift initial throw, smooth deceleration)<br>• Cubic Bézier curved arcs with randomized normal vectors<br>• Micro-overshoot and corrective landing |
| **`skyvern`**<br>([Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern)) | ⭐ 9k+<br>Python / Playwright | **Vision-First Automation & Human-in-the-Loop**: Navigating dynamic websites, anti-bot screens, and messy legacy portals. | • Dynamic slot filling (requesting human input for MFA/passwords)<br>• Execution pause & resume without losing workflow state<br>• Resilient table and multi-page data scraping |
| **`Anthropic Computer Use`**<br>([anthropic-quickstarts](https://github.com/anthropics/anthropic-quickstarts)) | ⭐ 20k+<br>Python / OS Docker | **Coordinate Grounding & Visual OS Control**: Vision-based coordinate clicking and keyboard input without direct DOM access. | • Unified visual coordinate mapping (`x`, `y`)<br>• Set-of-Marks (SOM) visual labeling overlay<br>• Bounded execution safety steps |

---

## 2. Core Primitives Synthesized in PrivaPilot

### A. Animated Human AI Cursor (`ghost-cursor` + `browser-use`)
- **Smootherstep Velocity Curve**: Uses Ken Perlin's quintic polynomial ($S_2(p) = 6p^5 - 15p^4 + 10p^3$) guaranteeing zero initial jerk and soft deceleration onto the target.
- **Dynamic Live Element Tracking**: Dynamically recalculates `el.getBoundingClientRect()` on every animation frame, ensuring the cursor follows the element even during scrolling or responsive reflow.
- **Hotspot Offset Compensation**: Adjusts container coordinates so the physical SVG pointer tip (arrow tip, hand index finger, or caret baseline) points with subpixel precision directly at the interactive center.

### B. Self-Healing Element Mapping (`stagehand`)
- **Fingerprinting**: Captures tag, role, text content, placeholder, aria-label, and relative bounding boxes.
- **Fuzzy Proximity Scoring**: If a dynamic single-page app (SPA) re-renders or updates IDs, PrivaPilot matches candidates based on semantic tag weighting and coordinate proximity ($S \ge 0.55$).

### C. Zero-PII Privacy Barrier (`PrivaPilot Invariant`)
Unlike remote cloud agents (e.g. Browserbase or Skyvern Cloud) that stream unredacted screenshots to external servers, PrivaPilot executes **on-device client redaction**:
1. High-speed multi-category Regex for passwords, SSNs, credit cards, emails, phone numbers.
2. Direct DOM text sanitization masking sensitive values.
3. ONNX WASM UltraFace detector blurring human faces before any visual screenshot is passed to the VLM.

---

## 3. Recommended Skills Architecture for Autonomous Agents

When building clean, production-grade skills for browser agents, follow this 4-tier separation:

```
skills/
├── browser-harness/                  # Master index & agent orchestration runtime
│   ├── SKILL.md                      # System prompt & skill registry
│   └── best-agent-skills.md          # Architectural open-source benchmark & analysis
├── interaction-skills/               # Low-level DOM & viewport mechanics
│   ├── agent-cursor.md               # Visual Bézier gliding, badges, ripples
│   ├── execution-shield.md           # Capture-phase user event lock & pause
│   ├── controlled-inputs.md          # React/Vue input setter bypass
│   ├── drag-and-drop.md              # HTML5 synthetic DataTransfer sequences
│   ├── dropdowns.md                  # Native <select> and ARIA comboboxes
│   ├── scrolling.md                  # Synchronous & container viewport panning
│   └── shadow-dom.md                 # Open ShadowRoot piercing and traversal
└── domain-skills/                    # High-level web application playbooks
    ├── sih-portal.md                 # Smart India Hackathon problem statements & search
    ├── github.md                     # GitHub PRs, issues, search, releases
    ├── wikipedia.md                  # Wikipedia search, infobox extraction, references
    ├── duckduckgo-google.md          # Web search parsing & snippet extraction
    └── reddit.md                     # Reddit discussions, comments, upvotes
```
