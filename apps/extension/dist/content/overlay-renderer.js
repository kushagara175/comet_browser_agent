/**
 * @privapilot/extension - Content Script In-Page Overlay HUD
 *
 * Renders subtle visual boundaries around inspected and targeted DOM elements.
 */
export class OverlayRenderer {
    overlayContainer = null;
    ensureContainer() {
        if (!this.overlayContainer) {
            this.overlayContainer = document.createElement('div');
            this.overlayContainer.id = 'privapilot-hud-overlay-root';
            this.overlayContainer.style.position = 'fixed';
            this.overlayContainer.style.top = '0';
            this.overlayContainer.style.left = '0';
            this.overlayContainer.style.width = '100vw';
            this.overlayContainer.style.height = '100vh';
            this.overlayContainer.style.pointerEvents = 'none';
            this.overlayContainer.style.zIndex = '2147483647';
            document.body.appendChild(this.overlayContainer);
        }
        return this.overlayContainer;
    }
    highlightTargetElement(el, label = 'TARGET') {
        const root = this.ensureContainer();
        root.innerHTML = ''; // Clear previous highlight
        const rect = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.left = `${rect.left}px`;
        box.style.top = `${rect.top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        box.style.border = '2px solid #10b981';
        box.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        box.style.borderRadius = '4px';
        box.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
        box.style.transition = 'all 0.2s ease-in-out';
        const pill = document.createElement('span');
        pill.innerText = `PrivaPilot: ${label}`;
        pill.style.position = 'absolute';
        pill.style.top = '-20px';
        pill.style.left = '0';
        pill.style.background = '#10b981';
        pill.style.color = '#ffffff';
        pill.style.fontSize = '10px';
        pill.style.fontWeight = 'bold';
        pill.style.padding = '2px 6px';
        pill.style.borderRadius = '3px';
        pill.style.fontFamily = 'monospace';
        box.appendChild(pill);
        root.appendChild(box);
        // Auto-clear after 2.5 seconds
        setTimeout(() => {
            if (root.contains(box)) {
                root.removeChild(box);
            }
        }, 2500);
    }
    clear() {
        if (this.overlayContainer) {
            this.overlayContainer.innerHTML = '';
        }
    }
}
//# sourceMappingURL=overlay-renderer.js.map