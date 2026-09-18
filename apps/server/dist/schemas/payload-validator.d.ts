/**
 * @privapilot/server - Closed Request Payload Schema Validator
 *
 * Implements strict closed recursive schemas for /api/v1/reason and /api/v1/chat.
 * Rejects every unknown root or nested key, prototype-pollution attempts,
 * enforces bounded lengths, counts, decoded screenshot sizes, explicit allowlists,
 * and duplicate/contradiction checks without reflecting submitted values.
 */
import { SanitizedNetworkPayload, SanitizedChatPayload, PlatformTaskRequest, PlanRequest, SynthesizeRequest } from '@privapilot/protocol';
export interface ValidationResult<T = SanitizedNetworkPayload> {
    readonly isValid: boolean;
    readonly payload?: T;
    readonly errorMessage?: string;
}
/**
 * Validates /api/v1/reason incoming payload against closed recursive schema.
 */
export declare function validateSanitizedPayload(body: any): ValidationResult<SanitizedNetworkPayload>;
/**
 * Validates /api/v1/chat incoming payload against closed schema.
 */
export declare function validateSanitizedChatPayload(body: any): ValidationResult<SanitizedChatPayload>;
/**
 * Validates a PlatformTaskRequest against closed schema.
 */
export declare function validatePlatformTaskRequest(body: any): ValidationResult<PlatformTaskRequest>;
/**
 * Validates a PlanRequest against closed schema.
 */
export declare function validatePlanRequest(body: any): ValidationResult<PlanRequest>;
/**
 * Validates a SynthesizeRequest against closed schema.
 */
export declare function validateSynthesizeRequest(body: any): ValidationResult<SynthesizeRequest>;
//# sourceMappingURL=payload-validator.d.ts.map