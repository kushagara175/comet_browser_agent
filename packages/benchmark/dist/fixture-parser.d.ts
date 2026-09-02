/**
 * @privapilot/benchmark - Fixture DOM Parser
 *
 * Converts a static fixture HTML string into the same element descriptor shape the
 * live extension hands to the real detectors. This exists so the benchmark can call
 * `analyzeDomElementSensitivity` and friends directly instead of re-implementing
 * detection with fixture-specific string matching, which would make the harness
 * grade its own hardcoded constants rather than the shipped code.
 *
 * Layout note: a static string has no layout. Boxes here are a deterministic
 * synthetic layout, adequate for mask-policy checks but NOT a substitute for real
 * browser geometry. Anything that genuinely depends on layout is reported as
 * unmeasured rather than estimated. See docs/AUDIT_LOCAL_VS_DEFERRED.md.
 */
export interface ParsedFixtureElement {
    readonly tagName: string;
    readonly type?: string;
    readonly id?: string;
    readonly name?: string;
    readonly autocomplete?: string;
    readonly inputmode?: string;
    readonly placeholder?: string;
    readonly ariaLabel?: string;
    readonly associatedLabelText?: string;
    readonly value?: string;
    readonly className?: string;
    /** Visible text for buttons/links. */
    readonly textContent?: string;
    /** Deterministic synthetic layout box [x, y, w, h], normalized 0..1. */
    readonly normBox: [number, number, number, number];
    /** Role as the live element-extractor would classify it. */
    readonly role: string;
    /** The name a user would see, used for element-accuracy matching. */
    readonly displayName: string;
}
export interface ParsedFixtureDocument {
    readonly elements: ReadonlyArray<ParsedFixtureElement>;
    /** Text nodes outside of tags, with their offset into the original HTML. */
    readonly textSegments: ReadonlyArray<{
        text: string;
        startIndex: number;
    }>;
}
export declare function parseFixtureDocument(html: string): ParsedFixtureDocument;
//# sourceMappingURL=fixture-parser.d.ts.map