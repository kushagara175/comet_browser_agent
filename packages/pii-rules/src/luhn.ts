/**
 * @privapilot/pii-rules - Luhn Algorithm Checksum Validator
 *
 * Used to validate candidate credit/debit card numbers and eliminate false positives.
 */

export function isValidLuhn(cardNumberStr: string): boolean {
  const sanitized = cardNumberStr.replace(/[\s-]/g, '');

  if (!/^\d{13,19}$/.test(sanitized)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
