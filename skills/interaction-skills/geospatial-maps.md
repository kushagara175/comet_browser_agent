---
name: geospatial-maps
description: Interaction skill for manipulating WebGL and 2D canvas map viewports (OpenLayers, Leaflet, Mapbox, ISRO Bhuvan) via Set-of-Marks and coordinate actions.
version: 1.0.0
---

# Geospatial Map Interaction Skill

Modern web mapping engines (OpenLayers, Leaflet, Mapbox GL, Cesium) render map tiles and vectors inside an HTML5 `<canvas>` element. Because individual geographical features (rivers, roads, markers) do not exist as standard HTML DOM elements, standard DOM selectors cannot be used directly on the map surface.

This skill equips the PrivaPilot agent with visual and coordinate-level primitives to interact with map surfaces accurately.

---

## 1. Canvas Recognition & Surface Grounding

1. **Map Surface Identification**:
   - The perception engine identifies map canvases by inspecting:
     - `role="application"`, `role="region"` with `aria-label="Map"`.
     - Container classes: `.ol-viewport`, `.leaflet-container`, `.mapboxgl-map`, `#mapCanvas`, `#cesiumContainer`.
2. **Set-of-Marks (SoM) on Overlaid UI**:
   - Navigation controls (zoom in `+`, zoom out `-`, compass, fullscreen, layer panel toggles) sit in the DOM layer *above* the canvas.
   - The sanitizer overlays numbered badges `[1]`, `[2]` on these controls so the LLM can click them directly via `targetLocalId`.

---

## 2. Interaction Primitives on Maps

### A. Panning the Map
- **Relative Coordinate Drag**:
  - To pan North/South/East/West, call `drag_and_drop` with normalized coordinate offsets:
  - Example: Drag from center `[0.5, 0.5]` to `[0.5, 0.3]` to pan downward (moving viewport North).
- **Arrow Key Panning**:
  - When the map container has focus, call `press_key` with `'ArrowUp'`, `'ArrowDown'`, `'ArrowLeft'`, or `'ArrowRight'`.

### B. Zooming
- **Zoom Buttons**: Prefer clicking the dedicated `[+]` or `[-]` zoom controls.
- **Double Click**: Call `click` with `clickCount: 2` on the target location on the canvas.
- **Scroll Wheel**: Call `scroll` with `targetLocalId: "el_map_canvas"` to zoom smoothly.

### C. Pinpointing & Inspecting Map Markers
1. When a search is performed, the map places a pin icon at the resolved coordinates.
2. Call `click` or `hover` directly on the marker or its numbered badge to open the location info popup.
3. Call `extract_data` on the opened popup to retrieve coordinates, elevation, district, and state details.

---

## 3. Resilience & Anti-Stall Guidelines
- Canvas-based map rendering occurs asynchronously via WebGL shaders.
- Allow 500–1200ms between map pans for tile servers to load high-resolution imagery before extracting visual observations.
- Never confuse a transient loading spinner on the map canvas with a broken task.
