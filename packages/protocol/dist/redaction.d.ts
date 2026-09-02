/**
 * @privapilot/protocol - The redaction scheme, described once
 *
 * The problem statement requires that the central server "should be aware for this
 * redaction scheme and can process data accordingly". Until now the wire payload
 * carried no redaction information at all: `maskCount` existed on SanitizedContext
 * and was dropped at the network boundary, and the server's system prompt asserted
 * in hardcoded prose that PII "has been blacked out" without ever being told what,
 * how much, or by what convention.
 *
 * Everything the two sides must agree on lives here, so the client stamps the scheme
 * and the server renders its prompt from the same definitions. Neither can drift.
 */
import { SensitiveCategory, RedactionMethod } from './payload.js';
/** Opaque blackout fill drawn over redacted regions. */
export declare const REDACTION_FILL_COLOR = "#0f172a";
/** Border and label colour drawn on top of the fill. */
export declare const REDACTION_CHROME_COLOR = "#38bdf8";
/** Label stamped into the image over an opaque-masked region. */
export declare function redactionImageLabel(category: SensitiveCategory): string;
/** Label stamped into the image over a pixelated face region. */
export declare const FACE_IMAGE_LABEL = "[FACE BLUR]";
/**
 * Names substituted for sensitive controls in the element list.
 *
 * The server sees these instead of the real accessible name. They are deliberately
 * category-level: enough to reason about what the control is for, never enough to
 * identify whose it is.
 */
export declare const SENSITIVE_ELEMENT_PLACEHOLDERS: Readonly<Record<SensitiveCategory, string>>;
/** The placeholder a sensitive control of this category is presented as. */
export declare function sensitiveElementPlaceholder(category: SensitiveCategory): string;
export interface RedactionCategorySummary {
    readonly category: SensitiveCategory;
    readonly count: number;
    readonly method: RedactionMethod;
}
/**
 * What was removed from this payload and how, so the server can interpret the gaps
 * rather than treat them as a broken page.
 *
 * Carries counts and conventions only. It must never carry a value, a label, or a
 * coordinate that could re-identify what was redacted.
 */
export interface RedactionManifest {
    readonly schemeVersion: '1.0';
    /** Categories present in this capture, with how many regions of each. */
    readonly categories: ReadonlyArray<RedactionCategorySummary>;
    readonly totalRegions: number;
    readonly masksRendered: number;
    /** Conventions the server will encounter in the screenshot and element list. */
    readonly conventions: {
        readonly opaqueFillColor: string;
        readonly imageLabelFormat: string;
        readonly faceImageLabel: string;
        readonly elementPlaceholders: ReadonlyArray<string>;
    };
    /** Whether coverage was verified against the output pixels, not just counted. */
    readonly coverage: {
        readonly pixelVerified: boolean;
        readonly regionsAssessed: number;
        readonly regionsUnassessable: number;
    };
    /**
     * Action capabilities withheld from sensitive controls. The server cannot type
     * into a password or payment field because the capability is not offered.
     */
    readonly withheldCapabilities: ReadonlyArray<string>;
}
/**
 * Renders the manifest as instructions for the reasoning model.
 *
 * This is what makes the server prompt *derived* rather than hardcoded prose: the
 * model is told what was actually removed from this specific capture, in the
 * conventions this specific client used, instead of a fixed sentence that was true
 * by assertion.
 */
export declare function describeRedactionScheme(manifest: RedactionManifest | undefined): string;
//# sourceMappingURL=redaction.d.ts.map