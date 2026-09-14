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

  // Animated AI Ghost Cursor state
  private cursorEl: HTMLElement | null = null;
  private cursorDismissTimer: any = null;
  private currentCursorX: number = typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 200;
  private currentCursorY: number = typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 200;

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
    this.hideCursor(0);
    this.disableSafetyShield();
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
    if (this.glowWatchdogTimer && typeof this.glowWatchdogTimer.unref === 'function') {
      this.glowWatchdogTimer.unref();
    }
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
        <svg class="privapilot-cursor-icon privapilot-cursor-arrow" viewBox="0 0 24 24" width="20" height="20" style="display: block; overflow: visible;">
          <path d="M 3 2 L 3 19 L 7.5 14.5 L 11.5 22 L 14.2 20.5 L 10.2 13 L 16 13 Z"
                fill="#0f172a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <svg class="privapilot-cursor-icon privapilot-cursor-hand" viewBox="0 0 24 24" width="20" height="20" style="display: none; overflow: visible;">
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

      cursor.style.transform = `translate3d(${this.currentCursorX}px, ${this.currentCursorY}px, 0)`;
      document.body.appendChild(cursor);

      this.cursorEl = cursor;
    }
    return this.cursorEl;
  }

  /**
   * Switches the pointer shape to match human cursor conventions (arrow, link hand, text caret).
   */
  setCursorPointerType(type: 'arrow' | 'hand' | 'caret'): void {
    if (!this.cursorEl) return;
    const arrow = this.cursorEl.querySelector('.privapilot-cursor-arrow') as HTMLElement | null;
    const hand = this.cursorEl.querySelector('.privapilot-cursor-hand') as HTMLElement | null;
    const caret = this.cursorEl.querySelector('.privapilot-cursor-caret') as HTMLElement | null;

    if (arrow) arrow.style.display = type === 'arrow' ? 'block' : 'none';
    if (hand) hand.style.display = type === 'hand' ? 'block' : 'none';
    if (caret) caret.style.display = type === 'caret' ? 'block' : 'none';
  }

  private updateCursorBadge(actionKind: string, extraText?: string): void {
    if (!this.cursorEl) return;
    const iconEl = this.cursorEl.querySelector('.privapilot-cursor-badge-icon');
    const textEl = this.cursorEl.querySelector('.privapilot-cursor-badge-text');

    const kindUpper = (actionKind || 'CLICK').toUpperCase();
    let svgIcon = OverlayRenderer.MINIMAL_ICONS.CLICK;
    let label = 'Click';

    if (kindUpper.includes('TYPE')) {
      svgIcon = OverlayRenderer.MINIMAL_ICONS.TYPE;
      label = extraText ? `Type "${extraText.slice(0, 20)}${extraText.length > 20 ? '...' : ''}"` : 'Type';
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
   * Glides the cursor along a natural human curved trajectory to the target element.
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

    const rect = el.getBoundingClientRect();
    const tagName = (el.tagName || '').toUpperCase();
    const role = (el.getAttribute?.('role') || '').toLowerCase();
    const isClickable = tagName === 'BUTTON' || tagName === 'A' || role === 'button' || role === 'link' || role === 'tab';
    const isTextInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || (el as any).isContentEditable;

    // Realistic target coordinates: human clicks inside element with natural slight offset
    const targetX = Math.round(rect.left + Math.min(Math.max(rect.width * 0.35, 6), 35));
    const targetY = Math.round(rect.top + Math.min(Math.max(rect.height * 0.5, 6), 22));

    // Update pointer shape to match element type
    if (isClickable) {
      this.setCursorPointerType('hand');
    } else if (isTextInput) {
      this.setCursorPointerType('caret');
    } else {
      this.setCursorPointerType('arrow');
    }

    // Update minimal vector icon and text label
    this.updateCursorBadge(actionKind, extraText);

    // Make cursor visible at starting point
    cursor.style.opacity = '1';

    const startX = this.currentCursorX;
    const startY = this.currentCursorY;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy);

    // Dynamic duration based on human movement distance: small move ~240ms, long move ~420ms
    const totalDuration = durationMs !== undefined ? durationMs : Math.min(Math.max(Math.round(dist * 0.42), 240), 440);

    // Headless test or instantaneous duration check
    if (totalDuration <= 20) {
      cursor.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
      this.currentCursorX = targetX;
      this.currentCursorY = targetY;
      return;
    }

    // Natural curved human trajectory (Bézier control points)
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
    const arcHeight = Math.min(Math.max(dist * 0.16, 12), 85) * (Math.random() > 0.45 ? 1 : -1);

    const cp1x = startX + dx * 0.35 + nx * arcHeight;
    const cp1y = startY + dy * 0.35 + ny * arcHeight;
    const cp2x = startX + dx * 0.78 + nx * (arcHeight * 0.4);
    const cp2y = startY + dy * 0.78 + ny * (arcHeight * 0.4);

    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    await new Promise<void>((resolve) => {
      const getRaf = () => {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame;
        return (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
      };

      const step = (now: number) => {
        const elapsed = Math.max(0, now - startTime);
        const progress = Math.min(1, elapsed / totalDuration);

        // Human velocity easing (cubic ease-in-out)
        const t = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Cubic Bézier calculation
        const oneMinusT = 1 - t;
        const x = Math.round(
          oneMinusT * oneMinusT * oneMinusT * startX +
          3 * oneMinusT * oneMinusT * t * cp1x +
          3 * oneMinusT * t * t * cp2x +
          t * t * t * targetX
        );
        const y = Math.round(
          oneMinusT * oneMinusT * oneMinusT * startY +
          3 * oneMinusT * oneMinusT * t * cp1y +
          3 * oneMinusT * t * t * cp2y +
          t * t * t * targetY
        );

        cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;

        if (progress < 1) {
          getRaf()(step);
        } else {
          cursor.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
          this.currentCursorX = targetX;
          this.currentCursorY = targetY;
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
      if (this.cursorEl) {
        this.cursorEl.style.opacity = '0';
      }
      return;
    }

    this.cursorDismissTimer = setTimeout(() => {
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

