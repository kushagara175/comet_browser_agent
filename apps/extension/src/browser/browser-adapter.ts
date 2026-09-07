/**
 * @privapilot/extension - Browser API Adapter
 *
 * Provides a clean cross-browser abstraction for:
 * - Tab screenshot capture (captureVisibleTab)
 * - Message passing (runtime.sendMessage / tabs.sendMessage)
 * - Local storage
 */

import { RawCapture, SanitizedContext, ModelTier } from '@privapilot/protocol';
import { LocalDomSnapshot, SanitizerPipeline } from '../sanitizer/pipeline.js';

declare const chrome: any;

export interface SanitizationHostRequest {
  readonly rawCapture: RawCapture;
  readonly snapshot: LocalDomSnapshot;
  readonly goal: string;
  readonly activeTier?: ModelTier;
  readonly regionBudget?: number;
  readonly domHash?: string;
  readonly viewportHash?: string;
}

export interface BrowserAdapter {
  captureVisibleTab(): Promise<string>;
  sendMessageToTab<T = any>(tabId: number, message: any): Promise<T>;
  sendMessageToRuntime<T = any>(message: any): Promise<T>;
  getActiveTab(): Promise<{ id: number; url: string; title: string }>;
  getStorage<T>(key: string): Promise<T | null>;
  setStorage<T>(key: string, value: T): Promise<void>;
  runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext>;
}

export class WebExtensionAdapter implements BrowserAdapter {
  private offscreenCreationPromise: Promise<void> | null = null;
  private offscreenCloseTimer: any = null;
  private get browserAPI() {
    // Cross-browser chrome or browser global
    if (typeof chrome !== 'undefined') return chrome;
    if (typeof (globalThis as any).browser !== 'undefined') return (globalThis as any).browser;
    return null;
  }

  async captureVisibleTab(): Promise<string> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.captureVisibleTab) {
      // Mock fallback for Node.js / offline tests
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    return new Promise((resolve, reject) => {
      try {
        api.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl: string) => {
          if (api.runtime.lastError) {
            try {
              api.tabs.captureVisibleTab({ format: 'png' }, (fallbackDataUrl: string) => {
                if (api.runtime.lastError) {
                  reject(new Error(api.runtime.lastError.message));
                } else if (!fallbackDataUrl) {
                  reject(new Error('Tab capture returned empty data'));
                } else {
                  resolve(fallbackDataUrl);
                }
              });
            } catch (err: any) {
              reject(new Error(err.message || api.runtime.lastError.message));
            }
          } else if (!dataUrl) {
            reject(new Error('Tab capture returned empty data'));
          } else {
            resolve(dataUrl);
          }
        });
      } catch (err: any) {
        try {
          api.tabs.captureVisibleTab({ format: 'png' }, (dataUrl: string) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else if (!dataUrl) {
              reject(new Error('Tab capture returned empty data'));
            } else {
              resolve(dataUrl);
            }
          });
        } catch (e: any) {
          reject(new Error(e.message || err.message));
        }
      }
    });
  }

  async sendMessageToTab<T = any>(tabId: number, message: any): Promise<T> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.sendMessage) {
      return {} as T;
    }

    return new Promise((resolve, reject) => {
      api.tabs.sendMessage(tabId, message, (response: T) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async sendMessageToRuntime<T = any>(message: any): Promise<T> {
    const api = this.browserAPI;
    if (!api || !api.runtime || !api.runtime.sendMessage) {
      return {} as T;
    }

    return new Promise((resolve, reject) => {
      api.runtime.sendMessage(message, (response: T) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async getActiveTab(): Promise<{ id: number; url: string; title: string }> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.query) {
      return { id: 1, url: 'https://app.example.local/', title: 'Workspace' };
    }

    const isWebTab = (t: any) => Boolean(t && t.id && typeof t.url === 'string' && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));

    return new Promise((resolve) => {
      // 1. Try lastFocusedWindow (active web tab behind popup/sidepanel)
      api.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: any[]) => {
        const found1 = tabs?.find(isWebTab);
        if (!api.runtime.lastError && found1) {
          return resolve({ id: found1.id, url: found1.url || '', title: found1.title || '' });
        }

        // 2. Try currentWindow
        api.tabs.query({ active: true, currentWindow: true }, (currentTabs: any[]) => {
          const found2 = currentTabs?.find(isWebTab);
          if (!api.runtime.lastError && found2) {
            return resolve({ id: found2.id, url: found2.url || '', title: found2.title || '' });
          }

          // 3. Fallback to any active web tab
          api.tabs.query({ active: true }, (anyTabs: any[]) => {
            const found3 = anyTabs?.find(isWebTab);
            if (!api.runtime.lastError && found3) {
              return resolve({ id: found3.id, url: found3.url || '', title: found3.title || '' });
            }

            // 4. Query all tabs for any open http/https tab
            api.tabs.query({}, (allTabs: any[]) => {
              const httpTab = allTabs?.find((t: any) => typeof t.url === 'string' && (t.url.startsWith('http://') || t.url.startsWith('https://')));
              if (httpTab) {
                return resolve({ id: httpTab.id, url: httpTab.url || '', title: httpTab.title || '' });
              }
              if (anyTabs && anyTabs.length > 0) {
                return resolve({ id: anyTabs[0].id, url: anyTabs[0].url || '', title: anyTabs[0].title || '' });
              }
              resolve({ id: 0, url: '', title: '' });
            });
          });
        });
      });
    });
  }

  async getStorage<T>(key: string): Promise<T | null> {
    const api = this.browserAPI;
    if (!api || !api.storage || !api.storage.local) {
      return null;
    }
    return new Promise((resolve) => {
      api.storage.local.get([key], (res: any) => {
        resolve(res[key] || null);
      });
    });
  }

  async setStorage<T>(key: string, value: T): Promise<void> {
    const api = this.browserAPI;
    if (!api || !api.storage || !api.storage.local) {
      return;
    }
    return new Promise((resolve) => {
      api.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  /**
   * Ensures singleton offscreen document is active in Chrome MV3.
   */
  private async ensureOffscreenDocument(): Promise<void> {
    const api = this.browserAPI;
    if (!api || !api.offscreen) {
      return;
    }

    // Check if an offscreen document already exists
    if (typeof api.offscreen.hasDocument === 'function') {
      const hasDoc = await api.offscreen.hasDocument();
      if (hasDoc) return;
    } else if (api.runtime && typeof api.runtime.getContexts === 'function') {
      const contexts = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (contexts && contexts.length > 0) return;
    }

    if (this.offscreenCreationPromise) {
      await this.offscreenCreationPromise;
      return;
    }

    const offscreenUrl = api.runtime.getURL ? api.runtime.getURL('src/offscreen/offscreen.html') : 'src/offscreen/offscreen.html';

    this.offscreenCreationPromise = api.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['BLOBS', 'DOM_PARSER'],
      justification: 'On-device privacy mask rendering on screenshot canvas'
    }).catch((err: any) => {
      // Ignore error if document already exists
      if (!err.message?.includes('Only a single offscreen document may be created')) {
        throw err;
      }
    }).finally(() => {
      this.offscreenCreationPromise = null;
    });

    await this.offscreenCreationPromise;
  }

  /**
   * Routes sanitization through the offscreen document host with correlation IDs and timeouts.
   */
  async runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext> {
    const api = this.browserAPI;

    // 1. Chrome MV3 Offscreen Host Path
    if (api && api.offscreen && api.runtime && api.runtime.sendMessage) {
      await this.ensureOffscreenDocument();

      // Reset 60s idle cleanup timer
      if (this.offscreenCloseTimer) clearTimeout(this.offscreenCloseTimer);
      this.offscreenCloseTimer = setTimeout(async () => {
        try {
          if (api.offscreen && typeof api.offscreen.closeDocument === 'function') {
            await api.offscreen.closeDocument();
          }
        } catch (_) {}
      }, 60000);

      const correlationId = `san_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // 15000ms Bounded Timeout Promise (accommodates cold-start ONNX model initialization)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Sanitization Host Timeout: Offscreen document did not respond within 15000ms'));
        }, 15000);
      });

      const messagePromise = new Promise<SanitizedContext>((resolve, reject) => {
        api.runtime.sendMessage(
          {
            target: 'privapilot-offscreen',
            type: 'SANITIZE_CAPTURE',
            correlationId,
            payload: request
          },
          (response: any) => {
            if (api.runtime.lastError) {
              reject(new Error(`Offscreen Message Error: ${api.runtime.lastError.message}`));
              return;
            }
            if (!response) {
              reject(new Error('Offscreen document returned empty response'));
              return;
            }
            if (response.correlationId !== correlationId) {
              reject(new Error(`Correlation ID mismatch: expected ${correlationId}, got ${response.correlationId}`));
              return;
            }
            if (!response.success || !response.sanitized) {
              reject(new Error(response.error || 'Sanitization failed in offscreen document'));
              return;
            }
            resolve(response.sanitized);
          }
        );
      });

      return Promise.race([messagePromise, timeoutPromise]);
    }

    // 2. Direct Canvas Host Path (Firefox background page / DOM-equipped environments)
    if (typeof document !== 'undefined') {
      return SanitizerPipeline.sanitize(
        request.rawCapture,
        request.snapshot,
        request.goal,
        undefined,
        {
          activeTier: request.activeTier,
          domHash: request.domHash,
          viewportHash: request.viewportHash,
          regionBudget: request.regionBudget
        }
      );
    }

    // 3. Fail-closed if no execution host is available
    throw new Error('Sanitization Host Unavailable: No DOM or offscreen document available to render masks safely');
  }
}
