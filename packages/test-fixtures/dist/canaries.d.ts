/**
 * @privapilot/test-fixtures - Canary Scanner & Assertions
 */
export declare const SECRET_CANARY = "SECRET_CANARY_SIH26171_DO_NOT_TRANSMIT";
/**
 * Recursively scans any object/string/array for presence of the canary string.
 * Throws a hard error if the canary is leaked.
 */
export declare function assertNoCanaryLeak(target: any, contextName?: string): void;
//# sourceMappingURL=canaries.d.ts.map