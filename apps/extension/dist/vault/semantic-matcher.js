/**
 * @privapilot/extension - Semantic Form Field Classifier & Vault Matcher
 *
 * Resolves heterogeneous form field labels, placeholders, and attributes
 * (e.g. "contact" vs "phone", "org" vs "college") to canonical identity slots
 * without brittle hardcoded string matching.
 */
import { DEMO_USER_PROFILE } from './vault-store.js';
const SYNONYM_GROUPS = [
    {
        canonical: 'password',
        aliases: ['password', 'pass', 'pwd', 'secret', 'passcode'],
        autocompletes: ['current-password', 'new-password'],
        inputTypes: ['password'],
        friendlyPrompt: 'Please enter your password for this site'
    },
    {
        canonical: 'username',
        aliases: ['username', 'user id', 'userid', 'account', 'handle', 'login id', 'sign in', 'signin id'],
        autocompletes: ['username'],
        friendlyPrompt: 'Please enter your username/email'
    },
    {
        canonical: 'phone',
        aliases: [
            'contact',
            'contact no',
            'contact number',
            'phone',
            'phone no',
            'phone number',
            'telephone',
            'mobile',
            'mobile no',
            'mobile number',
            'usernumber',
            'user number',
            'mobile (10 digits)',
            '10 digits',
            'cell',
            'whatsapp',
            'tel'
        ],
        autocompletes: ['tel', 'tel-national', 'tel-country-code'],
        inputTypes: ['tel'],
        friendlyPrompt: 'Please enter your Phone / Contact Number'
    },
    {
        canonical: 'email',
        aliases: ['email', 'e-mail', 'mail', 'email id', 'email address', 'user email', 'useremail'],
        autocompletes: ['email'],
        inputTypes: ['email'],
        friendlyPrompt: 'Please enter your Email Address'
    },
    {
        canonical: 'fullName',
        aliases: ['full name', 'your name', 'name', 'applicant name', 'candidate name', 'student name', 'candidate'],
        autocompletes: ['name'],
        friendlyPrompt: 'Please enter your Full Name'
    },
    {
        canonical: 'firstName',
        aliases: ['first name', 'firstname', 'given name', 'fname', 'first'],
        autocompletes: ['given-name'],
        friendlyPrompt: 'Please enter your First Name'
    },
    {
        canonical: 'lastName',
        aliases: ['last name', 'lastname', 'surname', 'family name', 'lname', 'last'],
        autocompletes: ['family-name'],
        friendlyPrompt: 'Please enter your Last Name'
    },
    {
        canonical: 'dateOfBirth',
        aliases: [
            'date of birth',
            'dob',
            'birth date',
            'birthday',
            'bday',
            'dateofbirth',
            'birth'
        ],
        autocompletes: ['bday', 'bday-day', 'bday-month', 'bday-year'],
        inputTypes: ['date'],
        friendlyPrompt: 'Please enter your Date of Birth'
    },
    {
        canonical: 'organization',
        aliases: [
            'organization',
            'organisation',
            'org',
            'company',
            'college',
            'college name',
            'company name',
            'institute name',
            'university name',
            'school name',
            'organization name',
            'organisation name',
            'org name',
            'institute',
            'institution',
            'university',
            'school',
            'employer'
        ],
        autocompletes: ['organization'],
        friendlyPrompt: 'Please enter your College / Organization Name'
    },
    {
        canonical: 'address',
        aliases: [
            'address',
            'street',
            'street address',
            'address line',
            'currentaddress',
            'current address',
            'permanentaddress',
            'permanent address',
            'current-address',
            'permanent-address',
            'residence'
        ],
        autocompletes: ['street-address', 'address-line1', 'address-line2'],
        friendlyPrompt: 'Please enter your Street Address'
    },
    {
        canonical: 'city',
        aliases: ['city', 'town', 'district'],
        autocompletes: ['address-level2'],
        friendlyPrompt: 'Please enter your City'
    },
    {
        canonical: 'state',
        aliases: ['state', 'province', 'region'],
        autocompletes: ['address-level1'],
        friendlyPrompt: 'Please enter your State'
    },
    {
        canonical: 'postalCode',
        aliases: ['pin', 'pincode', 'pin code', 'postal', 'postal code', 'zip', 'zipcode', 'zip code'],
        autocompletes: ['postal-code'],
        friendlyPrompt: 'Please enter your ZIP / PIN Code'
    },
    {
        canonical: 'country',
        aliases: ['country', 'nation'],
        autocompletes: ['country', 'country-name'],
        friendlyPrompt: 'Please enter your Country'
    },
    {
        canonical: 'gender',
        aliases: ['gender', 'sex', 'male', 'female', 'gender-radio'],
        autocompletes: ['sex'],
        friendlyPrompt: 'Please select your Gender'
    },
    {
        canonical: 'githubUrl',
        aliases: ['github', 'github url', 'git', 'repo', 'portfolio', 'project url'],
        autocompletes: ['url'],
        friendlyPrompt: 'Please enter your GitHub / Portfolio URL'
    }
];
/**
 * Normalizes text tokens by splitting camelCase, stripping punctuation, and leading/trailing whitespace.
 */
function cleanTokens(raw) {
    return raw
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[_\-:\*\(\)\[\]\/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Evaluates whether an input element descriptor matches any known semantic synonym.
 */
export function classifyFieldDescriptor(descriptor) {
    const typeAttr = (descriptor.type || '').toLowerCase().trim();
    const autocomplete = (descriptor.autocomplete || '').toLowerCase().trim();
    // Combine descriptive textual attributes into search space
    const textCorpus = [
        descriptor.associatedLabelText || '',
        descriptor.placeholder || '',
        descriptor.ariaLabel || '',
        descriptor.name || '',
        descriptor.id || '',
        descriptor.rawName || '',
        descriptor.sanitizedName || ''
    ]
        .map(cleanTokens)
        .filter(Boolean)
        .join(' ');
    let bestMatch = null;
    for (const group of SYNONYM_GROUPS) {
        let score = 0;
        const reasons = [];
        // 1. HTML5 input type match
        if (group.inputTypes && group.inputTypes.includes(typeAttr)) {
            score += 0.45;
            reasons.push(`type="${typeAttr}"`);
        }
        // 2. HTML5 autocomplete attribute match
        if (autocomplete && group.autocompletes.some(ac => autocomplete.includes(ac))) {
            score += 0.50;
            reasons.push(`autocomplete="${autocomplete}"`);
        }
        // 3. Exact alias match in text corpus
        for (const alias of group.aliases) {
            const aliasClean = cleanTokens(alias);
            const regex = new RegExp(`\\b${aliasClean.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (regex.test(textCorpus)) {
                // Exclude generic 'name' in fullName if textCorpus contains organization/company/college tokens
                if (group.canonical === 'fullName' && aliasClean === 'name') {
                    if (/\b(college|company|organization|organisation|university|institute|institution|school|employer|domain|host|file|folder)\b/i.test(textCorpus)) {
                        continue;
                    }
                }
                // Boost for associated label text or placeholder match
                const isLabelMatch = Boolean(descriptor.associatedLabelText && regex.test(cleanTokens(descriptor.associatedLabelText)));
                const isPlaceholderMatch = Boolean(descriptor.placeholder && regex.test(cleanTokens(descriptor.placeholder)));
                const isNameOrIdMatch = Boolean((descriptor.name && regex.test(cleanTokens(descriptor.name))) || (descriptor.id && regex.test(cleanTokens(descriptor.id))));
                // Longer alias matches are more specific than short single words
                const specificity = Math.min(0.15, aliasClean.length * 0.015);
                const baseBoost = isLabelMatch ? 0.60 : isPlaceholderMatch ? 0.55 : isNameOrIdMatch ? 0.50 : 0.40;
                score += baseBoost + specificity;
                reasons.push(`matches alias "${alias}"`);
                break;
            }
        }
        // Cap confidence at 1.0
        const finalScore = Math.min(1.0, score);
        if (finalScore >= 0.4 && (!bestMatch || finalScore > bestMatch.confidence)) {
            bestMatch = {
                canonical: group.canonical,
                confidence: Number(finalScore.toFixed(2)),
                reason: reasons.join(', ')
            };
        }
    }
    return bestMatch;
}
/**
 * Matches a form element against the local Personal Vault and site credentials.
 * Strict zero-PII leak: Only returns values from the local store; nothing is transmitted.
 */
export function matchFieldToVault(descriptor, profile, siteCredentials = [], _targetDomain = '', allowDemoFallback = false) {
    const classification = classifyFieldDescriptor(descriptor);
    if (!classification) {
        return {
            matched: false,
            confidence: 0,
            isCredential: false,
            reason: 'No semantic field match found'
        };
    }
    const { canonical, confidence, reason } = classification;
    const group = SYNONYM_GROUPS.find(g => g.canonical === canonical);
    const promptIfMissing = group?.friendlyPrompt || 'Please enter the required information';
    // A. Site Credential handling (Password / Username)
    if (canonical === 'password') {
        const cred = siteCredentials[0];
        if (cred && cred.password) {
            return {
                matched: true,
                canonicalField: 'password',
                valueToFill: cred.password,
                confidence: Math.max(confidence, 0.95),
                isCredential: true,
                reason: `Matched site password for domain (${reason})`,
                promptIfMissing
            };
        }
        return {
            matched: false,
            canonicalField: 'password',
            confidence,
            isCredential: true,
            reason: `Password field detected but no saved credential exists for this domain`,
            promptIfMissing
        };
    }
    if (canonical === 'username') {
        const cred = siteCredentials[0];
        const usernameVal = cred?.usernameOrEmail || profile.email || profile.fullName;
        if (usernameVal) {
            return {
                matched: true,
                canonicalField: 'username',
                valueToFill: usernameVal,
                confidence: Math.max(confidence, 0.90),
                isCredential: true,
                reason: `Matched username/login from domain credentials (${reason})`,
                promptIfMissing
            };
        }
        return {
            matched: false,
            canonicalField: 'username',
            confidence,
            isCredential: true,
            reason: `Login field detected but username is not configured`,
            promptIfMissing
        };
    }
    // B. Personal Profile mapping
    const profileKeyMap = {
        phone: 'phone',
        email: 'email',
        fullName: 'fullName',
        firstName: 'firstName',
        lastName: 'lastName',
        organization: 'organization',
        address: 'address',
        city: 'city',
        state: 'state',
        postalCode: 'postalCode',
        country: 'country',
        dateOfBirth: 'dateOfBirth',
        gender: 'gender',
        githubUrl: 'githubUrl',
        username: undefined,
        password: undefined
    };
    const profileKey = profileKeyMap[canonical];
    const profileValue = profileKey ? profile[profileKey] : undefined;
    if (profileValue && String(profileValue).trim().length > 0) {
        return {
            matched: true,
            canonicalField: canonical,
            valueToFill: String(profileValue).trim(),
            confidence: Math.max(confidence, 0.88),
            isCredential: false,
            reason: `Matched "${canonical}" to user profile (${reason})`,
            promptIfMissing
        };
    }
    // Fallback: If full name exists but firstName / lastName was requested
    if (canonical === 'firstName' && profile.fullName) {
        const firstName = profile.fullName.trim().split(/\s+/)[0];
        if (firstName) {
            return {
                matched: true,
                canonicalField: 'firstName',
                valueToFill: firstName,
                confidence: Math.max(confidence, 0.85),
                isCredential: false,
                reason: `Derived firstName from profile fullName (${reason})`,
                promptIfMissing
            };
        }
    }
    // C. Demo Persona Fallback
    if (allowDemoFallback && profileKey && DEMO_USER_PROFILE[profileKey]) {
        const demoVal = String(DEMO_USER_PROFILE[profileKey]).trim();
        if (demoVal.length > 0) {
            return {
                matched: true,
                canonicalField: canonical,
                valueToFill: demoVal,
                confidence: Math.max(confidence, 0.85),
                isCredential: false,
                reason: `Populated "${canonical}" with synthetic demo persona (${reason})`,
                promptIfMissing
            };
        }
    }
    return {
        matched: false,
        canonicalField: canonical,
        confidence,
        isCredential: false,
        reason: `Field classified as "${canonical}" (${reason}), but value is missing from profile`,
        promptIfMissing
    };
}
//# sourceMappingURL=semantic-matcher.js.map