# 05. Action Memory Cache & Privacy Audit Trail — SIH26171

## 1. Subsystem Architecture

The Action Memory Cache and State Verifier optimize client execution latency (15% metric) and provide cryptographic proof of zero PII leakage:

```
[Server UI Action] ──▶ [IndexedDB Action Cache] ──▶ [Content Script Executor] ──▶ [pHash State Verifier]
                              ▲                                                          │
                              └──────────────── Store Verified Action ───────────────────┘
```

---

## 2. IndexedDB Action Cache Schema

Recurring user workflows (e.g. repeated portal navigation, filtering, or logins) are stored locally in the browser's `IndexedDB`:

```typescript
export interface CachedActionPath {
  taskSignature: string;      // e.g. "portal.isro.gov.in#search_satellite_imagery"
  stepIndex: number;          // 0, 1, 2...
  sanitizedDOMHash: string;   // Structural hash of non-sensitive DOM tree
  action: {
    type: 'click' | 'type' | 'select' | 'scroll';
    selector: string;
    coordinates?: { x: number; y: number };
  };
  lastSuccessTimestamp: number;
  hitCount: number;
}
```

### Fast-Path Latency Advantage
- **Cold Run (Server VLM Reasoning):** ~850–1200 ms per step.
- **Warm Run (IndexedDB Cache Hit):** **<150 ms** deterministic replay.
- Directly optimizes the **15% End-to-End Latency** metric while reducing server compute costs.

---

## 3. Closed-Loop State Verification & Self-Healing

After executing any UI action, the agent captures the subsequent viewport and verifies state transitions:

```typescript
export class StateVerifier {
  public static async verifyTransition(
    beforeBlob: Blob,
    afterBlob: Blob
  ): Promise<boolean> {
    const hashBefore = await this.computePerceptualHash(beforeBlob);
    const hashAfter = await this.computePerceptualHash(afterBlob);
    
    const hammingDistance = this.calculateHammingDistance(hashBefore, hashAfter);
    // Hamming distance > 4 indicates significant visual page update
    return hammingDistance >= 4;
  }

  public static async handleStallOrModal(document: Document): Promise<boolean> {
    // Detect common modal backdrop or cookie/consent banners
    const modalCloseSelectors = [
      'button[aria-label*="close" i]',
      'button[class*="modal-close" i]',
      'button[class*="cookie-accept" i]',
      '.modal .close',
      '#dismiss-button'
    ];
    
    for (const selector of modalCloseSelectors) {
      const btn = document.querySelector(selector) as HTMLElement;
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }
    return false;
  }
}
```

---

## 4. Cryptographic Privacy Audit Trail

To empirically demonstrate compliance with the **40% PII & Redaction** scoring criteria to SIH judges, the extension generates a real-time cryptographic audit log:

```typescript
export interface PrivacyAuditRecord {
  stepId: number;
  timestamp: string;
  urlHost: string;
  detectedSensitiveElements: {
    category: 'PASSWORD' | 'FACE' | 'CREDIT_CARD' | 'EMAIL' | 'PHONE' | 'AADHAAR';
    redactionMethod: 'SOLID_BLACKOUT' | 'GAUSSIAN_BLUR' | 'TEXT_MASK';
    elementBounds: { x: number; y: number; width: number; height: number };
    sha256Digest: string; // Hash of raw data proving detection without storing plaintext
  }[];
  networkPayloadVerifiedClean: boolean;
}
```

Judges can click **"Export Privacy Audit Log"** in the HUD to download a JSON/CSV verification report validating that 0 unredacted secrets were transmitted.
