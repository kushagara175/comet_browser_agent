/**
 * @privapilot/test-fixtures - Canary Scanner & Assertions
 */

export const SECRET_CANARY = 'SECRET_CANARY_SIH26171_DO_NOT_TRANSMIT';

/**
 * Recursively scans any object/string/array for presence of the canary string.
 * Throws a hard error if the canary is leaked.
 */
export function assertNoCanaryLeak(target: any, contextName: string = 'Network Payload'): void {
  const serialized = typeof target === 'string' ? target : JSON.stringify(target);

  if (serialized && serialized.includes(SECRET_CANARY)) {
    throw new Error(
      `[PRIVACY BREACH DETECTED] Canary secret '${SECRET_CANARY}' was found in ${contextName}!`
    );
  }
}
