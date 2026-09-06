/**
 * @privapilot/extension - Cryptographic Payload Digest
 *
 * Implements deterministic canonical serialization and Web Crypto SHA-256 hashing.
 * Guarantees tamper detection and cryptographic integrity for sanitized context before
 * network transmission.
 *
 * Enforces privacy boundary: NEVER hashes or retains raw predictable PII.
 */
/**
 * Deterministically sorts object keys and serializes JSON into a canonical string.
 */
export declare function canonicalizeJson(value: any): string;
/**
 * Computes SHA-256 hex digest using standard Web Crypto API (browser & Node.js).
 */
export declare function computeSha256Hex(data: string | Uint8Array): Promise<string>;
/**
 * Canonical safe fields extracted for payload digest calculation.
 */
export interface SafePayloadDigestFields {
    captureId: string;
    goal: string;
    maskCount: number;
    pageState: {
        title: string;
        viewport: readonly [number, number] | number[];
    };
    elements: ReadonlyArray<{
        localId: string;
        role: string;
        sanitizedName: string;
        coarseBounds?: readonly [number, number, number, number] | number[];
        state?: ReadonlyArray<string> | string[];
        actionCapabilities?: ReadonlyArray<string> | string[];
    }>;
}
/**
 * Extracts strictly safe, non-sensitive structural fields and computes their SHA-256 digest.
 * Returns formatted as `sha256_${64_hex_chars}`.
 */
export declare function computePayloadDigestSha256(payload: any): Promise<string>;
/**
 * Verifies that a payload's declared digest matches its actual canonical contents.
 */
export declare function verifyPayloadDigestSha256(payload: any, expectedDigest: string): Promise<boolean>;
//# sourceMappingURL=digest.d.ts.map