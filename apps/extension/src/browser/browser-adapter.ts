/**
 * @privapilot/extension - Browser API Adapter
 *
 * Provides a clean cross-browser abstraction for:
 * - Tab screenshot capture (captureVisibleTab)
 * - Message passing (runtime.sendMessage / tabs.sendMessage)
 * - Local storage
 */

import { RawCapture, SanitizedContext } from '@privapilot/protocol';
import { LocalDomSnapshot, SanitizerPipeline } from '../sanitizer/pipeline.js';

declare const chrome: any;

export interface SanitizationHostRequest {
  readonly rawCapture: RawCapture;
  readonly snapshot: LocalDomSnapshot;
  readonly goal: string;
}

export interface BrowserAdapter {
  captureVisibleTab(targetWindowId?: number | null): Promise<string>;
  sendMessageToTab<T = any>(tabId: number, message: any): Promise<T>;
  sendMessageToRuntime<T = any>(message: any): Promise<T>;
  getActiveTab(preferredTabId?: number): Promise<{ id: number; url: string; title: string; windowId?: number }>;
  navigateTab?(tabId: number, url: string): Promise<void>;
  getStorage<T>(key: string): Promise<T | null>;
  setStorage<T>(key: string, value: T): Promise<void>;
  runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext>;
}

export class WebExtensionAdapter implements BrowserAdapter {
  private offscreenCreationPromise: Promise<void> | null = null;
  private offscreenCloseTimer: any = null;
  private lastCaptureTime = 0;
  private get browserAPI() {
    // Cross-browser chrome or browser global
    if (typeof chrome !== 'undefined') return chrome;
    if (typeof (globalThis as any).browser !== 'undefined') return (globalThis as any).browser;
    return null;
  }

  async captureVisibleTab(targetWindowId?: number | null): Promise<string> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.captureVisibleTab) {
      // Mock fallback for Node.js / offline tests
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }

    // Chrome MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND guard:
    // Ensure at least 550ms between captures to prevent quota exhaustion
    const now = Date.now();
    const elapsed = now - this.lastCaptureTime;
    if (elapsed < 550) {
      await new Promise((r) => setTimeout(r, 550 - elapsed));
    }
    this.lastCaptureTime = Date.now();

    const doCapture = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        try {
          api.tabs.captureVisibleTab(targetWindowId ?? null, { format: 'png' }, (dataUrl: string) => {
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
    };

    try {
      return await doCapture();
    } catch (err: any) {
      if (err.message && err.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        await new Promise((r) => setTimeout(r, 600));
        this.lastCaptureTime = Date.now();
        return await doCapture();
      }
      throw err;
    }
  }

  async sendMessageToTab<T = any>(tabId: number, message: any): Promise<T> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.sendMessage) {
      return {} as T;
    }

    const trySend = (): Promise<T> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Content script did not respond within 3000ms'));
        }, 3000);

        api.tabs.sendMessage(tabId, message, (response: T) => {
          clearTimeout(timer);
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    };

    try {
      return await trySend();
    } catch (initialErr: any) {
      // If content script was detached during extension reload, auto-inject and retry
      if (api.scripting && typeof api.scripting.executeScript === 'function') {
        try {
          await api.scripting.executeScript({
            target: { tabId },
            files: ['dist/content/content-main.js']
          });
          await new Promise((r) => setTimeout(r, 150));
          return await trySend();
        } catch {
          throw initialErr;
        }
      }
      throw initialErr;
    }
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

  async getActiveTab(preferredTabId?: number): Promise<{ id: number; url: string; title: string; windowId?: number }> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.query) {
      return { id: 1, url: 'https://app.example.local/', title: 'Workspace', windowId: 1 };
    }

    // If caller explicitly provided a target tab ID, verify and return it directly
    if (preferredTabId && typeof api.tabs.get === 'function') {
      try {
        const explicitTab = await new Promise<any>((resolve) => {
          api.tabs.get(preferredTabId, (tab: any) => {
            if (!api.runtime.lastError && tab && tab.id) {
              resolve(tab);
            } else {
              resolve(null);
            }
          });
        });
        if (explicitTab) {
          return {
            id: explicitTab.id,
            url: explicitTab.url || '',
            title: explicitTab.title || '',
            windowId: explicitTab.windowId
          };
        }
      } catch (_) {}
    }

    return new Promise((resolve) => {
      // 1. Try lastFocusedWindow (active web tab behind popup/sidepanel)
      api.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: any[]) => {
        if (!api.runtime.lastError && tabs && tabs.length > 0) {
          return resolve({
            id: tabs[0].id,
            url: tabs[0].url || '',
            title: tabs[0].title || '',
            windowId: tabs[0].windowId
          });
        }

        // 2. Try currentWindow
        api.tabs.query({ active: true, currentWindow: true }, (currentTabs: any[]) => {
          if (!api.runtime.lastError && currentTabs && currentTabs.length > 0) {
            return resolve({
              id: currentTabs[0].id,
              url: currentTabs[0].url || '',
              title: currentTabs[0].title || '',
              windowId: currentTabs[0].windowId
            });
          }

          // 3. Fallback to any active tab
          api.tabs.query({ active: true }, (anyTabs: any[]) => {
            if (!api.runtime.lastError && anyTabs && anyTabs.length > 0) {
              return resolve({
                id: anyTabs[0].id,
                url: anyTabs[0].url || '',
                title: anyTabs[0].title || '',
                windowId: anyTabs[0].windowId
              });
            }
            resolve({ id: 0, url: '', title: '' });
          });
        });
      });
    });
  }

  async navigateTab(tabId: number, url: string): Promise<void> {
    const api = this.browserAPI;
    if (api && api.tabs && api.tabs.update) {
      await new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            if (api.tabs.onUpdated && api.tabs.onUpdated.removeListener) {
              try { api.tabs.onUpdated.removeListener(listener); } catch {}
            }
            resolve();
          }
        };
        const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            done();
          }
        };
        if (api.tabs.onUpdated && api.tabs.onUpdated.addListener) {
          try { api.tabs.onUpdated.addListener(listener); } catch {}
        }
        setTimeout(done, 5000);
        api.tabs.update(tabId, { url }, () => {});
      });
      // Settle buffer for content script injection & DOM layout
      await new Promise((r) => setTimeout(r, 1000));
    }
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
      console.error('[PrivaPilot SW] createDocument error:', err?.message || err);
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
        let attempts = 0;
        const maxAttempts = 15;
        let settled = false;

        const attemptSend = () => {
          attempts++;

          // Attempt 1-to-1 dedicated Port connection if available
          if (typeof api.runtime.connect === 'function') {
            try {
              const port = api.runtime.connect({ name: 'privapilot-offscreen' });
              let portReceivedResponse = false;

              port.onMessage.addListener((response: any) => {
                if (settled) return;
                portReceivedResponse = true;
                settled = true;
                try { port.disconnect(); } catch (_) {}

                if (!response || response.correlationId !== correlationId) {
                  reject(new Error(`Correlation ID mismatch: expected ${correlationId}, got ${response?.correlationId}`));
                  return;
                }
                if (!response.success || !response.sanitized) {
                  reject(new Error(response.error || 'Sanitization failed in offscreen document'));
                  return;
                }
                resolve(response.sanitized);
              });

              port.onDisconnect.addListener(() => {
                if (!portReceivedResponse && !settled) {
                  // Port closed before responding; document may still be mounting or bundle loading
                  if (attempts < maxAttempts) {
                    setTimeout(attemptSend, 200);
                  } else {
                    settled = true;
                    reject(new Error('Offscreen port disconnected before sanitization completed'));
                  }
                }
              });

              port.postMessage({
                target: 'privapilot-offscreen',
                type: 'SANITIZE_CAPTURE',
                correlationId,
                payload: request
              });
              return;
            } catch (err) {
              console.warn('[PrivaPilot SW] Port connection attempt failed, using runtime.sendMessage:', err);
            }
          }

          // Fallback to runtime.sendMessage
          api.runtime.sendMessage(
            {
              target: 'privapilot-offscreen',
              type: 'SANITIZE_CAPTURE',
              correlationId,
              payload: request
            },
            (response: any) => {
              if (settled) return;
              if (api.runtime.lastError || !response) {
                if (attempts < maxAttempts) {
                  // Offscreen script is still mounting/parsing the bundle: retry shortly
                  setTimeout(attemptSend, 200);
                  return;
                }
                settled = true;
                if (api.runtime.lastError) {
                  reject(new Error(`Offscreen Message Error: ${api.runtime.lastError.message}`));
                } else {
                  reject(new Error('Offscreen document returned empty response'));
                }
                return;
              }
              settled = true;
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
        };

        attemptSend();
      });

      return Promise.race([messagePromise, timeoutPromise]);
    }

    // 2. Direct Canvas Host Path (Firefox background page / DOM-equipped environments)
    if (typeof document !== 'undefined') {
      return SanitizerPipeline.sanitize(
        request.rawCapture,
        request.snapshot,
        request.goal
      );
    }

    // 3. Fail-closed if no execution host is available
    throw new Error('Sanitization Host Unavailable: No DOM or offscreen document available to render masks safely');
  }
}
