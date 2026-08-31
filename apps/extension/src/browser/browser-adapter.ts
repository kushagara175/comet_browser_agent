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
      api.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl: string) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
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

    return new Promise((resolve, reject) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else if (tabs.length === 0) {
          reject(new Error('No active tab found'));
        } else {
          resolve({
            id: tabs[0].id,
            url: tabs[0].url || '',
            title: tabs[0].title || ''
          });
        }
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
        request.goal
      );
    }

    // 3. Fail-closed if no execution host is available
    throw new Error('Sanitization Host Unavailable: No DOM or offscreen document available to render masks safely');
  }
}
