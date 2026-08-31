/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */

import { AuditRecord, SensitiveRegion } from '@privapilot/protocol';

declare const chrome: any;

export class AuditLogger {
  private auditTrail: AuditRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get(['privapilot_audit_trail']);
        if (result && Array.isArray(result.privapilot_audit_trail)) {
          this.auditTrail = result.privapilot_audit_trail;
        }
      } catch {
        // Fallback to in-memory
      }
    }
  }

  logRedactionEvent(
    region: SensitiveRegion,
    captureId: string,
    payloadDigest: string,
    decision: 'redacted' | 'blocked' | 'safe_allowed' = 'redacted'
  ): AuditRecord {
    const record: AuditRecord = {
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

  private persistToStorage(): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ privapilot_audit_trail: this.auditTrail }).catch(() => {});
    }
  }

  getAuditRecords(): ReadonlyArray<AuditRecord> {
    return [...this.auditTrail];
  }

  clear(): void {
    this.auditTrail = [];
    this.persistToStorage();
  }
}
