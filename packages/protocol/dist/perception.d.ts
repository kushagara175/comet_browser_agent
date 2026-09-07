/**
 * @privapilot/protocol - Visual & DOM Perception Contracts (Stage E)
 */
export type PerceptionSource = 'dom' | 'vision' | 'fused';
export type PerceptionMode = 'dom-only' | 'vision-only' | 'fused';
export interface VisualRegionProposal {
    readonly visualRegionId: string;
    readonly role: 'button' | 'input' | 'dialog' | 'icon' | 'link' | 'unknown';
    readonly bounds: readonly [number, number, number, number];
    readonly pixelBox: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly edgeConfidence: number;
    readonly aspectRatio: number;
}
export interface PerceptionCandidate {
    readonly candidateId: string;
    readonly captureId: string;
    readonly role: string;
    readonly sanitizedName: string;
    readonly coarseBounds: readonly [number, number, number, number];
    readonly confidence: number;
    readonly actionCapabilities: ReadonlyArray<string>;
    readonly provenance: PerceptionSource;
    readonly domLocalId?: string;
    readonly visualRegionId?: string;
    readonly spatialAgreement?: number;
    readonly semanticAgreement?: number;
}
export interface PerceptionResult {
    readonly captureId: string;
    readonly mode: PerceptionMode;
    readonly candidates: ReadonlyArray<PerceptionCandidate>;
    readonly durationMs: number;
    readonly domCandidateCount: number;
    readonly visualCandidateCount: number;
    readonly fusedCandidateCount: number;
    readonly meanSpatialAgreement?: number;
}
//# sourceMappingURL=perception.d.ts.map