import { SanitizedElement } from './payload.js';

export type ActionKind =
  | 'observe'
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'request_user_confirmation'
  | 'finish'
  | 'blocked';

export type RiskLevel = 'safe' | 'protected' | 'blocked';

export interface ActionProposal {
  readonly actionId: string;
  readonly kind: ActionKind;
  readonly targetLocalId?: string;
  readonly confidence: number;
  readonly risk: RiskLevel;
  readonly rationale: string;
  readonly expectedState?: string;
  readonly textToType?: string;
  readonly selectOptionValue?: string;
  readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly success: boolean;
  readonly timestamp: number;
  readonly message?: string;
  readonly semanticOutcomeVerified: boolean;
  readonly reasonCode?: string;
  readonly staleTarget?: boolean;
}

export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly proposal?: ActionProposal;
  readonly errorMessage?: string;
}

const ALLOWED_ACTION_PROPOSAL_KEYS = new Set([
  'actionId',
  'kind',
  'targetLocalId',
  'confidence',
  'risk',
  'rationale',
  'expectedState',
  'textToType',
  'selectOptionValue',
  'scrollDirection'
]);

const VALID_ACTION_KINDS = new Set([
  'observe',
  'click',
  'type',
  'select',
  'scroll',
  'wait',
  'request_user_confirmation',
  'finish',
  'blocked'
]);

const VALID_RISK_LEVELS = new Set([
  'safe',
  'protected',
  'blocked'
]);

const VALID_SCROLL_DIRECTIONS = new Set([
  'up',
  'down',
  'top',
  'bottom'
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

const PROHIBITED_URL_PATTERNS = [
  /https?:\/\//i,
  /ftp:\/\//i,
  /file:\/\//i,
  /ws:\/\//i,
  /wss:\/\//i,
  /blob:/i,
  /data:/i
];

const PROHIBITED_SELECTOR_PATTERNS = [
  /^\s*#/,
  /^\s*\./,
  /\/\//,
  /\bxpath\b/i,
  /\bcontains\s*\(/i,
  /\btext\s*\(\s*\)/i,
  /[[\]>+~:]/
];

const LOCAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const ACTION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

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

function hasProhibitedScriptPattern(str: string): boolean {
  return PROHIBITED_SCRIPT_PATTERNS.some((p) => p.test(str));
}

function hasProhibitedUrlPattern(str: string): boolean {
  return PROHIBITED_URL_PATTERNS.some((p) => p.test(str));
}

function hasProhibitedSelectorPattern(str: string): boolean {
  return PROHIBITED_SELECTOR_PATTERNS.some((p) => p.test(str));
}

/**
 * Validates an ActionProposal against strict closed runtime schema and optional context elements.
 */
export function validateActionProposal(
  proposal: any,
  validElements?: ReadonlyArray<SanitizedElement>
): ActionValidationResult {
  if (!isPlainObject(proposal)) {
    return { isValid: false, errorMessage: 'Action proposal must be a JSON object' };
  }

  // 1. Closed Schema: Reject unknown and prototype-pollution keys
  const keys = Object.getOwnPropertyNames(proposal);
  for (const k of keys) {
    if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_ACTION_PROPOSAL_KEYS.has(k)) {
      return { isValid: false, errorMessage: `Closed schema violation: Unknown action property` };
    }
  }

  // 2. actionId
  if (typeof proposal.actionId !== 'string' || !ACTION_ID_REGEX.test(proposal.actionId)) {
    return { isValid: false, errorMessage: 'Invalid or missing "actionId"' };
  }
  if (hasProhibitedScriptPattern(proposal.actionId) || hasProhibitedUrlPattern(proposal.actionId)) {
    return { isValid: false, errorMessage: 'actionId contains prohibited script or URL patterns' };
  }

  // 3. kind
  if (typeof proposal.kind !== 'string' || !VALID_ACTION_KINDS.has(proposal.kind)) {
    return { isValid: false, errorMessage: 'Invalid or unsupported action kind' };
  }

  // 4. confidence
  if (
    typeof proposal.confidence !== 'number' ||
    !Number.isFinite(proposal.confidence) ||
    Number.isNaN(proposal.confidence) ||
    proposal.confidence < 0 ||
    proposal.confidence > 1
  ) {
    return { isValid: false, errorMessage: 'Field "confidence" must be a finite number between 0 and 1' };
  }

  // 5. risk
  if (typeof proposal.risk !== 'string' || !VALID_RISK_LEVELS.has(proposal.risk)) {
    return { isValid: false, errorMessage: 'Invalid or missing "risk" level' };
  }

  // 6. rationale
  if (typeof proposal.rationale !== 'string' || proposal.rationale.length > 1000) {
    return { isValid: false, errorMessage: 'Field "rationale" must be a string up to 1000 characters' };
  }
  if (hasProhibitedScriptPattern(proposal.rationale) || hasProhibitedUrlPattern(proposal.rationale)) {
    return { isValid: false, errorMessage: 'rationale contains prohibited script or URL patterns' };
  }

  // 7. expectedState
  if (proposal.expectedState !== undefined) {
    if (typeof proposal.expectedState !== 'string' || proposal.expectedState.length > 500) {
      return { isValid: false, errorMessage: 'Field "expectedState" must be a string up to 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.expectedState) || hasProhibitedUrlPattern(proposal.expectedState)) {
      return { isValid: false, errorMessage: 'expectedState contains prohibited script or URL patterns' };
    }
  }

  // 8. scrollDirection
  if (proposal.scrollDirection !== undefined) {
    if (typeof proposal.scrollDirection !== 'string' || !VALID_SCROLL_DIRECTIONS.has(proposal.scrollDirection)) {
      return { isValid: false, errorMessage: 'Field "scrollDirection" must be one of "up", "down", "top", "bottom"' };
    }
  }

  // 9. targetLocalId & action-specific requirements
  const kind = proposal.kind as ActionKind;

  if (proposal.targetLocalId !== undefined) {
    if (typeof proposal.targetLocalId !== 'string' || !LOCAL_ID_REGEX.test(proposal.targetLocalId) || hasProhibitedSelectorPattern(proposal.targetLocalId)) {
      return { isValid: false, errorMessage: 'Invalid targetLocalId format. Raw selectors and script patterns prohibited' };
    }
  }

  // Actions requiring targetLocalId
  if (kind === 'click' || kind === 'type' || kind === 'select') {
    if (!proposal.targetLocalId || typeof proposal.targetLocalId !== 'string') {
      return { isValid: false, errorMessage: `Action kind "${kind}" requires a valid "targetLocalId"` };
    }
  }

  // Type action requirements
  if (kind === 'type') {
    if (typeof proposal.textToType !== 'string' || proposal.textToType.length === 0 || proposal.textToType.length > 500) {
      return { isValid: false, errorMessage: 'Action kind "type" requires "textToType" string between 1 and 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.textToType)) {
      return { isValid: false, errorMessage: 'textToType contains prohibited script patterns' };
    }
  } else if (proposal.textToType !== undefined) {
    if (typeof proposal.textToType !== 'string' || proposal.textToType.length > 500) {
      return { isValid: false, errorMessage: 'Field "textToType" must be a string up to 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.textToType)) {
      return { isValid: false, errorMessage: 'textToType contains prohibited script patterns' };
    }
  }

  // Select action requirements
  if (kind === 'select') {
    if (typeof proposal.selectOptionValue !== 'string' || proposal.selectOptionValue.length === 0 || proposal.selectOptionValue.length > 200) {
      return { isValid: false, errorMessage: 'Action kind "select" requires "selectOptionValue" string between 1 and 200 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.selectOptionValue)) {
      return { isValid: false, errorMessage: 'selectOptionValue contains prohibited script patterns' };
    }
  } else if (proposal.selectOptionValue !== undefined) {
    if (typeof proposal.selectOptionValue !== 'string' || proposal.selectOptionValue.length > 200) {
      return { isValid: false, errorMessage: 'Field "selectOptionValue" must be a string up to 200 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.selectOptionValue)) {
      return { isValid: false, errorMessage: 'selectOptionValue contains prohibited script patterns' };
    }
  }

  // 10. Context & Capability Validation against Sanitized Elements (if supplied)
  if (validElements) {
    if (proposal.targetLocalId) {
      const targetElement = validElements.find((e) => e.localId === proposal.targetLocalId);
      if (!targetElement) {
        return {
          isValid: false,
          errorMessage: 'Target element with localId not found in sanitized context'
        };
      }

      // Check capabilities (if element declares actionCapabilities)
      const caps = targetElement.actionCapabilities || [];
      if (caps.length > 0) {
        if (kind === 'click' && !caps.includes('click')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "click" action capability'
          };
        }

        if (kind === 'type' && !caps.includes('type')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "type" action capability'
          };
        }

        if (kind === 'select' && !caps.includes('select')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "select" action capability'
          };
        }
      }
    }
  }

  return {
    isValid: true,
    proposal: proposal as ActionProposal
  };
}

/**
 * Validates whether an action proposed by the reasoning server is safe to auto-execute.
 */
export function classifyActionRisk(
  proposal: ActionProposal,
  elementName?: string
): RiskLevel {
  const kind = proposal.kind;
  const name = (elementName || '').toLowerCase();

  // Hard blocked categories
  if (
    name.includes('password') ||
    name.includes('otp') ||
    name.includes('captcha') ||
    name.includes('cvv') ||
    name.includes('pin') ||
    (kind === 'type' && (
      name.includes('payment') ||
      name.includes('card') ||
      name.includes('token') ||
      name.includes('secret') ||
      name.includes('sensitive') ||
      name.includes('national id') ||
      name.includes('aadhaar') ||
      name.includes('pan') ||
      name.includes('ssn')
    ))
  ) {
    return 'blocked';
  }

  // Protected actions requiring human confirmation
  if (
    kind === 'request_user_confirmation' ||
    name.includes('submit') ||
    name.includes('send') ||
    name.includes('publish') ||
    name.includes('delete') ||
    name.includes('remove') ||
    name.includes('pay') ||
    name.includes('purchase') ||
    name.includes('buy') ||
    name.includes('authorize') ||
    name.includes('sign') ||
    name.includes('transfer') ||
    name.includes('confirm order')
  ) {
    return 'protected';
  }

  // Safe reversible actions
  if (
    kind === 'observe' ||
    kind === 'wait' ||
    kind === 'scroll' ||
    kind === 'select' ||
    (kind === 'click' && (name.includes('preview') || name.includes('filter') || name.includes('view') || name.includes('tab') || name.includes('next') || name.includes('search') || name.includes('close') || name.includes('cancel'))) ||
    kind === 'type'
  ) {
    return 'safe';
  }

  return proposal.risk || 'protected';
}

