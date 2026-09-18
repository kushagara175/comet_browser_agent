/**
 * @privapilot/pii-rules - DOM Semantic Analyzer
 *
 * Inspects DOM element descriptors (input type, autocomplete, inputmode, id, name, aria-label, placeholder, labels)
 * to detect sensitive form fields deterministically.
 */
import { SENSITIVE_FIELD_KEYWORDS, SENSITIVE_AUTOCOMPLETE_VALUES } from './keywords.js';
import { scanTextForPII } from './regex-patterns.js';
/**
 * Evaluates whether a DOM element is sensitive based on semantic attributes.
 */
export function analyzeDomElementSensitivity(desc) {
    const type = (desc.type || '').toLowerCase();
    const autocomplete = (desc.autocomplete || '').toLowerCase();
    const name = (desc.name || '').toLowerCase();
    const id = (desc.id || '').toLowerCase();
    const placeholder = (desc.placeholder || '').toLowerCase();
    const ariaLabel = (desc.ariaLabel || '').toLowerCase();
    const labelText = (desc.associatedLabelText || '').toLowerCase();
    // 1. Password input type
    if (type === 'password') {
        return {
            isSensitive: true,
            category: 'password',
            reason: 'input[type="password"]',
            confidence: 1.0
        };
    }
    // 2. Sensitive Autocomplete values
    for (const autoVal of SENSITIVE_AUTOCOMPLETE_VALUES) {
        if (autocomplete.includes(autoVal)) {
            let cat = 'password';
            if (autoVal === 'cc-csc')
                cat = 'cvv';
            else if (autoVal.startsWith('cc-'))
                cat = 'credit_card';
            else if (autoVal.startsWith('bday'))
                cat = 'date_of_birth';
            else if (autoVal === 'one-time-code')
                cat = 'auth_code';
            else if (autoVal.startsWith('tel'))
                cat = 'phone';
            else if (autoVal.includes('address') || autoVal.includes('postal-code'))
                cat = 'address';
            else if (autoVal.includes('name') || autoVal === 'username')
                cat = 'username';
            else if (autoVal === 'email')
                cat = 'email';
            return {
                isSensitive: true,
                category: cat,
                reason: `autocomplete="${autoVal}"`,
                confidence: 1.0
            };
        }
    }
    // 3. Email & Tel input types (explicit HTML5 semantics)
    if (type === 'email' || autocomplete === 'email') {
        return {
            isSensitive: true,
            category: 'email',
            reason: 'type/autocomplete email',
            confidence: 0.95
        };
    }
    if (type === 'tel' || autocomplete === 'tel') {
        return {
            isSensitive: true,
            category: 'phone',
            reason: 'type/autocomplete tel',
            confidence: 0.95
        };
    }
    // 4. Sensitive Keywords in id, name, placeholder, label, aria-label
    const combinedTokens = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .toLowerCase();
    for (const keyword of SENSITIVE_FIELD_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b|_${keyword}|${keyword}_`, 'i');
        if (regex.test(combinedTokens) || combinedTokens.includes('secret_canary') || combinedTokens.includes('canary')) {
            let cat = 'token';
            if (keyword.includes('password') || keyword.includes('passcode') || keyword.includes('pwd'))
                cat = 'password';
            else if (keyword.includes('card') || keyword.includes('cc_'))
                cat = 'credit_card';
            else if (keyword.includes('cvv') || keyword.includes('cvc'))
                cat = 'cvv';
            else if (keyword.includes('email') || keyword.includes('mail'))
                cat = 'email';
            else if (keyword.includes('phone') || keyword.includes('mobile') || keyword.includes('contact') || keyword.includes('tel') || keyword.includes('cell') || keyword.includes('usernumber'))
                cat = 'phone';
            else if (keyword.includes('pan'))
                cat = 'national_id';
            else if (keyword.includes('aadhaar') || keyword.includes('aadhar'))
                cat = 'national_id';
            else if (keyword.includes('ssn') || keyword.includes('social_security'))
                cat = 'national_id';
            else if (keyword.includes('bank') || keyword.includes('ifsc') || keyword.includes('iban'))
                cat = 'bank_account';
            else if (keyword.includes('otp') || keyword.includes('2fa') || keyword.includes('mfa'))
                cat = 'auth_code';
            else if (keyword.includes('medical') || keyword.includes('diagnosis') || keyword.includes('prescription') || keyword.includes('patient') || keyword.includes('health') || keyword.includes('doctor_note') || keyword.includes('clinical'))
                cat = 'uninspectable';
            else if (keyword.includes('address') || keyword.includes('street') || keyword.includes('city') || keyword.includes('state') || keyword.includes('zip') || keyword.includes('postal') || keyword.includes('pincode'))
                cat = 'address';
            else if (keyword.includes('dob') || keyword.includes('birth') || keyword.includes('bday'))
                cat = 'date_of_birth';
            else if (keyword.includes('name') || keyword.includes('fname') || keyword.includes('lname') || keyword.includes('user') || keyword.includes('applicant'))
                cat = 'username';
            return {
                isSensitive: true,
                category: cat,
                reason: `token match: "${keyword}"`,
                confidence: 0.95
            };
        }
    }
    // 5. Value PII Inspection (Zero-Trust Input Boundary): If input/textarea has a live filled value
    if (desc.value && typeof desc.value === 'string') {
        const trimmedVal = desc.value.trim();
        if (trimmedVal.length > 0) {
            const piiMatches = scanTextForPII(trimmedVal);
            if (piiMatches.length > 0) {
                return {
                    isSensitive: true,
                    category: piiMatches[0].category,
                    reason: `live value matches PII (${piiMatches[0].category})`,
                    confidence: 0.95
                };
            }
            // If the field is a form input or textarea that is not a search box or button
            const isSearchBox = combinedTokens.includes('search') || combinedTokens.includes('filter') || combinedTokens.includes('find') || type === 'search';
            if (!isSearchBox && (desc.tagName === 'textarea' || (desc.tagName === 'input' && type !== 'submit' && type !== 'button' && type !== 'checkbox' && type !== 'radio'))) {
                return {
                    isSensitive: true,
                    category: 'username',
                    reason: `live input value in form field: "${desc.name || desc.id || desc.placeholder || 'input'}"`,
                    confidence: 0.85
                };
            }
        }
    }
    return {
        isSensitive: false,
        confidence: 1.0
    };
}
//# sourceMappingURL=dom-semantic.js.map