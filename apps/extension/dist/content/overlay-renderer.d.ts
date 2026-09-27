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
    private cropBoxEl;
    private cropBoxTimer;
    private scanBeamEl;
    private cursorEl;
    private cursorDismissTimer;
    private currentCursorX;
    private currentCursorY;
    private isAgentCursorActive;
    private boundMouseMove;
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
    /**
     * Highlights the specific captured region with an animated "rope / marching-ants" viewfinder border
     * for 2.5 - 3 seconds, giving the user immediate live visual proof of the cropped area.
     */
    highlightFocusedCropRegion(rect: {
        x: number;
        y: number;
        width: number;
        height: number;
        type?: string;
    }, durationMs?: number): void;
    private ensureGlowStyles;
    showAgentWorkingGlow(label?: string): void;
    /**
     * Refreshes the visual scanning beam whenever the page scene is scanned / DOM snapshot is taken.
     * Keeps the ambient blue glow steady without tearing it down, providing an authentic scan pulse.
     */
    triggerScanSweep(): void;
    hideAgentWorkingGlow(): void;
    /**
     * Minimal SVG action icons (no tacky emojis).
     */
    private static readonly MINIMAL_ICONS;
    /**
     * Ensures the visual AI agent cursor element exists in the DOM.
     */
    ensureCursor(): HTMLElement;
    /**
     * Switches the pointer shape to match human cursor conventions (arrow, link hand, text caret).
     */
    setCursorPointerType(type: 'arrow' | 'hand' | 'caret'): void;
    private updateCursorBadge;
    /**
     * Computes the exact interactive target point (screen coordinates) for an element,
     * accounting for element semantics (buttons, text inputs, links) and cursor hotspot tip offsets.
     */
    computeTargetPoint(el: HTMLElement, cursorType: 'arrow' | 'hand' | 'caret'): {
        targetX: number;
        targetY: number;
        containerX: number;
        containerY: number;
    };
    /**
     * Glides the cursor along a natural human curved trajectory to the target element
     * using Ken Perlin's Smootherstep velocity easing and live element tracking.
     */
    glideCursorTo(el: HTMLElement, actionKind?: string, extraText?: string, durationMs?: number): Promise<void>;
    /**
     * Simulates a physical human mouse press down and release.
     */
    animateClickPress(): Promise<void>;
    /**
     * Simulates a physical human mouse drag from a source element to a destination element.
     */
    animateDrag(sourceEl: HTMLElement, destEl: HTMLElement): Promise<void>;
    /**
     * Spawns an animated click ripple at the cursor's current location.
     */
    triggerClickRipple(): void;
    /**
     * Highlights the badge with an active typing glow.
     */
    triggerTypingBadge(): void;
    /**
     * Parks or fades out the agent cursor after an extended idle delay.
     * Default delay is 15s so cursor remains resting on screen like a real user's mouse!
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