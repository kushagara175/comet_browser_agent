/**
 * @privapilot/protocol - Payload Contracts and Type Boundaries
 *
 * Enforces compile-time and runtime guarantees:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 * RawCapture CANNOT be passed to Network clients.
 */

import { ScreenshotPixelBox, ViewportCssPixelBox, ViewportMetadata } from './coordinates.js';

export type SensitiveCategory =
  | 'password'
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'cvv'
  | 'bank_account'
  | 'national_id'
  | 'date_of_birth'
  | 'address'
  | 'username'
  | 'auth_code'
  | 'token'
  | 'face'
  | 'high_risk_surface'
  | 'uninspectable';

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

export type ElementRole =
  | 'button'
  | 'link'
  | 'input'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'menuitem'
  | 'tab'
  | 'heading'
  | 'dialog'
  | 'generic';

export type ActionCapability = 'click' | 'type' | 'select' | 'scroll' | 'hover' | 'drag' | 'upload';

export interface SanitizedElement {
  readonly localId: string; // e.g. "el_1", "el_2"
  readonly role: ElementRole;
  readonly sanitizedName: string;
  /** Coarse normalized bounds: [normX, normY, normW, normH] between 0 and 1 */
  readonly coarseBounds: readonly [number, number, number, number];
  readonly state: ReadonlyArray<'enabled' | 'disabled' | 'visible' | 'checked' | 'focused'>;
  readonly actionCapabilities: ReadonlyArray<ActionCapability>;
  /** Safe contextual text tokens from the enclosing row, card, or container (excluding sensitive inputs) */
  readonly containerContext?: string;
  /** Nearest preceding heading or section title */
  readonly nearestHeading?: string;
  /** Whether the element resides inside an active modal or dialog */
  readonly isInsideDialog?: boolean;
  /** Vertical position relative to current viewport: in_view, above, or below */
  readonly verticalOffset?: 'in_view' | 'above' | 'below';
  /** Whether the element is currently within the visible viewport */
  readonly inViewport?: boolean;
}

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly maxScrollTop: number;
  readonly scrollableBelow: boolean;
  readonly scrollableAbove: boolean;
  readonly pixelsBelow: number;
  readonly pixelsAbove: number;
}

export interface StateDelta {
  readonly previousAction?: {
    readonly kind: string;
    readonly targetName?: string;
    readonly targetLocalId?: string;
    readonly textToType?: string;
    readonly expectedState?: string;
  };
  readonly urlChanged: boolean;
  readonly previousUrl?: string;
  readonly currentUrl: string;
  readonly elementsAddedCount: number;
  readonly elementsRemovedCount: number;
  readonly scrollDeltaY: number;
  readonly dialogOpened?: string;
  readonly observedOutcome: string;
  readonly verificationPassed: boolean;
}

export interface SanitizedPageState {
  readonly title: string;
  readonly viewport: readonly [number, number];
  readonly url?: string;
  readonly visibleDialogCount?: number;
  readonly dialogTitles?: ReadonlyArray<string>;
  readonly statusSummaries?: ReadonlyArray<string>;
  readonly routeFingerprint?: string;
  readonly postconditionSummary?: string;
  readonly counters?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly contentSummaries?: ReadonlyArray<string>;
  readonly domain?: string;
  readonly scrollMetrics?: ScrollMetrics;
  readonly stateDelta?: StateDelta;
}

export interface RedactionManifest {
  readonly manifestVersion: '1.0';
  readonly totalRegions: number;
  readonly categoryCounts: {
    readonly piiText: number;
    readonly domInput: number;
    readonly face: number;
    readonly surface: number;
  };
  readonly methodCounts: {
    readonly opaqueBox: number;
    readonly spatialBlur: number;
  };
  readonly placeholderConvention: '[REDACTED]';
  readonly geometrySemantics: 'clamped_css_pixels';
  readonly pixelVerificationPerformed: boolean;
  readonly pixelVerificationPassed: boolean;
  readonly uninspectableSurfacePolicy: 'fail_closed';
  readonly visionAttempted: boolean;
  readonly visionSucceeded: boolean;
  readonly visionProvider: 'None' | 'WASM' | 'WebGPU' | 'ModelRunner';
  readonly visionModel?: string;
  readonly durationMs?: number;
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
  readonly payloadDigestSha256: string;
  readonly timestamp: number;
  readonly redactionManifest?: RedactionManifest;
}

/**
 * Closed Network Payload schema sent over the wire to Centralized Reasoning Server.
 */
export interface SanitizedNetworkPayload {
  readonly protocolVersion: '1.0';
  readonly runId: string;
  readonly goal: string;
  readonly screenshot: string; // Base64 data URL
  readonly elements: ReadonlyArray<SanitizedElement>;
  readonly pageState: SanitizedPageState;
  readonly redactionManifest?: RedactionManifest;
}

/**
 * Converts verified SanitizedContext into canonical wire-ready SanitizedNetworkPayload.
 */
export function toSanitizedNetworkPayload(context: SanitizedContext): SanitizedNetworkPayload {
  return {
    protocolVersion: '1.0',
    runId: context.runId,
    goal: context.goal,
    screenshot: context.sanitizedScreenshotDataUrl,
    elements: context.elements,
    pageState: context.pageState,
    ...(context.redactionManifest ? { redactionManifest: context.redactionManifest } : {})
  };
}

export interface SanitizedDisplayPayload {
  readonly protocolVersion: string;
  readonly runId: string;
  readonly goal: string;
  readonly screenshot: string;
  readonly elements: ReadonlyArray<SanitizedElement>;
  readonly pageState: SanitizedPageState | 'Not available';
  readonly redactionManifest?: RedactionManifest;
}

export function calculateBase64ByteLength(dataUrlOrBase64: string): number {
  if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== 'string') return 0;
  const commaIdx = dataUrlOrBase64.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
  if (!b64.length) return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Generates canonical safe display projection directly from the exact canonical wire payload.
 * Never synthesizes fake run IDs, capture IDs, digests, viewports, or goals.
 * Displays 'Not available' for missing values.
 */
export function toSanitizedDisplayPayload(
  payload: SanitizedNetworkPayload | null | undefined,
  options?: { payloadDigest?: string; screenshotDigest?: string } | string
): SanitizedDisplayPayload | { protocolVersion: string; status: string } {
  if (!payload) {
    return {
      protocolVersion: '1.0',
      status: 'Awaiting initial perception cycle'
    };
  }

  const payloadDigest = typeof options === 'string' ? options : options?.payloadDigest || 'Not available';
  const screenshotDigest = typeof options === 'object' ? options?.screenshotDigest || payloadDigest : payloadDigest;

  const screenshot = payload.screenshot || '';
  const byteCount = calculateBase64ByteLength(screenshot);
  const kbCount = Math.round(byteCount / 1024);
  const screenshotDisplay = screenshot
    ? `[Screenshot base64 omitted from display: ${kbCount} KB (${byteCount} bytes), Screenshot SHA-256: ${screenshotDigest}, Payload Structure SHA-256: ${payloadDigest}]`
    : 'Not available';

  return {
    protocolVersion: payload.protocolVersion || '1.0',
    runId: payload.runId || 'Not available',
    goal: payload.goal || 'Not available',
    screenshot: screenshotDisplay,
    elements: payload.elements || [],
    pageState: payload.pageState || 'Not available',
    ...(payload.redactionManifest ? { redactionManifest: payload.redactionManifest } : {})
  };
}

/**
 * A message in a multi-turn chat conversation.
 */
export interface ChatHistoryMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
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
  readonly history?: ReadonlyArray<ChatHistoryMessage>;
}

/**
 * Contextless General Chat Payload schema. Zero browser/page state.
 */
export interface GeneralChatPayload {
  readonly protocolVersion: '1.0';
  readonly message: string;
  readonly history?: ReadonlyArray<ChatHistoryMessage>;
}


