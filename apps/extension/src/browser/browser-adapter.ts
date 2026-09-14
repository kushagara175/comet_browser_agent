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
  getActiveTab(preferredTabId?: number): Promise<{ id: number; url: string; title: string; windowId?: number; status?: string }>;
  navigateTab?(tabId: number, url: string, options?: { createNewTab?: boolean }): Promise<{ tabId: number; url?: string } | void>;
  waitForTabReady?(tabId: number, timeoutMs?: number, expectedUrl?: string): Promise<{ id: number; url: string; title: string; windowId?: number; status?: string } | null>;
  ensureContentScript?(tabId: number): Promise<boolean>;
  getStorage<T>(key: string): Promise<T | null>;
  setStorage<T>(key: string, value: T): Promise<void>;
  runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext>;
  getBookmarks?(query?: string): Promise<any[]>;
  openBookmarksManager?(): Promise<{ tabId: number; url?: string }>;
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
    const FALLBACK_1X1_PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    if (!api || !api.tabs || !api.tabs.captureVisibleTab) {
      // Mock fallback for Node.js / offline tests
      return FALLBACK_1X1_PNG;
    }

    // Chrome MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND guard:
    // Ensure at least 550ms between captures to prevent quota exhaustion
    const now = Date.now();
    const elapsed = now - this.lastCaptureTime;
    if (elapsed < 550) {
      await new Promise((r) => setTimeout(r, 550 - elapsed));
    }
    this.lastCaptureTime = Date.now();

    // Resolve target window ID if not explicitly provided
    let windowId = typeof targetWindowId === 'number' && targetWindowId > 0 ? targetWindowId : undefined;
    if (windowId == null && api.tabs && api.tabs.query) {
      try {
        const activeTabs = await new Promise<any[]>((resolve) => {
          api.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: any[]) => {
            if (!api.runtime.lastError && tabs && tabs.length > 0) return resolve(tabs);
            api.tabs.query({ active: true }, (tabs2: any[]) => resolve(tabs2 || []));
          });
        });
        const normalTab =
          activeTabs.find(
            (t: any) =>
              t.windowId != null &&
              t.url &&
              !t.url.startsWith('chrome-extension://') &&
              !t.url.startsWith('devtools://')
          ) || activeTabs[0];
        if (normalTab && typeof normalTab.windowId === 'number' && normalTab.windowId > 0) {
          windowId = normalTab.windowId;
        }
      } catch (_) {}
    }

    const captureWithWindow = (wId?: number): Promise<string> => {
      return new Promise((resolve, reject) => {
        try {
          const callback = (dataUrl: string) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else if (!dataUrl) {
              reject(new Error('Tab capture returned empty data'));
            } else {
              resolve(dataUrl);
            }
          };

          if (typeof wId === 'number' && wId > 0) {
            api.tabs.captureVisibleTab(wId, { format: 'png' }, callback);
          } else {
            api.tabs.captureVisibleTab({ format: 'png' }, callback);
          }
        } catch (e: any) {
          reject(new Error(e?.message || 'Exception during captureVisibleTab'));
        }
      });
    };

    const doCapture = async (): Promise<string> => {
      // 1. Try with resolved window ID
      if (typeof windowId === 'number') {
        try {
          return await captureWithWindow(windowId);
        } catch (_) {
          // If windowId failed, continue to fallback attempts
        }
      }

      // 2. Try with lastFocused normal window if available
      if (api.windows && api.windows.getLastFocused) {
        try {
          const lastWin = await new Promise<any>((resolve) => {
            api.windows.getLastFocused({ windowTypes: ['normal'] }, (win: any) => resolve(win));
          });
          if (lastWin && typeof lastWin.id === 'number' && lastWin.id !== windowId) {
            return await captureWithWindow(lastWin.id);
          }
        } catch (_) {}
      }

      // 3. Try default captureVisibleTab without windowId
      try {
        return await captureWithWindow();
      } catch (err: any) {
        // 4. Graceful fallback: If Chrome rejects tab capture (e.g. empty URL "", restricted frame),
        // yield neutral 1x1 image so DOM-based autonomous perception and actions continue uninterrupted.
        console.warn(`[BrowserAdapter] captureVisibleTab failed (${err?.message || 'restricted view'}). Yielding fallback canvas.`);
        return FALLBACK_1X1_PNG;
      }
    };

    try {
      return await doCapture();
    } catch (err: any) {
      if (err.message && err.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
        await new Promise((r) => setTimeout(r, 600));
        this.lastCaptureTime = Date.now();
        return await doCapture();
      }
      return FALLBACK_1X1_PNG;
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
          reject(new Error('Content script did not respond within 7000ms'));
        }, 7000);

        api.tabs.sendMessage(tabId, message, { frameId: 0 }, (response: T) => {
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
      // If content script was detached during extension reload or page redirect, auto-inject and retry
      const injected = await this.ensureContentScript(tabId);
      if (injected) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          return await trySend();
        } catch {
          throw initialErr;
        }
      }
      throw initialErr;
    }
  }

  async ensureContentScript(tabId: number): Promise<boolean> {
    const api = this.browserAPI;
    if (!api || !tabId) return false;

    // Check if script is already responsive
    try {
      const ping = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 600);
        api.tabs.sendMessage(tabId, { type: 'CLEAR_OVERLAYS' }, { frameId: 0 }, (res: any) => {
          clearTimeout(timer);
          if (api.runtime.lastError || !res) resolve(false);
          else resolve(true);
        });
      });
      if (ping) return true;
    } catch (_) {}

    // Inject content script programmatically into top-level document
    if (api.scripting && typeof api.scripting.executeScript === 'function') {
      try {
        await api.scripting.executeScript({
          target: { tabId, allFrames: false },
          files: ['dist/content/content-main.js']
        });
        await new Promise((r) => setTimeout(r, 250));
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  async waitForTabReady(
    tabId: number,
    timeoutMs = 8000,
    expectedUrl?: string
  ): Promise<{ id: number; url: string; title: string; windowId?: number; status?: string } | null> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !tabId) return null;

    return new Promise((resolve) => {
      let settledTimer: any = null;
      let timeoutTimer: any = null;

      const isUrlSettled = (tabUrl?: string) => {
        if (!tabUrl || (tabUrl === 'about:blank' && expectedUrl !== 'about:blank') || tabUrl.startsWith('chrome://')) return false;
        if (!expectedUrl) return true;
        try {
          const tabParsed = new URL(tabUrl);
          if (tabParsed.protocol === 'http:' || tabParsed.protocol === 'https:') {
            return true;
          }
          const tabHost = tabParsed.hostname.toLowerCase().replace(/^www\./, '');
          const expHost = new URL(expectedUrl).hostname.toLowerCase().replace(/^www\./, '');
          return tabHost === expHost || tabHost.endsWith('.' + expHost) || expHost.endsWith('.' + tabHost);
        } catch (_) {
          return true;
        }
      };

      const cleanup = () => {
        if (settledTimer) clearTimeout(settledTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (api.tabs.onUpdated && api.tabs.onUpdated.removeListener) {
          try { api.tabs.onUpdated.removeListener(onUpdatedListener); } catch {}
        }
      };

      const finishWithTab = (tab: any) => {
        cleanup();
        resolve(tab ? {
          id: tab.id,
          url: tab.url || '',
          title: tab.title || '',
          windowId: tab.windowId,
          status: tab.status || 'complete'
        } : null);
      };

      const checkCurrentStatus = () => {
        if (!api.tabs.get) return resolve(null);
        api.tabs.get(tabId, (tab: any) => {
          if (api.runtime.lastError || !tab) {
            cleanup();
            return resolve(null);
          }
          if (tab.status === 'complete' && isUrlSettled(tab.url)) {
            // Debounce 400ms to catch immediate client-side JS or meta-refresh redirects
            settledTimer = setTimeout(() => {
              api.tabs.get(tabId, (finalTab: any) => {
                if (isUrlSettled(finalTab?.url || tab.url)) {
                  finishWithTab(finalTab || tab);
                }
              });
            }, 400);
          }
        });
      };

      const onUpdatedListener = (updatedTabId: number, changeInfo: { status?: string; url?: string }, tab: any) => {
        if (updatedTabId !== tabId) return;

        // If a new navigation or redirect begins loading, reset debounce
        if (changeInfo.status === 'loading') {
          if (settledTimer) {
            clearTimeout(settledTimer);
            settledTimer = null;
          }
        } else if (changeInfo.status === 'complete') {
          if (!isUrlSettled(tab?.url)) return;
          if (settledTimer) clearTimeout(settledTimer);
          settledTimer = setTimeout(() => {
            finishWithTab(tab);
          }, 400);
        }
      };

      if (api.tabs.onUpdated && api.tabs.onUpdated.addListener) {
        try { api.tabs.onUpdated.addListener(onUpdatedListener); } catch {}
      }

      timeoutTimer = setTimeout(() => {
        cleanup();
        if (api.tabs.get) {
          api.tabs.get(tabId, (tab: any) => {
            finishWithTab(tab);
          });
        } else {
          resolve(null);
        }
      }, timeoutMs);

      checkCurrentStatus();
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

  async getActiveTab(preferredTabId?: number): Promise<{ id: number; url: string; title: string; windowId?: number; status?: string }> {
    const api = this.browserAPI;
    if (!api || !api.tabs || !api.tabs.query) {
      return { id: 1, url: 'https://app.example.local/', title: 'Workspace', windowId: 1, status: 'complete' };
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
            windowId: explicitTab.windowId,
            status: explicitTab.status || 'complete'
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
            windowId: tabs[0].windowId,
            status: tabs[0].status || 'complete'
          });
        }

        // 2. Try currentWindow
        api.tabs.query({ active: true, currentWindow: true }, (currentTabs: any[]) => {
          if (!api.runtime.lastError && currentTabs && currentTabs.length > 0) {
            return resolve({
              id: currentTabs[0].id,
              url: currentTabs[0].url || '',
              title: currentTabs[0].title || '',
              windowId: currentTabs[0].windowId,
              status: currentTabs[0].status || 'complete'
            });
          }

          // 3. Fallback to any active tab
          api.tabs.query({ active: true }, (anyTabs: any[]) => {
            if (!api.runtime.lastError && anyTabs && anyTabs.length > 0) {
              return resolve({
                id: anyTabs[0].id,
                url: anyTabs[0].url || '',
                title: anyTabs[0].title || '',
                windowId: anyTabs[0].windowId,
                status: anyTabs[0].status || 'complete'
              });
            }
            resolve({ id: 0, url: '', title: '', status: 'complete' });
          });
        });
      });
    });
  }

  async navigateTab(
    tabId: number,
    url: string,
    options?: { createNewTab?: boolean }
  ): Promise<{ tabId: number; url?: string }> {
    const api = this.browserAPI;
    if (api && api.tabs) {
      let targetTabId = tabId && tabId > 0 ? tabId : 0;
      if (!targetTabId && api.tabs.query) {
        const tabs = await new Promise<any[]>((resolve) => {
          api.tabs.query({ active: true, lastFocusedWindow: true }, (res: any[]) => {
            if (!api.runtime.lastError && res && res.length > 0) return resolve(res);
            api.tabs.query({ active: true }, (res2: any[]) => {
              if (!api.runtime.lastError && res2 && res2.length > 0) return resolve(res2);
              api.tabs.query({}, (all: any[]) => resolve(all || []));
            });
          });
        });
        const normalTab =
          tabs.find(
            (t: any) =>
              t.id &&
              t.url &&
              !t.url.startsWith('chrome-extension://') &&
              !t.url.startsWith('devtools://')
          ) || tabs[0];
        if (normalTab && normalTab.id) {
          targetTabId = normalTab.id;
        }
      }

      // If opening in a new tab was requested (e.g. switching to a different website from an existing active page)
      if (options?.createNewTab && api.tabs.create) {
        const createdTab = await new Promise<any>((resolve) => {
          try {
            api.tabs.create({ url, active: true }, (tab: any) => resolve(tab || null));
          } catch (_) {
            resolve(null);
          }
        });
        if (createdTab && createdTab.id) {
          const readyTab = await this.waitForTabReady(createdTab.id, 10000, url);
          await this.ensureContentScript(createdTab.id);
          return { tabId: createdTab.id, url: readyTab?.url || url };
        }
      }

      let updateSucceeded = false;
      if (targetTabId && api.tabs.update) {
        updateSucceeded = await new Promise<boolean>((resolve) => {
          try {
            api.tabs.update(targetTabId, { url, active: true }, (updatedTab: any) => {
              if (api.runtime?.lastError || !updatedTab) {
                resolve(false);
              } else {
                resolve(true);
              }
            });
          } catch (_) {
            resolve(false);
          }
        });
        if (updateSucceeded) {
          const readyTab = await this.waitForTabReady(targetTabId, 10000, url);
          if (readyTab && readyTab.url && !readyTab.url.startsWith('chrome://')) {
            await this.ensureContentScript(targetTabId);
            return { tabId: targetTabId, url: readyTab.url };
          }
        }
      }

      // If tabs.update failed (e.g. Chrome blocks updating chrome:// surfaces)
      // or if targetTabId remained on a restricted URL, open in a fresh active tab!
      if (api.tabs.create) {
        const oldTabId = targetTabId;
        const createdTab = await new Promise<any>((resolve) => {
          try {
            api.tabs.create({ url, active: true }, (tab: any) => {
              resolve(tab || null);
            });
          } catch (_) {
            resolve(null);
          }
        });
        if (createdTab && createdTab.id) {
          targetTabId = createdTab.id;
          const readyTab = await this.waitForTabReady(targetTabId, 10000, url);
          await this.ensureContentScript(targetTabId);
          if (oldTabId && oldTabId !== targetTabId && api.tabs.remove) {
            try { api.tabs.remove(oldTabId, () => { if (api.runtime?.lastError) {} }); } catch (_) {}
          }
          return { tabId: targetTabId, url: readyTab?.url || url };
        }
      }
    }
    return { tabId: tabId || 0, url };
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

  async getBookmarks(query?: string): Promise<any[]> {
    const api = this.browserAPI;
    if (api && api.bookmarks) {
      return new Promise<any[]>((resolve) => {
        try {
          if (query && typeof api.bookmarks.search === 'function') {
            api.bookmarks.search(query, (results: any[]) => resolve(results || []));
          } else if (typeof api.bookmarks.getTree === 'function') {
            api.bookmarks.getTree((tree: any[]) => resolve(tree || []));
          } else {
            resolve([]);
          }
        } catch (_) {
          resolve([]);
        }
      });
    }
    return [];
  }

  async openBookmarksManager(): Promise<{ tabId: number; url?: string }> {
    const api = this.browserAPI;
    if (api && api.tabs && api.tabs.create) {
      return new Promise<{ tabId: number; url?: string }>((resolve) => {
        try {
          api.tabs.create({ url: 'chrome://bookmarks' }, (tab: any) => {
            resolve({ tabId: tab?.id || 0, url: 'chrome://bookmarks' });
          });
        } catch (_) {
          resolve({ tabId: 0 });
        }
      });
    }
    return { tabId: 0 };
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
      try {
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

        return await Promise.race([messagePromise, timeoutPromise]);
      } catch (offscreenErr: any) {
        console.warn('[PrivaPilot SW] Offscreen host sanitization failed, attempting direct worker fallback:', offscreenErr?.message || offscreenErr);
        // Fall through to direct canvas host path or worker OffscreenCanvas path
      }
    }

    // 2. Direct Canvas Host Path (Firefox background page / DOM-equipped environments)
    if (typeof document !== 'undefined') {
      return SanitizerPipeline.sanitize(
        request.rawCapture,
        request.snapshot,
        request.goal
      );
    }

    // 3. Worker OffscreenCanvas Path (Chrome Service Worker direct execution)
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const w = request.rawCapture.metadata.screenshotWidth || 1280;
        const h = request.rawCapture.metadata.screenshotHeight || 720;
        const offCanvas = new OffscreenCanvas(w, h);
        const ctx = offCanvas.getContext('2d');
        if (ctx && request.rawCapture.rawScreenshotDataUrl) {
          try {
            const res = await fetch(request.rawCapture.rawScreenshotDataUrl);
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);
            ctx.drawImage(bitmap, 0, 0, w, h);
          } catch (_) {}
        }
        return await SanitizerPipeline.sanitize(
          request.rawCapture,
          request.snapshot,
          request.goal,
          offCanvas
        );
      } catch (workerErr: any) {
        console.error('[PrivaPilot SW] Worker OffscreenCanvas sanitization error:', workerErr);
      }
    }

    // 4. Fail-closed if no execution host is available
    throw new Error('Sanitization Host Unavailable: No DOM or offscreen document available to render masks safely');
  }
}
