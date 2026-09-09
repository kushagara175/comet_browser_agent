/**
 * @privapilot/protocol - Domain Playbooks (Site-Specific Agent Knowledge)
 *
 * Implements deterministic domain playbooks and site knowledge inspired by
 * browser-harness domain-skills, providing instant route and target grounding
 * for specific portals without requiring DOM trial-and-error.
 */
export interface PlaybookRoute {
    readonly name: string;
    readonly path: string;
    readonly aliases?: ReadonlyArray<string>;
    readonly description: string;
    readonly matchKeywords: ReadonlyArray<string>;
}
export interface PlaybookLandmark {
    readonly id: string;
    readonly phrase: string;
    readonly aliases: ReadonlyArray<string>;
    readonly role?: 'button' | 'link' | 'input' | 'select' | 'tab';
    readonly description: string;
    readonly intentAction: 'click' | 'type' | 'select' | 'navigate';
}
export interface PlaybookMetricRule {
    readonly metricId: string;
    readonly labelKeywords: ReadonlyArray<string>;
    readonly containerHints: ReadonlyArray<string>;
    readonly valuePattern: string;
    readonly description: string;
}
export interface DomainPlaybook {
    readonly domain: string;
    readonly name: string;
    readonly aliases: ReadonlyArray<string>;
    readonly routes: ReadonlyArray<PlaybookRoute>;
    readonly landmarks: ReadonlyArray<PlaybookLandmark>;
    readonly metricsRules: ReadonlyArray<PlaybookMetricRule>;
    readonly formFieldHints?: Record<string, ReadonlyArray<string>>;
}
export interface PlaybookResolution {
    readonly playbookName: string;
    readonly matchedIntent: 'navigate' | 'click_landmark' | 'fill_field' | 'extract_metric' | 'none';
    readonly confidence: number;
    readonly targetPhrase?: string;
    readonly targetUrl?: string;
    readonly targetRole?: string;
    readonly metricRule?: PlaybookMetricRule;
    readonly rationale: string;
}
/**
 * Built-in playbook for Smart India Hackathon (sih.gov.in) portal.
 * Maps known navigation paths, key landmarks, search inputs, and submission metrics.
 */
export declare const SIH_PLAYBOOK: DomainPlaybook;
/**
 * Registry of known domain playbooks.
 */
export declare const REGISTERED_PLAYBOOKS: ReadonlyArray<DomainPlaybook>;
/**
 * Normalizes host/URL to identify matching domain playbook.
 */
export declare function lookupDomainPlaybook(urlOrHostname: string): DomainPlaybook | undefined;
/**
 * Checks if a given URL matches a playbook route, including any path aliases and domain-specific conventions.
 */
export declare function isUrlMatchingRoute(url: string | undefined, route: PlaybookRoute): boolean;
/**
 * Resolves user query intent against a domain playbook to provide deterministic navigation,
 * target grounding, or metric extraction recommendations.
 */
export declare function resolvePlaybookIntent(playbook: DomainPlaybook, userQuery: string, currentUrl?: string): PlaybookResolution;
/**
 * Attempts to extract a metric value from text using a playbook metric rule.
 */
export declare function extractMetricsWithPlaybook(textContext: string, metricRule: PlaybookMetricRule): {
    value: string;
    label: string;
} | undefined;
/**
 * Cleanly extracts search target text from a search directive.
 * E.g. "search for PS 171" -> "PS 171"
 *      "search Chinmaya in search box" -> "Chinmaya"
 */
export declare function extractSearchQueryFromGoal(goal: string): string;
//# sourceMappingURL=domain-playbooks.d.ts.map