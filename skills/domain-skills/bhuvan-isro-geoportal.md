---
name: bhuvan-isro-geoportal
description: Domain skill for ISRO Bhuvan NextGen Map Viewer, geospatial searches, 2D/3D navigation, and satellite thematic layer inspection.
version: 1.0.0
---

# ISRO Bhuvan Geoportal & Geospatial Exploration Skill

This skill guides the autonomous agent when navigating, searching, and inspecting geospatial data on **ISRO Bhuvan** (`https://bhuvan.nrsc.gov.in`) and its NextGen 2D/3D map viewer (`/ngmaps`).

---

## 1. Domain Map & Key Routes

| Route | Purpose | Key Interactive Elements |
| :--- | :--- | :--- |
| `https://bhuvan.nrsc.gov.in` | Bhuvan Geoportal Home | NextGen Maps link, 2D/3D Viewer card, Thematic Services |
| `https://bhuvan.nrsc.gov.in/ngmaps` | NextGen Interactive Viewer | Search bar, Map Canvas, Layers drawer, Zoom controls |
| `https://bhuvan.nrsc.gov.in/thematic` | Thematic Services Portal | Disaster management, Land Use/Cover, Water bodies |

---

## 2. Interaction Playbook & Tool Sequencing

### A. Searching & Pinpointing Locations (e.g. "Locate Bengaluru on Bhuvan")
1. **Identify Search Input**:
   - Locate the primary search bar (typically labelled *"search bhuvan maps"*, *"Search Place/City"*, or `role="input"`).
2. **Execute Clean Search Tool Call**:
   - Call `type` tool: `{ "kind": "type", "targetLocalId": "el_search_input", "textToType": "Bengaluru", "pressEnter": true }`.
3. **Handle Autocomplete Suggestions**:
   - Bhuvan renders an autocomplete dropdown listbox below the search bar.
   - Do NOT stop after typing! The map does not center until the suggestion is clicked.
   - Call `click` tool on the matching suggestion item: `{ "kind": "click", "targetLocalId": "el_suggestion_1" }`.
4. **Verify Map Centering**:
   - Observe the updated URL hash (e.g. `#12.9716/77.5946`) or map canvas movement.

---

### B. Inspecting Thematic Satellite Layers & Overlays
1. **Open Layers Drawer**:
   - Look for the layer control button (icon with stacked squares or text *"Map Layers"*, *"Thematic"*, *"Overlays"*).
   - Call `click` tool: `{ "kind": "click", "targetLocalId": "el_layers_btn" }`.
2. **Toggle Specific Overlay**:
   - Locate the target checkbox or switch (e.g. *"LULC (Land Use / Land Cover)"*, *"Water Bodies"*, *"Satellite Imagery"*).
   - Call `click` tool on the specific checkbox.
3. **Verify Layer Rendering**:
   - Check that the overlay rendered on the canvas and extract layer metadata.

---

### C. Navigating 2D vs 3D Map Modes
1. When already on `/ngmaps`, the 2D/3D canvas is already active.
2. If the user asks to switch to 3D mode, locate the *"3D"* or *"Globe"* toggle button in the top-right toolbar and click it.
3. Use mouse drag actions (`drag_and_drop`) on the canvas container to rotate or tilt 3D terrain.

---

## 3. Strict Autonomous Directives (No Fake Hardcoded Bypasses)
- **Never claim a location is centered without clicking the suggestion or pressing enter.**
- **Never terminate early on the homepage**: If the user prompt requires exploring a map, navigate into the viewer and execute the search.
- **Explain actions naturally in the monologue**: Describe the city being searched, the layers observed, and why each tool is invoked.
