/**
 * @privapilot/extension - Content Mutation Debouncer & Fast DOM Hash
 *
 * Listens for meaningful DOM mutations using a targeted attributeFilter,
 * excludes characterData noise, disconnects around PrivaPilot's overlay rendering,
 * and debounces perception triggers (250ms debounce, 1000ms maxWait).
 */

import { fnv1a32 } from '../sanitizer/perception-cache.js';

const MEANINGFUL_ATTRIBUTES = [
  'class',
  'style',
  'src',
  'href',
  'disabled',
  'hidden',
  'aria-hidden',
  'aria-disabled',
  'value',
  'checked',
  'selected',
  'type',
  'name',
  'role'
];

export interface ViewportSnapshot {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly devicePixelRatio: number;
}

export class DomMutationTracker {
  private observer: MutationObserver | null = null;
  private debounceTimer: any = null;
  private maxWaitTimer: any = null;
  private lastTriggerTime = 0;
  private isMutated = true; // Initial capture is always dirty
  private isSuspended = false;

  private readonly debounceDelayMs: number;
  private readonly maxWaitMs: number;
  private readonly onChangeCallback?: () => void;

  constructor(options: { debounceDelayMs?: number; maxWaitMs?: number; onChange?: () => void } = {}) {
    this.debounceDelayMs = options.debounceDelayMs ?? 250;
    this.maxWaitMs = options.maxWaitMs ?? 1000;
    this.onChangeCallback = options.onChange;
  }

  /**
   * Attaches MutationObserver to the target root element.
   */
  start(rootNode: Node = document.body || document.documentElement): void {
    if (typeof MutationObserver === 'undefined') return;
    this.stop();

    this.observer = new MutationObserver((mutations) => {
      if (this.isSuspended) return;

      // Filter out mutations originating from PrivaPilot's own overlay or helper elements
      const hasMeaningfulChange = mutations.some((m) => {
        const target = m.target as HTMLElement | null;
        if (target && target.id && target.id.startsWith('privapilot-')) return false;
        if (target && target.className && typeof target.className === 'string' && target.className.includes('privapilot-')) return false;

        // Scoped characterData: Only treat text mutations as dirtying if they occur inside
        // interactive elements or inputs. Global tickers/clocks/counters outside interactive
        // nodes do not zero out perception cache hit rates. (Visual shifts are caught by 4x4 dHash).
        if (m.type === 'characterData') {
          const parent = (m.target as Node).parentElement;
          if (!parent) return false;
          const tag = parent.tagName?.toLowerCase();
          if (['input', 'textarea', 'button', 'a', 'select', 'option', 'label'].includes(tag)) return true;
          if (parent.isContentEditable || parent.getAttribute('role') === 'textbox') return true;
          return false;
        }

        return true;
      });

      if (!hasMeaningfulChange) return;

      this.isMutated = true;
      this.scheduleDebouncedTrigger();
    });

    try {
      this.observer.observe(rootNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: MEANINGFUL_ATTRIBUTES,
        characterData: true // Observe text changes immediately
      });
    } catch {
      // In non-DOM or test environment
    }
  }

  /**
   * Suspends observer while modifying the DOM (e.g. rendering action overlays).
   */
  runWithoutObserving<T>(fn: () => T): T {
    this.isSuspended = true;
    try {
      return fn();
    } finally {
      this.isSuspended = false;
    }
  }

  private scheduleDebouncedTrigger(): void {
    const now = Date.now();
    if (!this.lastTriggerTime) this.lastTriggerTime = now;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Max-wait enforcement
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        this.trigger();
      }, this.maxWaitMs);
    }

    this.debounceTimer = setTimeout(() => {
      this.trigger();
    }, this.debounceDelayMs);
  }

  private trigger(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
    this.lastTriggerTime = 0;
    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  hasPendingMutations(): boolean {
    return this.isMutated;
  }

  resetMutationFlag(): void {
    this.isMutated = false;
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
  }

  /**
   * Computes a fast 32-bit hash of the viewport geometry and scroll coordinates.
   */
  static computeViewportHash(viewport: ViewportSnapshot): string {
    const key = `${viewport.innerWidth}x${viewport.innerHeight}@${viewport.scrollX},${viewport.scrollY}#${viewport.devicePixelRatio}`;
    return fnv1a32(key).toString(16).padStart(8, '0');
  }
}
