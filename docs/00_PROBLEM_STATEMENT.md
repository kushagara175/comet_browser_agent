# 00. Official Problem Statement — SIH26171

> **This document is authoritative.** Every other document in this repository is an
> interpretation of the text below. Where anything disagrees with this file, this file wins.

---

## 1. Official Metadata

| Field | Value |
| :--- | :--- |
| Problem Statement ID | **26171** |
| Title | On-device Visual Perception for Light-weight Browser Agents |
| Organization | **Indian Space Research Organisation (ISRO)** |
| Department | Department of Space / ISRO |
| Category | Software |
| Theme | **Smart Automation** |
| Dataset | *"Any open-source data can be used. Use cases for evaluation will be provided during finale."* |
| YouTube link / contact | Not provided |

---

## 2. Background (as given)

AI agents with access to visual context and screen state can assist with complex workflows and
automate many tasks. Most agentic AI pipelines are deployed server-side, which limits the type of
data a user can share with them. A local agent deployed on the user's machine — particularly in the
browser — eliminates the need to share sensitive data with the server.

Local systems have fewer resources than servers and cannot host a full pipeline, so only
**non-sensitive data** — the structure of the screen, application fields, and similar — can be sent
to a server for processing.

Modern browser APIs (WebGPU, WebAssembly) and local inference libraries (ONNX Runtime Web,
Transformers.js) have unlocked the ability to run lightweight ML models directly on the client. The
aim is to bridge these two environments: leveraging the reasoning power of cloud or server-based AI
while strictly enforcing data privacy at the client side.

---

## 3. Description (as given)

Build a privacy-preserving vision agent that runs in the browser. This involves a client-side
architecture where:

- A local **Vision Transformer (ViT) or equivalent computer vision model** "reads" the user's screen
  and takes decisions based on that.
- If visual context must be sent to a server, it shall **sanitize the sensitive/PII data using DOM
  tags or any other method, before any network request is made.**
- It must **dynamically detect and redact sensitive elements** — for example blurring faces,
  blacking out passwords, and masking PII.
- **Only anonymized, unidentifiable data** may be transmitted to the central server, which is aware
  of the redaction scheme and can process data accordingly.
- The server processes the sanitized context and returns **actionable commands** for the browser
  agent to execute.
- Participants must balance the trade-off between **inference latency and accuracy**.

---

## 4. Expected Solution (as given)

A working prototype consisting of a client-side extension and a server, demonstrating:

### Client-side (extension / JS), running in popular browsers (Chrome, Firefox)

- **Local Vision Processing** — a client-side vision model running in the browser (e.g. via WebGPU)
  that evaluates the current screen state.
- **Privacy Preserving Filter** — a mechanism for sanitizing sensitive or personal visual data,
  achieved through local bounding-box redaction, semantic obfuscation, masking, or similar.
  **This must be clearly demonstrated.**

### Server-side

- **Server Side Integration** — transmission of the anonymized visual context to a centralized
  LLM/VLM, which successfully interprets the sanitized data and returns a response: either processed
  data to be re-ingested by the local client, or a UI action (e.g. *"click the submit button,"*
  *"scroll down"*) that the local client executes.
- Participants are free to use **any offline-deployable (open-source / open-weights) model** on the
  server side. **During SIH they may use a cloud-hosted version of these.**
- **An end-to-end task assisting the user must be demonstrated.**

---

## 5. Evaluation Metrics (as given)

| # | Metric | Weight |
| :-: | :--- | :-: |
| 1 | Accuracy of visual context from screen | **25%** |
| 2 | Recall and precision for detection of sensitive/PII data | **20%** |
| 3 | Precision of redaction | **20%** |
| 4 | Client-side resource utilization | **20%** |
| 5 | Overall end-to-end latency of the provided task | **15%** |

Note that metrics 2 and 3 together are **40%** of the score, and both depend entirely on the local
redaction pipeline. Metric 4 rewards keeping the client light — which is why the in-browser model is
a small quantized detector rather than a full VLM.

---

## 6. The line to build strategy around

> *"Use cases for evaluation will be provided during finale."*

**You will not know the test website or scenario in advance.** ISRO is deliberately withholding it
until judging.

This makes **generalization to arbitrary, unseen pages a hard requirement, not a stretch goal.** A
solution that quietly only works on one rehearsed demo site fails the moment judges hand over a task
on a page it has never seen. Concretely, this means:

- No site-specific selectors, no hardcoded element IDs, no per-domain special cases anywhere in the
  detection, redaction, or execution path.
- The detectors must be **semantic and generic**: `input[type=password]`, `autocomplete` tokens,
  ARIA roles, regex over visible text, and a vision model — never "the password field on site X".
- The benchmark corpus must include page shapes the code was **not** developed against, and the
  demo rehearsal should include at least one page nobody on the team has seen before.
- Fail-closed behavior matters more than usual: on an unfamiliar page, over-masking and refusing to
  transmit is a recoverable outcome; leaking PII is not.

The companion note — *"Any open-source data can be used"* — means any public dataset (open
face-detection sets, synthetic PII form data) is fair game for building and testing the detection
and redaction components. There is no official ISRO-provided dataset to match against.

**ISRO context is genuine**, and useful for framing (e.g. staff interacting with varied internal web
tools), but **no specific ISRO portal is named or guaranteed** as the evaluation target. Do not build
toward one.

---

## 7. Provenance

An earlier version of this project's planning documents was based on a third-party prep document
that invented details not present in the real problem statement — ISRO geospatial portals (Bhuvan,
MOSDAC, VEDAS, Bhoonidhi), a full air-gapped offline requirement, and WebGL map dragging. **None of
that is in the official text.** In particular, the earlier "zero cloud / air-gapped" framing directly
contradicts this PS, which *requires* a client-to-server split.

Those superseded documents are retained in `docs/archive/` for provenance only. Do not build from
them.
