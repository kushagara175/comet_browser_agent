/**
 * @privapilot/protocol - Payload Contracts and Type Boundaries
 *
 * Enforces compile-time and runtime guarantees:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 * RawCapture CANNOT be passed to Network clients.
 */
import { ScreenshotPixelBox, ViewportCssPixelBox, ViewportMetadata } from './coordinates.js';
export type SensitiveCategory = 'password' | 'email' | 'phone' | 'credit_card' | 'cvv' | 'bank_account' | 'national_id' | 'date_of_birth' | 'address' | 'username' | 'auth_code' | 'token' | 'face' | 'high_risk_surface' | 'uninspectable';
export type RedactionMethod = 'opaque_mask' | 'gaussian_blur';
export interface SensitiveRegion {
    readonly id: string;
    readonly category: SensitiveCategory;
    readonly viewportBox: ViewportCssPixelBox;
    readonly screenshotBox: ScreenshotPixelBox;
    readonly detectorSource: 'dom_semantic' | 'text_pii_regex' | 'face_model' | 'surface_detector' | 'user_override';
    readonly method: RedactionMethod;
    readonly label?: string;
}
/**
 * Raw capture produced on the local client. Strictly internal.
 */
export interface RawCapture {
    readonly _brand: 'RawCapture_InternalOnly';
    readonly captureId: string;
    readonly timestamp: number;
    readonly rawScreenshotDataUrl: string;
    readonly rawDomSummary: any;
    readonly metadata: ViewportMetadata;
}
/**
 * Intermediate report from in-browser detectors.
 */
export interface DetectionReport {
    readonly captureId: string;
    readonly timestamp: number;
    readonly regions: ReadonlyArray<SensitiveRegion>;
    readonly uninspectableSurfacesFound: boolean;
    readonly requiresFailClosedBlock: boolean;
    readonly failClosedReason?: string;
}
export type ElementRole = 'button' | 'link' | 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'menuitem' | 'tab' | 'heading' | 'generic';
export type ActionCapability = 'click' | 'type' | 'select' | 'scroll';
export interface SanitizedElement {
    readonly localId: string;
    readonly role: ElementRole;
    readonly sanitizedName: string;
    /** Coarse normalized bounds: [normX, normY, normW, normH] between 0 and 1 */
    readonly coarseBounds: readonly [number, number, number, number];
    readonly state: ReadonlyArray<'enabled' | 'disabled' | 'visible' | 'checked' | 'focused'>;
    readonly actionCapabilities: ReadonlyArray<ActionCapability>;
}
export interface SanitizedPageState {
    readonly title: string;
    readonly viewport: readonly [number, number];
}
/**
 * Sanitized context produced by local redaction pipeline. Safe to pass to Network client.
 */
export interface SanitizedContext {
    readonly _brand: 'SanitizedContext_Verified';
    readonly protocolVersion: '1.0';
    readonly runId: string;
    readonly captureId: string;
    readonly goal: string;
    /** Base64 encoded sanitized image with opaque masks and face blurs applied */
    readonly sanitizedScreenshotDataUrl: string;
    readonly elements: ReadonlyArray<SanitizedElement>;
    readonly pageState: SanitizedPageState;
    readonly maskCount: number;
    /** What was redacted and by what convention. See redaction.ts. */
    readonly redactionManifest: import('./redaction.js').RedactionManifest;
    readonly payloadDigestSha256: string;
    readonly timestamp: number;
}
/**
 * Closed Network Payload schema sent over the wire to Centralized Reasoning Server.
 */
export interface SanitizedNetworkPayload {
    readonly protocolVersion: '1.0';
    readonly runId: string;
    readonly goal: string;
    readonly screenshot: string;
    readonly elements: ReadonlyArray<SanitizedElement>;
    readonly pageState: SanitizedPageState;
    /**
     * The redaction scheme this payload was produced under. The problem statement
     * requires the server to be aware of it; without this the server was reasoning
     * over holes it had no description of.
     */
    readonly redactionManifest: import('./redaction.js').RedactionManifest;
}
/**
 * Closed Page-Aware Chat Payload schema. Derived strictly from SanitizedContext.
 */
export interface SanitizedChatPayload {
    readonly _brand: 'SanitizedChatPayload_Verified';
    readonly protocolVersion: '1.0';
    readonly message: string;
    readonly elements: ReadonlyArray<SanitizedElement>;
    readonly sanitizedTitle: string;
    readonly maskCount: number;
}
/**
 * Contextless General Chat Payload schema. Zero browser/page state.
 */
export interface GeneralChatPayload {
    readonly protocolVersion: '1.0';
    readonly message: string;
}
//# sourceMappingURL=payload.d.ts.map