/**
 * @privapilot/server - Closed Request Payload Schema Validator
 *
 * Implements section 4.7 of the Winning Execution Playbook:
 * Rejects unknown keys, validates versioned closed schema.
 */

import { SanitizedNetworkPayload } from '@privapilot/protocol';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly payload?: SanitizedNetworkPayload;
  readonly errorMessage?: string;
}

const ALLOWED_ROOT_KEYS = new Set([
  'protocolVersion',
  'runId',
  'goal',
  'screenshot',
  'elements',
  'pageState'
]);

export function validateSanitizedPayload(body: any): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: false, errorMessage: 'Request body must be a JSON object' };
  }

  // 1. Closed Schema: Reject any unknown keys
  for (const key of Object.keys(body)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      return {
        isValid: false,
        errorMessage: `Closed schema violation: Unknown property '${key}' is prohibited`
      };
    }
  }

  // 2. Validate Protocol Version
  if (body.protocolVersion !== '1.0') {
    return {
      isValid: false,
      errorMessage: `Unsupported protocol version '${body.protocolVersion}'. Expected '1.0'`
    };
  }

  // 3. Validate Goal & Screenshot
  if (typeof body.goal !== 'string' || body.goal.length === 0) {
    return { isValid: false, errorMessage: 'Field "goal" must be a non-empty string' };
  }

  if (typeof body.screenshot !== 'string') {
    return { isValid: false, errorMessage: 'Field "screenshot" must be a sanitized image string' };
  }

  // 4. Validate Elements
  if (!Array.isArray(body.elements)) {
    return { isValid: false, errorMessage: 'Field "elements" must be an array' };
  }

  for (let i = 0; i < body.elements.length; i++) {
    const el = body.elements[i];
    if (!el.localId || typeof el.localId !== 'string') {
      return { isValid: false, errorMessage: `Element at index ${i} is missing a valid "localId"` };
    }
    // Prohibit server-side raw CSS selectors or JS injection
    if (el.localId.startsWith('#') || el.localId.startsWith('.')) {
      return { isValid: false, errorMessage: `Invalid localId format '${el.localId}'. Raw selectors prohibited` };
    }
  }

  return {
    isValid: true,
    payload: body as SanitizedNetworkPayload
  };
}
