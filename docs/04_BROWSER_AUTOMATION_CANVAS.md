# 04. Browser Automation & Canvas Interaction — SIH26171

## 1. Playwright + Chrome DevTools Protocol (CDP) Architecture

Traditional Selenium scripts are slow, lack low-level input control, and cannot capture high-framerate accessibility trees. We use **Playwright (Python/TypeScript)** paired directly with **Chrome DevTools Protocol (CDP)** sessions for pixel-accurate viewport management and hardware-level mouse dispatching.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BROWSER CONTROL SUBSYSTEM                       │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Component                │ Implementation Details                      │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Engine                   │ Chromium Headed / Headless via Playwright   │
│ Viewport Standard        │ 1280x720 (1.0 Device Scale Factor)          │
│ CDP Session              │ `Page.accessibility.snapshot`, `Input.dispatch`│
│ Download Interceptor     │ `page.on('download', ...)` to local dir     │
│ Trace & Audit Recorder   │ Full CDP Screencast & Action Event Log      │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. In-DOM Set-of-Marks (SoM) Injection Engine

Instead of running heavy OpenCV bounding box detections over raw screenshot bitmaps, we inject lightweight CSS badges directly into the webpage DOM before capturing the screenshot. This guarantees 100% mathematical alignment between badge IDs and DOM selectors.

### JavaScript Injection Script
```javascript
// inject_som_badges.js
(() => {
  const interactiveSelectors = [
    'button', 'a[href]', 'input', 'select', 'textarea',
    '[role="button"]', '[role="checkbox"]', '[role="option"]',
    '[onclick]', '.clickable', 'canvas'
  ];

  let idCounter = 1;
  const elements = document.querySelectorAll(interactiveSelectors.join(','));
  const elementMap = {};

  // Remove existing badges
  document.querySelectorAll('.sih-som-badge').forEach(el => el.remove());

  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
      const badge = document.createElement('div');
      badge.className = 'sih-som-badge';
      badge.innerText = `${idCounter}`;
      badge.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        background: #e11d48;
        color: white;
        font-size: 11px;
        font-weight: bold;
        padding: 2px 5px;
        border-radius: 4px;
        z-index: 2147483647;
        pointer-events: none;
        border: 1px solid #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      `;
      document.body.appendChild(badge);

      elementMap[idCounter] = {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
      };
      idCounter++;
    }
  });

  return elementMap;
})();
```

---

## 3. WebGL / Leaflet Canvas Drag Interaction

For portals like Bhuvan where geographic regions (e.g. Assam / Brahmaputra basin) must be drawn on a WebGL canvas:

```python
async def execute_canvas_drag(page, start_x: float, start_y: float, end_x: float, end_y: float, steps: int = 15):
    """
    Executes a continuous smooth hardware mouse drag across a WebGL canvas.
    Discrete jumps often fail to register on WebGL event listeners; smooth steps are essential.
    """
    # 1. Hover to start coordinate
    await page.mouse.move(start_x, start_y)
    await page.wait_for_timeout(100)

    # 2. Press left mouse button down
    await page.mouse.down(button="left")
    await page.wait_for_timeout(100)

    # 3. Interpolate steps across the trajectory
    for i in range(1, steps + 1):
        curr_x = start_x + (end_x - start_x) * (i / steps)
        curr_y = start_y + (end_y - start_y) * (i / steps)
        await page.mouse.move(curr_x, curr_y)
        await page.wait_for_timeout(20)

    # 4. Release mouse
    await page.wait_for_timeout(100)
    await page.mouse.up(button="left")
```

---

## 4. Offline Sandbox & Mock Portal (The Live Demo Safety Net)

To ensure zero risk during live presentations:
1. **Playwright HAR Recording:** Record a live session on Bhuvan:
   ```bash
   npx playwright open https://bhuvan.nrsc.gov.in --save-har=bhuvan_session.har
   ```
2. **Local Replay Server:**
   Serve the saved HAR / HTML bundle on `http://localhost:8080` when running in disconnected demo mode:
   ```python
   # offline_portal_server.py
   from http.server import HTTPServer, SimpleHTTPRequestHandler
   import os

   class LocalPortalHandler(SimpleHTTPRequestHandler):
       def __init__(self, *args, **kwargs):
           super().__init__(*args, directory="mocks/bhuvan_static", **kwargs)

   if __name__ == '__main__':
       server = HTTPServer(('127.0.0.1', 8080), LocalPortalHandler)
       print("🚀 Offline Mock Bhuvan Server running on http://127.0.0.1:8080")
       server.serve_forever()
   ```
