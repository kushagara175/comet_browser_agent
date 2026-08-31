/**
 * @privapilot/server - Zero-Logging & Header Scrubbing Middleware
 *
 * Enforces section 6.1 of the Winning Execution Playbook:
 * Never logs request bodies or unredacted metadata in server logs.
 */
export declare function sanitizeHeadersForLogging(headers: Record<string, string | string[] | undefined>): Record<string, string>;
//# sourceMappingURL=zero-log.d.ts.map