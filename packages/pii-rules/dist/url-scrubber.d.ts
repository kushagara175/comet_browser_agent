/**
 * @privapilot/pii-rules - Outbound Privacy Boundary URL and Optional Text Scrubber
 *
 * Enforces strict redaction on all outbound communication channels:
 * - URL paths, query parameters, fragments, userinfo, and tokens
 * - Optional text fields: postcondition summary, action history, custom prompt, conversation history, search results
 * - Preserves safe domain and navigation context needed for autonomous browsing tasks
 */
import { SanitizedNetworkPayload } from '@privapilot/protocol';
/**
 * Sanitizes an absolute or relative URL string for safe transmission across outbound boundaries.
 * Preserves safe domain, protocol, and clean navigation path hierarchy while redacting
 * emails, tokens, secrets, userinfo, and PII from paths, query strings, and fragments.
 */
export declare function sanitizeOutboundUrl(rawUrl: string): string;
/**
 * Replaces all embedded URLs in a free-form string with their sanitized representations.
 */
export declare function sanitizeUrlsInText(text: string): string;
/**
 * Scrubs optional metadata and text fields before egress.
 * Sanitizes embedded URLs, strips canary secrets, and replaces detected PII/tokens with redaction markers.
 */
export declare function scrubOptionalText(text: string): string;
/**
 * Scrubs conversation history messages for safe outbound transmission.
 */
export declare function scrubHistory(history?: ReadonlyArray<{
    role: 'user' | 'assistant';
    content: string;
}>): Array<{
    role: 'user' | 'assistant';
    content: string;
}> | undefined;
/**
 * Scrubs an entire SanitizedNetworkPayload to guarantee that no unredacted URLs,
 * tokens, or PII can escape over the wire.
 */
export declare function sanitizeOutboundPayload(payload: SanitizedNetworkPayload): SanitizedNetworkPayload;
//# sourceMappingURL=url-scrubber.d.ts.map