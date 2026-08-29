/**
 * @privapilot/extension - Browser API Adapter
 *
 * Provides a clean cross-browser abstraction for:
 * - Tab screenshot capture (captureVisibleTab)
 * - Message passing (runtime.sendMessage / tabs.sendMessage)
 * - Local storage
 */

declare const chrome: any;

export interface BrowserAdapter {
  captureVisibleTab(): Promise<string>;
  sendMessageToTab<T = any>(tabId: number, message: any): Promise<T>;
  sendMessageToRuntime<T = any>(message: any): Promise<T>;
  getActiveTab(): Promise<{ id: number; url: string; title: string }>;
  getStorage<T>(key: string): Promise<T | null>;
  setStorage<T>(key: string, value: T): Promise<void>;
}

export class WebExtensionAdapter implements BrowserAdapter {
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
      return { id: 1, url: 'http://localhost:4500', title: 'Test Portal' };
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
}
