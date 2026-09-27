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
  private cropBoxEl: HTMLElement | null = null;
  private cropBoxTimer: any = null;
  private scanBeamEl: HTMLElement | null = null;

  // Animated AI Ghost Cursor state
  private cursorEl: HTMLElement | null = null;
  private cursorDismissTimer: any = null;
  private currentCursorX: number = typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 200;
  private currentCursorY: number = typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 200;
  private isAgentCursorActive: boolean = false;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;

  // In-Page Execution Safety Shield state
  private shieldEl: HTMLElement | null = null;
  private shieldWatchdogTimer: any = null;
  private boundShieldHandler: ((e: Event) => void) | null = null;
  private isShieldActive: boolean = false;

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
    this.cropBoxEl = null;
    this.hideCursor(0);
    this.disableSafetyShield();
  }

  /**
   * Highlights the specific captured region with an animated "rope / marching-ants" viewfinder border
   * for 2.5 - 3 seconds, giving the user immediate live visual proof of the cropped area.
   */
  highlightFocusedCropRegion(
    rect: { x: number; y: number; width: number; height: number; type?: string },
    durationMs: number = 3000
  ): void {
    if (typeof document === 'undefined' || !rect || rect.width <= 0 || rect.height <= 0) return;
    const root = this.ensureContainer();

    // Inject marching ants keyframes if not already present
    if (!document.getElementById('privapilot-crop-keyframes')) {
      const style = document.createElement('style');
      style.id = 'privapilot-crop-keyframes';
      style.textContent = `
        @keyframes privapilotMarchingAnts {
          0% { background-position: 0 0, 100% 0, 100% 100%, 0 100%; }
          100% { background-position: 24px 0, 100% 24px, calc(100% - 24px) 100%, 0 calc(100% - 24px); }
        }
      `;
      document.head.appendChild(style);
    }

    if (this.cropBoxTimer) {
      clearTimeout(this.cropBoxTimer);
      this.cropBoxTimer = null;
    }
    if (this.cropBoxEl && root.contains(this.cropBoxEl)) {
      root.removeChild(this.cropBoxEl);
      this.cropBoxEl = null;
    }

    const box = document.createElement('div');
    box.className = 'privapilot-overlay privapilot-crop-viewfinder';
    box.setAttribute('data-privapilot-ignore', 'true');
    box.style.position = 'absolute';
    box.style.left = `${Math.max(0, rect.x - 6)}px`;
    box.style.top = `${Math.max(0, rect.y - 6)}px`;
    box.style.width = `${rect.width + 12}px`;
    box.style.height = `${rect.height + 12}px`;
    box.style.borderRadius = '6px';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '2147483645';
    box.style.boxShadow = '0 0 0 1px rgba(56, 189, 248, 0.4), 0 8px 32px rgba(0, 0, 0, 0.4)';
    box.style.backgroundColor = 'rgba(15, 23, 42, 0.08)';

    // Authentic marching-ants dashed border using linear-gradients
    box.style.backgroundImage = `
      linear-gradient(90deg, #38bdf8 50%, transparent 50%),
      linear-gradient(180deg, #38bdf8 50%, transparent 50%),
      linear-gradient(270deg, #38bdf8 50%, transparent 50%),
      linear-gradient(0deg, #38bdf8 50%, transparent 50%)
    `;
    box.style.backgroundRepeat = 'repeat-x, repeat-y, repeat-x, repeat-y';
    box.style.backgroundSize = '16px 2px, 2px 16px, 16px 2px, 2px 16px';
    box.style.backgroundPosition = '0 0, 100% 0, 100% 100%, 0 100%';
    box.style.animation = 'privapilotMarchingAnts 0.8s linear infinite';
    box.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
    box.style.opacity = '1';

    // Top-left Viewfinder Pill
    const pill = document.createElement('div');
    pill.className = 'privapilot-overlay privapilot-crop-pill';
    pill.setAttribute('data-privapilot-ignore', 'true');
    const labelType = (rect.type || 'TASK AREA').toUpperCase();
    pill.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span>PrivaPilot: ${labelType} (${Math.round(rect.width)} × ${Math.round(rect.height)})</span>
    `;
    pill.style.position = 'absolute';
    pill.style.top = rect.y > 30 ? '-26px' : '4px';
    pill.style.left = '0';
    pill.style.display = 'flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '5px';
    pill.style.background = '#0f172a';
    pill.style.color = '#e2e8f0';
    pill.style.border = '1px solid rgba(56, 189, 248, 0.4)';
    pill.style.fontSize = '10px';
    pill.style.fontWeight = '600';
    pill.style.padding = '3px 8px';
    pill.style.borderRadius = '5px';
    pill.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
    pill.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    pill.style.pointerEvents = 'none';
    pill.style.whiteSpace = 'nowrap';

    // High-tech Corner brackets
    const bracketSize = 10;
    const bracketWidth = 2;
    const bracketColor = '#38bdf8';

    const corners = [
      { top: '-2px', left: '-2px', borderTop: `${bracketWidth}px solid ${bracketColor}`, borderLeft: `${bracketWidth}px solid ${bracketColor}` },
      { top: '-2px', right: '-2px', borderTop: `${bracketWidth}px solid ${bracketColor}`, borderRight: `${bracketWidth}px solid ${bracketColor}` },
      { bottom: '-2px', left: '-2px', borderBottom: `${bracketWidth}px solid ${bracketColor}`, borderLeft: `${bracketWidth}px solid ${bracketColor}` },
      { bottom: '-2px', right: '-2px', borderBottom: `${bracketWidth}px solid ${bracketColor}`, borderRight: `${bracketWidth}px solid ${bracketColor}` }
    ];

    corners.forEach((c) => {
      const cornerEl = document.createElement('div');
      cornerEl.setAttribute('data-privapilot-ignore', 'true');
      cornerEl.style.position = 'absolute';
      cornerEl.style.width = `${bracketSize}px`;
      cornerEl.style.height = `${bracketSize}px`;
      cornerEl.style.pointerEvents = 'none';
      Object.assign(cornerEl.style, c);
      box.appendChild(cornerEl);
    });

    box.appendChild(pill);
    root.appendChild(box);
    this.cropBoxEl = box;

    if (durationMs > 0) {
      this.cropBoxTimer = setTimeout(() => {
        if (this.cropBoxEl && root.contains(this.cropBoxEl)) {
          this.cropBoxEl.style.opacity = '0';
          this.cropBoxEl.style.transform = 'scale(0.98)';
          setTimeout(() => {
            if (this.cropBoxEl && root.contains(this.cropBoxEl)) {
              root.removeChild(this.cropBoxEl);
              this.cropBoxEl = null;
            }
          }, 320);
        }
      }, durationMs);
    }
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

      @keyframes privapilot-scan-sweep {
        0% {
          top: -6px;
          opacity: 0;
        }
        8% {
          opacity: 0.95;
        }
        88% {
          opacity: 0.95;
        }
        100% {
          top: 100vh;
          opacity: 0;
        }
      }

      .privapilot-scan-beam {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        width: 100vw !important;
        height: 3px !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.4) 15%, #38bdf8 50%, rgba(56, 189, 248, 0.4) 85%, transparent 100%) !important;
        box-shadow: 0 0 16px 4px rgba(56, 189, 248, 0.8), 0 0 32px 8px rgba(37, 99, 235, 0.5) !important;
        animation: privapilot-scan-sweep 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
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
        display: none !important;
      }

      .privapilot-pulse-dot {
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: #60a5fa !important;
        box-shadow: 0 0 6px #3b82f6 !important;
        animation: privapilot-dot-pulse 1.6s ease-in-out infinite !important;
      }

      /* Realistic Human AI Cursor */
      .privapilot-agent-cursor {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        opacity: 0;
        transition: opacity 0.25s ease-out;
        will-change: transform, opacity;
        filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 6px rgba(59, 130, 246, 0.45));
      }

      .privapilot-cursor-icon {
        display: block !important;
        transform-origin: 0 0;
        transition: transform 0.08s ease-out;
      }

      .privapilot-cursor-pressing .privapilot-cursor-icon {
        transform: scale(0.82) translate(1px, 1px) !important;
      }

      .privapilot-cursor-badge {
        position: absolute !important;
        top: 18px !important;
        left: 18px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        background: rgba(15, 23, 42, 0.92) !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        color: #f1f5f9 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        letter-spacing: 0.2px !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
      }

      .privapilot-cursor-badge-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #60a5fa !important;
        line-height: 1 !important;
      }

      .privapilot-cursor-badge-icon svg {
        display: block !important;
      }

      .privapilot-cursor-ripple {
        position: absolute !important;
        top: 1px !important;
        left: 1px !important;
        width: 6px !important;
        height: 6px !important;
        border-radius: 50% !important;
        border: 2px solid #38bdf8 !important;
        pointer-events: none !important;
        transform: translate(-50%, -50%) scale(0.2) !important;
        opacity: 0 !important;
      }

      .privapilot-cursor-ripple.privapilot-ripple-active {
        animation: privapilot-human-ripple 0.38s cubic-bezier(0.1, 0.8, 0.2, 1) forwards !important;
      }

      @keyframes privapilot-human-ripple {
        0% {
          opacity: 0.9;
          transform: translate(-50%, -50%) scale(0.3);
          border-color: #38bdf8;
          box-shadow: 0 0 6px #38bdf8;
        }
        50% {
          border-color: #34d399;
          box-shadow: 0 0 10px #34d399;
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(4.2);
          border-color: #34d399;
        }
      }

      /* In-Page Execution Safety Shield */
      .privapilot-shield-root {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483645 !important;
        pointer-events: auto !important;
        cursor: wait !important;
        background: rgba(15, 23, 42, 0.05) !important;
        backdrop-filter: blur(0.5px) !important;
        -webkit-backdrop-filter: blur(0.5px) !important;
        transition: opacity 0.2s ease !important;
      }

      .privapilot-shield-hud {
        position: fixed !important;
        top: 14px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        background: rgba(10, 15, 30, 0.94) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1.5px solid rgba(59, 130, 246, 0.8) !important;
        color: #f0f9ff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 6px 16px !important;
        border-radius: 9999px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 20px rgba(59, 130, 246, 0.5) !important;
        letter-spacing: 0.3px !important;
        user-select: none !important;
        pointer-events: auto !important;
      }

      .privapilot-shield-pulse-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #38bdf8 !important;
        box-shadow: 0 0 8px #38bdf8 !important;
        animation: privapilot-dot-pulse 1.2s ease-in-out infinite !important;
      }

      .privapilot-shield-esc-badge {
        background: rgba(59, 130, 246, 0.25) !important;
        border: 1px solid rgba(96, 165, 250, 0.5) !important;
        border-radius: 4px !important;
        padding: 1px 6px !important;
        font-size: 10px !important;
        color: #93c5fd !important;
        margin-left: 4px !important;
        font-family: monospace !important;
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

      glow.style.opacity = '0';
      document.body.appendChild(glow);
      void glow.offsetHeight;
      glow.style.opacity = '1';

      this.workingGlowEl = glow;
    } else {
      this.workingGlowEl.style.opacity = '1';
    }

    // Auto-dismiss watchdog after 45 seconds
    this.glowWatchdogTimer = setTimeout(() => {
      this.hideAgentWorkingGlow();
    }, 45000);
    if (this.glowWatchdogTimer && typeof this.glowWatchdogTimer.unref === 'function') {
      this.glowWatchdogTimer.unref();
    }
  }

  /**
   * Refreshes the visual scanning beam whenever the page scene is scanned / DOM snapshot is taken.
   * Keeps the ambient blue glow steady without tearing it down, providing an authentic scan pulse.
   */
  triggerScanSweep(): void {
    if (typeof document === 'undefined' || !document.body) return;
    this.ensureGlowStyles();

    // Ensure ambient working glow remains alive
    this.showAgentWorkingGlow();

    // Remove any previous active beam
    if (this.scanBeamEl && document.body.contains(this.scanBeamEl)) {
      this.scanBeamEl.remove();
      this.scanBeamEl = null;
    }

    const beam = document.createElement('div');
    beam.id = 'privapilot-scan-beam';
    beam.className = 'privapilot-overlay privapilot-scan-beam';
    beam.setAttribute('data-privapilot-ignore', 'true');
    beam.setAttribute('aria-hidden', 'true');

    document.body.appendChild(beam);
    this.scanBeamEl = beam;

    setTimeout(() => {
      if (this.scanBeamEl === beam) {
        if (beam.parentNode) beam.parentNode.removeChild(beam);
        this.scanBeamEl = null;
      }
    }, 1000);
  }

  hideAgentWorkingGlow(): void {
    if (this.glowWatchdogTimer) {
      clearTimeout(this.glowWatchdogTimer);
      this.glowWatchdogTimer = null;
    }

    if (this.scanBeamEl) {
      if (this.scanBeamEl.parentNode) {
        this.scanBeamEl.parentNode.removeChild(this.scanBeamEl);
      }
      this.scanBeamEl = null;
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

  /**
   * Minimal SVG action icons (no tacky emojis).
   */
  private static readonly MINIMAL_ICONS: Record<string, string> = {
    CLICK: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><path d="M8 1v2.5M8 12.5v2.5M1 8h2.5M12.5 8h2.5"/></svg>',
    TYPE: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5zM3 13.5h10"/></svg>',
    SELECT: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg>',
    HOVER: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="2.5"/><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/></svg>',
    SCROLL: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
    UPLOAD: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 11V3M5 6l3-3 3 3M3 13h10"/></svg>',
    DRAG: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h6M5 8h6M5 13h6"/></svg>'
  };

  /**
   * Ensures the visual AI agent cursor element exists in the DOM.
   */
  ensureCursor(): HTMLElement {
    if (!this.cursorEl || !document.body.contains(this.cursorEl)) {
      this.ensureGlowStyles();
      const cursor = document.createElement('div');
      cursor.id = 'privapilot-agent-cursor';
      cursor.className = 'privapilot-overlay privapilot-agent-cursor';
      cursor.setAttribute('data-privapilot-ignore', 'true');
      cursor.setAttribute('aria-hidden', 'true');

      cursor.innerHTML = `
        <svg class="privapilot-cursor-icon privapilot-cursor-hand" viewBox="0 0 24 24" width="22" height="22" style="display: block; overflow: visible;">
          <path d="M 8.5 2.5 C 7.4 2.5 6.5 3.4 6.5 4.5 L 6.5 11.5 L 5 10 C 4.1 9.1 2.7 9.1 1.8 10 C 0.9 10.9 0.9 12.3 1.8 13.2 L 6 17.5 C 7.5 19 9.5 20.5 12 20.5 L 15.5 20.5 C 18.5 20.5 19.5 18.5 19.5 15.5 L 19.5 9 C 19.5 7.9 18.6 7 17.5 7 C 17 7 16.2 7.2 15.8 7.5 L 15.8 6.5 C 15.8 5.4 14.9 4.5 13.8 4.5 C 13.3 4.5 12.6 4.7 12.2 5 L 12.2 4.5 C 12.2 3.4 11.3 2.5 10.2 2.5 C 9.7 2.5 9 2.7 8.5 2.5 Z"
                fill="#0f172a" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
        <svg class="privapilot-cursor-icon privapilot-cursor-caret" viewBox="0 0 24 24" width="18" height="18" style="display: none; overflow: visible;">
          <path d="M 6 3 L 14 3 M 10 3 L 10 19 M 6 19 L 14 19"
                fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
          <path d="M 6 3 L 14 3 M 10 3 L 10 19 M 6 19 L 14 19"
                fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
        </svg>
        <div class="privapilot-overlay privapilot-cursor-ripple" data-privapilot-ignore="true"></div>
        <div class="privapilot-overlay privapilot-cursor-badge" data-privapilot-ignore="true">
          <span class="privapilot-cursor-badge-icon">${OverlayRenderer.MINIMAL_ICONS.CLICK}</span>
          <span class="privapilot-cursor-badge-text">Click</span>
        </div>
      `;

      cursor.style.transform = `translate3d(${Math.round(this.currentCursorX - 2.5)}px, ${Math.round(this.currentCursorY - 1.7)}px, 0)`;
      document.body.appendChild(cursor);

      this.cursorEl = cursor;

      if (typeof window !== 'undefined' && !this.boundMouseMove) {
        this.boundMouseMove = (e: MouseEvent) => {
          if (!this.isAgentCursorActive) {
            this.currentCursorX = e.clientX;
            this.currentCursorY = e.clientY;
          }
        };
        try {
          window.addEventListener('mousemove', this.boundMouseMove, { passive: true, capture: true });
        } catch (_) {}
      }
    }
    return this.cursorEl;
  }

  /**
   * Switches the pointer shape to match human cursor conventions (arrow, link hand, text caret).
   */
  setCursorPointerType(type: 'arrow' | 'hand' | 'caret'): void {
    if (!this.cursorEl) return;
    const hand = this.cursorEl.querySelector('.privapilot-cursor-hand') as HTMLElement | null;
    const caret = this.cursorEl.querySelector('.privapilot-cursor-caret') as HTMLElement | null;
    // Arrow is removed — hand is default for all navigation/reading/clicking actions
    if (hand) hand.style.display = type === 'caret' ? 'none' : 'block';
    if (caret) caret.style.display = type === 'caret' ? 'block' : 'none';
  }

  private updateCursorBadge(actionKind: string, extraText?: string, targetEl?: HTMLElement): void {
    if (!this.cursorEl) return;
    const iconEl = this.cursorEl.querySelector('.privapilot-cursor-badge-icon');
    const textEl = this.cursorEl.querySelector('.privapilot-cursor-badge-text');

    const kindUpper = (actionKind || 'CLICK').toUpperCase();
    let svgIcon = OverlayRenderer.MINIMAL_ICONS.CLICK;
    let label = 'Click';

    if (kindUpper.includes('TYPE')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.TYPE;
      const targetSemantics = targetEl ? `${targetEl.getAttribute?.('type') || ''} ${targetEl.getAttribute?.('name') || ''} ${targetEl.id || ''} ${targetEl.getAttribute?.('placeholder') || ''}`.toLowerCase() : '';
      const isSensitiveField = /password|email|phone|card|cvv|pin|ssn|aadhar|aadhaar|name|secret|token/i.test(targetSemantics);
      const isSensitiveText = extraText && (
        /@/i.test(extraText) ||
        /\b(?:password|secret|token|credential|key)\b/i.test(extraText) ||
        /^[0-9\s-]{12,}$/.test(extraText)
      );

      if (extraText && !isSensitiveField && !isSensitiveText) {
        label = `Type "${extraText.slice(0, 20)}${extraText.length > 20 ? '...' : ''}"`;
      } else {
        label = 'Type';
      }
    } else if (kindUpper.includes('CLICK')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.CLICK;
      label = 'Click';
    } else if (kindUpper.includes('SELECT')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.SELECT;
      label = 'Select';
    } else if (kindUpper.includes('HOVER')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.HOVER;
      label = 'Hover';
    } else if (kindUpper.includes('SCROLL')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.SCROLL;
      label = 'Scroll';
    } else if (kindUpper.includes('UPLOAD')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.UPLOAD;
      label = 'Upload';
    } else if (kindUpper.includes('DRAG')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.DRAG;
      label = 'Drag';
    }

    if (iconEl) iconEl.innerHTML = svgIcon;
    if (textEl) textEl.textContent = label;
  }

  /**
   * Computes the exact interactive target point (screen coordinates) for an element,
   * accounting for element semantics (buttons, text inputs, links) and cursor hotspot tip offsets.
   */
  computeTargetPoint(el: HTMLElement, cursorType: 'arrow' | 'hand' | 'caret'): {
    targetX: number;
    targetY: number;
    containerX: number;
    containerY: number;
  } {
    const rect = el.getBoundingClientRect();
    const tagName = (el.tagName || '').toUpperCase();
    const role = (el.getAttribute?.('role') || '').toLowerCase();
    const type = (el.getAttribute?.('type') || '').toLowerCase();
    const isTextInput =
      tagName === 'TEXTAREA' ||
      (tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)) ||
      Boolean((el as any).isContentEditable);
    const isClickable =
      tagName === 'BUTTON' ||
      tagName === 'A' ||
      role === 'button' ||
      role === 'link' ||
      role === 'tab' ||
      role === 'menuitem' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'checkbox' ||
      type === 'radio';

    let targetX: number;
    let targetY: number;

    if (isTextInput) {
      // Natural typing entry point: comfortable indentation inside text box, vertically centered
      const leftPad = Math.min(Math.max(rect.width * 0.08, 12), 40);
      targetX = Math.round(rect.left + leftPad);
      targetY = Math.round(rect.top + rect.height * 0.5);
    } else if (isClickable) {
      // Buttons, links, tabs, checkboxes: pinpoint center of the interactable element
      targetX = Math.round(rect.left + rect.width * 0.5);
      targetY = Math.round(rect.top + rect.height * 0.5);
    } else {
      // General elements: comfortable top-left / center balance
      targetX = Math.round(rect.left + Math.min(rect.width * 0.5, 120));
      targetY = Math.round(rect.top + Math.min(rect.height * 0.5, 28));
    }

    // Hotspot offsets so the physical tip/caret lands precisely on (targetX, targetY)
    // Arrow: Tip is at SVG (3, 2) in 24x24 viewBox scaled to 20x20 -> (2.5px, 1.67px)
    // Hand: Tip of index finger is at SVG (8.5, 2.5) scaled to 20x20 -> (7.1px, 2.1px)
    // Caret: Center of I-beam is at SVG (10, 11) in 24x24 viewBox scaled to 18x18 -> (7.5px, 8.25px)
    let hotspotX = 2.5;
    let hotspotY = 1.7;
    if (cursorType === 'hand') {
      hotspotX = 7.1;
      hotspotY = 2.1;
    } else if (cursorType === 'caret') {
      hotspotX = 7.5;
      hotspotY = 8.25;
    }

    return {
      targetX,
      targetY,
      containerX: Math.round(targetX - hotspotX),
      containerY: Math.round(targetY - hotspotY)
    };
  }

  /**
   * Glides the cursor along a natural human curved trajectory to the target element
   * using Ken Perlin's Smootherstep velocity easing and live element tracking.
   */
  async glideCursorTo(
    el: HTMLElement,
    actionKind: string = 'CLICK',
    extraText?: string,
    durationMs?: number
  ): Promise<void> {
    if (typeof document === 'undefined' || !document.body) return;
    const cursor = this.ensureCursor();
    if (this.cursorDismissTimer) {
      clearTimeout(this.cursorDismissTimer);
      this.cursorDismissTimer = null;
    }
    this.isAgentCursorActive = true;

    const tagName = (el.tagName || '').toUpperCase();
    const role = (el.getAttribute?.('role') || '').toLowerCase();
    const type = (el.getAttribute?.('type') || '').toLowerCase();
    const isTextInput =
      tagName === 'TEXTAREA' ||
      (tagName === 'INPUT' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)) ||
      Boolean((el as any).isContentEditable);
    const isClickable =
      tagName === 'BUTTON' ||
      tagName === 'A' ||
      role === 'button' ||
      role === 'link' ||
      role === 'tab' ||
      role === 'menuitem' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'checkbox' ||
      type === 'radio';

    const pointerType: 'arrow' | 'hand' | 'caret' = isTextInput ? 'caret' : (isClickable ? 'hand' : 'arrow');
    this.setCursorPointerType(pointerType);
    this.updateCursorBadge(actionKind, extraText, el);

    // Make cursor visible
    cursor.style.opacity = '1';

    const initialPoint = this.computeTargetPoint(el, pointerType);
    const startX = this.currentCursorX;
    const startY = this.currentCursorY;
    const initialDx = initialPoint.targetX - startX;
    const initialDy = initialPoint.targetY - startY;
    const dist = Math.hypot(initialDx, initialDy);

    // Dynamic duration based on human movement distance: small move ~240ms, long move ~420ms
    const totalDuration = durationMs !== undefined
      ? durationMs
      : Math.min(Math.max(Math.round(220 + dist * 0.36), 260), 440);

    // Headless test or instantaneous duration check
    if (totalDuration <= 20) {
      cursor.style.transform = `translate3d(${initialPoint.containerX}px, ${initialPoint.containerY}px, 0)`;
      this.currentCursorX = initialPoint.targetX;
      this.currentCursorY = initialPoint.targetY;
      return;
    }

    // Arc height and normal vector for human curved trajectory
    const nx = -initialDy / (dist || 1);
    const ny = initialDx / (dist || 1);
    const arcSign = (Math.round(startX + startY) % 2 === 0) ? 1 : -1;
    const arcHeight = Math.min(Math.max(dist * 0.14, 6), 55) * arcSign;

    let hotspotX = 2.5;
    let hotspotY = 1.7;
    if (pointerType === 'hand') {
      hotspotX = 7.1;
      hotspotY = 2.1;
    } else if (pointerType === 'caret') {
      hotspotX = 7.5;
      hotspotY = 8.25;
    }

    await new Promise<void>((resolve) => {
      const getRaf = () => {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame;
        return (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
      };

      let startTime: number | null = null;

      const step = (now: number) => {
        if (startTime === null) {
          startTime = now;
        }
        const elapsed = Math.max(0, now - startTime);
        const progress = Math.min(1, elapsed / totalDuration);

        // Ken Perlin's Smootherstep velocity easing: 6p^5 - 15p^4 + 10p^3
        // Guarantees 0 initial jerk and velvety smooth deceleration into target
        const t = progress * progress * progress * (progress * (progress * 6 - 15) + 10);

        // Dynamically track live element position in case of layout shift or scrolling
        const livePoint = this.computeTargetPoint(el, pointerType);
        const curTargetX = livePoint.targetX;
        const curTargetY = livePoint.targetY;
        const curDx = curTargetX - startX;
        const curDy = curTargetY - startY;

        const cp1x = startX + curDx * 0.32 + nx * arcHeight;
        const cp1y = startY + curDy * 0.32 + ny * arcHeight;
        const cp2x = startX + curDx * 0.72 + nx * (arcHeight * 0.45);
        const cp2y = startY + curDy * 0.72 + ny * (arcHeight * 0.45);

        const oneMinusT = 1 - t;
        const x = Math.round(
          oneMinusT * oneMinusT * oneMinusT * startX +
          3 * oneMinusT * oneMinusT * t * cp1x +
          3 * oneMinusT * t * t * cp2x +
          t * t * t * curTargetX
        );
        const y = Math.round(
          oneMinusT * oneMinusT * oneMinusT * startY +
          3 * oneMinusT * oneMinusT * t * cp1y +
          3 * oneMinusT * t * t * cp2y +
          t * t * t * curTargetY
        );

        cursor.style.transform = `translate3d(${Math.round(x - hotspotX)}px, ${Math.round(y - hotspotY)}px, 0)`;

        if (progress < 1) {
          getRaf()(step);
        } else {
          const finalPoint = this.computeTargetPoint(el, pointerType);
          cursor.style.transform = `translate3d(${finalPoint.containerX}px, ${finalPoint.containerY}px, 0)`;
          this.currentCursorX = finalPoint.targetX;
          this.currentCursorY = finalPoint.targetY;
          resolve();
        }
      };

      getRaf()(step);
    });
  }

  /**
   * Simulates a physical human mouse press down and release.
   */
  async animateClickPress(): Promise<void> {
    if (!this.cursorEl) return;
    this.cursorEl.classList.add('privapilot-cursor-pressing');
    this.triggerClickRipple();
    await new Promise((r) => setTimeout(r, 85));
    this.cursorEl.classList.remove('privapilot-cursor-pressing');
  }

  /**
   * Simulates a physical human mouse drag from a source element to a destination element.
   */
  async animateDrag(sourceEl: HTMLElement, destEl: HTMLElement): Promise<void> {
    await this.glideCursorTo(sourceEl, 'DRAG', 'Grabbing');
    if (this.cursorEl) this.cursorEl.classList.add('privapilot-cursor-pressing');
    await this.glideCursorTo(destEl, 'DRAG', 'Dropping');
    if (this.cursorEl) this.cursorEl.classList.remove('privapilot-cursor-pressing');
    this.triggerClickRipple();
  }

  /**
   * Spawns an animated click ripple at the cursor's current location.
   */
  triggerClickRipple(): void {
    if (!this.cursorEl) return;
    const ripple = this.cursorEl.querySelector('.privapilot-cursor-ripple') as HTMLElement | null;
    if (ripple) {
      ripple.classList.remove('privapilot-ripple-active');
      void ripple.offsetWidth;
      ripple.classList.add('privapilot-ripple-active');
    }
  }

  /**
   * Highlights the badge with an active typing glow.
   */
  triggerTypingBadge(): void {
    if (!this.cursorEl) return;
    const badge = this.cursorEl.querySelector('.privapilot-cursor-badge') as HTMLElement | null;
    if (badge) {
      badge.style.borderColor = '#38bdf8';
      badge.style.boxShadow = '0 0 14px rgba(56, 189, 248, 0.75)';
      setTimeout(() => {
        if (badge) {
          badge.style.borderColor = 'rgba(255, 255, 255, 0.16)';
          badge.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.35)';
        }
      }, 400);
    }
  }

  /**
   * Parks or fades out the agent cursor after an extended idle delay.
   * Default delay is 15s so cursor remains resting on screen like a real user's mouse!
   */
  hideCursor(delayMs: number = 15000): void {
    if (this.cursorDismissTimer) {
      clearTimeout(this.cursorDismissTimer);
      this.cursorDismissTimer = null;
    }

    if (delayMs <= 0) {
      this.isAgentCursorActive = false;
      if (this.cursorEl) {
        this.cursorEl.style.opacity = '0';
      }
      return;
    }

    this.cursorDismissTimer = setTimeout(() => {
      this.isAgentCursorActive = false;
      if (this.cursorEl) {
        this.cursorEl.style.opacity = '0';
      }
    }, delayMs);
    if (this.cursorDismissTimer && typeof this.cursorDismissTimer.unref === 'function') {
      this.cursorDismissTimer.unref();
    }
  }

  /**
   * Enables the in-page execution safety shield to prevent accidental user mouse/keyboard
   * interference while an agent action or batch is running.
   */
  enableSafetyShield(label: string = 'PrivaPilot Automating Page...'): void {
    if (typeof document === 'undefined' || !document.body) return;
    this.ensureGlowStyles();

    if (this.shieldWatchdogTimer) {
      clearTimeout(this.shieldWatchdogTimer);
    }

    if (!this.boundShieldHandler) {
      this.boundShieldHandler = (e: Event) => {
        if ((e as KeyboardEvent).key === 'Escape') {
          this.disableSafetyShield();
          try {
            window.dispatchEvent(new CustomEvent('privapilot-emergency-pause'));
          } catch (_) {}
          return;
        }
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.cancelable) {
          e.preventDefault();
        }
      };

      const events = [
        'click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu',
        'keydown', 'keypress', 'wheel', 'touchstart', 'touchend'
      ];
      for (const ev of events) {
        window.addEventListener(ev, this.boundShieldHandler, { capture: true, passive: false });
      }
    }

    if (!this.shieldEl || !document.body.contains(this.shieldEl)) {
      const shield = document.createElement('div');
      shield.id = 'privapilot-execution-shield';
      shield.className = 'privapilot-overlay privapilot-shield-root';
      shield.setAttribute('data-privapilot-ignore', 'true');
      shield.setAttribute('aria-hidden', 'true');

      shield.innerHTML = `
        <div class="privapilot-overlay privapilot-shield-hud" data-privapilot-ignore="true">
          <span class="privapilot-shield-pulse-dot" data-privapilot-ignore="true"></span>
          <span class="privapilot-shield-text" data-privapilot-ignore="true">${label}</span>
          <span class="privapilot-shield-esc-badge" data-privapilot-ignore="true">Esc to Pause</span>
        </div>
      `;

      shield.style.opacity = '0';
      document.body.appendChild(shield);
      void shield.offsetHeight;
      shield.style.opacity = '1';

      this.shieldEl = shield;
    } else {
      this.shieldEl.style.opacity = '1';
      const text = this.shieldEl.querySelector('.privapilot-shield-text');
      if (text) text.textContent = label;
    }

    this.isShieldActive = true;

    // Safety watchdog: auto-release after 25 seconds so tab is never permanently locked
    this.shieldWatchdogTimer = setTimeout(() => {
      this.disableSafetyShield();
    }, 25000);
    if (this.shieldWatchdogTimer && typeof this.shieldWatchdogTimer.unref === 'function') {
      this.shieldWatchdogTimer.unref();
    }
  }

  /**
   * Disables the safety shield and restores full user mouse and keyboard control.
   */
  disableSafetyShield(): void {
    if (this.shieldWatchdogTimer) {
      clearTimeout(this.shieldWatchdogTimer);
      this.shieldWatchdogTimer = null;
    }

    if (this.boundShieldHandler) {
      const events = [
        'click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu',
        'keydown', 'keypress', 'wheel', 'touchstart', 'touchend'
      ];
      for (const ev of events) {
        window.removeEventListener(ev, this.boundShieldHandler, { capture: true } as any);
      }
      this.boundShieldHandler = null;
    }

    if (this.shieldEl) {
      const el = this.shieldEl;
      el.style.opacity = '0';
      setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        if (this.shieldEl === el) {
          this.shieldEl = null;
        }
      }, 200);
    }

    this.isShieldActive = false;
  }

  isExternalInputLocked(): boolean {
    return this.isShieldActive;
  }
}

