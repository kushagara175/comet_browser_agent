/**
 * @privapilot/protocol - Resource Governance & Model Tiering Contracts
 *
 * Enforces client runtime budgeting, observable tiering (T0/T1/T2),
 * explicit backpressure, and accounted resident memory.
 */
export const DEFAULT_RESOURCE_BUDGET = {
    maxMsPerFrame: 1500,
    maxResidentMb: 160,
    maxCapturesPerMinute: 45,
    warmupInferenceCount: 2,
    reupgradeDwellMs: 15000,
    sessionDisposalGraceMs: 15000,
    initialRegionBudget: 12
};
//# sourceMappingURL=resource-governance.js.map