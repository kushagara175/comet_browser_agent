---
name: universal-tools-spec
description: Comprehensive specification of all atomic tools and agent skills callable by the PrivaPilot multimodal browser agent.
version: 1.0.0
---

# Universal Browser Agent Tools & Skills Specification

This document defines the complete catalog of tools and skills that the PrivaPilot autonomous browser agent uses to navigate, interact with, extract from, and solve tasks across any web portal.

The LLM brain (Mistral-Large-3 / VLM) selects and calls these tools directly during each perception-action loop based on the sanitized visual viewport (Set-of-Marks badges) and DOM element tokens.

---

## 1. Tool Taxonomy Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AGENT TOOL TAXONOMY                             │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ 1. Navigation     │ 2. Interaction    │ 3. Spatial & Viewport          │
│ • navigate        │ • click           │ • scroll                       │
│ • manage_tab      │ • type            │ • zoom                         │
│ • go_back/forward │ • hover           │ • map_pan / map_zoom           │
│ • refresh         │ • select_option   │ • scroll_into_view             │
│                   │ • drag_and_drop   │                                │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 4. Forms & Files  │ 5. Data & QA      │ 6. Safety & Workflow           │
│ • fill_form       │ • extract_data    │ • request_user_confirmation    │
│ • upload_file     │ • extract_table   │ • request_user_input           │
│ • download_file   │ • inspect_element │ • wait                         │
│                   │ • finish (answer) │ • batch                        │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

---

## 2. Exhaustive Tool Definitions

### A. Navigation & Tab Management

#### 1. `navigate`
- **Purpose**: Load a target URL, open a new destination, or switch to a required web portal.
- **Parameters**:
  - `url` (string, required): Full destination URL (e.g., `https://bhuvan.nrsc.gov.in` or `https://sih.gov.in`).
  - `createNewTab` (boolean, optional): Whether to open in a new browser tab or current active tab. Default: `false`.
- **Preconditions**: Sanitized network boundary verifies URL is valid HTTP/HTTPS scheme.
- **Expected Outcome**: Tab navigates, page loads, new visual snapshot generated.

#### 2. `manage_tab`
- **Purpose**: Multi-tab orchestration (switch between search results, comparison portals, or documentation).
- **Parameters**:
  - `action`: `'new'` | `'switch'` | `'close'` | `'list'`.
  - `tabId` (number, optional): Target tab ID to switch to or close.
- **Expected Outcome**: Active tab updated or new tab focused.

---

### B. Core DOM Interaction Tools

#### 3. `click`
- **Purpose**: Activate interactive elements (buttons, links, checkboxes, radio buttons, navigation tabs, canvas targets).
- **Parameters**:
  - `targetLocalId` (string, required): Identifier of target element (e.g. `el_14`) or Set-of-Marks numeric ID (`[14]`).
  - `coordinates` ([number, number], optional): Normalized `[x, y]` relative coordinates `(0.0 - 1.0)` for canvas clicks or icon regions lacking explicit DOM nodes.
  - `pressEnter` (boolean, optional): Send Enter key following click if required.
- **Execution Mechanism**:
  1. AI Ghost Cursor glides organically via cubic Bézier trajectory with Ken Perlin Smootherstep velocity.
  2. Micro-overshoot (3–8px) simulates human biomechanics.
  3. Dispatches full event chain (`pointerdown` $\to$ `mousedown` $\to$ `focus` $\to$ `pointerup` $\to$ `mouseup` $\to$ `click`).
- **Postcondition**: Element activated; DOM or URL mutated.

#### 4. `type`
- **Purpose**: Enter text into `<input>`, `<textarea>`, or `[contenteditable]` elements (search bars, filter inputs, login fields).
- **Parameters**:
  - `targetLocalId` (string, required): ID of target input field.
  - `textToType` (string, required): String to enter.
  - `pressEnter` (boolean, optional): Automatically press `Enter` to submit the form/search. Default: `false`.
  - `clearFirst` (boolean, optional): Clear existing field content before typing. Default: `true`.
- **Execution Mechanism**:
  - Focuses target element.
  - Invokes native HTML prototype value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) to bypass React 16+ fibers, Vue 3 proxies, and Angular change detectors.
  - Dispatches Gaussian-cadence `InputEvent('input', { bubbles: true })` and `change` event.
- **Postcondition**: Field value updated; `value_present` verified.

#### 5. `hover`
- **Purpose**: Reveal flyout navigation menus, tooltips, preview cards, or map pin popups.
- **Parameters**:
  - `targetLocalId` (string, required): Target element to hover over.
  - `coordinates` ([number, number], optional): Target position.
- **Execution Mechanism**:
  - Glides cursor to element and triggers `pointerenter` $\to$ `mouseover` $\to$ `mousemove`.
- **Postcondition**: Flyout menu or tooltip rendered.

#### 6. `select_option`
- **Purpose**: Select options from native `<select>` dropdowns or custom ARIA comboboxes/listboxes.
- **Parameters**:
  - `targetLocalId` (string, required): Target select element or combobox.
  - `selectOptionValue` (string, required): Option value or visible text to select.
- **Postcondition**: Option selected; `select_changed` verified.

#### 7. `drag_and_drop`
- **Purpose**: Drag sliders, reorder Kanban cards, move map pins, or perform drag-to-dismiss actions.
- **Parameters**:
  - `targetLocalId` (string, required): Drag source element.
  - `destinationLocalId` (string, optional): Drop target element.
  - `coordinates` ([number, number], optional): Destination coordinate offset.
- **Execution Mechanism**:
  - Dispatches synthetic HTML5 `DataTransfer` sequence (`dragstart` $\to$ `dragenter` $\to$ `dragover` $\to$ `drop` $\to$ `dragend`).

---

### C. Viewport & Spatial Exploration Tools

#### 8. `scroll`
- **Purpose**: Pan the viewport or an inner scrollable container (e.g. data table, modal drawer, sidebar feed).
- **Parameters**:
  - `scrollDirection`: `'up'` | `'down'` | `'top'` | `'bottom'`.
  - `targetLocalId` (string, optional): Specific container element to scroll. If omitted, scrolls the window.
- **Execution Mechanism**:
  - Dispatches smooth wheel events or `scrollBy({ top: delta, behavior: 'smooth' })`.
- **Postcondition**: `scroll_changed` verified; new visual elements exposed.

#### 9. `map_control` (Geospatial Map Skill)
- **Purpose**: Specialized tool for geospatial map surfaces (ISRO Bhuvan, OpenLayers, Leaflet, Mapbox, Google Maps).
- **Parameters**:
  - `action`: `'pan'` | `'zoom_in'` | `'zoom_out'` | `'search_location'` | `'toggle_layer'`.
  - `query` (string, optional): Place or city name (e.g. `"Bengaluru"`, `"Sriharikota"`).
  - `targetLocalId` (string, optional): Search box or layer control button.
  - `coordinates` ([number, number], optional): Relative pan direction vector.
- **Execution Mechanism**:
  - Interacts with map canvas or executes map search bar with autocomplete suggestion drill-down.
- **Postcondition**: Map centers on location; tile coordinates updated.

---

### D. Data Extraction & Web Slicing Tools

#### 10. `extract_data`
- **Purpose**: Extract clean structured tabular data, problem statements, product cards, or articles from the page.
- **Parameters**:
  - `targetLocalId` (string, optional): Container or table element.
  - `instruction` (string, required): Description of fields or rows to extract (e.g. `"Extract all 2026 problem statements with Organization, Title, and Category"`).
- **Execution Mechanism**:
  - Traverses DOM nodes, parses table rows (`<tr>`, `<td>`, `<th>`) or flex/grid card items.
  - Returns structured markdown tables or JSON records to the LLM.
- **Postcondition**: Substantive data captured into evidence ledger.

#### 11. `upload_file`
- **Purpose**: Attach documents, resumes, images, or data files to `<input type="file">` elements.
- **Parameters**:
  - `targetLocalId` (string, required): File input element.
  - `fileName` (string, required): File name.
  - `fileData` (string, optional): Base64 encoded file content or vault reference.
- **Postcondition**: File attached to input via synthetic `DataTransfer` file list.

---

### E. Safety, Human-in-the-Loop & Completion Tools

#### 12. `request_user_input`
- **Purpose**: Pause execution to prompt the user when essential information is missing (e.g., custom search parameters, personal preference, 2FA OTP code, CAPTCHA).
- **Parameters**:
  - `userInputPrompt` (string, required): User-facing question displayed in the sidepanel.
  - `inputKey` (string, optional): Identifier for the requested field (e.g. `"otp_code"`, `"destination"`).
- **Execution Mechanism**:
  - Transitions coordinator to `awaiting-user-input`, highlights input in sidepanel HUD.
  - Resumes execution loop when user submits response.

#### 13. `request_user_confirmation`
- **Purpose**: Human-in-the-loop safety barrier before executing irreversible or sensitive actions (payments, form submissions, account deletions, password changes).
- **Parameters**:
  - `rationale` (string, required): Plain-language explanation of why approval is required.
- **Execution Mechanism**:
  - Displays amber warning modal in sidepanel with "Approve" and "Deny" buttons.
  - Prevents automated execution until explicit human authorization is granted.

#### 14. `finish`
- **Purpose**: Conclude the run when all user objectives are fully completed and verified.
- **Parameters**:
  - `reply` (string, required): Comprehensive markdown response summarizing the findings, extracted data, or confirmation of completed actions.
  - `rationale` (string, required): Summary of how the goal was satisfied.
- **Postcondition**: Run transitions to `complete`; response presented to user.

---

## 3. The Autonomous Perception-Action Loop

Every cycle follows a strict 4-step sequence:

```
Step 1: PERCEPTION
   ├── Local Offscreen Canvas captures viewport.
   ├── On-device regex & UltraFace redact PII.
   ├── Set-of-Marks overlays numbered badges [1], [2], [3] on all interactive elements.
   └── Sanitized image + tokens transmitted to Mistral-Large-3 on port 4501.

Step 2: DELIBERATION (Live Monologue)
   ├── LLM writes natural stream-of-consciousness monologue in `reasoning`.
   ├── Explains visual observations and strategic intent.
   └── Streamed live word-by-word (15-25ms) into the sidepanel thought drawer.

Step 3: ACTION SELECTION
   ├── LLM selects exactly one atomic tool call:
   │   { "kind": "type", "targetLocalId": "el_4", "textToType": "Bhuvan", "pressEnter": true }
   └── Validated against closed schema whitelist.

Step 4: EXECUTION & VERIFICATION
   ├── Dispatched via Chrome MV3 content script with Ghost Cursor animation.
   ├── Real page mutations observed (URL changed, DOM updated, modal opened).
   └── Cycle repeats until `finish` is called.
```
