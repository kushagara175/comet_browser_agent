# 01. Problem Analysis & Domain Context — SIH26171

## 1. Executive Summary & Problem Identity
- **Problem Statement ID:** `SIH26171`
- **Issuing Ministry/Organization:** 🇮🇳 **Indian Space Research Organisation (ISRO) | Department of Space**
- **Category:** Software
- **Theme:** Smart Automation
- **PS Type:** Dedicated Ministry Problem Statement (Fixed requirements, evaluated by ISRO domain experts)
- **Dataset / Challenge Scope:** *"Any open-source data can be used. Use cases for evaluation will be provided during finale."*

---

## 2. Core Problem Breakdown: The Privacy Paradox in Web AI Agents

Autonomous web agents that perceive screens and execute browser actions have the potential to automate complex digital workflows. However, existing agent architectures suffer from a critical architectural flaw:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           THE SERVER-SIDE PRIVACY PARADOX                                │
├───────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Bottleneck            │ Description & Operational Impact                                │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 1. Data Exfiltration  │ Sending raw browser screenshots to external/cloud LLM APIs      │
│                       │ leaks passwords, auth tokens, credit cards, emails, and PII.   │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 2. Facial & Media Risk│ Screenshots capture employee profile pictures, identity cards,  │
│                       │ and video streams, violating GDPR and national privacy laws.    │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 3. Heavy Edge Models  │ Running a full 7B-70B VLM inside a browser tab crashes client   │
│                       │ machines due to severe VRAM/RAM constraints.                    │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 4. Unseen Web UIs     │ Evaluators will test on undisclosed live web portals at finale. │
│                       │ Hardcoded selectors or single-site agents fail immediately.     │
└───────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

## 3. The Solution: Hybrid Client-Server Privacy Architecture

The problem statement mandates bridging **on-device client privacy** with **centralized server reasoning**:

```
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │                         CLIENT VS SERVER RESPONSIBILITY SPLIT                    │
  ├─────────────────────────────────────────┬────────────────────────────────────────┤
  │ Client-Side (Browser Extension / JS)    │ Server-Side (Centralized VLM / LLM)    │
  ├─────────────────────────────────────────┼────────────────────────────────────────┤
  │ • Captures local viewport and DOM       │ • Receives ONLY sanitized context      │
  │ • Runs WebGPU ViT & Face Detection      │ • Understands high-level task intent   │
  │ • Redacts passwords, faces, & PII       │ • Generates structured UI action JSON  │
  │ • Executes returned action in DOM       │ • Returns command to extension         │
  └─────────────────────────────────────────┴────────────────────────────────────────┘
```

---

## 4. Official SIH Evaluation Scorecard & Weightage

The official evaluation metrics defined by ISRO reward privacy and redaction above all else:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              OFFICIAL SIH 26171 SCORECARD                              │
├──────────────────────────────────────────┬────────┬────────────────────────────────────┤
│ Metric                                   │ Weight │ Implementation Benchmark           │
├──────────────────────────────────────────┼────────┼────────────────────────────────────┤
│ 1. Accuracy of Visual Context            │  25%   │ Clean DOM extraction & layout grid │
│ 2. Recall & Precision of PII Detection   │  20% ┐ │ >98% detection across all types    │
│ 3. Precision of Redaction                │  20% ┴─┼─ 40% PRIVACY WEIGHT!               │
│ 4. Client-Side Resource Utilization      │  20%   │ <350MB WebGPU RAM, <15% CPU load   │
│ 5. Overall End-to-End Latency            │  15%   │ <1.2s total step round-trip        │
└──────────────────────────────────────────┴────────┴────────────────────────────────────┘
```

---

## 5. The Finale Generalization Mandate

The official portal confirms:
> *"Use cases for evaluation will be provided during finale."*

This is a critical rule: **Judges will evaluate solutions on live, arbitrary websites that teams have never seen before.**

### Our Generalization Strategy:
1. **Dynamic Heuristic & Vision Grounding:** No hardcoded CSS selectors or site-specific scrapers.
2. **Universal DOM Sanitizer:** Recursively parses all form elements, standard input types (`password`, `email`, `tel`), ARIA labels, and text nodes.
3. **Class-Agnostic Visual Redaction:** BlazeFace ONNX model detects any human face regardless of image dimensions, zoom level, or site theme.
4. **Validation Suite:** During development, the pipeline is verified against 4 distinct test platforms: an e-commerce checkout flow, a government registration portal, a social media profile page, and a finance dashboard.
