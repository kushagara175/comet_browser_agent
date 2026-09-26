/**
 * @privapilot/protocol - Master Web & Indian Government Portals Directory
 *
 * Exhaustive verified catalog of 1,000+ reference portals and 120+ official Indian
 * Government websites (.gov.in / .nic.in). Enables instant zero-hallucination URL
 * resolution and anti-phishing navigation for the autonomous browser agent.
 */
export interface DirectoryPortal {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly category: PortalCategory;
    readonly keywords: ReadonlyArray<string>;
    readonly description: string;
    readonly isGovernmentIndia?: boolean;
}
export type PortalCategory = 'space_and_science' | 'education_and_hackathons' | 'citizen_services_and_identity' | 'finance_tax_and_corporate' | 'transport_and_railways' | 'passports_and_external_affairs' | 'health_and_welfare' | 'law_justice_and_consumer' | 'agriculture_and_rural' | 'state_governance' | 'knowledge_and_research' | 'developer_and_tech' | 'travel_and_hospitality' | 'ecommerce_and_retail' | 'productivity_and_cloud' | 'finance_and_investing';
/**
 * 120+ Verified Official Indian Government Portals (.gov.in / .nic.in / .co.in)
 */
export declare const INDIAN_GOVERNMENT_PORTALS: ReadonlyArray<DirectoryPortal>;
/**
 * Top Global Knowledge, Tech, Developer, and Everyday Reference Portals
 */
export declare const GLOBAL_REFERENCE_PORTALS: ReadonlyArray<DirectoryPortal>;
/**
 * Unified Master Directory Catalog combining all portals
 */
export declare const MASTER_WEB_DIRECTORY: ReadonlyArray<DirectoryPortal>;
/**
 * High-speed semantic & keyword resolver that matches a user query/prompt
 * to the most authoritative, authentic web portal URL.
 *
 * @param query The user's input phrase (e.g. "search problem statements on SIH" or "check weather on mosdac")
 * @returns Canonical verified URL if matched, or undefined.
 */
export declare function resolvePortalFromQuery(query: string): string | undefined;
//# sourceMappingURL=web-directory.d.ts.map