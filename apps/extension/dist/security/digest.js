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
export function canonicalizeJson(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        const items = value.map((item) => canonicalizeJson(item));
        return `[${items.join(',')}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const entries = keys.map((key) => {
            const serializedVal = canonicalizeJson(value[key]);
            return `${JSON.stringify(key)}:${serializedVal}`;
        });
        return `{${entries.join(',')}}`;
    }
    throw new Error(`Unsupported type for canonical JSON serialization: ${typeof value}`);
}
/**
 * Computes SHA-256 hex digest using standard Web Crypto API (browser & Node.js).
 */
export async function computeSha256Hex(data) {
    let buffer;
    if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data);
    }
    else {
        buffer = data;
    }
    // Use globalThis.crypto.subtle for universal Web Crypto support
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof subtle.digest !== 'function') {
        throw new Error('Web Crypto subtle.digest is unavailable in current runtime environment');
    }
    const hashBuffer = await subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * Extracts strictly safe, non-sensitive structural fields and computes their SHA-256 digest.
 * Returns formatted as `sha256_${64_hex_chars}`.
 */
export async function computePayloadDigestSha256(payload) {
    const safeRepresentation = {
        captureId: String(payload.captureId || ''),
        goal: String(payload.goal || ''),
        maskCount: Number(payload.maskCount || 0),
        pageState: {
            title: String(payload.pageState?.title || ''),
            viewport: Array.isArray(payload.pageState?.viewport)
                ? [Number(payload.pageState.viewport[0] || 0), Number(payload.pageState.viewport[1] || 0)]
                : [1280, 800]
        },
        elements: Array.isArray(payload.elements)
            ? payload.elements.map((el) => ({
                localId: String(el.localId || ''),
                role: String(el.role || 'generic'),
                sanitizedName: String(el.sanitizedName || ''),
                coarseBounds: Array.isArray(el.coarseBounds)
                    ? [
                        Number(el.coarseBounds[0] || 0),
                        Number(el.coarseBounds[1] || 0),
                        Number(el.coarseBounds[2] || 0),
                        Number(el.coarseBounds[3] || 0)
                    ]
                    : [0, 0, 0, 0],
                state: Array.isArray(el.state) ? [...el.state].map(String).sort() : [],
                actionCapabilities: Array.isArray(el.actionCapabilities)
                    ? [...el.actionCapabilities].map(String).sort()
                    : []
            }))
            : []
    };
    const canonicalString = canonicalizeJson(safeRepresentation);
    const hex = await computeSha256Hex(canonicalString);
    return `sha256_${hex}`;
}
/**
 * Verifies that a payload's declared digest matches its actual canonical contents.
 */
export async function verifyPayloadDigestSha256(payload, expectedDigest) {
    if (!expectedDigest || !expectedDigest.startsWith('sha256_')) {
        return false;
    }
    const actualDigest = await computePayloadDigestSha256(payload);
    return actualDigest === expectedDigest;
}
//# sourceMappingURL=digest.js.map