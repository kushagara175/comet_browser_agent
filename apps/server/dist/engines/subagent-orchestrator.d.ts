/**
 * @privapilot/server - Sub-Agent Swarm Orchestrator
 *
 * Implements:
 * 1. Intelligent Task Decomposition into Directed Acyclic Graphs (DAGs)
 * 2. Parallel Sub-Agent Worker Execution with Bounded Concurrency
 * 3. On-Device Redaction & Privacy Isolation Compliance
 * 4. Cryptographic SHA-256 Compliance Audit Proof Generation
 * 5. Multi-Worker Result Synthesis
 */
import { SubTaskPlan, SubTaskResult, PlatformTaskRequest, PlatformTaskResponse, TaskSpecification } from '@privapilot/protocol';
import { VlmReasoningEngine } from './vlm-engine.js';
export declare class SubAgentOrchestrator {
    private static instance;
    private readonly tasks;
    private readonly vlmEngine;
    constructor(vlmEngine?: VlmReasoningEngine);
    static getInstance(vlmEngine?: VlmReasoningEngine): SubAgentOrchestrator;
    /**
     * Evaluates if a goal should be decomposed into sub-agents, and produces a SubTask DAG.
     */
    planTask(goal: string, contextUrl?: string): Promise<SubTaskPlan>;
    /**
     * Evaluates a goal to produce an explicit TaskSpecification defining
     * what tasks to do (ordered steps) and what NOT to do (guardrails).
     */
    planTaskSpecification(goal: string, contextUrl?: string, customPrompt?: string): Promise<TaskSpecification>;
    /**
     * Executes a complete platform task, orchestrating sub-agents concurrently.
     */
    dispatchTask(request: PlatformTaskRequest, tenantId: string): Promise<PlatformTaskResponse>;
    /**
     * Simulates/executes an individual sub-agent worker in an isolated sandbox.
     */
    private runSubAgentWorker;
    /**
     * Merges multiple sub-task outputs into a coherent executive summary.
     */
    synthesizeResults(originalGoal: string, results: readonly SubTaskResult[]): Promise<string>;
    /**
     * Generates a real cryptographic SHA-256 compliance audit proof certifying zero PII leak.
     */
    private createAuditProof;
    /**
     * Fetches an existing task by ID for live polling.
     */
    getTask(taskId: string): PlatformTaskResponse | null;
}
export declare function resolveEntityUrl(entity: string, goal: string): string;
export declare function getPortalGroundedKnowledge(title: string, goal: string, url?: string): string;
//# sourceMappingURL=subagent-orchestrator.d.ts.map