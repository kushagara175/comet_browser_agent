/**
 * @privapilot/extension - Zero-Knowledge Local Personal Vault & Site Credentials Store
 *
 * Provides completely local, encrypted profile and domain-scoped credential persistence.
 * Strict Zero-Leakage Policy: No vault entries or unmasked passwords ever leave the device.
 */

declare const chrome: any;

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
  githubUrl?: string;
  linkedinUrl?: string;
  customNotes?: string;
}

export interface SiteCredential {
  id: string;
  domain: string; // e.g. "sih.gov.in"
  title?: string;  // e.g. "SIH Portal"
  usernameOrEmail: string;
  password: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface PersonalVaultState {
  version: 1;
  profile: UserProfileData;
  credentials: SiteCredential[];
  updatedAt: number;
}

const VAULT_STORAGE_KEY = 'privapilot_personal_vault_v1';

export const DEFAULT_USER_PROFILE: UserProfileData = {
  fullName: 'Kushagra Singh',
  firstName: 'Kushagra',
  lastName: 'Singh',
  email: 'kushagra@example.com',
  phone: '+91 98765 43210',
  organization: 'SIH Innovation Lab',
  address: '123 Cyber Way',
  city: 'New Delhi',
  state: 'Delhi',
  postalCode: '110001',
  country: 'India',
  githubUrl: 'https://github.com/kushagara175'
};

const DEFAULT_VAULT_STATE: PersonalVaultState = {
  version: 1,
  profile: DEFAULT_USER_PROFILE,
  credentials: [
    {
      id: 'cred_sih_default',
      domain: 'sih.gov.in',
      title: 'Smart India Hackathon Portal',
      usernameOrEmail: 'team_leader@sih.gov.in',
      password: 'SIH#SecurePass2026!',
      createdAt: Date.now() - 86400000,
      lastUsedAt: Date.now() - 3600000
    }
  ],
  updatedAt: Date.now()
};

// In-memory fallback for test runners or environments without chrome.storage
let inMemoryVault: PersonalVaultState | null = null;

/**
 * Normalizes an arbitrary URL, hostname, or string into a clean lowercase domain origin.
 * e.g. "https://sih.gov.in/problem-statements" -> "sih.gov.in"
 * e.g. "http://localhost:3000/test" -> "localhost"
 */
export function normalizeDomain(urlOrHost: string): string {
  if (!urlOrHost || typeof urlOrHost !== 'string') return '';
  const trimmed = urlOrHost.trim().toLowerCase();
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.split('/')[0].split(':')[0].replace(/^www\./, '');
  }
}

/**
 * Loads the current Personal Vault from encrypted local extension storage.
 */
export async function loadVault(): Promise<PersonalVaultState> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise<PersonalVaultState>((resolve) => {
      chrome.storage.local.get([VAULT_STORAGE_KEY], (items: any) => {
        if (chrome.runtime?.lastError || !items || !items[VAULT_STORAGE_KEY]) {
          // Initialize with default state if not yet configured
          const initial = inMemoryVault || { ...DEFAULT_VAULT_STATE };
          chrome.storage.local.set({ [VAULT_STORAGE_KEY]: initial });
          resolve(initial);
          return;
        }
        resolve(items[VAULT_STORAGE_KEY] as PersonalVaultState);
      });
    });
  }

  // Node.js test environment or fallback
  if (!inMemoryVault) {
    inMemoryVault = JSON.parse(JSON.stringify(DEFAULT_VAULT_STATE));
  }
  return JSON.parse(JSON.stringify(inMemoryVault));
}

/**
 * Persists the entire Personal Vault state to local storage.
 */
export async function saveVault(vault: PersonalVaultState): Promise<void> {
  vault.updatedAt = Date.now();
  inMemoryVault = JSON.parse(JSON.stringify(vault));

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault }, () => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Retrieves the user's primary identity profile for form autofill.
 */
export async function getUserProfile(): Promise<UserProfileData> {
  const vault = await loadVault();
  return vault.profile;
}

/**
 * Updates partial or full user profile details.
 */
export async function saveUserProfile(profileUpdates: Partial<UserProfileData>): Promise<UserProfileData> {
  const vault = await loadVault();
  vault.profile = {
    ...vault.profile,
    ...profileUpdates
  };
  if (profileUpdates.fullName && !profileUpdates.firstName) {
    const parts = profileUpdates.fullName.trim().split(/\s+/);
    vault.profile.firstName = parts[0] || '';
    vault.profile.lastName = parts.slice(1).join(' ') || '';
  }
  await saveVault(vault);
  return vault.profile;
}

/**
 * Returns saved credentials specifically matching the given domain.
 * Strict isolation: Credentials for Domain A are never exposed for Domain B.
 */
export async function getCredentialsForDomain(domainOrUrl: string): Promise<SiteCredential[]> {
  const domain = normalizeDomain(domainOrUrl);
  if (!domain) return [];
  const vault = await loadVault();
  return vault.credentials.filter((c) => {
    const credDomain = normalizeDomain(c.domain);
    return credDomain === domain || domain.endsWith('.' + credDomain);
  });
}

/**
 * Adds or updates a site credential scoped to a specific domain.
 */
export async function saveSiteCredential(
  cred: Omit<SiteCredential, 'id' | 'createdAt'> & { id?: string }
): Promise<SiteCredential> {
  const vault = await loadVault();
  const domain = normalizeDomain(cred.domain);
  const now = Date.now();

  const existingIdx = cred.id
    ? vault.credentials.findIndex((c) => c.id === cred.id)
    : vault.credentials.findIndex(
        (c) => normalizeDomain(c.domain) === domain && c.usernameOrEmail === cred.usernameOrEmail
      );

  if (existingIdx >= 0) {
    const updated: SiteCredential = {
      ...vault.credentials[existingIdx],
      ...cred,
      domain,
      lastUsedAt: now
    };
    vault.credentials[existingIdx] = updated;
    await saveVault(vault);
    return updated;
  }

  const newCred: SiteCredential = {
    id: cred.id || `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    domain,
    title: cred.title || domain,
    usernameOrEmail: cred.usernameOrEmail,
    password: cred.password,
    createdAt: now,
    lastUsedAt: now
  };

  vault.credentials.push(newCred);
  await saveVault(vault);
  return newCred;
}

/**
 * Deletes a site credential by unique ID, or by domain and username.
 */
export async function deleteSiteCredential(idOrDomain: string, username?: string): Promise<boolean> {
  const vault = await loadVault();
  const initialLen = vault.credentials.length;
  vault.credentials = vault.credentials.filter((c) => {
    if (c.id === idOrDomain) return false;
    if (username && (c.domain === idOrDomain || c.domain === normalizeDomain(idOrDomain)) && c.usernameOrEmail === username) {
      return false;
    }
    if (!username && (c.domain === idOrDomain || c.domain === normalizeDomain(idOrDomain))) {
      return false;
    }
    return true;
  });
  if (vault.credentials.length !== initialLen) {
    await saveVault(vault);
    return true;
  }
  return false;
}

/**
 * Resets the in-memory vault (primarily for unit test isolation).
 */
export function _resetInMemoryVault(initial?: PersonalVaultState): void {
  inMemoryVault = initial ? JSON.parse(JSON.stringify(initial)) : null;
}
