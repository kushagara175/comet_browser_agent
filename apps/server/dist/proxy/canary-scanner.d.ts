/**
 * @privapilot/server - Network Security Canary Scanner Proxy
 *
 * Scans all incoming and outgoing network traffic for canary secrets or raw unredacted data.
 */
export declare class CanaryScannerProxy {
    static inspect(payload: any, path?: string): {
        passed: boolean;
        leakFound?: string;
    };
}
//# sourceMappingURL=canary-scanner.d.ts.map