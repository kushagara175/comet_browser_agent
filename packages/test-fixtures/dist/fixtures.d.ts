/**
 * @privapilot/test-fixtures - Synthetic HTML Test Fixtures
 *
 * 14 standard test fixtures modeling diverse webpage structures with embedded synthetic PII & canaries.
 */
export interface TestFixture {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly html: string;
    readonly expectedPiiCount: number;
    readonly expectedSafeActionableCount: number;
}
export declare const TEST_FIXTURES: Record<string, TestFixture>;
//# sourceMappingURL=fixtures.d.ts.map