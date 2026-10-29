/**
 * @privapilot/extension - Hardware-Level Input Dispatcher (Chrome DevTools Protocol)
 *
 * Injects genuine hardware-level mouse clicks, typing, and scroll events directly into the
 * Chromium rendering pipeline via `chrome.debugger` to overcome synthetic event barriers
 * (React 18 concurrent mode, Shadow DOM widgets, canvas elements, custom drag-and-drop).
 */

declare const chrome: any;

export interface CdpPoint {
  x: number;
  y: number;
}

export interface CdpClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  modifiers?: number; // 1 = Alt, 2 = Ctrl, 4 = Meta/Cmd, 8 = Shift
}

export interface CdpTypeOptions {
  delayMs?: number;
}

export class CdpInputDispatcher {
  private static attachedTabs = new Set<number>();
  private static detachTimers = new Map<number, any>();

  /**
   * Checks if Chrome debugger API is available in the current runtime.
   */
  static isAvailable(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome.debugger && chrome.debugger.attach);
  }

  /**
   * Returns whether a tab is currently attached to the debugger.
   */
  static isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  /**
   * Attaches Chrome debugger to the specified tab if not already attached.
   */
  static async attach(tabId: number): Promise<boolean> {
    if (!this.isAvailable()) return false;
    if (this.attachedTabs.has(tabId)) {
      this.cancelAutoDetach(tabId);
      return true;
    }

    return new Promise((resolve) => {
      try {
        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime?.lastError) {
            const err = chrome.runtime.lastError.message || '';
            if (err.includes('already attached') || err.includes('Another debugger')) {
              this.attachedTabs.add(tabId);
              resolve(true);
              return;
            }
            console.warn(`[PrivaPilot CDP] Attach failed on tab ${tabId}: ${err}`);
            resolve(false);
            return;
          }

          this.attachedTabs.add(tabId);

          // Listen for external detachment (e.g. user clicks "Cancel" on Chrome debug bar)
          try {
            if (chrome.debugger.onDetach && typeof chrome.debugger.onDetach.addListener === 'function') {
              if (!chrome.debugger.onDetach.hasListener(this.handleDetachEvent)) {
                chrome.debugger.onDetach.addListener(this.handleDetachEvent);
              }
            }
          } catch (_) {}

          resolve(true);
        });
      } catch (err: any) {
        console.warn(`[PrivaPilot CDP] Exception attaching debugger: ${err.message}`);
        resolve(false);
      }
    });
  }

  /**
   * Detaches the debugger from the tab.
   */
  static async detach(tabId: number): Promise<void> {
    if (!this.isAvailable()) return;
    this.cancelAutoDetach(tabId);
    if (!this.attachedTabs.has(tabId)) return;

    return new Promise((resolve) => {
      try {
        chrome.debugger.detach({ tabId }, () => {
          this.attachedTabs.delete(tabId);
          resolve();
        });
      } catch (_) {
        this.attachedTabs.delete(tabId);
        resolve();
      }
    });
  }

  /**
   * Schedules an auto-detach after idleMs to remove the top browser debugging banner.
   */
  static scheduleAutoDetach(tabId: number, idleMs = 4000): void {
    this.cancelAutoDetach(tabId);
    const timer = setTimeout(() => {
      this.detach(tabId).catch(() => {});
    }, idleMs);
    this.detachTimers.set(tabId, timer);
  }

  private static cancelAutoDetach(tabId: number): void {
    if (this.detachTimers.has(tabId)) {
      clearTimeout(this.detachTimers.get(tabId));
      this.detachTimers.delete(tabId);
    }
  }

  private static handleDetachEvent = (source: { tabId?: number }) => {
    if (source && source.tabId) {
      CdpInputDispatcher.attachedTabs.delete(source.tabId);
      CdpInputDispatcher.cancelAutoDetach(source.tabId);
    }
  };

  /**
   * Dispatches a native hardware mouse click at viewport coordinates (x, y).
   */
  static async dispatchClick(tabId: number, x: number, y: number, options: CdpClickOptions = {}): Promise<boolean> {
    const attached = await this.attach(tabId);
    if (!attached) return false;

    const button = options.button || 'left';
    const clickCount = options.clickCount || 1;
    const modifiers = options.modifiers || 0;

    try {
      // 1. Mouse Moved
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x),
        y: Math.round(y),
        modifiers
      });

      // 2. Mouse Pressed
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button,
        clickCount,
        x: Math.round(x),
        y: Math.round(y),
        modifiers
      });

      // Micro delay for realistic hardware switch debounce
      await new Promise((r) => setTimeout(r, 25));

      // 3. Mouse Released
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button,
        clickCount,
        x: Math.round(x),
        y: Math.round(y),
        modifiers
      });

      this.scheduleAutoDetach(tabId);
      return true;
    } catch (err: any) {
      console.warn(`[PrivaPilot CDP] Click dispatch failed on tab ${tabId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Dispatches native hardware keyboard typing.
   */
  static async dispatchType(tabId: number, text: string, options: CdpTypeOptions = {}): Promise<boolean> {
    const attached = await this.attach(tabId);
    if (!attached) return false;

    const delay = options.delayMs || 10;

    try {
      for (const char of text) {
        if (char === '\n') {
          // Enter key
          await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13,
            macCharCode: 13,
            unmodifiedText: '\r',
            text: '\r',
            key: 'Enter',
            code: 'Enter'
          });
          await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13,
            macCharCode: 13,
            unmodifiedText: '\r',
            text: '\r',
            key: 'Enter',
            code: 'Enter'
          });
        } else {
          await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyDown',
            text: char,
            unmodifiedText: char
          });
          await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            text: char,
            unmodifiedText: char
          });
        }
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      this.scheduleAutoDetach(tabId);
      return true;
    } catch (err: any) {
      console.warn(`[PrivaPilot CDP] Type dispatch failed on tab ${tabId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Dispatches hardware wheel scroll event.
   */
  static async dispatchScroll(tabId: number, x: number, y: number, deltaX: number, deltaY: number): Promise<boolean> {
    const attached = await this.attach(tabId);
    if (!attached) return false;

    try {
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(x),
        y: Math.round(y),
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY)
      });

      this.scheduleAutoDetach(tabId);
      return true;
    } catch (err: any) {
      console.warn(`[PrivaPilot CDP] Scroll dispatch failed on tab ${tabId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Dispatches genuine hardware-level drag-and-drop between two screen points.
   * Simulates continuous movement vectors across the Chromium compositor.
   */
  static async dispatchDragAndDrop(
    tabId: number,
    from: CdpPoint,
    to: CdpPoint,
    steps = 8
  ): Promise<boolean> {
    const attached = await this.attach(tabId);
    if (!attached) return false;

    try {
      // 1. Move to origin
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(from.x),
        y: Math.round(from.y)
      });

      // 2. Press left button
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        clickCount: 1,
        x: Math.round(from.x),
        y: Math.round(from.y),
        buttons: 1
      });

      await new Promise((r) => setTimeout(r, 20));

      // 3. Smooth interpolation steps
      const totalSteps = Math.max(3, steps);
      for (let i = 1; i <= totalSteps; i++) {
        const progress = i / totalSteps;
        const curX = Math.round(from.x + (to.x - from.x) * progress);
        const curY = Math.round(from.y + (to.y - from.y) * progress);

        await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: curX,
          y: curY,
          buttons: 1
        });
        await new Promise((r) => setTimeout(r, 10));
      }

      // 4. Release mouse button at destination
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: 1,
        x: Math.round(to.x),
        y: Math.round(to.y),
        buttons: 0
      });

      this.scheduleAutoDetach(tabId);
      return true;
    } catch (err: any) {
      console.warn(`[PrivaPilot CDP] Drag-and-drop failed on tab ${tabId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Internal helper to send CDP commands asynchronously.
   */
  static sendCommand(tabId: number, method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        chrome.debugger.sendCommand({ tabId }, method, params, (result: any) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }
}
