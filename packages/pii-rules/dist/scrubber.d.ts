/**
 * @privapilot/pii-rules - String and Element Name Scrubber
 */
/**
 * Replaces detected PII substrings within a text string with tokenized redaction markers.
 */
export declare function scrubText(text: string, options?: {
    publicAuthorHandles?: boolean;
}): string;
/**
 * Sanitizes element labels/names by removing sensitive identifiers or replaced values.
 */
export declare function sanitizeElementName(rawName: string, options?: {
    publicAuthorHandles?: boolean;
}): string;
//# sourceMappingURL=scrubber.d.ts.map