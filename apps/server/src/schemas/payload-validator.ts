/**
 * @privapilot/server - Closed Request Payload Schema Validator
 *
 * Implements strict closed recursive schemas for /api/v1/reason and /api/v1/chat.
 * Rejects every unknown root or nested key, prototype-pollution attempts,
 * enforces bounded lengths, counts, decoded screenshot sizes, explicit allowlists,
 * and duplicate/contradiction checks without reflecting submitted values.
 */

import { SanitizedNetworkPayload, SanitizedChatPayload } from '@privapilot/protocol';

export interface ValidationResult<T = SanitizedNetworkPayload> {
  readonly isValid: boolean;
  readonly payload?: T;
  readonly errorMessage?: string;
}

const ALLOWED_REASONING_ROOT_KEYS = new Set([
  'protocolVersion',
  'runId',
  'goal',
  'screenshot',
  'elements',
  'pageState',
  'redactionManifest',
  'recentActions'
]);

/** Categories the client may declare in a redaction manifest. */
const KNOWN_SENSITIVE_CATEGORIES = new Set([
  'password', 'email', 'phone', 'credit_card', 'cvv', 'bank_account',
  'national_id', 'date_of_birth', 'address', 'username', 'auth_code',
  'token', 'face', 'high_risk_surface', 'uninspectable'
]);

const ALLOWED_CHAT_ROOT_KEYS = new Set([
  'protocolVersion',
  'message',
  'elements',
  'sanitizedTitle',
  'maskCount'
]);

const ALLOWED_ELEMENT_KEYS = new Set([
  'localId',
  'role',
  'sanitizedName',
  'coarseBounds',
  'state',
  'actionCapabilities'
]);

const ALLOWED_PAGE_STATE_KEYS = new Set([
  'title',
  'viewport'
]);

const VALID_ROLES = new Set([
  'button',
  'link',
  'input',
  'select',
  'textarea',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
  'heading',
  'generic'
]);

const VALID_ELEMENT_STATES = new Set([
  'enabled',
  'disabled',
  'visible',
  'checked',
  'focused'
]);

const VALID_ACTION_CAPABILITIES = new Set([
  'click',
  'type',
  'select',
  'scroll'
]);

const PROHIBITED_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

const PROHIBITED_SCRIPT_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /on\w+\s*=/i,
  /\beval\s*\(/i,
  /\bexpression\s*\(/i
];

const LOCAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SCREENSHOT_DATA_URL_REGEX = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_DECODED_SCREENSHOT_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * Checks if a value is a genuine plain JSON object without prototype tampering.
 */
function isPlainObject(val: any): boolean {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) {
    return false;
  }
  if (Object.getOwnPropertySymbols(val).length > 0) {
    return false;
  }
  return true;
}

/**
 * Checks if a string contains prohibited executable or script patterns.
 */
function hasProhibitedScriptPattern(str: string): boolean {
  return PROHIBITED_SCRIPT_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Validates a single element against the strict closed SanitizedElement schema.
 */
function validateElement(
  el: any,
  index: number,
  isChat = false
): { isValid: boolean; errorMessage?: string } {
  if (!isPlainObject(el)) {
    return { isValid: false, errorMessage: `Element at index ${index} must be an object` };
  }

  // Reject unknown or prohibited nested element keys
  const ownKeys = Object.getOwnPropertyNames(el);
  for (const k of ownKeys) {
    if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_ELEMENT_KEYS.has(k)) {
      return {
        isValid: false,
        errorMessage: `Closed schema violation: Unknown nested element property at index ${index}`
      };
    }
  }

  // localId
  if (!el.localId || typeof el.localId !== 'string') {
    return { isValid: false, errorMessage: `Element at index ${index} is missing a valid "localId"` };
  }
  if (!LOCAL_ID_REGEX.test(el.localId) || el.localId.startsWith('#') || el.localId.startsWith('.')) {
    return {
      isValid: false,
      errorMessage: `Invalid localId format at index ${index}. Raw selectors prohibited`
    };
  }

  // role
  if (el.role === undefined) {
    if (!isChat) {
      return { isValid: false, errorMessage: `Invalid or missing role at index ${index}` };
    }
  } else {
    if (typeof el.role !== 'string' || !VALID_ROLES.has(el.role)) {
      return { isValid: false, errorMessage: `Invalid role at index ${index}` };
    }
  }

  // sanitizedName
  if (el.sanitizedName !== undefined) {
    if (typeof el.sanitizedName !== 'string' || el.sanitizedName.length > 120) {
      return { isValid: false, errorMessage: `sanitizedName at index ${index} must be a string up to 120 chars` };
    }
    if (hasProhibitedScriptPattern(el.sanitizedName)) {
      return { isValid: false, errorMessage: `sanitizedName at index ${index} contains prohibited script patterns` };
    }
  }

  // coarseBounds: [x, y, w, h] between 0 and 1
  if (el.coarseBounds !== undefined) {
    if (!Array.isArray(el.coarseBounds) || el.coarseBounds.length !== 4) {
      return { isValid: false, errorMessage: `coarseBounds at index ${index} must be an array of 4 numbers [x, y, w, h]` };
    }
    for (let b = 0; b < 4; b++) {
      const val = el.coarseBounds[b];
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0 || val > 1) {
        return { isValid: false, errorMessage: `coarseBounds values at index ${index} must be numbers between 0 and 1` };
      }
    }
  }

  // state
  if (el.state !== undefined) {
    if (!Array.isArray(el.state)) {
      return { isValid: false, errorMessage: `state at index ${index} must be an array` };
    }
    const seenStates = new Set<string>();
    for (let sIdx = 0; sIdx < el.state.length; sIdx++) {
      const s = el.state[sIdx];
      if (typeof s !== 'string' || !VALID_ELEMENT_STATES.has(s)) {
        return { isValid: false, errorMessage: `Invalid state value at index ${index}` };
      }
      if (seenStates.has(s)) {
        return { isValid: false, errorMessage: `Duplicate state value at index ${index}` };
      }
      seenStates.add(s);
    }
    if (seenStates.has('enabled') && seenStates.has('disabled')) {
      return {
        isValid: false,
        errorMessage: `Contradictory element state at index ${index}: cannot be both enabled and disabled`
      };
    }
  }

  // actionCapabilities
  if (el.actionCapabilities !== undefined) {
    if (!Array.isArray(el.actionCapabilities)) {
      return { isValid: false, errorMessage: `actionCapabilities at index ${index} must be an array` };
    }
    const seenCaps = new Set<string>();
    for (let cIdx = 0; cIdx < el.actionCapabilities.length; cIdx++) {
      const cap = el.actionCapabilities[cIdx];
      if (typeof cap !== 'string' || !VALID_ACTION_CAPABILITIES.has(cap)) {
        return { isValid: false, errorMessage: `Invalid actionCapability value at index ${index}` };
      }
      if (seenCaps.has(cap)) {
        return { isValid: false, errorMessage: `Duplicate actionCapability value at index ${index}` };
      }
      seenCaps.add(cap);
    }
  }

  return { isValid: true };
}

/**
 * Validates /api/v1/reason incoming payload against closed recursive schema.
 */
export function validateSanitizedPayload(body: any): ValidationResult<SanitizedNetworkPayload> {
  if (!isPlainObject(body)) {
    return { isValid: false, errorMessage: 'Request body must be a JSON object' };
  }

  // 1. Closed Schema: Reject unknown or prohibited root keys
  const rootKeys = Object.getOwnPropertyNames(body);
  for (const key of rootKeys) {
    if (PROHIBITED_PROPERTY_NAMES.has(key) || !ALLOWED_REASONING_ROOT_KEYS.has(key)) {
      return {
        isValid: false,
        errorMessage: 'Closed schema violation: Unknown property is prohibited'
      };
    }
  }

  // 2. Validate Protocol Version
  if (body.protocolVersion !== '1.0') {
    return {
      isValid: false,
      errorMessage: 'Unsupported protocol version. Expected "1.0"'
    };
  }

  // 3. Validate runId
  if (typeof body.runId !== 'string' || !RUN_ID_REGEX.test(body.runId)) {
    return {
      isValid: false,
      errorMessage: 'Invalid or missing "runId"'
    };
  }

  // 4. Validate Goal
  if (typeof body.goal !== 'string' || body.goal.trim().length === 0 || body.goal.length > 2000) {
    return { isValid: false, errorMessage: 'Field "goal" must be a non-empty string under 2000 characters' };
  }
  if (hasProhibitedScriptPattern(body.goal)) {
    return { isValid: false, errorMessage: 'Field "goal" contains prohibited script patterns' };
  }

  // 5. Validate Screenshot Data URL & Decoded Size Limit
  if (typeof body.screenshot !== 'string' || body.screenshot.length === 0) {
    return { isValid: false, errorMessage: 'Field "screenshot" must be a non-empty sanitized image string' };
  }

  const screenshotMatch = body.screenshot.match(SCREENSHOT_DATA_URL_REGEX);
  if (!screenshotMatch) {
    return {
      isValid: false,
      errorMessage: 'Field "screenshot" must be a valid base64 data URL (e.g. data:image/png;base64,...)'
    };
  }

  const base64Data = screenshotMatch[1];
  let padding = 0;
  if (base64Data.endsWith('==')) {
    padding = 2;
  } else if (base64Data.endsWith('=')) {
    padding = 1;
  }

  const decodedSize = Math.max(1, Math.floor((base64Data.length * 3) / 4) - padding);
  if (decodedSize > MAX_DECODED_SCREENSHOT_BYTES) {
    return { isValid: false, errorMessage: 'Field "screenshot" exceeds maximum allowed size of 4MB' };
  }

  // 6. Validate pageState recursively
  if (body.pageState === undefined || !isPlainObject(body.pageState)) {
    return { isValid: false, errorMessage: 'Field "pageState" must be an object' };
  }

  const pageStateKeys = Object.getOwnPropertyNames(body.pageState);
  for (const pKey of pageStateKeys) {
    if (PROHIBITED_PROPERTY_NAMES.has(pKey) || !ALLOWED_PAGE_STATE_KEYS.has(pKey)) {
      return { isValid: false, errorMessage: 'Closed schema violation: Unknown pageState property' };
    }
  }

  if (typeof body.pageState.title !== 'string' || body.pageState.title.length > 200) {
    return { isValid: false, errorMessage: 'pageState.title must be a string up to 200 characters' };
  }
  if (hasProhibitedScriptPattern(body.pageState.title)) {
    return { isValid: false, errorMessage: 'pageState.title contains prohibited script patterns' };
  }

  if (!Array.isArray(body.pageState.viewport) || body.pageState.viewport.length !== 2) {
    return { isValid: false, errorMessage: 'pageState.viewport must be an array of [width, height]' };
  }
  const [vpWidth, vpHeight] = body.pageState.viewport;
  if (
    typeof vpWidth !== 'number' ||
    !Number.isFinite(vpWidth) ||
    Number.isNaN(vpWidth) ||
    vpWidth <= 0 ||
    vpWidth > 100000 ||
    typeof vpHeight !== 'number' ||
    !Number.isFinite(vpHeight) ||
    Number.isNaN(vpHeight) ||
    vpHeight <= 0 ||
    vpHeight > 100000
  ) {
    return { isValid: false, errorMessage: 'pageState.viewport dimensions must be positive finite numbers' };
  }

  // 7. Validate Elements
  if (!Array.isArray(body.elements)) {
    return { isValid: false, errorMessage: 'Field "elements" must be an array' };
  }
  if (body.elements.length > 200) {
    return { isValid: false, errorMessage: 'Field "elements" exceeds maximum allowed count of 200 elements' };
  }

  const seenLocalIds = new Set<string>();
  for (let i = 0; i < body.elements.length; i++) {
    const el = body.elements[i];
    const elRes = validateElement(el, i, false);
    if (!elRes.isValid) {
      return { isValid: false, errorMessage: elRes.errorMessage };
    }
    if (seenLocalIds.has(el.localId)) {
      return { isValid: false, errorMessage: `Duplicate element localId at index ${i}` };
    }
    seenLocalIds.add(el.localId);
  }

  if (body.recentActions !== undefined) {
    if (!Array.isArray(body.recentActions) || body.recentActions.length > 20) {
      return { isValid: false, errorMessage: 'Invalid "recentActions"' };
    }
    for (const a of body.recentActions) {
      if (!isPlainObject(a) || typeof a.kind !== 'string' || a.kind.length > 32) {
        return { isValid: false, errorMessage: 'Invalid entry in "recentActions"' };
      }
      if (a.targetLabel !== undefined && (typeof a.targetLabel !== 'string' || a.targetLabel.length > 200)) {
        return { isValid: false, errorMessage: 'Invalid targetLabel in "recentActions"' };
      }
    }
  }

  const manifestRes = validateRedactionManifest(body.redactionManifest);
  if (!manifestRes.isValid) {
    return { isValid: false, errorMessage: manifestRes.errorMessage };
  }

  return {
    isValid: true,
    payload: body as SanitizedNetworkPayload
  };
}

/**
 * Validates the redaction manifest.
 *
 * The manifest is generated into the model's system prompt, so it crosses a trust
 * boundary twice: it arrives over the wire and is then handed to an LLM as
 * instructions. Category names are checked against a known set and counts are
 * bounded, so a malformed or hostile manifest cannot inject arbitrary text into
 * the prompt through a category label.
 */
function validateRedactionManifest(manifest: any): { isValid: boolean; errorMessage?: string } {
  // Absent manifest is a protocol error: the server is required to be aware of the
  // redaction scheme, so a payload that declines to describe it is not processable.
  if (!isPlainObject(manifest)) {
    return { isValid: false, errorMessage: 'Missing or invalid "redactionManifest"' };
  }
  if (manifest.schemeVersion !== '1.0') {
    return { isValid: false, errorMessage: 'Unsupported redactionManifest.schemeVersion. Expected "1.0"' };
  }
  if (!Array.isArray(manifest.categories) || manifest.categories.length > 32) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.categories"' };
  }

  for (const entry of manifest.categories) {
    if (!isPlainObject(entry)) {
      return { isValid: false, errorMessage: 'Invalid entry in "redactionManifest.categories"' };
    }
    if (!KNOWN_SENSITIVE_CATEGORIES.has(entry.category)) {
      return { isValid: false, errorMessage: `Unknown redaction category: not an accepted value` };
    }
    if (!Number.isInteger(entry.count) || entry.count < 0 || entry.count > 10000) {
      return { isValid: false, errorMessage: 'Invalid count in "redactionManifest.categories"' };
    }
    if (entry.method !== 'opaque_mask' && entry.method !== 'gaussian_blur') {
      return { isValid: false, errorMessage: 'Invalid method in "redactionManifest.categories"' };
    }
  }

  if (!Number.isInteger(manifest.totalRegions) || manifest.totalRegions < 0 || manifest.totalRegions > 10000) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.totalRegions"' };
  }
  if (!Number.isInteger(manifest.masksRendered) || manifest.masksRendered < 0 || manifest.masksRendered > 10000) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.masksRendered"' };
  }

  if (!isPlainObject(manifest.conventions)) {
    return { isValid: false, errorMessage: 'Missing "redactionManifest.conventions"' };
  }
  const c = manifest.conventions;
  const shortString = (v: any, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;
  if (!shortString(c.opaqueFillColor, 32) || !shortString(c.imageLabelFormat) || !shortString(c.faceImageLabel)) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.conventions"' };
  }
  if (!Array.isArray(c.elementPlaceholders) || c.elementPlaceholders.length > 32 ||
      !c.elementPlaceholders.every((p: any) => shortString(p))) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.conventions.elementPlaceholders"' };
  }

  if (!isPlainObject(manifest.coverage) || typeof manifest.coverage.pixelVerified !== 'boolean') {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.coverage"' };
  }
  if (!Array.isArray(manifest.withheldCapabilities) || manifest.withheldCapabilities.length > 16 ||
      !manifest.withheldCapabilities.every((x: any) => shortString(x, 32))) {
    return { isValid: false, errorMessage: 'Invalid "redactionManifest.withheldCapabilities"' };
  }

  return { isValid: true };
}

/**
 * Validates /api/v1/chat incoming payload against closed schema.
 */
export function validateSanitizedChatPayload(body: any): ValidationResult<SanitizedChatPayload> {
  if (!isPlainObject(body)) {
    return { isValid: false, errorMessage: 'Request body must be a JSON object' };
  }

  // 1. Closed Schema: Reject unknown or prohibited root keys
  const rootKeys = Object.getOwnPropertyNames(body);
  for (const key of rootKeys) {
    if (PROHIBITED_PROPERTY_NAMES.has(key) || !ALLOWED_CHAT_ROOT_KEYS.has(key)) {
      return {
        isValid: false,
        errorMessage: 'Closed schema violation: Unknown property is prohibited'
      };
    }
  }

  // 2. Protocol Version
  if (body.protocolVersion !== '1.0') {
    return {
      isValid: false,
      errorMessage: 'Unsupported protocol version. Expected "1.0"'
    };
  }

  // 3. Message
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { isValid: false, errorMessage: 'Field "message" must be a non-empty string' };
  }
  if (body.message.length > 2000) {
    return { isValid: false, errorMessage: 'Field "message" exceeds maximum length of 2000 characters' };
  }
  if (hasProhibitedScriptPattern(body.message)) {
    return { isValid: false, errorMessage: 'Field "message" contains prohibited script patterns' };
  }

  // 4. Sanitized Title
  if (body.sanitizedTitle !== undefined) {
    if (typeof body.sanitizedTitle !== 'string' || body.sanitizedTitle.length > 200) {
      return { isValid: false, errorMessage: 'Field "sanitizedTitle" must be a string up to 200 characters' };
    }
    if (hasProhibitedScriptPattern(body.sanitizedTitle)) {
      return { isValid: false, errorMessage: 'Field "sanitizedTitle" contains prohibited script patterns' };
    }
  }

  // 5. Mask Count
  if (body.maskCount !== undefined) {
    if (typeof body.maskCount !== 'number' || !Number.isInteger(body.maskCount) || body.maskCount < 0) {
      return { isValid: false, errorMessage: 'Field "maskCount" must be a non-negative integer' };
    }
  }

  // 6. Elements
  if (body.elements !== undefined) {
    if (!Array.isArray(body.elements)) {
      return { isValid: false, errorMessage: 'Field "elements" must be an array' };
    }
    if (body.elements.length > 100) {
      return { isValid: false, errorMessage: 'Field "elements" exceeds maximum allowed count of 100 elements' };
    }
    const seenLocalIds = new Set<string>();
    for (let i = 0; i < body.elements.length; i++) {
      const el = body.elements[i];
      const elRes = validateElement(el, i, true);
      if (!elRes.isValid) {
        return { isValid: false, errorMessage: elRes.errorMessage };
      }
      if (seenLocalIds.has(el.localId)) {
        return { isValid: false, errorMessage: `Duplicate element localId at index ${i}` };
      }
      seenLocalIds.add(el.localId);
    }
  }

  return {
    isValid: true,
    payload: body as SanitizedChatPayload
  };
}

