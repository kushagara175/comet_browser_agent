/**
 * @privapilot/test-fixtures - Ground Truth Annotations for Benchmarking
 *
 * CONTAMINATION NOTICE (DEV SPLIT ONLY):
 * All fixtures in this suite were authored in the same repository cycle as the detectors,
 * fusion policy, and test harness. They are designated strictly as DEV fixtures for
 * pipeline calibration and regression smoke testing. They are NOT a held-out evaluation set.
 * An independent held-out evaluation corpus will be captured from real-world pages by
 * evaluators without exposure to fusion-policy.ts.
 */

import { SensitiveCategory } from '@privapilot/protocol';
import { SECRET_CANARY } from './canaries.js';

export type BenchmarkSplit = 'dev' | 'held-out';

export type ElementVisibilityBucket = 'dom-visible' | 'dom-blind';

export interface GroundTruthBox {
  readonly category: SensitiveCategory;
  /**
   * DOM anchor for this region. The browser harness resolves it against real layout
   * and derives the true box, so ground truth describes WHICH element is sensitive
   * rather than where it happened to sit in a synthetic grid.
   *
   * The normX..normH values below are the legacy hand-authored coordinates, kept so
   * the Node harness - which has no layout engine - keeps working unchanged. They are
   * not meaningful in a real browser and the browser harness ignores them.
   */
  readonly selector?: string;
  readonly normX: number;
  readonly normY: number;
  readonly normW: number;
  readonly normH: number;
  readonly tokenOrLabel?: string;
}

export interface GroundTruthElement {
  readonly role: string;
  readonly name: string;
  readonly selector?: string;
  readonly normX?: number;
  readonly normY?: number;
  readonly normW?: number;
  readonly normH?: number;
  readonly isSensitive?: boolean;
  readonly bucket?: ElementVisibilityBucket;
}

export interface GroundTruthAnnotation {
  readonly fixtureId: string;
  readonly split: BenchmarkSplit;
  readonly expectedPiiCategories: ReadonlyArray<SensitiveCategory>;
  readonly minActionableElements: number;
  readonly maxActionableElements: number;
  readonly expectedSafeActionableCount: number;
  readonly groundTruthBoxes: ReadonlyArray<GroundTruthBox>;
  readonly groundTruthElements: ReadonlyArray<GroundTruthElement>;
}

export const GROUND_TRUTH_DATA: Record<string, GroundTruthAnnotation> = {
  'standard-login': {
    fixtureId: 'standard-login',
    split: 'dev',
    expectedPiiCategories: ['email', 'password'],
    minActionableElements: 3,
    maxActionableElements: 3,
    expectedSafeActionableCount: 1,
    groundTruthBoxes: [
      { category: 'email', normX: 0.1, normY: 0.2, normW: 0.8, normH: 0.08, selector: '#emailInput', tokenOrLabel: 'alex.tester@enterprise.local' },
      { category: 'password', normX: 0.1, normY: 0.35, normW: 0.8, normH: 0.08, selector: '#passwordInput', tokenOrLabel: 'SuperSecretPassword123!' }
    ],
    groundTruthElements: [
      { role: 'input', name: 'Email Address', selector: '#emailInput', isSensitive: true, bucket: 'dom-visible' },
      { role: 'input', name: 'Password', selector: '#passwordInput', isSensitive: true, bucket: 'dom-visible' },
      { role: 'button', name: 'Sign In', selector: '#submitBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'misleading-field-names': {
    fixtureId: 'misleading-field-names',
    split: 'dev',
    expectedPiiCategories: ['password', 'token'],
    minActionableElements: 3,
    maxActionableElements: 3,
    expectedSafeActionableCount: 1,
    groundTruthBoxes: [
      { category: 'password', normX: 0.1, normY: 0.1, normW: 0.8, normH: 0.08, selector: '#query_search', tokenOrLabel: 'HiddenPass!99' },
      // The canary is a bearer-token style secret, not a national ID. Its DOM context
      // in the fixture is id="custom_token" / "Confidential Key:" / "Token:". It was
      // authored as national_id, which made every correct 'token' detection score as
      // both a miss and a false positive.
      { category: 'token', selector: '#custom_token', normX: 0.1, normY: 0.25, normW: 0.8, normH: 0.08, tokenOrLabel: SECRET_CANARY }
    ],
    groundTruthElements: [
      { role: 'input', name: 'search_q', selector: '#query_search', isSensitive: true, bucket: 'dom-visible' },
      { role: 'input', name: 'data_ref', selector: '#custom_token', isSensitive: true, bucket: 'dom-visible' },
      { role: 'button', name: 'Perform Safe Search', selector: '#searchBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { category: 'credit_card', normX: 0.1, normY: 0.25, normW: 0.8, normH: 0.08, selector: '#cardNumber', tokenOrLabel: '4532 0150 1234 5671' },
      // The expiry field is already declared isSensitive in groundTruthElements below
      // and is masked by the pipeline, but had no box, so every correct detection of
      // it scored as a false positive. autocomplete="cc-exp" is card data.
      { category: 'credit_card', normX: 0.1, normY: 0.33, normW: 0.4, normH: 0.08, selector: '#cardExp', tokenOrLabel: '12/28' },
      { category: 'cvv', normX: 0.1, normY: 0.45, normW: 0.3, normH: 0.08, selector: '#cardCvv', tokenOrLabel: '892' }
    ],
    groundTruthElements: [
      { role: 'input', name: 'Cardholder Name', selector: '#cardHolder', isSensitive: true, bucket: 'dom-visible' },
      { role: 'input', name: 'Card Number', selector: '#cardNumber', isSensitive: true, bucket: 'dom-visible' },
      { role: 'input', name: 'Expiration Date', selector: '#cardExp', isSensitive: true, bucket: 'dom-visible' },
      { role: 'input', name: 'CVV Code', selector: '#cardCvv', isSensitive: true, bucket: 'dom-visible' },
      { role: 'button', name: 'Submit Payment ($49.00)', selector: '#paySubmitBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { category: 'email', normX: 0.15, normY: 0.2, normW: 0.7, normH: 0.05, selector: '.profile-card p:nth-of-type(1) span', tokenOrLabel: 'rohan.sharma@isro.gov.in.synthetic' },
      { category: 'phone', normX: 0.15, normY: 0.28, normW: 0.5, normH: 0.05, selector: '.profile-card p:nth-of-type(2) span', tokenOrLabel: '+91 98765 43210' },
      { category: 'national_id', normX: 0.15, normY: 0.36, normW: 0.4, normH: 0.05, selector: '.profile-card p:nth-of-type(3) span', tokenOrLabel: 'ABCDE1234F' },
      { category: 'national_id', normX: 0.15, normY: 0.44, normW: 0.5, normH: 0.05, selector: '.profile-card p:nth-of-type(4) span', tokenOrLabel: '4532 8901 2342' }
    ],
    groundTruthElements: [
      { role: 'button', name: 'View Safe Records', selector: '#viewRecordsBtn', isSensitive: false, bucket: 'dom-visible' },
      { role: 'button', name: 'Edit Profile', selector: '#editProfileBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { category: 'face', normX: 0.1, normY: 0.2, normW: 0.2, normH: 0.2, selector: 'img[alt="Avatar 1"]', tokenOrLabel: 'Avatar 1' },
      { category: 'face', normX: 0.4, normY: 0.2, normW: 0.2, normH: 0.2, selector: 'img[alt="Avatar 2"]', tokenOrLabel: 'Avatar 2' }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Load More', selector: '#loadMoreBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.8, normH: 0.5, selector: 'img.scanned-id', tokenOrLabel: 'Scanned Document' }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Open Safe Preview', selector: '#openSafePreview', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'canvas-app': {
    fixtureId: 'canvas-app',
    split: 'dev',
    expectedPiiCategories: ['high_risk_surface'],
    // Zero actionable DOM elements is the point of this fixture: the entire UI is
    // painted into a canvas, so DOM parsing has nothing to find and only the vision
    // model can read the surface.
    minActionableElements: 0,
    maxActionableElements: 0,
    expectedSafeActionableCount: 0,
    groundTruthBoxes: [
      { category: 'high_risk_surface', normX: 0.0, normY: 0.0, normW: 0.7, normH: 0.65, selector: '#appSurface', tokenOrLabel: 'appSurface' }
    ],
    groundTruthElements: []
  },

  'canvas-pii': {
    fixtureId: 'canvas-pii',
    split: 'dev',
    expectedPiiCategories: ['high_risk_surface'],
    minActionableElements: 1,
    maxActionableElements: 1,
    expectedSafeActionableCount: 1,
    groundTruthBoxes: [
      { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.6, normH: 0.4, selector: '#telemetryCanvas', tokenOrLabel: 'telemetryCanvas' }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Refresh Data', selector: '#refreshDataBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { category: 'high_risk_surface', normX: 0.1, normY: 0.2, normW: 0.7, normH: 0.5, selector: 'iframe', tokenOrLabel: 'iframe' }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Continue', selector: '#safeContinueBtn', isSensitive: false, bucket: 'dom-visible' }
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
      { role: 'button', name: 'Next Step', selector: '#nextStepBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'controlled-react-input': {
    fixtureId: 'controlled-react-input',
    split: 'dev',
    expectedPiiCategories: [],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 2,
    groundTruthBoxes: [],
    groundTruthElements: [
      { role: 'input', name: 'Search mission tickets...', selector: '#searchInput', isSensitive: false, bucket: 'dom-visible' },
      { role: 'button', name: 'Search', selector: '#searchSubmitBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'long-scroll': {
    fixtureId: 'long-scroll',
    split: 'dev',
    expectedPiiCategories: ['token'],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 2,
    groundTruthBoxes: [
      // The canary is a bearer-token style secret, not a national ID. Its DOM context
      // in the fixture is id="custom_token" / "Confidential Key:" / "Token:". It was
      // authored as national_id, which made every correct 'token' detection score as
      // both a miss and a false positive.
      { category: 'token', selector: 'div[style*="margin-top"] p', normX: 0.1, normY: 0.5, normW: 0.8, normH: 0.05, tokenOrLabel: SECRET_CANARY }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Top Nav', selector: '#topNavBtn', isSensitive: false, bucket: 'dom-visible' },
      { role: 'button', name: 'Middle Action', selector: '#midPageBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'dark-mode': {
    fixtureId: 'dark-mode',
    split: 'dev',
    expectedPiiCategories: ['password'],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 1,
    groundTruthBoxes: [
      { category: 'password', normX: 0.1, normY: 0.3, normW: 0.8, normH: 0.08, selector: '#darkSecret', tokenOrLabel: 'HiddenDarkPass' }
    ],
    groundTruthElements: [
      { role: 'input', name: 'darkSecret', selector: '#darkSecret', isSensitive: true, bucket: 'dom-visible' },
      { role: 'button', name: 'Safe Inspect', selector: '#darkInspectBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'modal-dialog': {
    fixtureId: 'modal-dialog',
    split: 'dev',
    expectedPiiCategories: ['token'],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 2,
    groundTruthBoxes: [
      // The canary is a bearer-token style secret, not a national ID. Its DOM context
      // in the fixture is id="custom_token" / "Confidential Key:" / "Token:". It was
      // authored as national_id, which made every correct 'token' detection score as
      // both a miss and a false positive.
      { category: 'token', selector: '#reviewModal p', normX: 0.2, normY: 0.3, normW: 0.6, normH: 0.05, tokenOrLabel: SECRET_CANARY }
    ],
    groundTruthElements: [
      { role: 'button', name: 'Cancel', selector: '#modalCloseBtn', isSensitive: false, bucket: 'dom-visible' },
      { role: 'button', name: 'Authorize Transfer', selector: '#modalSubmitBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'cookie-banner': {
    fixtureId: 'cookie-banner',
    split: 'dev',
    expectedPiiCategories: [],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 2,
    groundTruthBoxes: [],
    groundTruthElements: [
      { role: 'button', name: 'Accept Cookies', selector: '#acceptCookiesBtn', isSensitive: false, bucket: 'dom-visible' },
      { role: 'button', name: 'Main Feature', selector: '#mainActionBtn', isSensitive: false, bucket: 'dom-visible' }
    ]
  },

  'canvas-form': {
    fixtureId: 'canvas-form',
    split: 'dev',
    expectedPiiCategories: [],
    minActionableElements: 2,
    maxActionableElements: 2,
    expectedSafeActionableCount: 2,
    groundTruthBoxes: [],
    groundTruthElements: [
      { role: 'input', name: 'Canvas Input', normX: 0.1, normY: 0.15, normW: 0.8, normH: 0.15, isSensitive: false, bucket: 'dom-blind' },
      { role: 'button', name: 'Canvas Action', normX: 0.1, normY: 0.55, normW: 0.45, normH: 0.15, isSensitive: false, bucket: 'dom-blind' }
    ]
  },

  'image-identifier': {
    fixtureId: 'image-identifier',
    split: 'dev',
    expectedPiiCategories: [],
    minActionableElements: 1,
    maxActionableElements: 1,
    expectedSafeActionableCount: 1,
    groundTruthBoxes: [],
    groundTruthElements: [
      { role: 'image', name: 'auth_badge', selector: '#secSeal', normX: 0.2, normY: 0.2, normW: 0.2, normH: 0.25, isSensitive: false, bucket: 'dom-blind' }
    ]
  }
};


