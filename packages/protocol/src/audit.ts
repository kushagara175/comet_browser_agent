/**
 * @privapilot/protocol - Audit Records
 *
 * Strict Privacy Rule:
 * Never retain raw sensitive data or hashes of it (hashes of predictable values can be reversed).
 * Only retain metadata, categories, bounding boxes, and digests.
 */

import { SensitiveCategory, RedactionMethod } from './payload.js';
import { ScreenshotPixelBox } from './coordinates.js';

export interface AuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly category: SensitiveCategory;
  readonly boundingBox: ScreenshotPixelBox;
  readonly detectorSource: string;
  readonly redactionMethod: RedactionMethod;
  readonly captureId: string;
  readonly sanitizedPayloadDigest: string;
  readonly decision: 'redacted' | 'blocked' | 'safe_allowed';
}

/**
 * One step's routing decision: was the server needed, and what actually left the
 * machine.
 *
 * `bytesTransmitted: 0` is the evidence for the problem statement's conditional
 * clause - a step resolved with literally nothing sent, not merely with less sent.
 */
export interface DecisionAuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly runId: string;
  readonly step: number;
  readonly decisionSource: 'local' | 'remote';
  readonly actionKind: string;
  readonly targetLocalId?: string;
  readonly confidence: number;
  /** Which local rule fired, when decided on-device. */
  readonly rule?: string;
  /** Why the server was needed, when escalated. */
  readonly escalationReason?: string;
  readonly bytesTransmitted: number;
}

import { ResourceTelemetry } from './resource-governance.js';

export interface RunTelemetry {
  readonly runId: string;
  readonly t0_start: number;
  readonly t1_captureComplete: number;
  readonly t2_detectionComplete: number;
  readonly t3_sanitizationValidated: number;
  readonly t4_reasoningReceived: number;
  readonly t5_actionValidated: number;
  readonly t6_actionExecuted: number;
  readonly t7_stateVerified: number;
  readonly totalLatencyMs: number;
  readonly clientLatencyMs: number;
  readonly serverLatencyMs: number;
  readonly stepCount?: number;
  readonly stepsCompleted?: number;
  /** How this step was decided. */
  readonly decisionSource?: 'local' | 'remote';
  /** Running split across the whole run, so the ratio is visible live. */
  readonly stepsDecidedLocally?: number;
  readonly stepsEscalated?: number;
  readonly bytesTransmittedTotal?: number;
  /** Enforced on-device client resource governance metrics */
  readonly resources?: ResourceTelemetry;
}
