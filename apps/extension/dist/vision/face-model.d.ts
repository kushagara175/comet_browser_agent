/**
 * @privapilot/extension - On-Device UltraFace-320 Vision Model Runner
 *
 * Runs locally inside the offscreen sanitization document host using ONNX Runtime Web.
 * Features:
 * - 100% locally bundled weights (zero CDN/network fetches).
 * - Tries WebGPU when supported, strictly falling back to CPU WASM.
 * - Accurate 4,420 anchor decoding and IoU Non-Maximum Suppression (NMS).
 * - Generates typed screenshot/viewport coordinate boxes with conservative padding.
 */
import { ScreenshotPixelBox, ViewportCssPixelBox } from '@privapilot/protocol';
import { CoordinateTransformer } from '../sanitizer/coordinate-transformer.js';
export interface DetectedFace {
    readonly id: string;
    readonly confidence: number;
    readonly screenshotBox: ScreenshotPixelBox;
    readonly viewportBox: ViewportCssPixelBox;
}
export interface FaceInferenceResult {
    readonly faces: ReadonlyArray<DetectedFace>;
    readonly providerUsed: 'webgpu' | 'wasm' | 'heuristic_fallback' | 'mock_test';
    readonly durationMs: number;
}
export interface Anchor {
    readonly cx: number;
    readonly cy: number;
    readonly w: number;
    readonly h: number;
}
/**
 * Pre-computes the 4,420 static anchor boxes for UltraFace-320 (320x240 input).
 */
export declare function generateUltraFaceAnchors(): Anchor[];
export declare const ULTRA_FACE_ANCHORS: ReadonlyArray<Anchor>;
/**
 * Applies Intersection-over-Union (IoU) Non-Maximum Suppression.
 */
export declare function applyNMS(boxes: Array<{
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
    score: number;
}>, iouThreshold?: number): Array<{
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
    score: number;
}>;
/**
 * Preprocesses an input canvas into planar NCHW float tensor for UltraFace (320x240 RGB).
 */
export declare function preprocessCanvasToNCHW(sourceCanvas: HTMLCanvasElement | OffscreenCanvas, targetWidth?: number, targetHeight?: number): Float32Array;
/**
 * Parses raw scores and box offsets from UltraFace-320 output tensors.
 */
export declare function parseUltraFaceOutputs(scoresData: Float32Array, boxesData: Float32Array, origWidth: number, origHeight: number, confidenceThreshold?: number, iouThreshold?: number): Array<{
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
    score: number;
}>;
/**
 * Singleton ONNX model session manager for the offscreen document.
 */
export declare class UltraFaceModelRunner {
    private static session;
    private static providerUsed;
    private static initPromise;
    private static assetBase;
    /**
     * Points the runner at an explicit asset base instead of `chrome.runtime`.
     *
     * Outside the extension there is no `chrome.runtime.getURL`, and the relative
     * fallback path resolves against the *page* URL - so in the benchmark harness the
     * model and the ORT wasm both 404, `create()` threw, and `detectFaces` reported
     * `heuristic_fallback` with an empty list. Every fixture silently scored as
     * "no faces found" while appearing to run the model. Giving the harness a real
     * base URL is what lets the model actually execute outside Chrome's extension
     * origin, and therefore what makes any face number measurable at all.
     */
    static configure(assetBase: string | null): void;
    /**
     * Initializes the ONNX session once per offscreen document lifecycle.
     */
    static initialize(): Promise<'webgpu' | 'wasm'>;
    /**
     * Runs face detection against the raw screenshot canvas.
     */
    static detectFaces(screenshotCanvas: HTMLCanvasElement | OffscreenCanvas, transformer: CoordinateTransformer): Promise<FaceInferenceResult>;
}
//# sourceMappingURL=face-model.d.ts.map