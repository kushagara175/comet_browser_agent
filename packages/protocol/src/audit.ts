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
}
