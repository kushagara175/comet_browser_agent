/**
 * @privapilot/extension - Local Decision Tier
 *
 * The problem statement conditions transmission: sanitize the visual context
 * *"**If it requires** the visual context to be sent to server."* The loop had one
 * code path and no "if" - every step transmitted, whether or not the server was
 * needed to answer it.
 *
 * This router sits ahead of the HTTP client and resolves the steps that do not need
 * a reasoning model. When it decides, nothing leaves the machine at all: not a
 * redacted screenshot, not an element list, not a goal string.
 *
 * Design constraints, in order of importance:
 *
 *  1. **Site-agnostic.** No selectors, no domains, no per-site rules. The finale
 *     pages are unknown. What is used here is generic UI vocabulary and the goal's
 *     own words.
 *  2. **Escalate when unsure.** Deciding locally is an optimisation; deciding wrongly
 *     is a bug. Every rule requires an unambiguous winner, and ambiguity escalates.
 *  3. **Never locally decide a consequential action.** No typing, no submitting, no
 *     consenting on the user's behalf, no declaring the task finished. Those are the
 *     actions where being wrong actually costs the user something.
 *
 * The router reasons over the SANITIZED context - the same view the server would
 * have received. It could legitimately read the raw DOM, since it runs on-device,
 * but keeping it to the sanitized view means a locally-decided step and a remotely-
 * decided one were made from identical information, so the comparison is honest.
 */
import { ActionProposal, SanitizedContext, ViewportMetadata } from '@privapilot/protocol';
export interface RoutingContext {
    readonly goal: string;
    readonly sanitized: SanitizedContext;
    readonly step: number;
    /** Consecutive scrolls already decided locally, to stop a scroll loop. */
    readonly consecutiveLocalScrolls: number;
    /** Client-internal layout facts. Never transmitted; used only to route. */
    readonly viewport?: ViewportMetadata;
    /**
     * Labels of controls already clicked in this run.
     *
     * Without this the router re-proposes its own obvious answer forever: the goal
     * still names the button, so the same click scores highest on every step, the page
     * has already responded to it, and the run dies on semantic verification. Having
     * made the obvious move and not finished, the router is by definition no longer
     * sure - so it escalates.
     */
    readonly alreadyActionedLabels?: ReadonlyArray<string>;
}
export type RoutingDecision = {
    readonly source: 'local';
    readonly proposal: ActionProposal;
    readonly rule: string;
} | {
    readonly source: 'remote';
    readonly escalationReason: string;
};
export declare class DecisionRouter {
    /**
     * Decides a step locally, or reports why it must be escalated.
     *
     * Returning `remote` is the safe default and the common case; a rule fires only
     * when the answer is not in doubt.
     */
    static route(ctx: RoutingContext): RoutingDecision;
}
//# sourceMappingURL=decision-router.d.ts.map