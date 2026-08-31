# 05. Action Execution, Verification & Privacy Audit Trail — SIH26171

## 1. Subsystem Architecture

The perception loop combines bounded multi-step execution with explicit semantic verification and local privacy audit logging:

```
[Server UI Action Proposal] ──▶ [Action Policy Check] ──▶ [Content Script Executor] ──▶ [Semantic State Verifier]
                                          │                                                      │
                                          ▼                                                      ▼
                             [Confirm if Protected]                             [Explicit Postcondition Match]
```

---

## 2. Explicit Bounded Postcondition Verification (`verifier.ts`)

Instead of generic visual differences or assuming immediate completion, the agent enforces explicit postcondition checking:

```typescript
export class SemanticStateVerifier {
  public static async verifyOutcome(
    preSnapshot: SafePreActionSnapshot,
    proposal: ActionProposal,
    timeoutMs: number = 150
  ): Promise<VerificationOutcome> {
    // 1. Verify expectedLandmark (main, nav, dialog)
    // 2. Verify targetStateChanges (disabled, checked, aria-expanded)
    // 3. Verify modalDrawerVisibility (aria-modal, role=dialog)
    // 4. Verify safeNavigation (path or hash change without exposing query tokens)
    // 5. Verify statusRegionUpdates (role=status, aria-live)
  }
}
```

*Note on Historical Design Exploration:* An IndexedDB action cache was explored in early drafts for static replays. The production implementation prioritizes live re-perception and fresh ephemeral local IDs per cycle to guarantee correctness on dynamic single-page applications.

---

## 3. Privacy Audit Trail

The extension generates real-time telemetry and audit records without storing plaintext secrets:

```typescript
export interface PrivacyAuditRecord {
  stepId: number;
  timestamp: string;
  urlHost: string;
  detectedCategories: Array<'password' | 'face' | 'credit_card' | 'email' | 'phone' | 'national_id'>;
  maskCount: number;
  networkPayloadVerifiedClean: boolean;
}
```

*Note on Privacy Principles:* Audit records store bounding boxes and categories, **never raw secrets or reversible hashes of secrets**.

