/**
 * @privapilot/extension - Content Script In-Page Overlay HUD
 *
 * Renders subtle visual boundaries around inspected and targeted DOM elements.
 */
export declare class OverlayRenderer {
    private overlayContainer;
    ensureContainer(): HTMLElement;
    highlightTargetElement(el: HTMLElement, label?: string): void;
    clear(): void;
}
//# sourceMappingURL=overlay-renderer.d.ts.map