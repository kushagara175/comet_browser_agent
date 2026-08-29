/**
 * @privapilot/server - Network Security Canary Scanner Proxy
 *
 * Scans all incoming and outgoing network traffic for canary secrets or raw unredacted data.
 */

import { assertNoCanaryLeak, SECRET_CANARY } from '@privapilot/test-fixtures';

export class CanaryScannerProxy {
  static inspect(payload: any, path: string = '/api/v1/reason'): { passed: boolean; leakFound?: string } {
    try {
      assertNoCanaryLeak(payload, `HTTP request to ${path}`);
      return { passed: true };
    } catch (err: any) {
      return { passed: false, leakFound: SECRET_CANARY };
    }
  }
}
