/**
 * @privapilot/extension - Declarative Structured Data & Table Extractor
 *
 * Implements high-speed, on-device structured extraction (tables, cards, search results, lists)
 * in a single turn without token-heavy multi-step crawler loops.
 */
export interface StructuredExtractionFieldSchema {
    [fieldName: string]: 'string' | 'number' | 'link' | 'image' | string;
}
export interface StructuredExtractionSchema {
    itemType?: string;
    fields?: StructuredExtractionFieldSchema;
}
export interface StructuredExtractionOptions {
    containerSelector?: string;
    targetElement?: HTMLElement | null;
    schema?: StructuredExtractionSchema;
    limit?: number;
}
export interface StructuredExtractionResult {
    readonly success: boolean;
    readonly count: number;
    readonly items: ReadonlyArray<Record<string, any>>;
    readonly markdown: string;
    readonly summary: string;
    readonly nextPageHint?: {
        readonly href?: string;
        readonly text?: string;
    };
}
export declare class TableExtractor {
    /**
     * Extracts structured data from tables, list repeaters, or card containers.
     */
    static extract(rootDoc?: Document | HTMLElement, options?: StructuredExtractionOptions): StructuredExtractionResult;
    /**
     * Identifies pagination controls or "Next Page" links for multi-page extractions.
     */
    static findNextPageTarget(rootDoc: Document | HTMLElement): {
        href?: string;
        text?: string;
    } | null;
    /**
     * Extracts data from HTML <table>, <tbody>, or ARIA [role="table"] elements.
     */
    private static extractHtmlTables;
    /**
     * Extracts repeating card, search result, or list item structures.
     */
    private static extractCardRepeaters;
    /**
     * Schema-guided extractor for an individual card element.
     */
    private static extractFieldBySchema;
    /**
     * Generic key-value fallback when no repeating lists or tables are detected.
     */
    private static extractGenericKeyValue;
    /**
     * Transforms structured records into a clean GitHub Flavored Markdown table.
     */
    static recordsToMarkdown(items: ReadonlyArray<Record<string, any>>, explicitHeaders?: string[]): string;
    private static cleanText;
    private static coerceValue;
}
//# sourceMappingURL=table-extractor.d.ts.map