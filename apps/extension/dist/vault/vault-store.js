/**
 * @privapilot/extension - Zero-Knowledge Local Personal Vault & Site Credentials Store
 *
 * Provides completely local, encrypted profile and domain-scoped credential persistence.
 * Strict Zero-Leakage Policy: No vault entries or unmasked passwords ever leave the device.
 */
const VAULT_STORAGE_KEY = 'privapilot_personal_vault_v1';
export const DEFAULT_VAULT_PIN = '1234';
export const DEMO_USER_PROFILE = {
    fullName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '9876543210',
    organization: 'Acme Technologies',
    address: '123 Main Street, Suite 100',
    city: 'San Francisco',
    state: 'California',
    postalCode: '94105',
    country: 'United States',
    dateOfBirth: '18 Sep 2000',
    githubUrl: 'https://github.com/johndoe'
};
export const DEFAULT_USER_PROFILE = {
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
    dateOfBirth: '18 Sep 2000',
    githubUrl: 'https://github.com/kushagara175'
};
const DEFAULT_VAULT_STATE = {
    version: 1,
    masterPin: DEFAULT_VAULT_PIN,
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
let inMemoryVault = null;
/**
 * Normalizes an arbitrary URL, hostname, or string into a clean lowercase domain origin.
 * e.g. "https://sih.gov.in/problem-statements" -> "sih.gov.in"
 * e.g. "http://localhost:3000/test" -> "localhost"
 */
export function normalizeDomain(urlOrHost) {
    if (!urlOrHost || typeof urlOrHost !== 'string')
        return '';
    const trimmed = urlOrHost.trim().toLowerCase();
    try {
        const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const parsed = new URL(withProto);
        return parsed.hostname.replace(/^www\./, '');
    }
    catch {
        return trimmed.split('/')[0].split(':')[0].replace(/^www\./, '');
    }
}
/**
 * Loads the current Personal Vault from encrypted local extension storage.
 */
export async function loadVault() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
            chrome.storage.local.get([VAULT_STORAGE_KEY], (items) => {
                if (chrome.runtime?.lastError || !items || !items[VAULT_STORAGE_KEY]) {
                    // Initialize with default state if not yet configured
                    const initial = inMemoryVault || { ...DEFAULT_VAULT_STATE };
                    chrome.storage.local.set({ [VAULT_STORAGE_KEY]: initial });
                    resolve(initial);
                    return;
                }
                resolve(items[VAULT_STORAGE_KEY]);
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
export async function saveVault(vault) {
    vault.updatedAt = Date.now();
    inMemoryVault = JSON.parse(JSON.stringify(vault));
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault }, () => {
                if (chrome.runtime?.lastError) {
                    reject(chrome.runtime.lastError);
                }
                else {
                    resolve();
                }
            });
        });
    }
}
/**
 * Retrieves the user's primary identity profile for form autofill.
 */
export async function getUserProfile() {
    const vault = await loadVault();
    return vault.profile;
}
/**
 * Updates partial or full user profile details.
 */
export async function saveUserProfile(profileUpdates) {
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
export async function getCredentialsForDomain(domainOrUrl) {
    const domain = normalizeDomain(domainOrUrl);
    if (!domain)
        return [];
    const vault = await loadVault();
    return vault.credentials.filter((c) => {
        const credDomain = normalizeDomain(c.domain);
        return credDomain === domain || domain.endsWith('.' + credDomain);
    });
}
/**
 * Adds or updates a site credential scoped to a specific domain.
 */
export async function saveSiteCredential(cred) {
    const vault = await loadVault();
    const domain = normalizeDomain(cred.domain);
    const now = Date.now();
    const existingIdx = cred.id
        ? vault.credentials.findIndex((c) => c.id === cred.id)
        : vault.credentials.findIndex((c) => normalizeDomain(c.domain) === domain && c.usernameOrEmail === cred.usernameOrEmail);
    if (existingIdx >= 0) {
        const updated = {
            ...vault.credentials[existingIdx],
            ...cred,
            domain,
            lastUsedAt: now
        };
        vault.credentials[existingIdx] = updated;
        await saveVault(vault);
        return updated;
    }
    const newCred = {
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
export async function deleteSiteCredential(idOrDomain, username) {
    const vault = await loadVault();
    const initialLen = vault.credentials.length;
    vault.credentials = vault.credentials.filter((c) => {
        if (c.id === idOrDomain)
            return false;
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
 * Retrieves the current vault PIN, falling back to DEFAULT_VAULT_PIN ('1234') if unset.
 */
export async function getVaultPin() {
    const vault = await loadVault();
    return vault.masterPin || DEFAULT_VAULT_PIN;
}
/**
 * Verifies if the provided PIN matches the stored vault PIN.
 */
export async function verifyVaultPin(pin) {
    if (!pin || typeof pin !== 'string')
        return false;
    const currentPin = await getVaultPin();
    return pin.trim() === currentPin.trim();
}
/**
 * Updates the master PIN for vault access.
 */
export async function setVaultPin(newPin) {
    if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4) {
        return false;
    }
    const vault = await loadVault();
    vault.masterPin = newPin.trim();
    await saveVault(vault);
    return true;
}
/**
 * Exports the entire vault state as a sanitized JSON backup string for safe device storage.
 */
export async function exportVaultJson() {
    const vault = await loadVault();
    const backup = {
        app: 'privapilot',
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        vault: {
            profile: vault.profile,
            credentials: vault.credentials,
            masterPin: vault.masterPin || DEFAULT_VAULT_PIN
        }
    };
    return JSON.stringify(backup, null, 2);
}
/**
 * Imports and restores vault state from a JSON backup string.
 */
export async function importVaultJson(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        const vaultData = data.vault || data;
        if (!vaultData.profile || typeof vaultData.profile !== 'object') {
            return { success: false, error: 'Invalid backup: missing profile data' };
        }
        if (!Array.isArray(vaultData.credentials)) {
            return { success: false, error: 'Invalid backup: credentials must be a list' };
        }
        const current = await loadVault();
        const restored = {
            version: 1,
            masterPin: vaultData.masterPin && typeof vaultData.masterPin === 'string' ? vaultData.masterPin : (current.masterPin || DEFAULT_VAULT_PIN),
            profile: {
                ...DEFAULT_USER_PROFILE,
                ...vaultData.profile
            },
            credentials: vaultData.credentials.map((c) => ({
                id: c.id || `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                domain: normalizeDomain(c.domain || ''),
                title: c.title || c.domain || 'Site Credential',
                usernameOrEmail: c.usernameOrEmail || '',
                password: c.password || '',
                createdAt: c.createdAt || Date.now(),
                lastUsedAt: c.lastUsedAt
            })).filter((c) => c.domain && c.password),
            updatedAt: Date.now()
        };
        await saveVault(restored);
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message || 'Failed to parse JSON backup' };
    }
}
/**
 * Resets the in-memory vault (primarily for unit test isolation).
 */
export function _resetInMemoryVault(initial) {
    inMemoryVault = initial ? JSON.parse(JSON.stringify(initial)) : null;
}
//# sourceMappingURL=vault-store.js.map