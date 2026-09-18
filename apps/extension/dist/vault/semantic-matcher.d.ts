/**
 * @privapilot/extension - Semantic Form Field Classifier & Vault Matcher
 *
 * Resolves heterogeneous form field labels, placeholders, and attributes
 * (e.g. "contact" vs "phone", "org" vs "college") to canonical identity slots
 * without brittle hardcoded string matching.
 */
import { UserProfileData, SiteCredential } from './vault-store.js';
export type CanonicalFieldKey = 'phone' | 'email' | 'fullName' | 'firstName' | 'lastName' | 'organization' | 'address' | 'city' | 'state' | 'postalCode' | 'country' | 'dateOfBirth' | 'gender' | 'githubUrl' | 'username' | 'password';
export interface FormElementDescriptor {
    readonly id?: string;
    readonly tagName?: string;
    readonly type?: string;
    readonly name?: string;
    readonly placeholder?: string;
    readonly ariaLabel?: string;
    readonly associatedLabelText?: string;
    readonly autocomplete?: string;
    readonly rawName?: string;
    readonly sanitizedName?: string;
}
export interface FieldMatchResult {
    readonly matched: boolean;
    readonly canonicalField?: CanonicalFieldKey;
    readonly valueToFill?: string;
    readonly confidence: number;
    readonly isCredential: boolean;
    readonly reason: string;
    readonly promptIfMissing?: string;
}
/**
 * Evaluates whether an input element descriptor matches any known semantic synonym.
 */
export declare function classifyFieldDescriptor(descriptor: FormElementDescriptor): {
    canonical: CanonicalFieldKey;
    confidence: number;
    reason: string;
} | null;
/**
 * Matches a form element against the local Personal Vault and site credentials.
 * Strict zero-PII leak: Only returns values from the local store; nothing is transmitted.
 */
export declare function matchFieldToVault(descriptor: FormElementDescriptor, profile: UserProfileData, siteCredentials?: SiteCredential[], _targetDomain?: string, allowDemoFallback?: boolean): FieldMatchResult;
//# sourceMappingURL=semantic-matcher.d.ts.map