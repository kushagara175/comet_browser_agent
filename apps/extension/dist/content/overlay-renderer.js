/**
 * @privapilot/extension - Content Script In-Page Overlay HUD
 *
 * Renders prominent, high-visibility visual boundaries around inspected and targeted DOM elements
 * with real-time action feedback and clean post-action dismissal ("so after click it goes").
 */
export class OverlayRenderer {
    overlayContainer = null;
    currentBox = null;
    clearTimer = null;
    ensureContainer() {
        if (!this.overlayContainer || !document.body.contains(this.overlayContainer)) {
            this.overlayContainer = document.createElement('div');
            this.overlayContainer.id = 'privapilot-hud-overlay-root';
            this.overlayContainer.className = 'privapilot-overlay privapilot-hud';
            this.overlayContainer.setAttribute('data-privapilot-ignore', 'true');
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
    highlightTargetElement(el, label = 'TARGET', durationMs = 1200) {
        const root = this.ensureContainer();
        this.clear();
        const rect = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'privapilot-overlay privapilot-target-box';
        box.setAttribute('data-privapilot-ignore', 'true');
        box.style.position = 'absolute';
        box.style.left = `${Math.max(0, rect.left - 2)}px`;
        box.style.top = `${Math.max(0, rect.top - 2)}px`;
        box.style.width = `${Math.max(12, rect.width + 4)}px`;
        box.style.height = `${Math.max(12, rect.height + 4)}px`;
        box.style.border = '2.5px solid #2563eb';
        box.style.backgroundColor = 'rgba(37, 99, 235, 0.14)';
        box.style.borderRadius = '6px';
        box.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.35), 0 0 20px rgba(37, 99, 235, 0.55)';
        box.style.pointerEvents = 'none';
        box.style.transition = 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)';
        box.style.opacity = '1';
        const pill = document.createElement('span');
        pill.className = 'privapilot-overlay privapilot-action-pill';
        pill.setAttribute('data-privapilot-ignore', 'true');
        const icon = label.toUpperCase().includes('TYPE') ? '✍️' : (label.toUpperCase().includes('CLICK') ? '⚡' : '🔍');
        pill.innerText = `${icon} PrivaPilot: ${label}`;
        pill.style.position = 'absolute';
        pill.style.top = rect.top > 28 ? '-24px' : '4px';
        pill.style.left = '0';
        pill.style.background = '#2563eb';
        pill.style.color = '#ffffff';
        pill.style.fontSize = '10.5px';
        pill.style.fontWeight = '700';
        pill.style.padding = '2px 8px';
        pill.style.borderRadius = '4px';
        pill.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)';
        pill.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        pill.style.pointerEvents = 'none';
        pill.style.whiteSpace = 'nowrap';
        box.appendChild(pill);
        root.appendChild(box);
        this.currentBox = box;
        if (durationMs > 0) {
            this.clearTimer = setTimeout(() => {
                this.dismissBox(box);
            }, durationMs);
        }
    }
    /**
     * Briefly flashes the target box green when the click/action is dispatched,
     * then smoothly fades out and dismisses ("so after click it goes").
     */
    flashActionDispatched() {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
        if (this.currentBox && this.overlayContainer?.contains(this.currentBox)) {
            const box = this.currentBox;
            box.style.border = '2.5px solid #10b981';
            box.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            box.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.4), 0 0 25px rgba(16, 185, 129, 0.65)';
            const pill = box.querySelector('.privapilot-action-pill');
            if (pill) {
                pill.style.background = '#10b981';
                pill.innerText = '✓ PrivaPilot: DISPATCHED';
            }
            // Smooth fade-out after 160ms
            setTimeout(() => {
                this.dismissBox(box);
            }, 160);
        }
    }
    dismissBox(box) {
        box.style.transition = 'opacity 0.22s ease-out, transform 0.22s ease-out';
        box.style.opacity = '0';
        box.style.transform = 'scale(0.97)';
        setTimeout(() => {
            if (this.overlayContainer?.contains(box)) {
                this.overlayContainer.removeChild(box);
            }
            if (this.currentBox === box) {
                this.currentBox = null;
            }
        }, 240);
    }
    clear() {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
        if (this.overlayContainer) {
            this.overlayContainer.innerHTML = '';
        }
        this.currentBox = null;
    }
}
//# sourceMappingURL=overlay-renderer.js.map