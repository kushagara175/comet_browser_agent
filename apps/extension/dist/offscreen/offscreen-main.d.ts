/**
 * @privapilot/extension - Offscreen Sanitizer Host Main Entry
 *
 * Runs inside the trusted offscreen extension document with full DOM/Canvas access.
 * Performs real screenshot decoding, multi-layer PII detection, visual mask rendering,
 * and post-redaction verification before returning verified SanitizedContext.
 */
import { LocalDomSnapshot } from '../sanitizer/pipeline.js';
import { RawCapture, SanitizedContext } from '@privapilot/protocol';
export interface SanitizerOffscreenRequest {
    readonly target: 'privapilot-offscreen';
    readonly type: 'SANITIZE_CAPTURE';
    readonly correlationId: string;
    readonly payload: {
        readonly rawCapture: RawCapture;
        readonly snapshot: LocalDomSnapshot;
        readonly goal: string;
    };
}
export interface SanitizerOffscreenResponse {
    readonly correlationId: string;
    readonly success: boolean;
    readonly sanitized?: SanitizedContext;
    readonly error?: string;
    readonly durationMs?: number;
}
/**
 * Handles incoming sanitization requests in the offscreen host.
 */
export declare function handleSanitizeRequest(request: SanitizerOffscreenRequest): Promise<SanitizerOffscreenResponse>;
//# sourceMappingURL=offscreen-main.d.ts.map