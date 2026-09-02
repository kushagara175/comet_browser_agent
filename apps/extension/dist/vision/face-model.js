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
/**
 * Pre-computes the 4,420 static anchor boxes for UltraFace-320 (320x240 input).
 */
export function generateUltraFaceAnchors() {
    const featureMaps = [
        [40, 30], // Layer 1 (stride 8)
        [20, 15], // Layer 2 (stride 16)
        [10, 8], // Layer 3 (stride 32)
        [5, 4] // Layer 4 (stride 64)
    ];
    const minSizes = [
        [10, 16, 24], // 3 anchors per cell -> 40*30*3 = 3600
        [32, 48], // 2 anchors per cell -> 20*15*2 = 600
        [64, 96], // 2 anchors per cell -> 10*8*2  = 160
        [128, 192, 256] // 3 anchors per cell -> 5*4*3   = 60
    ];
    const inputWidth = 320;
    const inputHeight = 240;
    const anchors = [];
    for (let k = 0; k < featureMaps.length; k++) {
        const [fmW, fmH] = featureMaps[k];
        const sizes = minSizes[k];
        for (let i = 0; i < fmH; i++) {
            for (let j = 0; j < fmW; j++) {
                const cx = (j + 0.5) / fmW;
                const cy = (i + 0.5) / fmH;
                for (const size of sizes) {
                    const w = size / inputWidth;
                    const h = size / inputHeight;
                    anchors.push({ cx, cy, w, h });
                }
            }
        }
    }
    return anchors;
}
export const ULTRA_FACE_ANCHORS = generateUltraFaceAnchors();
/**
 * Applies Intersection-over-Union (IoU) Non-Maximum Suppression.
 */
export function applyNMS(boxes, iouThreshold = 0.35) {
    boxes.sort((a, b) => b.score - a.score);
    const selected = [];
    for (const box of boxes) {
        let shouldKeep = true;
        for (const kept of selected) {
            const xA = Math.max(box.xmin, kept.xmin);
            const yA = Math.max(box.ymin, kept.ymin);
            const xB = Math.min(box.xmax, kept.xmax);
            const yB = Math.min(box.ymax, kept.ymax);
            const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
            const boxArea = (box.xmax - box.xmin) * (box.ymax - box.ymin);
            const keptArea = (kept.xmax - kept.xmin) * (kept.ymax - kept.ymin);
            const unionArea = boxArea + keptArea - interArea;
            const iou = unionArea > 0 ? interArea / unionArea : 0;
            if (iou > iouThreshold) {
                shouldKeep = false;
                break;
            }
        }
        if (shouldKeep) {
            selected.push(box);
        }
    }
    return selected;
}
/**
 * Preprocesses an input canvas into planar NCHW float tensor for UltraFace (320x240 RGB).
 */
export function preprocessCanvasToNCHW(sourceCanvas, targetWidth = 320, targetHeight = 240) {
    let scratchCanvas;
    if (typeof document !== 'undefined') {
        scratchCanvas = document.createElement('canvas');
    }
    else {
        scratchCanvas = { getContext: () => null };
    }
    scratchCanvas.width = targetWidth;
    scratchCanvas.height = targetHeight;
    const ctx = scratchCanvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context unavailable for face model preprocessing');
    }
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    // Planar NCHW format: [1, 3, 240, 320]
    // Normalization: (x - 127.0) / 128.0
    const totalPixels = targetWidth * targetHeight;
    const tensorData = new Float32Array(3 * totalPixels);
    const rOffset = 0;
    const gOffset = totalPixels;
    const bOffset = totalPixels * 2;
    for (let i = 0; i < totalPixels; i++) {
        const srcIdx = i * 4;
        tensorData[rOffset + i] = (data[srcIdx] - 127.0) / 128.0;
        tensorData[gOffset + i] = (data[srcIdx + 1] - 127.0) / 128.0;
        tensorData[bOffset + i] = (data[srcIdx + 2] - 127.0) / 128.0;
    }
    return tensorData;
}
/**
 * Parses raw scores and box offsets from UltraFace-320 output tensors.
 */
export function parseUltraFaceOutputs(scoresData, boxesData, origWidth, origHeight, confidenceThreshold = 0.70, iouThreshold = 0.35) {
    const centerVariance = 0.1;
    const sizeVariance = 0.2;
    const candidates = [];
    const numAnchors = ULTRA_FACE_ANCHORS.length; // 4,420
    for (let i = 0; i < numAnchors; i++) {
        // Softmax over 2 classes (bg vs face)
        const scoreBg = scoresData[i * 2];
        const scoreFace = scoresData[i * 2 + 1];
        const maxScore = Math.max(scoreBg, scoreFace);
        const expBg = Math.exp(scoreBg - maxScore);
        const expFace = Math.exp(scoreFace - maxScore);
        const faceProb = expFace / (expBg + expFace);
        if (faceProb >= confidenceThreshold) {
            const anchor = ULTRA_FACE_ANCHORS[i];
            const boxOffsetIdx = i * 4;
            const dx = boxesData[boxOffsetIdx];
            const dy = boxesData[boxOffsetIdx + 1];
            const dw = boxesData[boxOffsetIdx + 2];
            const dh = boxesData[boxOffsetIdx + 3];
            const cx = dx * centerVariance * anchor.w + anchor.cx;
            const cy = dy * centerVariance * anchor.h + anchor.cy;
            const w = Math.exp(dw * sizeVariance) * anchor.w;
            const h = Math.exp(dh * sizeVariance) * anchor.h;
            // Scale to physical screenshot dimensions
            const xmin = Math.max(0, (cx - w / 2) * origWidth);
            const ymin = Math.max(0, (cy - h / 2) * origHeight);
            const xmax = Math.min(origWidth, (cx + w / 2) * origWidth);
            const ymax = Math.min(origHeight, (cy + h / 2) * origHeight);
            if (xmax > xmin && ymax > ymin) {
                candidates.push({ xmin, ymin, xmax, ymax, score: faceProb });
            }
        }
    }
    return applyNMS(candidates, iouThreshold);
}
/**
 * Singleton ONNX model session manager for the offscreen document.
 */
export class UltraFaceModelRunner {
    static session = null;
    static providerUsed = 'wasm';
    static initPromise = null;
    static assetBase = null;
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
    static configure(assetBase) {
        if (assetBase !== this.assetBase) {
            this.session = null;
            this.initPromise = null;
        }
        this.assetBase = assetBase ? assetBase.replace(/\/+$/, '') : null;
    }
    /**
     * Initializes the ONNX session once per offscreen document lifecycle.
     */
    static async initialize() {
        if (this.session) {
            return this.providerUsed;
        }
        if (this.initPromise) {
            await this.initPromise;
            return this.providerUsed;
        }
        this.initPromise = (async () => {
            // Dynamic import to support both browser extension and headless test environments
            const ort = await import('onnxruntime-web');
            // Configure local WASM paths
            const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
            if (this.assetBase) {
                ort.env.wasm.wasmPaths = `${this.assetBase}/wasm/`;
            }
            else if (hasChromeRuntime) {
                ort.env.wasm.wasmPaths = chrome.runtime.getURL('assets/wasm/');
            }
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
            const modelPath = this.assetBase
                ? `${this.assetBase}/models/version-RFB-320.onnx`
                : hasChromeRuntime
                    ? chrome.runtime.getURL('assets/models/version-RFB-320.onnx')
                    : './apps/extension/assets/models/version-RFB-320.onnx';
            // 1. Try WebGPU if available in browser
            if (typeof navigator !== 'undefined' && navigator.gpu) {
                try {
                    this.session = await ort.InferenceSession.create(modelPath, {
                        executionProviders: ['webgpu']
                    });
                    this.providerUsed = 'webgpu';
                    return;
                }
                catch {
                    // WebGPU unavailable or failed, fall through to WASM
                }
            }
            // 2. Fall back to CPU WASM for 100% correctness
            this.session = await ort.InferenceSession.create(modelPath, {
                executionProviders: ['wasm']
            });
            this.providerUsed = 'wasm';
        })().finally(() => {
            this.initPromise = null;
        });
        await this.initPromise;
        return this.providerUsed;
    }
    /**
     * Runs face detection against the raw screenshot canvas.
     */
    static async detectFaces(screenshotCanvas, transformer) {
        const t0 = Date.now();
        try {
            const provider = await this.initialize();
            const tensorData = preprocessCanvasToNCHW(screenshotCanvas, 320, 240);
            const ort = await import('onnxruntime-web');
            const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 240, 320]);
            const feeds = {};
            const inputName = this.session.inputNames[0] || 'input';
            feeds[inputName] = inputTensor;
            const results = await this.session.run(feeds);
            const scoresName = this.session.outputNames[0] || 'scores';
            const boxesName = this.session.outputNames[1] || 'boxes';
            const scoresTensor = results[scoresName] || Object.values(results)[0];
            const boxesTensor = results[boxesName] || Object.values(results)[1];
            const origWidth = screenshotCanvas.width;
            const origHeight = screenshotCanvas.height;
            const rawDetections = parseUltraFaceOutputs(scoresTensor.data, boxesTensor.data, origWidth, origHeight, 0.70, 0.35);
            const detectedFaces = rawDetections.map((d, idx) => {
                // Apply 12px conservative padding
                const padding = 12;
                const x = Math.max(0, d.xmin - padding);
                const y = Math.max(0, d.ymin - padding);
                const w = Math.min(origWidth - x, (d.xmax - d.xmin) + padding * 2);
                const h = Math.min(origHeight - y, (d.ymax - d.ymin) + padding * 2);
                const screenshotBox = {
                    space: 'screenshotPixel',
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(w),
                    height: Math.round(h)
                };
                const viewportBox = transformer.toViewportBox(screenshotBox);
                return {
                    id: `face_onnx_${idx}_${Date.now()}`,
                    confidence: d.score,
                    screenshotBox,
                    viewportBox
                };
            });
            return {
                faces: detectedFaces,
                providerUsed: provider,
                durationMs: Date.now() - t0
            };
        }
        catch {
            // Return empty faces with heuristic fallback indicator
            return {
                faces: [],
                providerUsed: 'heuristic_fallback',
                durationMs: Date.now() - t0
            };
        }
    }
}
//# sourceMappingURL=face-model.js.map