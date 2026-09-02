/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */

import { AuditRecord, DecisionAuditRecord, SensitiveRegion } from '@privapilot/protocol';

declare const chrome: any;

export class AuditLogger {
  private auditTrail: AuditRecord[] = [];
  private decisionTrail: DecisionAuditRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get(['privapilot_audit_trail', 'privapilot_decision_trail']);
        if (result && Array.isArray(result.privapilot_audit_trail)) {
          this.auditTrail = result.privapilot_audit_trail;
        }
        if (result && Array.isArray(result.privapilot_decision_trail)) {
          this.decisionTrail = result.privapilot_decision_trail;
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

  /**
   * Records how a step was decided, and how many bytes it cost.
   *
   * A local decision writes bytesTransmitted: 0 - the audit trail is where the
   * "we often do not send at all" claim is actually evidenced.
   */
  logDecisionEvent(record: Omit<DecisionAuditRecord, 'id' | 'timestamp'>): DecisionAuditRecord {
    const full: DecisionAuditRecord = {
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

  getDecisionRecords(): ReadonlyArray<DecisionAuditRecord> {
    return [...this.decisionTrail];
  }

  /** Local/remote split for the current trail, for the side panel and the harness. */
  getTransmissionSummary(): {
    totalSteps: number;
    decidedLocally: number;
    escalated: number;
    bytesTransmitted: number;
  } {
    const decidedLocally = this.decisionTrail.filter((d) => d.decisionSource === 'local').length;
    return {
      totalSteps: this.decisionTrail.length,
      decidedLocally,
      escalated: this.decisionTrail.length - decidedLocally,
      bytesTransmitted: this.decisionTrail.reduce((n, d) => n + d.bytesTransmitted, 0)
    };
  }

  private persistToStorage(): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        privapilot_audit_trail: this.auditTrail,
        privapilot_decision_trail: this.decisionTrail
      }).catch(() => {});
    }
  }

  getAuditRecords(): ReadonlyArray<AuditRecord> {
    return [...this.auditTrail];
  }

  clear(): void {
    this.auditTrail = [];
    this.decisionTrail = [];
    this.persistToStorage();
  }
}
