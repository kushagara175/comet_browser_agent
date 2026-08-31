/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */
import { AuditRecord, SensitiveRegion } from '@privapilot/protocol';
export declare class AuditLogger {
    private auditTrail;
    constructor();
    private loadFromStorage;
    logRedactionEvent(region: SensitiveRegion, captureId: string, payloadDigest: string, decision?: 'redacted' | 'blocked' | 'safe_allowed'): AuditRecord;
    private persistToStorage;
    getAuditRecords(): ReadonlyArray<AuditRecord>;
    clear(): void;
}
//# sourceMappingURL=audit-logger.d.ts.map