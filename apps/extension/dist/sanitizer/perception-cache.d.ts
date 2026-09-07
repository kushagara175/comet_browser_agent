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
import { SanitizedContext } from '@privapilot/protocol';
/**
 * Computes a fast 32-bit FNV-1a hash using bitwise 32-bit arithmetic (no BigInt overhead).
 */
export declare function fnv1a32(str: string, seed?: number): number;
/**
 * Computes a 64-bit FNV-1a hash using two 32-bit lanes (avoiding BigInt overhead).
 */
export declare function fnv1a64(str: string): string;
/**
 * Computes a 64-bit split hash (two 32-bit lanes) over DOM element structure and names.
 */
export declare function computeDomHash(elements: ReadonlyArray<{
    localId: string;
    role: string;
    rawName?: string;
    sanitizedName?: string;
}>): string;
/**
 * Computes a high-sensitivity perceptual difference hash (dHash) over a canvas bitmap.
 * Uses a 4x4 grid of 16x16 tile hashes (256 bits per tile, 16 tiles total).
 * Invalidate the cache if ANY localized region (e.g. 12px text or 64px avatar) changes.
 * Total cost: 16 small 17x16 draws (<1.5 ms total in offscreen canvas).
 */
export declare function computeCanvasDHash(canvas: HTMLCanvasElement | OffscreenCanvas): string;
export declare class PerceptionCache {
    private static cache;
    private static ttlMs;
    static setTtl(ttlMs: number): void;
    /**
     * Builds the sound composite cache key.
     */
    static buildKey(domHash: string, viewportHash: string, canvasDHash: string): string;
    /**
     * Retrieves cached sanitized context if present and unexpired.
     */
    static get(key: string): SanitizedContext | null;
    /**
     * Stores sanitized context into cache with current timestamp.
     */
    static set(key: string, sanitized: SanitizedContext): void;
    static clear(): void;
    static size(): number;
}
//# sourceMappingURL=perception-cache.d.ts.map