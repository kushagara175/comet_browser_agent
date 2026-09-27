/**
 * @privapilot/pii-rules - Fast, ReDoS-Safe Regex Patterns & Detectors
 */

import { SensitiveCategory } from '@privapilot/protocol';
import { isValidLuhn } from './luhn.js';
import { isValidAadhaar } from './verhoeff.js';

export interface TextMatch {
  readonly category: SensitiveCategory;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly matchedLength: number;
  readonly confidence: number;
}

export const CANARY_SECRET = 'SECRET_CANARY_SIH26171_DO_NOT_TRANSMIT';

// Canary patterns
const CANARY_REGEX = /\b(?:SECRET_CANARY[A-Za-z0-9_]*|CANARY_PRIVAPILOT[A-Za-z0-9_]*)\b/g;

// Medical notes & sensitive health markers
const MEDICAL_REGEX = /\b(?:medical note|clinical diagnosis|prescription info|patient record|doctor note)\b[^\n.,;]*/gi;

// Social Media / Profile Handles (e.g. @kushagracretes, @username)
const HANDLE_REGEX = /(?:^|(?<=\s|[([{"']))(@[A-Za-z0-9_]{1,30})\b/g;

// Delivery and Postal Address Markers (e.g. "Deliver to Kushagra, 211002", "Delivering to Mumbai 400001", "Ship to John Doe")
const DELIVERY_ADDRESS_REGEX = /(?:^|(?<=\s|[([{"']))(?:Deliver(?:y|ing)?\s+to|Ship\s+to|Shipping\s+to|Delivered\s+to)\s+([^\n\r<]{3,80})/gi;

// Home / Work / Office Named Locations (e.g. "HOME at katra - Allahabad", "WORK at Cyber City")
const HOME_WORK_LOCATION_REGEX = /\b(?:HOME|WORK|OFFICE|OTHER)\s+(?:at\s+|-\s+)([^\n\r<]{3,80})/gi;

// Indian 6-digit Postal PIN Codes in context (e.g. "PIN: 211002", "Pincode 560001", "Bengaluru-560 094", or 6 digits in delivery/postal address)
const PINCODE_IN_CONTEXT_REGEX = /(?:[A-Za-z]+[\-,]\s*|[,\-]\s*|\b(?:pin(?:\s*code)?|postal(?:\s*code)?|zip(?:\s*code)?)[\s:\-,]*)([1-9][0-9]{2}\s?[0-9]{3})\b/gi;

// Locality, Colony, Nagar, Marg, Katra street addresses
const LOCALITY_ADDRESS_REGEX = /\b(?:Flat|House|H\.No|Plot|Shop|Room|Bldg|Building|Apartment|Apt)\s*(?:(?:No\.?|#)\s*[A-Za-z0-9/-]{1,10}|\d+[A-Za-z0-9/-]*)\b|\b(?:Sector|Block|Pocket)\s*(?:[-#]\s*[A-Za-z0-9/-]{1,8}|(?:No\.?|#)\s*[A-Za-z0-9/-]{1,8}|\d+[A-Za-z0-9/-]*|[A-Z]\b)|\b\d+(?:st|nd|rd|th)?\s+(?:Main|Cross)(?:\s+(?:Road|Rd))?\b|\bMain\s+(?:Road|Street)\b|\b[A-Z][a-zA-Z0-9'-]+(?:\s+[A-Z][a-zA-Z0-9'-]+){0,2}\s+(?:Nagar|Colony|Enclave|Vihar|Kunj|Mohalla|Gali|Katra|Chowk|Bazar|Bazaar|Puram|Pally|Palli|Guda|Pura)\b/gi;

// Account Greeting Names (e.g. "Hello, Kushagra", "Welcome, Alice", "Hi John")
const ACCOUNT_GREETING_REGEX = /\b(?:Hello|Hi|Welcome),\s+([A-Za-z0-9_]{2,30})\b/gi;

// Standard Street Address (e.g. "123 Main St, Anytown, USA", "456 Park Avenue")
const STREET_ADDRESS_REGEX = /\b(?<![~≈])\b\d{1,5}(?:[/-]\d{1,5})?\s+(?!(?:km|kg|m\/s|mb|gb|tb|hz|khz|mhz|ghz|cm|mm|meters?|miles?|hours?|hrs?|mins?|sec(?:onds?)?|days?|years?|percent|%|x|deg|v|w|a|k)\b)[A-Za-z0-9'.-]{1,25}(?:\s+[A-Za-z0-9'.-]{1,25}){0,2}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir)\b(?:\s+(?:Apt|Suite|Unit|Flat|Floor|#)\s*[A-Za-z0-9/-]+)?/gi;

// Dates are sensitive only with an explicit DOB/birth-date label in the same text.
const DATE_OF_BIRTH_REGEX = /\b(?:\d{1,2}[\s/-](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s/-]\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/gi;

// Email: Standard RFC-compliant safe pattern and Obfuscated patterns (e.g. isropr[at]isro[dot]gov[dot]in, contact(at)domain(dot)com)
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const OBFUSCATED_EMAIL_REGEX = /(?:^|(?<=\s|[([{:;,]))[A-Za-z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*|\s*@\s*)[A-Za-z0-9.-]+(?:\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\.\s*)[A-Za-z]{2,}(?:\s*\[dot\]\s*[A-Za-z]{2,}|\s*\.\s*[A-Za-z]{2,})*/gi;
const EMAIL_LABEL_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:Email|E-mail|Mail)[\s.:]*([^\s\n\r<]+@[^\s\n\r<]+|[A-Za-z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*)[^\s\n\r<]+)/gi;

// Standard 10-digit Phone Numbers (e.g. 1234567890, (123) 456-7890, 123-456-7890)
const STANDARD_PHONE_REGEX = /(?:^|(?<!\d))(?:\+?1[\s.-]?)?\(?([0-9]{3})\)?[\s.-]?([0-9]{3})[\s.-]?([0-9]{4})(?!\d)\b/g;

// Contextual phone prefix (e.g. "Phone: +91 80 22172294 / 96", "Tel: 080-22172294", "Mobile: 9876543210")
const PHONE_LABEL_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:Phone|Tel(?:ephone)?|Mobile|Mob|Contact|Call|Fax)[\s.:]*([+\d\s()./-]{7,35})(?!\d)/gi;

// Indian Phone (+91-9876543210, +91 98765 43210, 09876543210, 9876543210) & International E.164
const INDIAN_PHONE_REGEX = /(?:^|(?<!\d))(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)\b/g;
const INDIAN_LANDLINE_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:\+91[\s-]?)?0?\d{2,4}[\s-]?\d{6,8}(?:\s*[/,]\s*\d{2,4})*(?!\d)\b/g;
const INTL_PHONE_REGEX = /(?:^|(?<=\s|[([{:;,]))\+(?:[1-9]\d{0,2})[\s.-]?\(?\d{1,5}\)?[\s.-]?\d{1,5}[\s.-]?\d{3,5}(?:\s*[/,]\s*\d{2,5})*(?!\d)/g;

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
export function scanTextForPII(text: string, options: { publicAuthorHandles?: boolean } = {}): TextMatch[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches: TextMatch[] = [];

  // 1. Canary pattern check
  for (const match of text.matchAll(CANARY_REGEX)) {
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

  // 1b. Medical pattern check
  for (const match of text.matchAll(MEDICAL_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'uninspectable',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.95
      });
    }
  }

  // 1c. Social Media / Profile Handles (@username)
  for (const match of options.publicAuthorHandles ? [] : text.matchAll(HANDLE_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const handleOffset = match[0].indexOf(match[1]);
      const handleStart = match.index + handleOffset;
      matches.push({
        category: 'username',
        startIndex: handleStart,
        endIndex: handleStart + match[1].length,
        matchedLength: match[1].length,
        confidence: 0.95
      });
    }
  }

  // 1d. Delivery & Postal Addresses
  for (const match of text.matchAll(DELIVERY_ADDRESS_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'address',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.95
      });
    }
  }

  // 1e. Home / Work / Office Named Locations
  for (const match of text.matchAll(HOME_WORK_LOCATION_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'address',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.95
      });
    }
  }

  // 1f. Locality / Street Address Lines
  for (const match of text.matchAll(LOCALITY_ADDRESS_REGEX)) {
    if (match.index !== undefined) {
      matches.push({
        category: 'address',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        matchedLength: match[0].length,
        confidence: 0.92
      });
    }
  }

  // 1g. Postal PIN codes in context
  for (const match of text.matchAll(PINCODE_IN_CONTEXT_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const pinOffset = match[0].indexOf(match[1]);
      const pinStart = match.index + pinOffset;
      matches.push({
        category: 'address',
        startIndex: pinStart,
        endIndex: pinStart + match[1].length,
        matchedLength: match[1].length,
        confidence: 0.96
      });
    }
  }

  // 1h. Account Greeting Names
  for (const match of text.matchAll(ACCOUNT_GREETING_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const nameOffset = match[0].indexOf(match[1]);
      const nameStart = match.index + nameOffset;
      matches.push({
        category: 'username',
        startIndex: nameStart,
        endIndex: nameStart + match[1].length,
        matchedLength: match[1].length,
        confidence: 0.95
      });
    }
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

  // 2b. Obfuscated Email (e.g. isropr[at]isro[dot]gov[dot]in, contact(at)domain(dot)com)
  for (const match of text.matchAll(OBFUSCATED_EMAIL_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered) {
        matches.push({
          category: 'email',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.97
        });
      }
    }
  }

  // 2c. Email with label (e.g. "Email: isropr[at]isro[dot]gov[dot]in" -> masks the email address)
  for (const match of text.matchAll(EMAIL_LABEL_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const emailOffset = match[0].indexOf(match[1]);
      const emailStart = match.index + emailOffset;
      const emailEnd = emailStart + match[1].length;
      const alreadyCovered = matches.some(m => m.startIndex <= emailStart && m.endIndex >= emailEnd);
      if (!alreadyCovered) {
        matches.push({
          category: 'email',
          startIndex: emailStart,
          endIndex: emailEnd,
          matchedLength: match[1].length,
          confidence: 0.98
        });
      }
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

  // 4. Aadhaar (12 digits, first digit in 2-9, valid Verhoeff checksum)
  for (const match of text.matchAll(AADHAAR_REGEX)) {
    if (match.index !== undefined) {
      if (isValidAadhaar(match[0])) {
        matches.push({
          category: 'national_id',
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.99
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

  // 5b. Contextual Phone Labels (e.g. "Phone: +91 80 22172294 / 96", "Tel: 080-22172294")
  for (const match of text.matchAll(PHONE_LABEL_REGEX)) {
    if (match.index !== undefined && match[1]) {
      const phoneOffset = match[0].indexOf(match[1]);
      const phoneStart = match.index + phoneOffset;
      const phoneEnd = phoneStart + match[1].length;
      const alreadyCovered = matches.some(m => m.startIndex <= phoneStart && m.endIndex >= phoneEnd);
      if (!alreadyCovered) {
        matches.push({
          category: 'phone',
          startIndex: phoneStart,
          endIndex: phoneEnd,
          matchedLength: match[1].length,
          confidence: 0.98
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

  // 6b. Indian Landline Numbers with STD codes (e.g. +91 80 22172294 / 96, 080-22172294)
  for (const match of text.matchAll(INDIAN_LANDLINE_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered && match[0].replace(/\D/g, '').length >= 8) {
        matches.push({
          category: 'phone',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.94
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

  // 7b. Standard 10-digit Phone Numbers
  for (const match of text.matchAll(STANDARD_PHONE_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered) {
        matches.push({
          category: 'phone',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.92
        });
      }
    }
  }

  // 7c. Street Addresses
  for (const match of text.matchAll(STREET_ADDRESS_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      if (!alreadyCovered) {
        matches.push({
          category: 'address',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.94
        });
      }
    }
  }

  // 7d. Dates of birth only; public calendar dates are not private.
  for (const match of text.matchAll(DATE_OF_BIRTH_REGEX)) {
    if (match.index !== undefined) {
      const start = match.index;
      const end = match.index + match[0].length;
      const alreadyCovered = matches.some(m => m.startIndex <= start && m.endIndex >= end);
      const prefix = text.slice(Math.max(0, start - 40), start);
      const hasBirthLabel = /(?:^|[\s([{,;])(?:dob|date\s+of\s+birth|birth\s+date|birthday|bday)\s*[:=\-]?\s*$/i.test(prefix);
      if (!alreadyCovered && hasBirthLabel) {
        matches.push({
          category: 'date_of_birth',
          startIndex: start,
          endIndex: end,
          matchedLength: match[0].length,
          confidence: 0.95
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
