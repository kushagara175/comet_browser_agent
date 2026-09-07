/**
 * @privapilot/extension - Content Mutation Debouncer & Fast DOM Hash
 *
 * Listens for meaningful DOM mutations using a targeted attributeFilter,
 * excludes characterData noise, disconnects around PrivaPilot's overlay rendering,
 * and debounces perception triggers (250ms debounce, 1000ms maxWait).
 */
export interface ViewportSnapshot {
    readonly innerWidth: number;
    readonly innerHeight: number;
    readonly scrollX: number;
    readonly scrollY: number;
    readonly devicePixelRatio: number;
}
export declare class DomMutationTracker {
    private observer;
    private debounceTimer;
    private maxWaitTimer;
    private lastTriggerTime;
    private isMutated;
    private isSuspended;
    private readonly debounceDelayMs;
    private readonly maxWaitMs;
    private readonly onChangeCallback?;
    constructor(options?: {
        debounceDelayMs?: number;
        maxWaitMs?: number;
        onChange?: () => void;
    });
    /**
     * Attaches MutationObserver to the target root element.
     */
    start(rootNode?: Node): void;
    /**
     * Suspends observer while modifying the DOM (e.g. rendering action overlays).
     */
    runWithoutObserving<T>(fn: () => T): T;
    private scheduleDebouncedTrigger;
    private trigger;
    hasPendingMutations(): boolean;
    resetMutationFlag(): void;
    stop(): void;
    /**
     * Computes a fast 32-bit hash of the viewport geometry and scroll coordinates.
     */
    static computeViewportHash(viewport: ViewportSnapshot): string;
}
//# sourceMappingURL=mutation-debouncer.d.ts.map