# PrivaPilot — Binding Working Rules

**Read this before every coding session, human or AI agent.**

Sections 1–4 and 6 are drawn from [`SIH26171_WINNING_EXECUTION_PLAYBOOK.md`](SIH26171_WINNING_EXECUTION_PLAYBOOK.md),
which remains the source of truth. Section 5 exists because the 31 Aug 2026 audit found the project
shipping fabricated metrics and a redaction pipeline that never ran.

Work items are tracked in [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md).

---

## 1. The privacy boundary — playbook §3.1

The flow is, and must remain:

```
RawCapture  →  DetectionReport  →  SanitizedContext  →  NetworkPayload
```

- The HTTP client accepts **`SanitizedContext` only**. `RawCapture` must never be assignable to it.
  The `_brand` fields in `packages/protocol/src/payload.ts` enforce this at compile time — never weaken
  them, never cast around them, never add an `any` that launders one into the other.
- Nothing crosses the network before sanitization: no screenshot, DOM fragment, OCR result,
  accessibility name, error object, analytics event, audit record, or action log.
- **Content scripts make no direct HTTP calls, ever.** All network traffic goes through the background
  coordinator, after sanitization.

## 2. Fail closed — playbook §3.2

- If coverage is uncertain, **do not transmit the screenshot.** Show the user:
  *"Sensitive content may be present in an area that cannot be inspected safely. No context was sent."*
- Safe options to offer: a DOM-only sanitized summary, let the user locally hide the region, let the user
  add a manual redaction rectangle, or cancel.
- **Never send a raw capture after a timeout or model failure.**
- A failing sanitizer must never degrade into permissive behavior. The fallback at `pipeline.ts:107` —
  which returned a 1×1 PNG and faked its own mask count so the verifier passed — is the canonical
  example of what not to do. If you find yourself writing a fallback that lets the pipeline continue
  after a redaction step failed, stop.

## 3. Data classes — playbook §3.3, §3.4

**Never leaves the browser:**
passwords · OTPs · tokens and API keys · cookies · credit-card numbers · CVVs · bank accounts ·
Aadhaar, PAN and government IDs · authentication QR codes · medical identifiers

**Redact by default:**
emails · phone numbers · addresses · faces · personal names · employee IDs · dates of birth ·
profile photos · sensitive free text

**Server may receive, after minimization:**
locally assigned element IDs · roles · sanitized names · normalized bounds · enabled/visible state ·
action capabilities · the redacted screenshot · the sanitized goal

**Never collect at all:**
full HTML · raw DOM · clipboard · history · localStorage · credential manager contents · devtools data

**Audit records** may contain only: timestamp, category, bounding box, detector source, redaction method,
capture ID, sanitized-payload digest, and the allow/block decision.
**Not even hashes of sensitive values** — a hash of an email, phone number, or known ID is guessable.

## 4. Action safety — playbook §6.1, §6.2, §6.4

- The server proposes **one** action at a time, addressed by local ID (`el_4`).
  **Reject any response containing a CSS selector, XPath, JavaScript, or URL.**
- **Auto-allow:** scroll · focus a non-sensitive field · click harmless navigation · open a preview ·
  select a non-sensitive filter · type user-provided non-sensitive search text.
- **Require user confirmation:** submit · send · publish · delete · save · download · upload · pay ·
  purchase · sign · authorize · account or security changes · typing into a sensitive field.
- **Always block:** CAPTCHA · MFA/OTP entry · password entry from the server · secret pasting ·
  browser permission prompts · extension pages · local-file access.
- Before any click, verify: the target exists; it is visible and enabled; its local ID still maps to the
  same semantic role; it is not protected; the current capture is fresh.
- **Never parse arbitrary prose into an action.** Invalid model output → do not execute, record a
  redacted local diagnostic, optionally make **one** schema-repair attempt, then show a safe error.
- State verification means *"the preview panel became visible"*, never *"the image changed enough"*.
  pHash difference alone is not sufficient evidence of success.
- Use DOM execution first. Coordinate clicking is an experimental fallback only.

## 5. Evidence and honesty — playbook §7.1, and the reason this file exists

- **Never state an unmeasured performance claim.** Not in the README, not in the UI, not in the pitch,
  not in the submission PDF, not in a commit message.
- Every metric requires all six: a definition · a fixed corpus · ground truth · a reproducible command ·
  a stored result · a report that shows failures.
- **Ground truth must never be derived from detector output.** If the same code produces both sides of
  the comparison, the number is meaningless. The old `benchmark/src/runner.ts` pushed to `detections`
  and `groundTruth` in the same loop and reported 100%/100%; that is not a benchmark.
- **A missed target is reported as FAILED.** Do not relabel it. The old `EVALUATION_REPORT.md` printed
  2292 ms against a <1200 ms target and marked it PASSED — an ISRO jury will find that, and it costs
  more than the metric ever would have.
- Test data is **synthetic only**. Never put real personal data in a fixture.
- WebGPU is an accelerator; WASM/CPU is the correctness path. **Privacy correctness must never depend on
  WebGPU being available.**
- Do not display model chain-of-thought in the UI (playbook §9.5).

## 6. Per-task discipline — playbook §10.4

Before starting any unit of work, state:

- bounded feature scope
- the raw input it touches
- the sanitized output it creates
- data prohibited from logs and network
- the test being added
- the safe failure behavior

**Never:**
bypass `SanitizedContext` · add a direct content-script HTTP call · log raw screen, DOM, or payload
values · execute a server-supplied selector · auto-execute a protected action · turn a failed sanitizer
into permissive behavior · state an unmeasured performance claim.

### Review checklist — playbook §10.5

- Can raw content cross the boundary?
- Does a timeout fail closed?
- Is the schema closed?
- Are coordinates converted using the named coordinate spaces?
- Is device pixel ratio handled?
- Are iframe, canvas, and image risks addressed?
- Is confirmation enforced?
- Is WebGPU optional for correctness?
- Is the test data synthetic?
- Does the test cover an adversarial condition?

---

## 7. Reuse before you write

The audit found working, tested utilities being duplicated or ignored. Before adding code, check:

| Need | Already exists |
| :--- | :--- |
| Merge overlapping mask regions | `mergeBoundingBoxes()` — `packages/protocol/src/coordinates.ts` |
| Viewport ↔ screenshot coordinate conversion with DPR and clamping | `viewportToScreenshotBox()` — same file |
| Action risk classification | `classifyActionRisk()` — `packages/protocol/src/action.ts` |
| PII text scanning (email, PAN, Aadhaar, card+Luhn, phone, CVV, JWT) | `scanTextForPII()` — `packages/pii-rules/src/regex-patterns.ts` |
| Sensitive form-field analysis by type/autocomplete/name | `analyzeDomElementSensitivity()` — `packages/pii-rules/src/dom-semantic.ts` |
| Element-name scrubbing | `sanitizeElementName()` — `packages/pii-rules/src/scrubber.ts` |
| Closed-schema payload validation | `validateSanitizedPayload()` — `apps/server/src/schemas/payload-validator.ts` |
| Local/cloud VLM adapter with auto-probe and mock fallback | `VlmReasoningEngine` — `apps/server/src/engines/vlm-engine.ts` |
| Ground-truth annotations for benchmarking | `GROUND_TRUTH_DATA` — `packages/test-fixtures/src/ground-truth.ts` |
| 14 synthetic PII test pages | `TEST_FIXTURES` — `packages/test-fixtures/src/fixtures.ts` |

## 8. Definition of done

A change is done when all of these hold:

- [ ] `npm run build` passes clean
- [ ] `npm test` passes, including a **new** test for this change
- [ ] `npm run test:canary` passes — the canary appears in no payload
- [ ] At least one adversarial condition from playbook §8.3 is covered
- [ ] No unmeasured claim was added to code, UI, or docs
- [ ] The failure path was tested, not just the happy path
- [ ] A concise limitation note was written down
