/**
 * @privapilot/protocol - SceneGraph Schema & Contracts
 *
 * Unified representation of page perception produced by fusing the parallel
 * DOM lane and on-device Vision lane.
 *
 * Privacy Invariants:
 * 1. `ref` is strictly opaque (e.g. "el_17") — the ONLY element identifier that may cross the network boundary.
 * 2. `labelHint` is strictly PII-screened before admission.
 * 3. `conflicts` is CLIENT-INTERNAL ONLY. It is retained for audit and ablation diagnostics,
 *    and NEVER serialized into network wire payloads.
 */
export {};
//# sourceMappingURL=scene-graph.js.map