/**
 * @privapilot/pii-rules - Verhoeff Checksum Algorithm
 *
 * Implements standard Verhoeff dihedral group D5 checksum validation used by UIDAI for Aadhaar.
 */

// Multiplication table (d) based on dihedral group D5
const D_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Permutation table (p)
const P_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// Inverse table (inv)
const INV_TABLE: ReadonlyArray<number> = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a number string using the Verhoeff algorithm.
 */
export function isValidVerhoeff(numStr: string): boolean {
  if (!numStr || typeof numStr !== 'string' || !/^\d+$/.test(numStr)) {
    return false;
  }

  let c = 0;
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr.charAt(len - 1 - i), 10);
    c = D_TABLE[c][P_TABLE[i % 8][digit]];
  }

  return c === 0;
}

/**
 * Calculates the Verhoeff check digit for a string of digits.
 */
export function calculateVerhoeffChecksum(numStr: string): number {
  if (!numStr || typeof numStr !== 'string' || !/^\d+$/.test(numStr)) {
    throw new Error('Invalid number string for Verhoeff calculation');
  }

  let c = 0;
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr.charAt(len - 1 - i), 10);
    c = D_TABLE[c][P_TABLE[(i + 1) % 8][digit]];
  }

  return INV_TABLE[c];
}

/**
 * Validates whether a candidate string is a valid 12-digit Indian Aadhaar number.
 * Requires first digit in [2-9] and valid Verhoeff checksum.
 */
export function isValidAadhaar(aadhaarStr: string): boolean {
  if (!aadhaarStr || typeof aadhaarStr !== 'string') {
    return false;
  }

  const normalized = aadhaarStr.replace(/[\s-]/g, '');

  // Aadhaar constraint: Exactly 12 digits, cannot start with 0 or 1
  if (!/^[2-9]\d{11}$/.test(normalized)) {
    return false;
  }

  // All identical digits (e.g. 999999999999) are invalid
  if (/^(\d)\1{11}$/.test(normalized)) {
    return false;
  }

  return isValidVerhoeff(normalized);
}
