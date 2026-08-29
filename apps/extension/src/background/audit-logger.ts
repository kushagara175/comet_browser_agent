/**
 * @privapilot/extension - Background Privacy Audit Logger
 *
 * Enforces section 3.4 of the Winning Execution Playbook:
 * Never stores raw sensitive data or hashes of it.
 */

import { AuditRecord, SensitiveRegion } from '@privapilot/protocol';

export class AuditLogger {
  private auditTrail: AuditRecord[] = [];

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
    return record;
  }

  getAuditRecords(): ReadonlyArray<AuditRecord> {
    return [...this.auditTrail];
  }

  clear(): void {
    this.auditTrail = [];
  }
}
