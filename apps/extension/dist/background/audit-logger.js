/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */
export class AuditLogger {
    auditTrail = [];
    constructor() {
        this.loadFromStorage();
    }
    async loadFromStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            try {
                const result = await chrome.storage.local.get(['privapilot_audit_trail']);
                if (result && Array.isArray(result.privapilot_audit_trail)) {
                    this.auditTrail = result.privapilot_audit_trail;
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
    persistToStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ privapilot_audit_trail: this.auditTrail }).catch(() => { });
        }
    }
    getAuditRecords() {
        return [...this.auditTrail];
    }
    clear() {
        this.auditTrail = [];
        this.persistToStorage();
    }
}
//# sourceMappingURL=audit-logger.js.map