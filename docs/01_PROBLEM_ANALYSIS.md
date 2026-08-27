# 01. Problem Analysis & Domain Context — SIH26171

## 1. Executive Summary & Problem Identity
- **Problem Statement ID:** `SIH26171`
- **Issuing Ministry/Organization:** 🇮🇳 **Indian Space Research Organisation (ISRO)**
- **Category:** Software | Miscellaneous (Space Technology & Autonomous Web Intelligence)
- **PS Type:** Dedicated Ministry Problem Statement (Fixed requirements, evaluated by ISRO scientists)
- **Key Target Portals:** Bhuvan (GIS & Satellite Imagery), MOSDAC (Meteorological & Oceanographic), VEDAS (Geo-spatial Visualization), Bhoonidhi (Open Earth Observation Data Hub).

---

## 2. Core Problem Breakdown

ISRO scientists, disaster management teams, and defense analysts repeatedly extract high-resolution satellite imagery (Cartosat, RISAT, Oceansat, INSAT-3D) across Indian geospatial portals. Currently, this workflow suffers from four fundamental bottlenecks:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                ISRO PORTAL BOTTLENECK MATRIX                             │
├───────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Bottleneck            │ Description & Operational Impact                                │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 1. Manual Complexity  │ 10+ nested dropdowns (satellite → sensor → band → resolution),  │
│                       │ date range selectors, cloud-cover threshold sliders, and        │
│                       │ interactive map boundary drawing. Consumes 30-60 mins/query.     │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 2. Air-Gapped Security│ ISRO/defense networks cannot transmit screen captures or data   │
│                       │ to external cloud LLM APIs (OpenAI, Anthropic, Google) due to   │
│                       │ sovereign data compliance and national security regulations.    │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 3. Canvas Maps (No DOM│ Bhuvan and VEDAS use WebGL/Leaflet/OpenLayers canvas viewports. │
│    Accessibility)     │ Traditional RPA/Selenium scripts fail because map features lack │
│                       │ inspectable HTML DOM nodes. Requires visual spatial grounding.  │
├───────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 4. Edge Hardware      │ Deployed on standard analyst laptops (e.g. 16GB RAM, standard    │
│    Constraints        │ i5/i7/Ryzen or Apple Silicon M-series) without data-center GPUs.│
│                       │ Inference must be ≤3B params, <4GB VRAM, and <800ms/step.       │
└───────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

## 3. Critical Clarification: "Offline" vs "Live Portals"

There is a frequent misconception about the term **"Offline"** in this hackathon problem statement:

```
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │                            AIR-GAP & NETWORK TAXONOMY                             │
  ├─────────────────────────────────────────┬────────────────────────────────────────┤
  │ What "Offline" DOES Mean (AI Layer)     │ What "Offline" DOES NOT Mean (Browser) │
  ├─────────────────────────────────────────┼────────────────────────────────────────┤
  │ • The VLM model weights reside locally  │ • It does NOT mean the browser has no  │
  │ • Image processing runs on local VRAM   │   network access to ISRO portals.      │
  │ • Planner, Cache, & SoM run 100% on-box │ • Queries are dynamic; images are      │
  │ • Zero outbound telemetry / Zero API key│   generated on-demand by ISRO backend. │
  └─────────────────────────────────────────┴────────────────────────────────────────┘
```

### The Hackathon Demo Defense Strategy (Network Safeguard)
During the hackathon Grand Finale, internet connections at jury tables can be unstable or Wi-Fi can be throttled.
- **Primary Mode:** Live connection to ISRO portal (`bhuvan.nrsc.gov.in` / `mosdac.gov.in`) with 100% local AI inference.
- **Fail-Safe Sandbox Mode (The Demo Savior):** A pre-recorded Playwright HAR/offline proxy server running on `localhost:8080` that mirrors the real Bhuvan interface. If live government servers are down or Wi-Fi drops, the agent seamlessly switches to the local sandbox while maintaining identical live visual UI behavior.

---

## 4. Key Success Criteria for Winning SIH

| Evaluation Criteria | Target Metric | Engineering Solution |
|---|---|---|
| **Autonomous Execution** | 100% End-to-end task completion | Natural language prompt → Downloaded GeoTIFF file |
| **Inference Latency** | < 800 ms per reasoning step | Quantized INT4 VLM (SmolVLM / Qwen2.5-VL) on Metal/CUDA |
| **Air-Gap Compliance** | 0 external network requests | Local Ollama/llama.cpp instance, verified by network inspector |
| **Visual Canvas Precision**| > 95% bounding box IoU | Set-of-Marks (SoM) + Normalized Coordinate Mapper |
| **Repetitive Speedup** | 45s (First run) → <8s (Cached run) | Deterministic Task-Graph Action Cache |
| **Self-Healing** | Auto-recovery from modals/popups | Perceptual hash (pHash) state verifier + DOM fallback |
