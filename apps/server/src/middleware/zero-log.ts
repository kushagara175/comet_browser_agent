/**
 * @privapilot/server - Zero-Logging & Header Scrubbing Middleware
 *
 * Enforces section 6.1 of the Winning Execution Playbook:
 * Never logs request bodies or unredacted metadata in server logs.
 */

export function sanitizeHeadersForLogging(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '[REDACTED_HEADER]';
    } else {
      sanitized[key] = Array.isArray(value) ? value.join(', ') : (value || '');
    }
  }

  return sanitized;
}
