/**
 * @privapilot/pii-rules - Fast, ReDoS-Safe Regex Patterns & Detectors
 */
import { SensitiveCategory } from '@privapilot/protocol';
export interface TextMatch {
    readonly category: SensitiveCategory;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly matchedLength: number;
    readonly confidence: number;
}
export declare const CANARY_SECRET = "SECRET_CANARY_SIH26171_DO_NOT_TRANSMIT";
/**
 * Scans a text string and returns all detected sensitive PII ranges.
 * Strictly avoids logging or storing the actual secret strings.
 */
export declare function scanTextForPII(text: string): TextMatch[];
//# sourceMappingURL=regex-patterns.d.ts.map