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
/** CLIP preprocessing constants, from the model's own preprocessor_config.json. */
const CLIP_IMAGE_MEAN = [0.48145466, 0.4578275, 0.40821073];
const CLIP_IMAGE_STD = [0.26862954, 0.26130258, 0.27577711];
const INPUT_SIZE = 224;
const MODEL_FILE = 'clip-vit-base-patch32-vision-uint8.onnx';
export const VIT_MODEL_FAMILY = 'CLIP ViT-B/32 (vision tower, uint8)';
/**
 * Converts a canvas region to the model's NCHW input tensor.
 *
 * Exported so the preprocessing can be tested directly: a normalization mistake here
 * produces embeddings that are confidently wrong rather than obviously broken.
 */
export function preprocessRegionToNCHW(source, region) {
    if (typeof document === 'undefined') {
        throw new Error('ViT preprocessing requires a document host');
    }
    const scratch = document.createElement('canvas');
    scratch.width = INPUT_SIZE;
    scratch.height = INPUT_SIZE;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx)
        throw new Error('Canvas 2D context unavailable for ViT preprocessing');
    const sx = region ? region.x : 0;
    const sy = region ? region.y : 0;
    const sw = region ? region.width : source.width;
    const sh = region ? region.height : source.height;
    // Letterbox rather than stretch. A control's aspect ratio is part of what it looks
    // like, and squashing a wide button into a square is a distortion the model was
    // never trained on.
    const scale = Math.min(INPUT_SIZE / sw, INPUT_SIZE / sh);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const dx = Math.floor((INPUT_SIZE - dw) / 2);
    const dy = Math.floor((INPUT_SIZE - dh) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const pixels = INPUT_SIZE * INPUT_SIZE;
    const tensor = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i++) {
        const src = i * 4;
        tensor[i] = (data[src] / 255 - CLIP_IMAGE_MEAN[0]) / CLIP_IMAGE_STD[0];
        tensor[pixels + i] = (data[src + 1] / 255 - CLIP_IMAGE_MEAN[1]) / CLIP_IMAGE_STD[1];
        tensor[2 * pixels + i] = (data[src + 2] / 255 - CLIP_IMAGE_MEAN[2]) / CLIP_IMAGE_STD[2];
    }
    return tensor;
}
/** Cosine similarity of two already-L2-normalized vectors. */
export function cosineSimilarity(a, b) {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < n; i++)
        dot += a[i] * b[i];
    return dot;
}
export class VitEncoder {
    static session = null;
    static initPromise = null;
    static assetBase = null;
    static provider = 'unavailable';
    static loadMs = 0;
    static lastInferenceMs = 0;
    static inferenceCount = 0;
    static lastError;
    /** Points the encoder at an HTTP asset base, for hosts without chrome.runtime. */
    static configure(assetBase) {
        if (assetBase !== this.assetBase) {
            this.session = null;
            this.initPromise = null;
            this.provider = 'unavailable';
        }
        this.assetBase = assetBase ? assetBase.replace(/\/+$/, '') : null;
    }
    static getStatus() {
        return {
            modelFamily: VIT_MODEL_FAMILY,
            providerUsed: this.provider,
            loadMs: this.loadMs,
            lastInferenceMs: this.lastInferenceMs,
            inferenceCount: this.inferenceCount,
            available: this.session !== null,
            lastError: this.lastError
        };
    }
    static modelUrl() {
        if (this.assetBase)
            return `${this.assetBase}/models/${MODEL_FILE}`;
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(`assets/models/${MODEL_FILE}`);
        }
        return `./apps/extension/assets/models/${MODEL_FILE}`;
    }
    static async initialize() {
        if (this.session)
            return this.provider;
        if (this.initPromise) {
            await this.initPromise;
            return this.provider;
        }
        const t0 = Date.now();
        this.initPromise = (async () => {
            const ort = await import('onnxruntime-web');
            if (this.assetBase) {
                ort.env.wasm.wasmPaths = `${this.assetBase}/wasm/`;
            }
            else if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
                ort.env.wasm.wasmPaths = chrome.runtime.getURL('assets/wasm/');
            }
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
            const url = this.modelUrl();
            if (typeof navigator !== 'undefined' && navigator.gpu) {
                try {
                    this.session = await ort.InferenceSession.create(url, { executionProviders: ['webgpu'] });
                    this.provider = 'webgpu';
                    return;
                }
                catch {
                    // WebGPU unavailable or refused this graph; WASM is the correctness path.
                }
            }
            this.session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] });
            this.provider = 'wasm';
        })().finally(() => {
            this.initPromise = null;
            this.loadMs = Date.now() - t0;
        });
        try {
            await this.initPromise;
            this.lastError = undefined;
        }
        catch (err) {
            this.provider = 'unavailable';
            this.lastError = String(err?.message || err);
            throw err;
        }
        return this.provider;
    }
    /**
     * Embeds one region of a canvas.
     *
     * Throws rather than returning an empty result: a silently-swallowed model failure
     * is exactly how face detection ran for weeks without ever executing. Callers
     * decide what to do when vision is unavailable, and say so in telemetry.
     */
    static async embedRegion(canvas, region) {
        await this.initialize();
        const ort = await import('onnxruntime-web');
        const input = preprocessRegionToNCHW(canvas, region);
        const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const feeds = {};
        feeds[this.session.inputNames[0] || 'pixel_values'] = tensor;
        const t0 = Date.now();
        const results = await this.session.run(feeds);
        this.lastInferenceMs = Date.now() - t0;
        this.inferenceCount++;
        // CLIPVisionModelWithProjection emits `image_embeds`; a plain vision model emits
        // `pooler_output`. Take whichever is present rather than assuming an export.
        const out = results.image_embeds ||
            results.pooler_output ||
            results[this.session.outputNames[0]] ||
            Object.values(results)[0];
        const raw = out.data;
        let norm = 0;
        for (let i = 0; i < raw.length; i++)
            norm += raw[i] * raw[i];
        norm = Math.sqrt(norm) || 1;
        const vector = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++)
            vector[i] = raw[i] / norm;
        return { vector, dimensions: vector.length };
    }
}
//# sourceMappingURL=vit-encoder.js.map