/**
 * @privapilot/pii-rules - Verhoeff Checksum Algorithm
 *
 * Implements standard Verhoeff dihedral group D5 checksum validation used by UIDAI for Aadhaar.
 */
/**
 * Validates a number string using the Verhoeff algorithm.
 */
export declare function isValidVerhoeff(numStr: string): boolean;
/**
 * Calculates the Verhoeff check digit for a string of digits.
 */
export declare function calculateVerhoeffChecksum(numStr: string): number;
/**
 * Validates whether a candidate string is a valid 12-digit Indian Aadhaar number.
 * Requires first digit in [2-9] and valid Verhoeff checksum.
 */
export declare function isValidAadhaar(aadhaarStr: string): boolean;
//# sourceMappingURL=verhoeff.d.ts.map