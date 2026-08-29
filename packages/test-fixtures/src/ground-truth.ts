/**
 * @privapilot/test-fixtures - Ground Truth Annotations for Benchmarking
 */

import { SensitiveCategory } from '@privapilot/protocol';

export interface GroundTruthAnnotation {
  readonly fixtureId: string;
  readonly expectedPiiCategories: ReadonlyArray<SensitiveCategory>;
  readonly minActionableElements: number;
  readonly maxActionableElements: number;
  readonly groundTruthBoxes: ReadonlyArray<{
    readonly category: SensitiveCategory;
    readonly normX: number;
    readonly normY: number;
    readonly normW: number;
    readonly normH: number;
  }>;
}

export const GROUND_TRUTH_DATA: Record<string, GroundTruthAnnotation> = {
  'standard-login': {
    fixtureId: 'standard-login',
    expectedPiiCategories: ['email', 'password'],
    minActionableElements: 3,
    maxActionableElements: 3,
    groundTruthBoxes: [
      { category: 'email', normX: 0.1, normY: 0.2, normW: 0.8, normH: 0.08 },
      { category: 'password', normX: 0.1, normY: 0.35, normW: 0.8, normH: 0.08 }
    ]
  },
  'profile-pii': {
    fixtureId: 'profile-pii',
    expectedPiiCategories: ['email', 'phone', 'national_id', 'national_id', 'date_of_birth'],
    minActionableElements: 2,
    maxActionableElements: 2,
    groundTruthBoxes: [
      { category: 'email', normX: 0.15, normY: 0.2, normW: 0.7, normH: 0.05 },
      { category: 'phone', normX: 0.15, normY: 0.28, normW: 0.5, normH: 0.05 },
      { category: 'national_id', normX: 0.15, normY: 0.36, normW: 0.4, normH: 0.05 },
      { category: 'national_id', normX: 0.15, normY: 0.44, normW: 0.5, normH: 0.05 }
    ]
  },
  'payment-portal': {
    fixtureId: 'payment-portal',
    expectedPiiCategories: ['credit_card', 'cvv', 'date_of_birth'],
    minActionableElements: 5,
    maxActionableElements: 5,
    groundTruthBoxes: [
      { category: 'credit_card', normX: 0.1, normY: 0.25, normW: 0.8, normH: 0.08 },
      { category: 'cvv', normX: 0.1, normY: 0.45, normW: 0.3, normH: 0.08 }
    ]
  }
};
