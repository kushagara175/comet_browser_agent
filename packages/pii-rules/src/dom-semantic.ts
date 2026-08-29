/**
 * @privapilot/pii-rules - DOM Semantic Analyzer
 *
 * Inspects DOM element descriptors (input type, autocomplete, inputmode, id, name, aria-label, placeholder, labels)
 * to detect sensitive form fields deterministically.
 */

import { SensitiveCategory } from '@privapilot/protocol';
import { SENSITIVE_FIELD_KEYWORDS, SENSITIVE_AUTOCOMPLETE_VALUES } from './keywords.js';

export interface DomElementDescriptor {
  readonly tagName: string;
  readonly type?: string;
  readonly name?: string;
  readonly id?: string;
  readonly autocomplete?: string;
  readonly inputmode?: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly associatedLabelText?: string;
  readonly value?: string;
}

export interface DomSensitivityDecision {
  readonly isSensitive: boolean;
  readonly category?: SensitiveCategory;
  readonly reason?: string;
  readonly confidence: number;
}

/**
 * Evaluates whether a DOM element is sensitive based on semantic attributes.
 */
export function analyzeDomElementSensitivity(
  desc: DomElementDescriptor
): DomSensitivityDecision {
  const type = (desc.type || '').toLowerCase();
  const autocomplete = (desc.autocomplete || '').toLowerCase();
  const name = (desc.name || '').toLowerCase();
  const id = (desc.id || '').toLowerCase();
  const placeholder = (desc.placeholder || '').toLowerCase();
  const ariaLabel = (desc.ariaLabel || '').toLowerCase();
  const labelText = (desc.associatedLabelText || '').toLowerCase();

  // 1. Password input type
  if (type === 'password') {
    return {
      isSensitive: true,
      category: 'password',
      reason: 'input[type="password"]',
      confidence: 1.0
    };
  }

  // 2. Sensitive Autocomplete values
  for (const autoVal of SENSITIVE_AUTOCOMPLETE_VALUES) {
    if (autocomplete.includes(autoVal)) {
      let cat: SensitiveCategory = 'password';
      if (autoVal.startsWith('cc-')) cat = 'credit_card';
      else if (autoVal.startsWith('bday')) cat = 'date_of_birth';
      else if (autoVal === 'one-time-code') cat = 'auth_code';

      return {
        isSensitive: true,
        category: cat,
        reason: `autocomplete="${autoVal}"`,
        confidence: 1.0
      };
    }
  }

  // 3. Sensitive Keywords in id, name, placeholder, label, aria-label
  const combinedTokens = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`.toLowerCase();

  for (const keyword of SENSITIVE_FIELD_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b|_${keyword}|${keyword}_`, 'i');
    if (regex.test(combinedTokens)) {
      let cat: SensitiveCategory = 'token';
      if (keyword.includes('password') || keyword.includes('passcode') || keyword.includes('pwd')) cat = 'password';
      else if (keyword.includes('card') || keyword.includes('cc_')) cat = 'credit_card';
      else if (keyword.includes('cvv') || keyword.includes('cvc')) cat = 'cvv';
      else if (keyword.includes('pan')) cat = 'national_id';
      else if (keyword.includes('aadhaar') || keyword.includes('aadhar')) cat = 'national_id';
      else if (keyword.includes('ssn') || keyword.includes('social_security')) cat = 'national_id';
      else if (keyword.includes('bank') || keyword.includes('ifsc') || keyword.includes('iban')) cat = 'bank_account';
      else if (keyword.includes('otp') || keyword.includes('2fa') || keyword.includes('mfa')) cat = 'auth_code';

      return {
        isSensitive: true,
        category: cat,
        reason: `token match: "${keyword}"`,
        confidence: 0.95
      };
    }
  }

  // 4. Email & Tel input types
  if (type === 'email' || autocomplete === 'email') {
    return {
      isSensitive: true,
      category: 'email',
      reason: 'type/autocomplete email',
      confidence: 0.90
    };
  }

  if (type === 'tel' || autocomplete === 'tel') {
    return {
      isSensitive: true,
      category: 'phone',
      reason: 'type/autocomplete tel',
      confidence: 0.90
    };
  }

  return {
    isSensitive: false,
    confidence: 1.0
  };
}
