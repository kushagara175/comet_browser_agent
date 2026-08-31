/**
 * @privapilot/test-fixtures - Ground Truth Annotations for Benchmarking
 *
 * Authored ground truth annotations across 14 fixtures partitioned into
 * development (dev) and held-out splits.
 */
import { SECRET_CANARY } from './canaries.js';
export const GROUND_TRUTH_DATA = {
    'standard-login': {
        fixtureId: 'standard-login',
        split: 'dev',
        expectedPiiCategories: ['email', 'password'],
        minActionableElements: 3,
        maxActionableElements: 3,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'email', normX: 0.1, normY: 0.2, normW: 0.8, normH: 0.08, tokenOrLabel: 'alex.tester@enterprise.local' },
            { category: 'password', normX: 0.1, normY: 0.35, normW: 0.8, normH: 0.08, tokenOrLabel: 'SuperSecretPassword123!' }
        ],
        groundTruthElements: [
            { role: 'input', name: 'Email Address', selector: '#emailInput', isSensitive: true },
            { role: 'input', name: 'Password', selector: '#passwordInput', isSensitive: true },
            { role: 'button', name: 'Sign In', selector: '#submitBtn', isSensitive: false }
        ]
    },
    'misleading-field-names': {
        fixtureId: 'misleading-field-names',
        split: 'dev',
        expectedPiiCategories: ['password', 'national_id'],
        minActionableElements: 3,
        maxActionableElements: 3,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'password', normX: 0.1, normY: 0.1, normW: 0.8, normH: 0.08, tokenOrLabel: 'HiddenPass!99' },
            { category: 'national_id', normX: 0.1, normY: 0.25, normW: 0.8, normH: 0.08, tokenOrLabel: SECRET_CANARY }
        ],
        groundTruthElements: [
            { role: 'input', name: 'search_q', selector: '#query_search', isSensitive: true },
            { role: 'input', name: 'data_ref', selector: '#custom_token', isSensitive: true },
            { role: 'button', name: 'Perform Safe Search', selector: '#searchBtn', isSensitive: false }
        ]
    },
    'payment-portal': {
        fixtureId: 'payment-portal',
        split: 'dev',
        expectedPiiCategories: ['credit_card', 'cvv'],
        minActionableElements: 5,
        maxActionableElements: 5,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'credit_card', normX: 0.1, normY: 0.25, normW: 0.8, normH: 0.08, tokenOrLabel: '4532 0150 1234 5671' },
            { category: 'cvv', normX: 0.1, normY: 0.45, normW: 0.3, normH: 0.08, tokenOrLabel: '892' }
        ],
        groundTruthElements: [
            { role: 'input', name: 'Cardholder Name', selector: '#cardHolder', isSensitive: true },
            { role: 'input', name: 'Card Number', selector: '#cardNumber', isSensitive: true },
            { role: 'input', name: 'Expiration Date', selector: '#cardExp', isSensitive: true },
            { role: 'input', name: 'CVV Code', selector: '#cardCvv', isSensitive: true },
            { role: 'button', name: 'Submit Payment ($49.00)', selector: '#paySubmitBtn', isSensitive: false }
        ]
    },
    'profile-pii': {
        fixtureId: 'profile-pii',
        split: 'dev',
        expectedPiiCategories: ['email', 'phone', 'national_id', 'national_id'],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 2,
        groundTruthBoxes: [
            { category: 'email', normX: 0.15, normY: 0.2, normW: 0.7, normH: 0.05, tokenOrLabel: 'rohan.sharma@isro.gov.in.synthetic' },
            { category: 'phone', normX: 0.15, normY: 0.28, normW: 0.5, normH: 0.05, tokenOrLabel: '+91 98765 43210' },
            { category: 'national_id', normX: 0.15, normY: 0.36, normW: 0.4, normH: 0.05, tokenOrLabel: 'ABCDE1234F' },
            { category: 'national_id', normX: 0.15, normY: 0.44, normW: 0.5, normH: 0.05, tokenOrLabel: '4532 8901 2342' }
        ],
        groundTruthElements: [
            { role: 'button', name: 'View Safe Records', selector: '#viewRecordsBtn', isSensitive: false },
            { role: 'button', name: 'Edit Profile', selector: '#editProfileBtn', isSensitive: false }
        ]
    },
    'face-gallery': {
        fixtureId: 'face-gallery',
        split: 'dev',
        expectedPiiCategories: ['face', 'face'],
        minActionableElements: 1,
        maxActionableElements: 1,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'face', normX: 0.1, normY: 0.2, normW: 0.2, normH: 0.2, tokenOrLabel: 'Avatar 1' },
            { category: 'face', normX: 0.4, normY: 0.2, normW: 0.2, normH: 0.2, tokenOrLabel: 'Avatar 2' }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Load More', selector: '#loadMoreBtn', isSensitive: false }
        ]
    },
    'image-pii': {
        fixtureId: 'image-pii',
        split: 'dev',
        expectedPiiCategories: ['high_risk_surface'],
        minActionableElements: 1,
        maxActionableElements: 1,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.8, normH: 0.5, tokenOrLabel: 'Scanned Document' }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Open Safe Preview', selector: '#openSafePreview', isSensitive: false }
        ]
    },
    'canvas-pii': {
        fixtureId: 'canvas-pii',
        split: 'dev',
        expectedPiiCategories: ['high_risk_surface'],
        minActionableElements: 1,
        maxActionableElements: 1,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.6, normH: 0.4, tokenOrLabel: 'telemetryCanvas' }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Refresh Data', selector: '#refreshDataBtn', isSensitive: false }
        ]
    },
    'cross-origin-iframe': {
        fixtureId: 'cross-origin-iframe',
        split: 'dev',
        expectedPiiCategories: ['high_risk_surface'],
        minActionableElements: 1,
        maxActionableElements: 1,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.7, normH: 0.5, tokenOrLabel: 'iframe' }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Continue', selector: '#safeContinueBtn', isSensitive: false }
        ]
    },
    'shadow-dom': {
        fixtureId: 'shadow-dom',
        split: 'dev',
        expectedPiiCategories: [],
        minActionableElements: 1,
        maxActionableElements: 1,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [],
        groundTruthElements: [
            { role: 'button', name: 'Next Step', selector: '#nextStepBtn', isSensitive: false }
        ]
    },
    'controlled-react-input': {
        fixtureId: 'controlled-react-input',
        split: 'held-out',
        expectedPiiCategories: [],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 2,
        groundTruthBoxes: [],
        groundTruthElements: [
            { role: 'input', name: 'Search mission tickets...', selector: '#searchInput', isSensitive: false },
            { role: 'button', name: 'Search', selector: '#searchSubmitBtn', isSensitive: false }
        ]
    },
    'long-scroll': {
        fixtureId: 'long-scroll',
        split: 'held-out',
        expectedPiiCategories: ['national_id'],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 2,
        groundTruthBoxes: [
            { category: 'national_id', normX: 0.1, normY: 0.5, normW: 0.8, normH: 0.05, tokenOrLabel: SECRET_CANARY }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Top Nav', selector: '#topNavBtn', isSensitive: false },
            { role: 'button', name: 'Middle Action', selector: '#midPageBtn', isSensitive: false }
        ]
    },
    'dark-mode': {
        fixtureId: 'dark-mode',
        split: 'held-out',
        expectedPiiCategories: ['password'],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 1,
        groundTruthBoxes: [
            { category: 'password', normX: 0.1, normY: 0.3, normW: 0.8, normH: 0.08, tokenOrLabel: 'HiddenDarkPass' }
        ],
        groundTruthElements: [
            { role: 'input', name: 'darkSecret', selector: '#darkSecret', isSensitive: true },
            { role: 'button', name: 'Safe Inspect', selector: '#darkInspectBtn', isSensitive: false }
        ]
    },
    'modal-dialog': {
        fixtureId: 'modal-dialog',
        split: 'held-out',
        expectedPiiCategories: ['national_id'],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 2,
        groundTruthBoxes: [
            { category: 'national_id', normX: 0.2, normY: 0.3, normW: 0.6, normH: 0.05, tokenOrLabel: SECRET_CANARY }
        ],
        groundTruthElements: [
            { role: 'button', name: 'Cancel', selector: '#modalCloseBtn', isSensitive: false },
            { role: 'button', name: 'Authorize Transfer', selector: '#modalSubmitBtn', isSensitive: false }
        ]
    },
    'cookie-banner': {
        fixtureId: 'cookie-banner',
        split: 'held-out',
        expectedPiiCategories: [],
        minActionableElements: 2,
        maxActionableElements: 2,
        expectedSafeActionableCount: 2,
        groundTruthBoxes: [],
        groundTruthElements: [
            { role: 'button', name: 'Accept Cookies', selector: '#acceptCookiesBtn', isSensitive: false },
            { role: 'button', name: 'Main Feature', selector: '#mainActionBtn', isSensitive: false }
        ]
    }
};
//# sourceMappingURL=ground-truth.js.map