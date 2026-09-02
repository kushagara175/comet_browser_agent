/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */
import { AuditRecord, DecisionAuditRecord, SensitiveRegion } from '@privapilot/protocol';
export declare class AuditLogger {
    private auditTrail;
    private decisionTrail;
    constructor();
    private loadFromStorage;
    logRedactionEvent(region: SensitiveRegion, captureId: string, payloadDigest: string, decision?: 'redacted' | 'blocked' | 'safe_allowed'): AuditRecord;
    /**
     * Records how a step was decided, and how many bytes it cost.
     *
     * A local decision writes bytesTransmitted: 0 - the audit trail is where the
     * "we often do not send at all" claim is actually evidenced.
     */
    logDecisionEvent(record: Omit<DecisionAuditRecord, 'id' | 'timestamp'>): DecisionAuditRecord;
    getDecisionRecords(): ReadonlyArray<DecisionAuditRecord>;
    /** Local/remote split for the current trail, for the side panel and the harness. */
    getTransmissionSummary(): {
        totalSteps: number;
        decidedLocally: number;
        escalated: number;
        bytesTransmitted: number;
    };
    private persistToStorage;
    getAuditRecords(): ReadonlyArray<AuditRecord>;
    clear(): void;
}
//# sourceMappingURL=audit-logger.d.ts.map