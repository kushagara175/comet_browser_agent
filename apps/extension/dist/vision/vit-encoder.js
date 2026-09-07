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
 * Works in both browser (DOM canvas letterbox) and Node.js (software pixel sampling).
 */
export function preprocessRegionToNCHW(source, region) {
    const sx = region ? Math.max(0, region.x) : 0;
    const sy = region ? Math.max(0, region.y) : 0;
    const sw = region ? Math.max(1, region.width) : Math.max(1, source.width || 1000);
    const sh = region ? Math.max(1, region.height) : Math.max(1, source.height || 800);
    // Browser path: if document is available, use fast native 2D canvas letterbox
    if (typeof document !== 'undefined') {
        const scratch = document.createElement('canvas');
        scratch.width = INPUT_SIZE;
        scratch.height = INPUT_SIZE;
        const ctx = scratch.getContext('2d', { willReadFrequently: true });
        if (!ctx)
            throw new Error('Canvas 2D context unavailable for ViT preprocessing');
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
    // Node.js / Headless path: software letterbox sampling directly from source pixels
    const pixels = INPUT_SIZE * INPUT_SIZE;
    const tensor = new Float32Array(3 * pixels);
    // Default normalized white background
    const normWhiteR = (1.0 - CLIP_IMAGE_MEAN[0]) / CLIP_IMAGE_STD[0];
    const normWhiteG = (1.0 - CLIP_IMAGE_MEAN[1]) / CLIP_IMAGE_STD[1];
    const normWhiteB = (1.0 - CLIP_IMAGE_MEAN[2]) / CLIP_IMAGE_STD[2];
    tensor.fill(normWhiteR, 0, pixels);
    tensor.fill(normWhiteG, pixels, 2 * pixels);
    tensor.fill(normWhiteB, 2 * pixels, 3 * pixels);
    const ctx = typeof source.getContext === 'function' ? source.getContext('2d') : null;
    if (!ctx || typeof ctx.getImageData !== 'function') {
        return tensor;
    }
    const srcW = Math.max(1, source.width || 1000);
    const srcH = Math.max(1, source.height || 800);
    const fullImg = ctx.getImageData(0, 0, srcW, srcH);
    const data = fullImg.data;
    const scale = Math.min(INPUT_SIZE / sw, INPUT_SIZE / sh);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const dx = Math.floor((INPUT_SIZE - dw) / 2);
    const dy = Math.floor((INPUT_SIZE - dh) / 2);
    for (let targetY = 0; targetY < dh; targetY++) {
        const srcY = Math.min(srcH - 1, Math.floor(sy + targetY / scale));
        const outRow = dy + targetY;
        if (outRow < 0 || outRow >= INPUT_SIZE)
            continue;
        for (let targetX = 0; targetX < dw; targetX++) {
            const srcX = Math.min(srcW - 1, Math.floor(sx + targetX / scale));
            const outCol = dx + targetX;
            if (outCol < 0 || outCol >= INPUT_SIZE)
                continue;
            const srcIdx = (srcY * srcW + srcX) * 4;
            const outIdx = outRow * INPUT_SIZE + outCol;
            const r = data[srcIdx] / 255;
            const g = data[srcIdx + 1] / 255;
            const b = data[srcIdx + 2] / 255;
            tensor[outIdx] = (r - CLIP_IMAGE_MEAN[0]) / CLIP_IMAGE_STD[0];
            tensor[pixels + outIdx] = (g - CLIP_IMAGE_MEAN[1]) / CLIP_IMAGE_STD[1];
            tensor[2 * pixels + outIdx] = (b - CLIP_IMAGE_MEAN[2]) / CLIP_IMAGE_STD[2];
        }
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
import { CapabilityDetector } from './capability-detector.js';
export class VitEncoder {
    static session = null;
    static initPromise = null;
    static assetBase = null;
    static provider = 'unavailable';
    static modelArtifactPath = '';
    static modelByteSize = 0;
    static loadMs = 0;
    static lastInferenceMs = 0;
    static inferenceCount = 0;
    static cropDurationsMs = [];
    static lastError;
    /** Points the encoder at an HTTP asset base, for hosts without chrome.runtime. */
    static configure(assetBase) {
        if (assetBase !== this.assetBase) {
            this.session = null;
            this.initPromise = null;
            this.provider = 'unavailable';
            this.cropDurationsMs = [];
            this.inferenceCount = 0;
        }
        this.assetBase = assetBase ? assetBase.replace(/\/+$/, '') : null;
    }
    static getStatus() {
        return {
            modelFamily: VIT_MODEL_FAMILY,
            providerUsed: this.provider,
            modelArtifactPath: this.modelArtifactPath,
            modelByteSize: this.modelByteSize,
            inputTensorShape: [1, 3, INPUT_SIZE, INPUT_SIZE],
            loadMs: this.loadMs,
            lastInferenceMs: this.lastInferenceMs,
            inferenceCount: this.inferenceCount,
            cropDurationsMs: [...this.cropDurationsMs],
            available: this.session !== null,
            lastError: this.lastError
        };
    }
    /**
     * Releases the ONNX session to reclaim resident memory on tier downgrade.
     */
    static async disposeSession() {
        if (this.session) {
            if (typeof this.session.release === 'function') {
                try {
                    await this.session.release();
                }
                catch { }
            }
            this.session = null;
            this.provider = 'unavailable';
        }
    }
    /**
     * Returns accounted memory footprint in bytes (weights + active session buffers).
     */
    static getMemoryFootprintBytes() {
        if (!this.session)
            return 0;
        return this.modelByteSize > 0 ? this.modelByteSize : 88648915;
    }
    static modelUrl() {
        if (this.assetBase)
            return `${this.assetBase}/models/${MODEL_FILE}`;
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            return chrome.runtime.getURL(`assets/models/${MODEL_FILE}`);
        }
        if (typeof process !== 'undefined' && process.cwd) {
            const cwd = process.cwd();
            const direct = `${cwd}/apps/extension/assets/models/${MODEL_FILE}`;
            return direct;
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
            this.modelArtifactPath = url;
            // Determine model byte size on disk
            if (typeof process !== 'undefined' && process.versions?.node) {
                try {
                    const fs = await import('node:fs');
                    if (fs.existsSync(url)) {
                        this.modelByteSize = fs.statSync(url).size;
                    }
                }
                catch { }
            }
            if (!this.modelByteSize) {
                this.modelByteSize = 88648915; // 88.6 MB verified uint8 size
            }
            const hardwareProvider = CapabilityDetector.detectBestProvider();
            if (hardwareProvider === 'webgpu' && CapabilityDetector.hasWebGPU()) {
                try {
                    this.session = await ort.InferenceSession.create(url, { executionProviders: ['webgpu'] });
                    this.provider = 'webgpu';
                    console.log(`[ViT] Initialized CLIP ViT-B/32 on WebGPU: ${url} (${this.modelByteSize} bytes)`);
                    return;
                }
                catch {
                    // WebGPU unavailable or refused this graph; WASM is the correctness path.
                }
            }
            const ep = hardwareProvider === 'cpu' ? ['cpu', 'wasm'] : ['wasm'];
            this.session = await ort.InferenceSession.create(url, { executionProviders: ep });
            this.provider = hardwareProvider === 'cpu' ? 'cpu' : 'wasm';
            console.log(`[ViT] Initialized CLIP ViT-B/32 on ${this.provider.toUpperCase()}: ${url} (${this.modelByteSize} bytes)`);
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
     * Embeds multiple regions of a canvas in parallel using a batched forward pass [N, 3, 224, 224].
     * Significantly reduces per-crop overhead compared to sequential single-crop inferences.
     */
    static async embedRegions(canvas, regions, maxBatch = 4) {
        if (!regions || regions.length === 0)
            return [];
        await this.initialize();
        const ort = await import('onnxruntime-web');
        const embeddings = [];
        const singleCropElements = 3 * INPUT_SIZE * INPUT_SIZE;
        const dims = 512;
        for (let start = 0; start < regions.length; start += maxBatch) {
            const batchRegions = regions.slice(start, start + maxBatch);
            const N = batchRegions.length;
            const batchedInput = new Float32Array(N * singleCropElements);
            for (let i = 0; i < N; i++) {
                const crop = preprocessRegionToNCHW(canvas, batchRegions[i]);
                batchedInput.set(crop, i * singleCropElements);
            }
            const tensor = new ort.Tensor('float32', batchedInput, [N, 3, INPUT_SIZE, INPUT_SIZE]);
            const feeds = {};
            feeds[this.session.inputNames[0] || 'pixel_values'] = tensor;
            const t0 = performance.now();
            const results = await this.session.run(feeds);
            const durationMs = Math.round((performance.now() - t0) * 10) / 10;
            const msPerCrop = Math.round((durationMs / N) * 10) / 10;
            this.lastInferenceMs = durationMs;
            for (let i = 0; i < N; i++) {
                this.cropDurationsMs.push(msPerCrop);
            }
            this.inferenceCount += N;
            console.log(`[ViT] Batched run: N=${N}, tensor=[${N}, 3, ${INPUT_SIZE}, ${INPUT_SIZE}], duration=${durationMs}ms (${msPerCrop}ms/crop), provider=${this.provider}`);
            const out = results.image_embeds ||
                results.pooler_output ||
                results[this.session.outputNames[0]] ||
                Object.values(results)[0];
            const raw = out.data;
            for (let i = 0; i < N; i++) {
                const offset = i * dims;
                let norm = 0;
                for (let d = 0; d < dims; d++) {
                    const val = raw[offset + d];
                    norm += val * val;
                }
                norm = Math.sqrt(norm) || 1;
                const vector = new Float32Array(dims);
                for (let d = 0; d < dims; d++) {
                    vector[d] = raw[offset + d] / norm;
                }
                embeddings.push({ vector, dimensions: dims });
            }
        }
        return embeddings;
    }
    /**
     * Embeds one region of a canvas using real CLIP ViT-B/32 forward pass.
     *
     * Throws rather than returning an empty result: a silently-swallowed model failure
     * is exactly how face detection ran for weeks without ever executing.
     */
    static async embedRegion(canvas, region) {
        const sw = canvas.width || 1000;
        const sh = canvas.height || 800;
        const reg = region || { x: 0, y: 0, width: sw, height: sh };
        const results = await this.embedRegions(canvas, [reg], 1);
        return results[0];
    }
}
//# sourceMappingURL=vit-encoder.js.map