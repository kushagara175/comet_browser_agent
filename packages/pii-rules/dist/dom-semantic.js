/**
 * @privapilot/pii-rules - DOM Semantic Analyzer
 *
 * Only editable fields can be classified by their form semantics. Navigation and
 * ordinary search controls stay actionable; validated PII in live values still wins.
 */
import { SENSITIVE_FIELD_KEYWORDS, SENSITIVE_AUTOCOMPLETE_VALUES } from './keywords.js';
import { scanTextForPII } from './regex-patterns.js';
const SAFE = { isSensitive: false, confidence: 1 };
const SEARCH_TERMS = /(?:^|[^a-z0-9])(?:search|filter|find|query|institute|college|topic|keyword)(?:$|[^a-z0-9])/i;
const COMPACT_IDENTIFIERS = [
    [/^(?:cardnumber|creditcardnumber|debitcardnumber|ccnumber|ccnum)\d*$/i, 'credit_card'],
    [/^(?:accountnumber|bankaccountnumber|bankaccount)\d*$/i, 'bank_account'],
    [/^(?:phonenumber|mobilenumber|contactnumber)\d*$/i, 'phone'],
    [/^(?:dateofbirth|birthdate|dob)\d*$/i, 'date_of_birth'],
    [/^(?:username|loginid|userid)\d*$/i, 'username'],
    [/^(?:fullname|firstname|lastname|applicantname|candidatename|studentname|name|txtname|custname)\d*$/i, 'name'],
    [/^(?:apikey|authkey|accesskey|accesstoken|secretkey)\d*$/i, 'token'],
    [/^(?:ssn|aadhaar(?:number)?|aadhar(?:number)?|pannumber|socialsecuritynumber)\d*$/i, 'national_id']
];
const SENSITIVE_LABELS = [
    [/\b(?:password|passcode|passwd|pwd|current password|new password)\b/i, 'password'],
    [/\b(?:one time (?:code|password)|otp|2fa|mfa|verification code|auth(?:entication)? code)\b/i, 'auth_code'],
    [/\b(?:cvv|cvc|card security code|security code)\b/i, 'cvv'],
    [/\b(?:credit card|debit card|card number|card no|cc num|payment card)\b/i, 'credit_card'],
    [/\b(?:aadhaar|aadhar|ssn|social security(?: number)?|pan (?:number|no)|permanent account number|national id)\b/i, 'national_id'],
    [/\b(?:bank account|account number|account no|iban|ifsc|routing number)\b/i, 'bank_account'],
    [/\b(?:diagnosis|prescription|patient (?:notes?|record)|medical (?:notes?|history|record)|health (?:diagnosis|record)|clinical (?:notes?|diagnosis)|doctor (?:notes?|diagnosis))\b/i, 'uninspectable'],
    [/\b(?:date of birth|birth date|birthday|dob|bday)\b/i, 'date_of_birth'],
    [/\b(?:email|e mail|email address)\b/i, 'email'],
    [/\b(?:phone (?:number|no)|mobile (?:number|no)|telephone number|contact number|cellphone)\b/i, 'phone'],
    [/\b(?:street address|postal address|home address|permanent address|current address|pin code|pincode|postal code|zipcode)\b/i, 'address'],
    [/\b(?:username|user name|user id|login id|login name|user handle)\b/i, 'username'],
    [/\b(?:(?:full|first|last|middle|applicant|candidate|student|user|your|person)\s*name|(?:enter|type|input|provide)\s*(?:your\s*)?name|^name\b|name\s*(?::|$))\b/i, 'name'],
    [/\b(?:api key|auth key|access token|secret key|secret canary|canary)\b/i, 'token']
];
function decision(category, reason) {
    return { isSensitive: true, category, reason, confidence: 0.95 };
}
/** Evaluates the semantics of an editable field without classifying navigation labels. */
export function analyzeDomElementSensitivity(desc) {
    const tag = desc.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea')
        return SAFE;
    const type = (desc.type || '').trim().toLowerCase();
    if (tag === 'input' && ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'].includes(type))
        return SAFE;
    // Explicit form semantics outrank public-search hints (including misleading names).
    if (type === 'password')
        return decision('password', 'input[type="password"]');
    if (type === 'email')
        return decision('email', 'input[type="email"]');
    if (type === 'tel')
        return decision('phone', 'input[type="tel"]');
    const autocompleteTokens = (desc.autocomplete || '').toLowerCase().split(/\s+/);
    for (const token of autocompleteTokens) {
        if (!SENSITIVE_AUTOCOMPLETE_VALUES.includes(token))
            continue;
        let category = 'password';
        if (token === 'cc-csc')
            category = 'cvv';
        else if (token.startsWith('cc-'))
            category = 'credit_card';
        else if (token.startsWith('bday'))
            category = 'date_of_birth';
        else if (token === 'one-time-code')
            category = 'auth_code';
        else if (token.startsWith('tel'))
            category = 'phone';
        else if (token === 'email')
            category = 'email';
        else if (token.includes('address') || token === 'postal-code')
            category = 'address';
        else if (token === 'username')
            category = 'username';
        else if (token.includes('name'))
            category = 'name';
        return decision(category, `autocomplete="${token}"`);
    }
    // The value is inspected even in a search box: a pasted card, Aadhaar, or
    // other recognized secret must not escape just because the control is public.
    const value = typeof desc.value === 'string' ? desc.value.trim() : '';
    if (value) {
        const match = scanTextForPII(value)[0];
        if (match)
            return decision(match.category, `live value matches PII (${match.category})`);
    }
    const searchHints = [desc.name, desc.id, desc.placeholder, desc.ariaLabel]
        .map(s => (s || '').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
    if (type === 'search' || searchHints.some(hint => SEARCH_TERMS.test(hint)))
        return SAFE;
    // Match complete attribute tokens/phrases, never fragments such as "contact"
    // inside "Contact Us" or "pan" inside a public page name.
    for (const [attribute, raw] of Object.entries({ name: desc.name, id: desc.id, placeholder: desc.placeholder, label: desc.associatedLabelText, aria: desc.ariaLabel })) {
        const normalized = (raw || '').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
        for (const [pattern, category] of SENSITIVE_LABELS) {
            if (pattern.test(normalized))
                return decision(category, `sensitive ${attribute} field`);
        }
        if (attribute === 'name' || attribute === 'id') {
            for (const [pattern, category] of COMPACT_IDENTIFIERS) {
                if (pattern.test((raw || '').trim()))
                    return decision(category, `sensitive ${attribute} field`);
            }
            // Only explicit tokens with a category are sensitive; generic "contact",
            // "name", "user", and "city" must not mask public form controls.
            for (const keyword of SENSITIVE_FIELD_KEYWORDS) {
                const words = keyword.replace(/_/g, ' ');
                if (new RegExp(`(?:^|[^a-z0-9])${words}(?:$|[^a-z0-9])`, 'i').test(normalized)) {
                    const category = SENSITIVE_LABELS.find(([pattern]) => pattern.test(words))?.[1];
                    if (category)
                        return decision(category, `sensitive ${attribute} field`);
                }
            }
        }
    }
    return SAFE;
}
//# sourceMappingURL=dom-semantic.js.map