/**
 * @privapilot/pii-rules - Fast, ReDoS-Safe Regex Patterns & Detectors
 */

import { SensitiveCategory } from '@privapilot/protocol';
import { isValidLuhn } from './luhn.js';

export interface TextMatch {
  readonly category: SensitiveCategory;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly matchedLength: number;
  readonly confidence: number;
}

export const CANARY_SECRET = 'SECRET_CANARY_SIH26171_DO_NOT_TRANSMIT';

// Email: Standard RFC-compliant safe pattern
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Indian Phone (+91-9876543210, +91 98765 43210, 09876543210, 9876543210) & International E.164
const INDIAN_PHONE_REGEX = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const INTL_PHONE_REGEX = /\b\+(?:[1-9]\d{0,2})[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}\b/g;

// Indian PAN (Permanent Account Number): 5 Letters, 4 Digits, 1 Letter (e.g. ABCDE1234F)
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

// Indian Aadhaar: 12 digits, often formatted as 4-4-4 (e.g. 4532 8901 2345)
const AADHAAR_REGEX = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;

// Card number candidates: 13-19 digits with spaces or dashes
const CARD_CANDIDATE_REGEX = /\b(?:\d{4}[\s-]?){3,4}\d{1,4}\b/g;

// CVV in context: 3 or 4 digits
const CVV_CONTEXT_REGEX = /\b(?:cvv|cvc|cvn|security code)[\s:]*([0-9]{3,4})\b/gi;

// Bearer tokens / API keys (JWT or high-entropy hex/base64 strings)
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
const GENERIC_SECRET_KEY_REGEX = /\b(?:sk_live_|ghp_|akIA)[A-Za-z0-9_]{16,}\b/g;

/**
 * Scans a text string and returns all detected sensitive PII ranges.
 * Strictly avoids logging or storing the actual secret strings.
 */
export function scanTextForPII(text: string): TextMatch[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches: TextMatch[] = [];

  // 1. Canary check
  let canaryIdx = text.indexOf(CANARY_SECRET);
  while (canaryIdx !== -1) {
    matches.push({
      category: 'token',
      startIndex: canaryIdx,
      endIndex: canaryIdx + CANARY_SECRET.length,
      matchedLength: CANARY_SECRET.length,
      confidence: 1.0
    });
    canaryIdx = text.indexOf(CANARY_SECRET, canaryIdx + CANARY_SECRET.length);
  }

  // 2. Email
  for (const match of text.matchAll(EMAIL_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'email',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.98
      });
    }
  }

  // 3. PAN
  for (const match of text.matchAll(PAN_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'national_id',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.99
      });
    }
  }

  // 4. Aadhaar
  for (const match of text.matchAll(AADHAAR_REGEX)) {
    if (match.index !== undefined) {
      const clean = match[0].replace(/[\s-]/g, '');
      if (clean.length === 12) {
        matches.push({
          category: 'national_id',
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.95
        });
      }
    }
  }

  // 5. Credit Cards with Luhn Check
  for (const match of text.matchAll(CARD_CANDIDATE_REGEX)) {
    if (match.index !== undefined) {
      const candidate = match[0];
      if (isValidLuhn(candidate)) {
        matches.push({
          category: 'credit_card',
          startIndex: match.index,
          endIndex: match.index + candidate.length,
          matchedLength: candidate.length,
          confidence: 1.0
        });
      }
    }
  }

  // 6. Indian Phone Numbers
  for (const match of text.matchAll(INDIAN_PHONE_REGEX)) {
    if (match.index !== undefined) {
      // Ensure it's not already matched as credit card or aadhaar
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered) {
        matches.push({
          category: 'phone',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.95
        });
      }
    }
  }

  // 7. International Phone Numbers
  for (const match of text.matchAll(INTL_PHONE_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered && match[0].length >= 8) {
        matches.push({
          category: 'phone',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.90
        });
      }
    }
  }

  // 8. CVV in context
  for (const match of text.matchAll(CVV_CONTEXT_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const cvvStart = match.index + match[0].indexOf(match[1]);
      matches.push({
        category: 'cvv',
        startIndex: cvvStart,
        endIndex: cvvStart + match[1].length,
        matchedLength: match[1].length,
        confidence: 0.95
      });
    }
  }

  // 9. JWT and Generic API Keys
  for (const match of text.matchAll(JWT_TOKEN_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'token',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 1.0
      });
    }
  }
  for (const match of text.matchAll(GENERIC_SECRET_KEY_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'token',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 1.0
      });
    }
  }

  // Return sorted non-overlapping or unified matches
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}
