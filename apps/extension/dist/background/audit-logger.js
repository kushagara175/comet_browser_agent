/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */
export class AuditLogger {
    auditTrail = [];
    decisionTrail = [];
    constructor() {
        this.loadFromStorage();
    }
    async loadFromStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            try {
                const result = await chrome.storage.local.get(['privapilot_audit_trail', 'privapilot_decision_trail']);
                if (result && Array.isArray(result.privapilot_audit_trail)) {
                    this.auditTrail = result.privapilot_audit_trail;
                }
                if (result && Array.isArray(result.privapilot_decision_trail)) {
                    this.decisionTrail = result.privapilot_decision_trail;
                }
            }
            catch {
                // Fallback to in-memory
            }
        }
    }
    logRedactionEvent(region, captureId, payloadDigest, decision = 'redacted') {
        const record = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now(),
            category: region.category,
            boundingBox: region.screenshotBox,
            detectorSource: region.detectorSource,
            redactionMethod: region.method,
            captureId,
            sanitizedPayloadDigest: payloadDigest,
            decision
        };
        this.auditTrail.push(record);
        if (this.auditTrail.length > 500) {
            this.auditTrail.shift();
        }
        this.persistToStorage();
        return record;
    }
    /**
     * Records how a step was decided, and how many bytes it cost.
     *
     * A local decision writes bytesTransmitted: 0 - the audit trail is where the
     * "we often do not send at all" claim is actually evidenced.
     */
    logDecisionEvent(record) {
        const full = {
            id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now(),
            ...record
        };
        this.decisionTrail.push(full);
        if (this.decisionTrail.length > 500) {
            this.decisionTrail.shift();
        }
        this.persistToStorage();
        return full;
    }
    getDecisionRecords() {
        return [...this.decisionTrail];
    }
    /** Local/remote split for the current trail, for the side panel and the harness. */
    getTransmissionSummary() {
        const decidedLocally = this.decisionTrail.filter((d) => d.decisionSource === 'local').length;
        return {
            totalSteps: this.decisionTrail.length,
            decidedLocally,
            escalated: this.decisionTrail.length - decidedLocally,
            bytesTransmitted: this.decisionTrail.reduce((n, d) => n + d.bytesTransmitted, 0)
        };
    }
    persistToStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({
                privapilot_audit_trail: this.auditTrail,
                privapilot_decision_trail: this.decisionTrail
            }).catch(() => { });
        }
    }
    getAuditRecords() {
        return [...this.auditTrail];
    }
    clear() {
        this.auditTrail = [];
        this.decisionTrail = [];
        this.persistToStorage();
    }
}
//# sourceMappingURL=audit-logger.js.map