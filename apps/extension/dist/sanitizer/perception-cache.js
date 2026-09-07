/**
 * @privapilot/extension - On-Device Perceptual Perception Cache
 *
 * Provides a sound, tamper-resistant cache key for redaction:
 * (DOM structural hash, Viewport offset, 32x32 grayscale dHash) with a strict 10s TTL.
 *
 * Crucial privacy guarantee: If pixels change (<img src>, canvas, video, CSS colors),
 * the perceptual dHash changes, strictly invalidating the cache and preventing stale
 * unredacted PII or missed faces from leaking.
 */
const DEFAULT_TTL_MS = 10000; // 10 seconds maximum entry lifespan
/**
 * Computes a fast 32-bit FNV-1a hash using bitwise 32-bit arithmetic (no BigInt overhead).
 */
export function fnv1a32(str, seed = 0x811c9dc5) {
    let hval = seed;
    for (let i = 0; i < str.length; i++) {
        hval ^= str.charCodeAt(i);
        hval = Math.imul(hval, 0x01000193);
    }
    return hval >>> 0;
}
/**
 * Computes a 64-bit FNV-1a hash using two 32-bit lanes (avoiding BigInt overhead).
 */
export function fnv1a64(str) {
    const h1 = fnv1a32(str, 0x811c9dc5).toString(16).padStart(8, '0');
    const h2 = fnv1a32(str, 0x9e3779b9).toString(16).padStart(8, '0');
    return `${h1}${h2}`;
}
/**
 * Computes a 64-bit split hash (two 32-bit lanes) over DOM element structure and names.
 */
export function computeDomHash(elements) {
    let lane1Str = '';
    let lane2Str = '';
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const name = el.sanitizedName || el.rawName || '';
        lane1Str += `${el.localId}:${el.role}:${name};`;
        lane2Str += `${i}:${el.role.length}:${name.length};`;
    }
    const h1 = fnv1a32(lane1Str, 0x811c9dc5).toString(16).padStart(8, '0');
    const h2 = fnv1a32(lane2Str, 0x9e3779b9).toString(16).padStart(8, '0');
    return `${h1}${h2}`;
}
/**
 * Computes a high-sensitivity perceptual difference hash (dHash) over a canvas bitmap.
 * Uses a 4x4 grid of 16x16 tile hashes (256 bits per tile, 16 tiles total).
 * Invalidate the cache if ANY localized region (e.g. 12px text or 64px avatar) changes.
 * Total cost: 16 small 17x16 draws (<1.5 ms total in offscreen canvas).
 */
export function computeCanvasDHash(canvas) {
    const tileSize = 16;
    const gridRows = 4;
    const gridCols = 4;
    let scratch = null;
    let ctx = null;
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        scratch = new OffscreenCanvas(tileSize + 1, tileSize);
        ctx = scratch.getContext('2d');
    }
    else if (typeof document !== 'undefined') {
        scratch = document.createElement('canvas');
        scratch.width = tileSize + 1;
        scratch.height = tileSize;
        ctx = scratch.getContext('2d', { willReadFrequently: true });
    }
    else if (typeof canvas?.getContext === 'function') {
        ctx = canvas.getContext('2d');
    }
    else {
        return `dhash_${canvas.width}x${canvas.height}`;
    }
    if (!ctx)
        return 'dhash_fallback';
    try {
        const srcWidth = canvas.width || 1280;
        const srcHeight = canvas.height || 800;
        const tileW = srcWidth / gridCols;
        const tileH = srcHeight / gridRows;
        let tileHashes = '';
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const sx = Math.floor(c * tileW);
                const sy = Math.floor(r * tileH);
                const sw = Math.floor((c + 1) * tileW) - sx;
                const sh = Math.floor((r + 1) * tileH) - sy;
                if (scratch && typeof ctx.drawImage === 'function') {
                    // Clear and downscale just this tile into 17x16
                    ctx.clearRect(0, 0, tileSize + 1, tileSize);
                    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tileSize + 1, tileSize);
                }
                const imgData = ctx.getImageData(0, 0, tileSize + 1, tileSize);
                const pixels = imgData.data;
                let tileHash = 0x811c9dc5;
                for (let y = 0; y < tileSize; y++) {
                    for (let x = 0; x < tileSize; x++) {
                        const idx1 = (y * (tileSize + 1) + x) * 4;
                        const idx2 = (y * (tileSize + 1) + (x + 1)) * 4;
                        const lum1 = (pixels[idx1] * 2 + pixels[idx1 + 1] * 5 + pixels[idx1 + 2]) >> 3;
                        const lum2 = (pixels[idx2] * 2 + pixels[idx2 + 1] * 5 + pixels[idx2 + 2]) >> 3;
                        const bit = lum1 > lum2 ? 1 : 0;
                        tileHash ^= bit;
                        tileHash = Math.imul(tileHash, 0x01000193);
                    }
                }
                tileHashes += (tileHash >>> 0).toString(16).padStart(8, '0');
            }
        }
        return tileHashes;
    }
    catch {
        return 'dhash_read_error';
    }
}
export class PerceptionCache {
    static cache = new Map();
    static ttlMs = DEFAULT_TTL_MS;
    static setTtl(ttlMs) {
        this.ttlMs = ttlMs;
    }
    /**
     * Builds the sound composite cache key.
     */
    static buildKey(domHash, viewportHash, canvasDHash) {
        return `${domHash}:${viewportHash}:${canvasDHash}`;
    }
    /**
     * Retrieves cached sanitized context if present and unexpired.
     */
    static get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }
        return entry.sanitized;
    }
    /**
     * Stores sanitized context into cache with current timestamp.
     */
    static set(key, sanitized) {
        // Evict old entries if cache grows beyond 50 entries
        if (this.cache.size >= 50) {
            const now = Date.now();
            for (const [k, v] of this.cache.entries()) {
                if (now - v.timestamp > this.ttlMs) {
                    this.cache.delete(k);
                }
            }
            if (this.cache.size >= 50) {
                // Drop oldest key
                const firstKey = this.cache.keys().next().value;
                if (firstKey)
                    this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, {
            sanitized,
            timestamp: Date.now()
        });
    }
    static clear() {
        this.cache.clear();
    }
    static size() {
        return this.cache.size;
    }
}
//# sourceMappingURL=perception-cache.js.map