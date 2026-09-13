/**
 * @privapilot/extension - Content Script In-Page Overlay HUD
 *
 * Renders prominent, high-visibility visual boundaries around inspected and targeted DOM elements
 * with real-time action feedback and clean post-action dismissal ("so after click it goes").
 */

export class OverlayRenderer {
  private overlayContainer: HTMLElement | null = null;
  private currentBox: HTMLElement | null = null;
  private clearTimer: any = null;
  private workingGlowEl: HTMLElement | null = null;
  private glowWatchdogTimer: any = null;

  ensureContainer(): HTMLElement {
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

  highlightTargetElement(el: HTMLElement, label: string = 'TARGET', durationMs: number = 1200): void {
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
  flashActionDispatched(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }

    if (this.currentBox && this.overlayContainer?.contains(this.currentBox)) {
      const box = this.currentBox;
      box.style.border = '2.5px solid #10b981';
      box.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      box.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.4), 0 0 25px rgba(16, 185, 129, 0.65)';

      const pill = box.querySelector('.privapilot-action-pill') as HTMLElement | null;
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

  private dismissBox(box: HTMLElement): void {
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

  clear(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    if (this.overlayContainer) {
      this.overlayContainer.innerHTML = '';
    }
    this.currentBox = null;
  }

  private ensureGlowStyles(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById('privapilot-glow-styles')) return;

    const style = document.createElement('style');
    style.id = 'privapilot-glow-styles';
    style.setAttribute('data-privapilot-ignore', 'true');
    style.textContent = `
      @keyframes privapilot-border-breathe {
        0% {
          box-shadow:
            inset 0 0 45px 10px rgba(30, 64, 175, 0.42),
            inset 0 0 16px 2px rgba(96, 165, 250, 0.65),
            inset 0 2.5px 6px 1px rgba(191, 219, 254, 0.9);
          border-top-color: rgba(191, 219, 254, 0.95);
          opacity: 0.88;
        }
        50% {
          box-shadow:
            inset 0 0 75px 18px rgba(37, 99, 235, 0.65),
            inset 0 0 28px 5px rgba(96, 165, 250, 0.88),
            inset 0 2.5px 10px 2px rgba(255, 255, 255, 0.98);
          border-top-color: rgba(255, 255, 255, 1);
          opacity: 1;
        }
        100% {
          box-shadow:
            inset 0 0 45px 10px rgba(30, 64, 175, 0.42),
            inset 0 0 16px 2px rgba(96, 165, 250, 0.65),
            inset 0 2.5px 6px 1px rgba(191, 219, 254, 0.9);
          border-top-color: rgba(191, 219, 254, 0.95);
          opacity: 0.88;
        }
      }

      @keyframes privapilot-dot-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.8;
        }
        50% {
          transform: scale(1.35);
          opacity: 1;
          box-shadow: 0 0 10px #60a5fa;
        }
      }

      .privapilot-working-glow {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 2147483646 !important;
        box-sizing: border-box !important;
        border-top: 2.5px solid rgba(191, 219, 254, 0.95) !important;
        border-bottom: 2px solid rgba(59, 130, 246, 0.75) !important;
        border-left: 2px solid rgba(59, 130, 246, 0.75) !important;
        border-right: 2px solid rgba(59, 130, 246, 0.75) !important;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.28) 0%, rgba(29, 78, 216, 0.12) 35%, transparent 70%),
          radial-gradient(ellipse at 50% 100%, rgba(59, 130, 246, 0.2) 0%, rgba(29, 78, 216, 0.08) 35%, transparent 70%),
          radial-gradient(ellipse at 0% 50%, rgba(37, 99, 235, 0.2) 0%, transparent 60%),
          radial-gradient(ellipse at 100% 50%, rgba(37, 99, 235, 0.2) 0%, transparent 60%) !important;
        animation: privapilot-border-breathe 2.4s ease-in-out infinite !important;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .privapilot-badge-pill {
        position: fixed !important;
        top: 12px !important;
        right: 18px !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        background: rgba(10, 15, 30, 0.88) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1px solid rgba(96, 165, 250, 0.5) !important;
        color: #e0f2fe !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        padding: 5px 12px !important;
        border-radius: 9999px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.45) !important;
        letter-spacing: 0.3px !important;
      }

      .privapilot-pulse-dot {
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: #60a5fa !important;
        box-shadow: 0 0 6px #3b82f6 !important;
        animation: privapilot-dot-pulse 1.6s ease-in-out infinite !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  showAgentWorkingGlow(label: string = 'PrivaPilot Agent Active'): void {
    if (typeof document === 'undefined' || !document.body) return;
    this.ensureGlowStyles();

    if (this.glowWatchdogTimer) {
      clearTimeout(this.glowWatchdogTimer);
    }

    if (!this.workingGlowEl || !document.body.contains(this.workingGlowEl)) {
      const glow = document.createElement('div');
      glow.id = 'privapilot-working-border';
      glow.className = 'privapilot-overlay privapilot-working-glow';
      glow.setAttribute('data-privapilot-ignore', 'true');
      glow.setAttribute('aria-hidden', 'true');

      const badge = document.createElement('div');
      badge.className = 'privapilot-overlay privapilot-badge-pill';
      badge.setAttribute('data-privapilot-ignore', 'true');
      badge.setAttribute('aria-hidden', 'true');

      const dot = document.createElement('span');
      dot.className = 'privapilot-pulse-dot';
      dot.setAttribute('data-privapilot-ignore', 'true');

      const text = document.createElement('span');
      text.className = 'privapilot-badge-text';
      text.textContent = label;
      text.setAttribute('data-privapilot-ignore', 'true');

      badge.appendChild(dot);
      badge.appendChild(text);
      glow.appendChild(badge);

      glow.style.opacity = '0';
      document.body.appendChild(glow);
      void glow.offsetHeight;
      glow.style.opacity = '1';

      this.workingGlowEl = glow;
    } else {
      this.workingGlowEl.style.opacity = '1';
      const text = this.workingGlowEl.querySelector('.privapilot-badge-text');
      if (text) text.textContent = label;
    }

    // Auto-dismiss watchdog after 45 seconds
    this.glowWatchdogTimer = setTimeout(() => {
      this.hideAgentWorkingGlow();
    }, 45000);
  }

  hideAgentWorkingGlow(): void {
    if (this.glowWatchdogTimer) {
      clearTimeout(this.glowWatchdogTimer);
      this.glowWatchdogTimer = null;
    }

    if (this.workingGlowEl) {
      const el = this.workingGlowEl;
      el.style.transition = 'opacity 0.28s ease-out';
      el.style.opacity = '0';
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        if (this.workingGlowEl === el) {
          this.workingGlowEl = null;
        }
      }, 300);
    }
  }
}

