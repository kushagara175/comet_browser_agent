/**
 * @privapilot/pii-rules - String and Element Name Scrubber
 */

import { scanTextForPII } from './regex-patterns.js';

/**
 * Replaces detected PII substrings within a text string with tokenized redaction markers.
 */
export function scrubText(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const matches = scanTextForPII(text);
  if (matches.length === 0) {
    return text;
  }

  let result = '';
  let lastIndex = 0;

  for (const match of matches) {
    if (match.startIndex < lastIndex) {
      if (match.endIndex > lastIndex) {
        lastIndex = match.endIndex;
      }
      continue;
    }
    result += text.substring(lastIndex, match.startIndex);
    result += `[REDACTED_${match.category.toUpperCase()}]`;
    lastIndex = match.endIndex;
  }

  result += text.substring(lastIndex);
  return result;
}

/**
 * Sanitizes element labels/names by removing sensitive identifiers or replaced values.
 */
export function sanitizeElementName(rawName: string): string {
  if (!rawName) return '';
  const scrubbed = scrubText(rawName).trim();
  // Truncate excessively long names to keep element payload compact
  if (scrubbed.length > 80) {
    return scrubbed.substring(0, 77) + '...';
  }
  return scrubbed;
}
