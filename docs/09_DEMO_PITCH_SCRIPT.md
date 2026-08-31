# 09. Grand Finale Pitch & Live Demo Script — SIH26171

## ⏱️ The 3-Minute Grand Finale Presentation

```
0:00 ────────── 0:30 ────────── 2:00 ────────── 2:45 ────────── 3:00
  The Hook        Live Demo        Scorecard       Generalization
 (Privacy Dilemma) (Dual-Pane HUD) (5 Metrics)     & Close
```

---

## 🎤 Minute-by-Minute Pitch Script

### 1. Minute 0:00 – 0:30: The Hook & The Privacy Paradox
> *"Good morning, respected judges. Autonomous AI browser agents are transforming digital workflows, but today they face a fatal flaw: to automate tasks, standard agents send raw screenshots to centralized cloud servers.*
>
> *In real-world workflows—whether on ISRO portals, enterprise tools, or banking systems—screens contain passwords, employee faces, credit cards, and confidential PII. Sending this raw visual data to external servers is a severe privacy violation and a security risk.*
>
> *We present **PrivaPilot**: an on-device, privacy-preserving browser agent that uses in-browser computer vision and deterministic DOM analysis to detect and redact sensitive data locally before anything ever touches the network."*

---

### 2. Minute 0:30 – 2:00: The Live Demonstration (The Visual Wow Factor)
> *"Let us show you this live in the browser.*
>
> *(Presenter triggers a complex form filling task on a live portal with password fields and personal photos)*
>
> *Look at our Mission Control HUD on the right side:*
> - *The **left preview** shows the live raw webpage on the user's laptop (held in local memory).*
> - *The **right preview** shows our **On-Device Redaction Engine** in real time: password fields are solid blacked out, PII tokens are masked, and employee faces are blurred.*
> - *Let's check the browser's Network Tab: **no plaintext passwords, no unmasked card numbers, and no raw faces are transmitted**.*
> - *Our centralized reasoning server receives this sanitized layout with ephemeral local IDs, interprets the task, returns the action proposal, and our extension autonomously executes the click and form submission."*

---

### 3. Minute 2:00 – 2:45: Official Benchmark Scorecard
> **⚠ Do not fill these in from memory or estimate them.** Every figure below is read from the
> latest `docs/benchmark-results/` output, produced by `npm run benchmark` against the authored ground-truth
> corpus. If a number has not been measured, it does not get spoken. See `AGENT_RULES.md` §5.

> *"Our solution is measured against all 5 official SIH evaluation metrics:*
> 1. * **Visual Context Accuracy (25%):** `<element recall / precision / median IoU>`*
> 2. * **PII Detection Recall & Precision (20%):** `<aggregate recall / precision, per category>`*
> 3. * **Precision of Redaction (20%):** `<coverage, over-mask ratio, safe-element preservation>`*
> 4. * **Client Resource Utilization (20%):** `<measured peak memory / CPU during a run>`*
> 5. * **End-to-End Latency (15%):** `<p50 / p95, split into client and server>`"*

> **Presenting a genuine number that missed its target beats presenting an invented one that hit it.**
> If a metric underperforms, say so and say what you would change — an ISRO jury will respect that far
> more than a figure that collapses under one follow-up question.

---

### 4. Minute 2:45 – 3:00: Generalization Defense & Close
> *"Finally, we know ISRO's official problem statement specifies that evaluation use cases are provided live at the finale. Our agent uses zero hardcoded rules or static selectors—it operates dynamically across any modern web interface using ephemeral local IDs and standards-compliant event dispatching.*
>
> *Thank you, and we are ready for your live test cases."*

---

## 🛡️ Jury Q&A Defense Cheat Sheet

### Q1: "Why not run the full reasoning VLM inside the browser tab as well?"
> **Answer:** *"A full 7B or 14B VLM requires significant VRAM, which introduces heavy memory pressure in consumer browser tabs and high latencies. By keeping lightweight perception and redaction in-browser and offloading reasoning to a central server, we achieve strong privacy with responsive multi-step execution."*

### Q2: "How do you guarantee that a new, unknown PII field is not leaked?"
> **Answer:** *"We use a layered defense: DOM input type inspection, ARIA metadata scanning, heuristic regex matching, and visual computer vision bounding-box detection. If any ambiguity exists, our redaction engine defaults to conservative masking."*

### Q3: "What if the webpage uses non-standard canvas or WebGL elements?"
> **Answer:** *"Our extension captures the rendered canvas bitmap, masks uninspectable regions fail-closed, and provides experimental coordinate-based fallback execution if required."*

