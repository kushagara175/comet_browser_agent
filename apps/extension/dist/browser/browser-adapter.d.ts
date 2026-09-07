/**
 * @privapilot/extension - Browser API Adapter
 *
 * Provides a clean cross-browser abstraction for:
 * - Tab screenshot capture (captureVisibleTab)
 * - Message passing (runtime.sendMessage / tabs.sendMessage)
 * - Local storage
 */
import { RawCapture, SanitizedContext } from '@privapilot/protocol';
import { LocalDomSnapshot } from '../sanitizer/pipeline.js';
export interface SanitizationHostRequest {
    readonly rawCapture: RawCapture;
    readonly snapshot: LocalDomSnapshot;
    readonly goal: string;
}
export interface BrowserAdapter {
    captureVisibleTab(targetWindowId?: number | null): Promise<string>;
    sendMessageToTab<T = any>(tabId: number, message: any): Promise<T>;
    sendMessageToRuntime<T = any>(message: any): Promise<T>;
    getActiveTab(preferredTabId?: number): Promise<{
        id: number;
        url: string;
        title: string;
        windowId?: number;
    }>;
    getStorage<T>(key: string): Promise<T | null>;
    setStorage<T>(key: string, value: T): Promise<void>;
    runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext>;
}
export declare class WebExtensionAdapter implements BrowserAdapter {
    private offscreenCreationPromise;
    private offscreenCloseTimer;
    private lastCaptureTime;
    private get browserAPI();
    captureVisibleTab(targetWindowId?: number | null): Promise<string>;
    sendMessageToTab<T = any>(tabId: number, message: any): Promise<T>;
    sendMessageToRuntime<T = any>(message: any): Promise<T>;
    getActiveTab(preferredTabId?: number): Promise<{
        id: number;
        url: string;
        title: string;
        windowId?: number;
    }>;
    getStorage<T>(key: string): Promise<T | null>;
    setStorage<T>(key: string, value: T): Promise<void>;
    /**
     * Ensures singleton offscreen document is active in Chrome MV3.
     */
    private ensureOffscreenDocument;
    /**
     * Routes sanitization through the offscreen document host with correlation IDs and timeouts.
     */
    runInSanitizerHost(request: SanitizationHostRequest): Promise<SanitizedContext>;
}
//# sourceMappingURL=browser-adapter.d.ts.map