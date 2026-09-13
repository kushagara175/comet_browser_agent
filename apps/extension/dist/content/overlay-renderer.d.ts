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
}
//# sourceMappingURL=overlay-renderer.d.ts.map