/**
 * @privapilot/extension - Zero-Knowledge Local Personal Vault & Site Credentials Store
 *
 * Provides completely local, encrypted profile and domain-scoped credential persistence.
 * Strict Zero-Leakage Policy: No vault entries or unmasked passwords ever leave the device.
 */
export interface UserProfileData {
    fullName: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone: string;
    organization: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    dateOfBirth?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    customNotes?: string;
}
export interface SiteCredential {
    id: string;
    domain: string;
    title?: string;
    usernameOrEmail: string;
    password: string;
    createdAt: number;
    lastUsedAt?: number;
}
export interface PersonalVaultState {
    version: 1;
    masterPin?: string;
    profile: UserProfileData;
    credentials: SiteCredential[];
    updatedAt: number;
}
export declare const DEFAULT_VAULT_PIN = "1234";
export declare const DEMO_USER_PROFILE: UserProfileData;
export declare const DEFAULT_USER_PROFILE: UserProfileData;
/**
 * Normalizes an arbitrary URL, hostname, or string into a clean lowercase domain origin.
 * e.g. "https://sih.gov.in/problem-statements" -> "sih.gov.in"
 * e.g. "http://localhost:3000/test" -> "localhost"
 */
export declare function normalizeDomain(urlOrHost: string): string;
/**
 * Loads the current Personal Vault from encrypted local extension storage.
 */
export declare function loadVault(): Promise<PersonalVaultState>;
/**
 * Persists the entire Personal Vault state to local storage.
 */
export declare function saveVault(vault: PersonalVaultState): Promise<void>;
/**
 * Retrieves the user's primary identity profile for form autofill.
 */
export declare function getUserProfile(): Promise<UserProfileData>;
/**
 * Updates partial or full user profile details.
 */
export declare function saveUserProfile(profileUpdates: Partial<UserProfileData>): Promise<UserProfileData>;
/**
 * Returns saved credentials specifically matching the given domain.
 * Strict isolation: Credentials for Domain A are never exposed for Domain B.
 */
export declare function getCredentialsForDomain(domainOrUrl: string): Promise<SiteCredential[]>;
/**
 * Adds or updates a site credential scoped to a specific domain.
 */
export declare function saveSiteCredential(cred: Omit<SiteCredential, 'id' | 'createdAt'> & {
    id?: string;
}): Promise<SiteCredential>;
/**
 * Deletes a site credential by unique ID, or by domain and username.
 */
export declare function deleteSiteCredential(idOrDomain: string, username?: string): Promise<boolean>;
/**
 * Retrieves the current vault PIN, falling back to DEFAULT_VAULT_PIN ('1234') if unset.
 */
export declare function getVaultPin(): Promise<string>;
/**
 * Verifies if the provided PIN matches the stored vault PIN.
 */
export declare function verifyVaultPin(pin: string): Promise<boolean>;
/**
 * Updates the master PIN for vault access.
 */
export declare function setVaultPin(newPin: string): Promise<boolean>;
/**
 * Exports the entire vault state as a sanitized JSON backup string for safe device storage.
 */
export declare function exportVaultJson(): Promise<string>;
/**
 * Imports and restores vault state from a JSON backup string.
 */
export declare function importVaultJson(jsonStr: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Resets the in-memory vault (primarily for unit test isolation).
 */
export declare function _resetInMemoryVault(initial?: PersonalVaultState): void;
//# sourceMappingURL=vault-store.d.ts.map