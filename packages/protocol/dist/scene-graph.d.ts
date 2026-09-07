/**
 * @privapilot/protocol - SceneGraph Schema & Contracts
 *
 * Unified representation of page perception produced by fusing the parallel
 * DOM lane and on-device Vision lane.
 *
 * Privacy Invariants:
 * 1. `ref` is strictly opaque (e.g. "el_17") — the ONLY element identifier that may cross the network boundary.
 * 2. `labelHint` is strictly PII-screened before admission.
 * 3. `conflicts` is CLIENT-INTERNAL ONLY. It is retained for audit and ablation diagnostics,
 *    and NEVER serialized into network wire payloads.
 */
export type SceneGraphProvenance = 'dom' | 'vision' | 'fused';
export interface SceneGraphElement {
    /** Opaque identifier, e.g. "el_17" — the ONLY element identifier that may cross the network boundary */
    readonly ref: string;
    /** Normalized bounding box [normX, normY, normW, normH] between 0 and 1 */
    readonly bbox: readonly [number, number, number, number];
    /** Unified semantic role: button | input | link | text | image | container... */
    readonly role: string;
    /** Affordances: clickable | typable | selectable | scrollable */
    readonly affordances: ReadonlyArray<string>;
    /** Perception confidence score between 0.0 and 1.0 */
    readonly confidence: number;
    /** Which perception lane supplied or resolved this element */
    readonly provenance: SceneGraphProvenance;
    /** Visible label or semantic name, GUARANTEED PII-screened before admission */
    readonly labelHint?: string;
    /** Whether vision salience identified this element as the primary call-to-action */
    readonly primaryCta?: boolean;
}
/**
 * Audit and debugging record of a disagreement between DOM and Vision lanes.
 * STRICTLY CLIENT-INTERNAL: NEVER serialized into network payloads.
 */
export interface SceneGraphConflict {
    readonly ref: string;
    readonly domClaim: {
        readonly role?: string;
        readonly bbox?: readonly [number, number, number, number];
        readonly disabled?: boolean;
        readonly inputType?: string;
        readonly ariaRole?: string;
        readonly confidence?: number;
        readonly text?: string;
    };
    readonly visionClaim: {
        readonly role?: string;
        readonly bbox?: readonly [number, number, number, number];
        readonly confidence?: number;
        readonly visuallyOccluded?: boolean;
        readonly primaryCta?: boolean;
        readonly surfaceType?: string;
        readonly conceptMatch?: string;
    };
    readonly resolvedTo: SceneGraphProvenance;
    readonly reason: string;
}
export interface SceneGraph {
    readonly elements: ReadonlyArray<SceneGraphElement>;
    /** Retained client-side only for auditing, telemetry, and ablation evaluation */
    readonly conflicts: ReadonlyArray<SceneGraphConflict>;
}
//# sourceMappingURL=scene-graph.d.ts.map