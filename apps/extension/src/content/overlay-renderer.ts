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

      /* Animated AI Ghost Cursor */
      .privapilot-agent-cursor {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        opacity: 0;
        transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease-out;
        will-change: transform, opacity;
      }

      .privapilot-cursor-pointer {
        display: block !important;
        width: 30px !important;
        height: 30px !important;
        filter: drop-shadow(0 3px 10px rgba(37, 99, 235, 0.75)) drop-shadow(0 0 18px rgba(96, 165, 250, 0.9)) !important;
        transform-origin: 0 0;
      }

      .privapilot-cursor-badge {
        position: absolute !important;
        top: 20px !important;
        left: 22px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        background: rgba(10, 15, 30, 0.92) !important;
        border: 1px solid rgba(96, 165, 250, 0.7) !important;
        color: #ffffff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        padding: 2.5px 8px !important;
        border-radius: 9999px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(59, 130, 246, 0.5) !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
      }

      .privapilot-cursor-ripple {
        position: absolute !important;
        top: 3px !important;
        left: 3px !important;
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        border: 2.5px solid #10b981 !important;
        box-shadow: 0 0 12px #10b981 !important;
        pointer-events: none !important;
        transform: translate(-50%, -50%) scale(0.2) !important;
        opacity: 0 !important;
      }

      .privapilot-cursor-ripple.privapilot-ripple-active {
        animation: privapilot-ripple-expand 0.48s cubic-bezier(0.1, 0.9, 0.2, 1) forwards !important;
      }

      @keyframes privapilot-ripple-expand {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(0.3);
          border-color: #60a5fa;
        }
        50% {
          border-color: #10b981;
          box-shadow: 0 0 20px #10b981;
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(5.5);
          border-color: #10b981;
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
        <svg class="privapilot-cursor-pointer" viewBox="0 0 32 32" width="30" height="30">
          <defs>
            <linearGradient id="privapilot-cursor-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#93c5fd" />
              <stop offset="45%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#1d4ed8" />
            </linearGradient>
          </defs>
          <path d="M 3 3 L 11 26 L 15 16 L 25 12 Z" fill="url(#privapilot-cursor-grad)" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" />
          <circle cx="11.5" cy="11.5" r="2.2" fill="#ffffff" />
          <circle cx="11.5" cy="11.5" r="1.1" fill="#38bdf8" />
        </svg>
        <div class="privapilot-overlay privapilot-cursor-ripple" data-privapilot-ignore="true"></div>
        <div class="privapilot-overlay privapilot-cursor-badge" data-privapilot-ignore="true">
          <span class="privapilot-cursor-badge-icon">⚡</span>
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
   * Smoothly glides the AI agent cursor to the target element's position with cubic Bézier easing.
   */
  async glideCursorTo(
    el: HTMLElement,
    actionKind: string = 'CLICK',
    extraText?: string,
    durationMs: number = 360
  ): Promise<void> {
    if (typeof document === 'undefined' || !document.body) return;
    const cursor = this.ensureCursor();
    if (this.cursorDismissTimer) {
      clearTimeout(this.cursorDismissTimer);
      this.cursorDismissTimer = null;
    }

    const rect = el.getBoundingClientRect();
    // Compute target coordinates (tip lands comfortably on target element)
    const targetX = Math.round(rect.left + Math.min(Math.max(rect.width * 0.35, 8), 40));
    const targetY = Math.round(rect.top + Math.min(Math.max(rect.height * 0.5, 8), 26));

    // Update badge icon & label
    const iconEl = cursor.querySelector('.privapilot-cursor-badge-icon');
    const textEl = cursor.querySelector('.privapilot-cursor-badge-text');

    let icon = '⚡';
    let text = 'Click';
    const kindUpper = (actionKind || 'CLICK').toUpperCase();
    if (kindUpper.includes('TYPE')) {
      icon = '✍️';
      text = extraText ? `Type "${extraText.slice(0, 16)}${extraText.length > 16 ? '...' : ''}"` : 'Typing...';
    } else if (kindUpper.includes('CLICK')) {
      icon = '⚡';
      text = 'Click';
    } else if (kindUpper.includes('SELECT')) {
      icon = '📋';
      text = 'Select';
    } else if (kindUpper.includes('HOVER')) {
      icon = '👁️';
      text = 'Hover';
    } else if (kindUpper.includes('SCROLL')) {
      icon = '📜';
      text = 'Scroll';
    } else if (kindUpper.includes('UPLOAD')) {
      icon = '📁';
      text = 'Upload';
    } else if (kindUpper.includes('DRAG')) {
      icon = '✋';
      text = 'Drag';
    } else {
      icon = '🎯';
      text = actionKind;
    }

    if (iconEl) iconEl.textContent = icon;
    if (textEl) textEl.textContent = text;

    cursor.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease-out`;
    cursor.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    cursor.style.opacity = '1';

    this.currentCursorX = targetX;
    this.currentCursorY = targetY;

    // Await gliding completion
    await new Promise((resolve) => setTimeout(resolve, durationMs));
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
          badge.style.borderColor = 'rgba(96, 165, 250, 0.7)';
          badge.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(59, 130, 246, 0.5)';
        }
      }, 400);
    }
  }

  /**
   * Smoothly fades out and parks the agent cursor.
   */
  hideCursor(delayMs: number = 600): void {
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

