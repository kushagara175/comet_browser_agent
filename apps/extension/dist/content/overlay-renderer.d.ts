/**
 * @privapilot/extension - Content Script In-Page Overlay HUD
 *
 * Renders prominent, high-visibility visual boundaries around inspected and targeted DOM elements
 * with real-time action feedback and clean post-action dismissal ("so after click it goes").
 */
export declare class OverlayRenderer {
    private overlayContainer;
    private currentBox;
    private clearTimer;
    private workingGlowEl;
    private glowWatchdogTimer;
    private cursorEl;
    private cursorDismissTimer;
    private currentCursorX;
    private currentCursorY;
    private shieldEl;
    private shieldWatchdogTimer;
    private boundShieldHandler;
    private isShieldActive;
    ensureContainer(): HTMLElement;
    highlightTargetElement(el: HTMLElement, label?: string, durationMs?: number): void;
    /**
     * Briefly flashes the target box green when the click/action is dispatched,
     * then smoothly fades out and dismisses ("so after click it goes").
     */
    flashActionDispatched(): void;
    private dismissBox;
    clear(): void;
    private ensureGlowStyles;
    showAgentWorkingGlow(label?: string): void;
    hideAgentWorkingGlow(): void;
    /**
     * Ensures the visual AI agent cursor element exists in the DOM.
     */
    ensureCursor(): HTMLElement;
    /**
     * Smoothly glides the AI agent cursor to the target element's position with cubic Bézier easing.
     */
    glideCursorTo(el: HTMLElement, actionKind?: string, extraText?: string, durationMs?: number): Promise<void>;
    /**
     * Spawns an animated click ripple at the cursor's current location.
     */
    triggerClickRipple(): void;
    /**
     * Highlights the badge with an active typing glow.
     */
    triggerTypingBadge(): void;
    /**
     * Smoothly fades out and parks the agent cursor.
     */
    hideCursor(delayMs?: number): void;
    /**
     * Enables the in-page execution safety shield to prevent accidental user mouse/keyboard
     * interference while an agent action or batch is running.
     */
    enableSafetyShield(label?: string): void;
    /**
     * Disables the safety shield and restores full user mouse and keyboard control.
     */
    disableSafetyShield(): void;
    isExternalInputLocked(): boolean;
}
//# sourceMappingURL=overlay-renderer.d.ts.map