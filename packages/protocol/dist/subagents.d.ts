/**
 * @privapilot/protocol - Sub-Agent Swarm & Platform API Types
 *
 * Defines the contract for:
 * 1. Task Decomposition & SubTask DAGs
 * 2. Parallel Sub-Agent Execution State & Results
 * 3. Multi-Tenant Platform Requests & Responses
 * 4. Cryptographic Compliance Audit Proofs
 */
export type SubTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type SubTaskOutcome = 'success' | 'failure' | 'blocked';
export type PrivacyTier = 'strict_dpdp' | 'standard';
export interface SubTask {
    readonly subTaskId: string;
    readonly title: string;
    readonly goal: string;
    readonly targetUrl?: string;
    /** SubTask IDs that must complete before this subtask can start */
    readonly dependsOn: readonly string[];
    readonly maxStepBudget?: number;
    status: SubTaskStatus;
    result?: SubTaskResult;
}
export interface SubTaskPlan {
    readonly shouldDecompose: boolean;
    readonly rationale: string;
    readonly subTasks: readonly SubTask[];
}
export interface SubTaskResult {
    readonly subTaskId: string;
    readonly goal: string;
    readonly outcome: SubTaskOutcome;
    readonly summary: string;
    readonly extractedData?: Record<string, unknown>;
    readonly durationMs: number;
    readonly stepCount?: number;
    readonly maskCount?: number;
}
export interface ComplianceAuditProof {
    readonly proofId: string;
    readonly timestamp: number;
    readonly tenantId: string;
    readonly hashes: {
        readonly requestDigest: string;
        readonly sanitizedPayloadDigest: string;
    };
    readonly zeroPlaintextPiiGuaranteed: boolean;
    readonly redactedEntitiesCount: {
        readonly faces: number;
        readonly domFields: number;
        readonly regexMatches: number;
    };
}
export interface PlatformTaskRequest {
    readonly protocolVersion: '1.0';
    readonly goal: string;
    readonly contextUrl?: string;
    readonly enableSubAgents?: boolean;
    readonly maxParallel?: number;
    readonly privacyTier?: PrivacyTier;
    readonly requireHumanApproval?: readonly string[];
}
export interface PlatformTaskResponse {
    readonly taskId: string;
    readonly status: 'planning' | 'running' | 'completed' | 'failed';
    readonly plan?: SubTaskPlan;
    readonly results?: readonly SubTaskResult[];
    readonly finalSynthesis?: string;
    readonly complianceAudit: ComplianceAuditProof;
    readonly startedAt: number;
    readonly completedAt?: number;
    readonly durationMs?: number;
}
export interface PlanRequest {
    readonly protocolVersion: '1.0';
    readonly goal: string;
    readonly contextUrl?: string;
}
export interface SynthesizeRequest {
    readonly protocolVersion: '1.0';
    readonly originalGoal: string;
    readonly subTaskResults: readonly SubTaskResult[];
}
//# sourceMappingURL=subagents.d.ts.map