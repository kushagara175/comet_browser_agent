/**
 * @privapilot/extension - On-Device Vision Transformer Encoder
 *
 * CLIP ViT-B/32 vision tower: 12 transformer layers over 32x32 patches of a 224x224
 * input, uint8-quantized, bundled locally and run through the `onnxruntime-web` the
 * extension already depends on. No new runtime dependency, no CDN fetch.
 *
 * Why this model and not the smaller one: the problem statement asks for "a local
 * Vision Transformer (ViT) or equivalent computer vision model". UltraFace is an
 * SSD-style CNN, so the project was resting on "or equivalent" - a defence rather
 * than an answer. MobileCLIP-S0 is 12 MB against this model's 85 MB but its tower is
 * a hybrid conv-transformer, which puts the same argument straight back. This is an
 * unambiguous ViT. Whether the size is affordable is a measured question, not an
 * assumed one - see the resource budget phase.
 *
 * Only the IMAGE tower ships. Text embeddings would require the text encoder and a
 * BPE tokenizer at runtime; instead, reference vectors are generated offline and
 * shipped as a small table, so nothing here needs to tokenize anything.
 */
export declare const VIT_MODEL_FAMILY = "CLIP ViT-B/32 (vision tower, uint8)";
export type VitProvider = 'webgpu' | 'wasm' | 'unavailable';
export interface VitEmbedding {
    /** L2-normalized embedding, so a dot product is a cosine similarity. */
    readonly vector: Float32Array;
    readonly dimensions: number;
}
export interface VitStatus {
    readonly modelFamily: string;
    readonly providerUsed: VitProvider;
    readonly loadMs: number;
    readonly lastInferenceMs: number;
    readonly inferenceCount: number;
    readonly available: boolean;
    readonly lastError?: string;
}
/**
 * Converts a canvas region to the model's NCHW input tensor.
 *
 * Exported so the preprocessing can be tested directly: a normalization mistake here
 * produces embeddings that are confidently wrong rather than obviously broken.
 */
export declare function preprocessRegionToNCHW(source: HTMLCanvasElement | OffscreenCanvas, region?: {
    x: number;
    y: number;
    width: number;
    height: number;
}): Float32Array;
/** Cosine similarity of two already-L2-normalized vectors. */
export declare function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number;
export declare class VitEncoder {
    private static session;
    private static initPromise;
    private static assetBase;
    private static provider;
    private static loadMs;
    private static lastInferenceMs;
    private static inferenceCount;
    private static lastError;
    /** Points the encoder at an HTTP asset base, for hosts without chrome.runtime. */
    static configure(assetBase: string | null): void;
    static getStatus(): VitStatus;
    private static modelUrl;
    static initialize(): Promise<VitProvider>;
    /**
     * Embeds one region of a canvas.
     *
     * Throws rather than returning an empty result: a silently-swallowed model failure
     * is exactly how face detection ran for weeks without ever executing. Callers
     * decide what to do when vision is unavailable, and say so in telemetry.
     */
    static embedRegion(canvas: HTMLCanvasElement | OffscreenCanvas, region?: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): Promise<VitEmbedding>;
}
//# sourceMappingURL=vit-encoder.d.ts.map