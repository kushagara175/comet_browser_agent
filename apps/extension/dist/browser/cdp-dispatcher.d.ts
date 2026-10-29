/**
 * @privapilot/extension - Hardware-Level Input Dispatcher (Chrome DevTools Protocol)
 *
 * Injects genuine hardware-level mouse clicks, typing, and scroll events directly into the
 * Chromium rendering pipeline via `chrome.debugger` to overcome synthetic event barriers
 * (React 18 concurrent mode, Shadow DOM widgets, canvas elements, custom drag-and-drop).
 */
export interface CdpPoint {
    x: number;
    y: number;
}
export interface CdpClickOptions {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    modifiers?: number;
}
export interface CdpTypeOptions {
    delayMs?: number;
}
export declare class CdpInputDispatcher {
    private static attachedTabs;
    private static detachTimers;
    /**
     * Checks if Chrome debugger API is available in the current runtime.
     */
    static isAvailable(): boolean;
    /**
     * Returns whether a tab is currently attached to the debugger.
     */
    static isAttached(tabId: number): boolean;
    /**
     * Attaches Chrome debugger to the specified tab if not already attached.
     */
    static attach(tabId: number): Promise<boolean>;
    /**
     * Detaches the debugger from the tab.
     */
    static detach(tabId: number): Promise<void>;
    /**
     * Schedules an auto-detach after idleMs to remove the top browser debugging banner.
     */
    static scheduleAutoDetach(tabId: number, idleMs?: number): void;
    private static cancelAutoDetach;
    private static handleDetachEvent;
    /**
     * Dispatches a native hardware mouse click at viewport coordinates (x, y).
     */
    static dispatchClick(tabId: number, x: number, y: number, options?: CdpClickOptions): Promise<boolean>;
    /**
     * Dispatches native hardware keyboard typing.
     */
    static dispatchType(tabId: number, text: string, options?: CdpTypeOptions): Promise<boolean>;
    /**
     * Dispatches hardware wheel scroll event.
     */
    static dispatchScroll(tabId: number, x: number, y: number, deltaX: number, deltaY: number): Promise<boolean>;
    /**
     * Dispatches genuine hardware-level drag-and-drop between two screen points.
     * Simulates continuous movement vectors across the Chromium compositor.
     */
    static dispatchDragAndDrop(tabId: number, from: CdpPoint, to: CdpPoint, steps?: number): Promise<boolean>;
    /**
     * Internal helper to send CDP commands asynchronously.
     */
    static sendCommand(tabId: number, method: string, params?: Record<string, any>): Promise<any>;
}
//# sourceMappingURL=cdp-dispatcher.d.ts.map