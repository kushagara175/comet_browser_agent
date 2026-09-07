# Two-Hour End-to-End Repair Prompt for Gemini

Copy everything inside the code block into Gemini/Antigravity.

```text
You are the lead coding agent responsible for making the existing PrivaPilot browser-agent flow work end-to-end in a focused two-hour engineering sprint.

Repository root: SIH_26209

PRIMARY OUTCOME

Make this real extension path complete successfully in Chrome:

User enters a task in the extension
→ extension captures the active webpage and DOM
→ local sanitizer detects and masks sensitive content
→ sanitizer validates the safe result
→ only sanitized context is sent to the configured reasoning model
→ model returns one constrained action
→ client validates risk, confidence, target, and capture freshness
→ extension executes the browser action
→ local verifier confirms the expected page change
→ agent either continues or returns complete
→ failures stop safely without transmitting raw content or executing unsafe actions.

TIME-BOX AND SCOPE

You have a focused two-hour sprint. Do not attempt the complete long-term visual-agent roadmap. Optimize for ONE genuinely working, repeatable, safe end-to-end workflow on the existing demo portal:

Goal: "Open the safe preview for the pending request"

The final task should:

1. Start from the extension side panel/runtime message path.
2. Capture the real demo portal tab.
3. Sanitize the real screenshot locally.
4. Send only sanitized context to the configured model.
5. Receive a schema-valid click proposal for "Open Safe Preview."
6. Execute the click through the content script.
7. Verify that the preview drawer/dialog opened.
8. Return `success: true` and state `complete`, without claiming success merely because the click event was dispatched.

If the model naturally returns `finish` after observing the opened preview, allow the second perception/reasoning step and verify completion. Do not hardcode the target ID, selector, website domain, or expected model response into production code.

READ FIRST

Read before editing:

- docs/00_PROBLEM_STATEMENT.md
- docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md
- docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md
- docs/GPT_PLAN/04_PROGRESS_TRACKER.md
- package.json
- apps/extension/src/background/coordinator.ts
- apps/extension/src/background/http-client.ts
- apps/extension/src/browser/browser-adapter.ts
- apps/extension/src/content/content-main.ts
- apps/extension/src/content/element-extractor.ts
- apps/extension/src/content/action-executor.ts
- apps/extension/src/content/verifier.ts
- apps/extension/src/sanitizer/pipeline.ts
- apps/extension/src/sanitizer/post-redaction-verifier.ts
- apps/extension/src/offscreen/offscreen-main.ts
- apps/server/src/index.ts
- apps/server/src/engines/vlm-engine.ts
- apps/server/src/schemas/payload-validator.ts
- apps/demo-portal/src/index.html
- apps/demo-portal/src/app.js
- scripts/run-e2e-extension.mjs
- tests/coordinator-multistep.test.js
- tests/semantic-verifier.test.js
- tests/offscreen-sanitizer.test.js

CURRENT VERIFIED STATE

- `npm run build` currently succeeds.
- `npm test` currently passes 172/172 tests.
- The configured model is reachable:
  - model: qwen/qwen2.5-vl-72b-instruct
  - provider: vlm-cloud
- Chrome extension installation and service-worker attachment work.
- The content-script reinjection fallback in `apps/extension/src/browser/browser-adapter.ts` is existing user work. Preserve it.
- The current working tree contains modified generated browser/background artifacts from that source change. Do not manually edit or revert them; rebuilding is allowed.
- Current real Chrome E2E command:

  npm run test:e2e

- Latest observed E2E failure:

  success: false
  state: blocked-local-only
  error: "Sensitive content may be present in an area that cannot be inspected safely. No context was sent."
  proposal: null
  wall clock: ~351 ms

- The coordinator catches every sanitizer error and replaces it with one generic message, hiding the root cause.
- `npm run benchmark:browser` currently runs the sanitizer successfully on 14 fixtures and reports:
  - 83.3% redaction coverage
  - 15/18 regions covered
  - 3 under-masked regions
  - 100% safe-control preservation
  - ~30 ms p50 client perception in the harness
- The demo portal includes an intentionally uninspectable telemetry canvas. The sanitizer is supposed to mask that surface; its existence alone must not automatically make the entire page unusable when masking succeeds.
- Production post-redaction verification is currently count/string based. Do not falsely call it pixel verified.
- A prior E2E run reached the model and click stage but failed because semantic verification timed out after clicking "Open Safe Preview."

MANDATORY OPERATING MODE

- Work autonomously. Do not stop to ask routine questions.
- Keep going through reproduce → diagnose → fix → build → test → E2E rerun.
- Make focused root-cause changes only.
- Do not redesign the UI.
- Do not integrate a new visual model.
- Do not implement Firefox.
- Do not implement the full 12-phase roadmap.
- Do not train a model.
- Do not add site-specific selectors, IDs, URL branches, or target IDs to production agent logic.
- Do not weaken privacy, schema validation, action safety, or postcondition verification merely to obtain `success: true`.
- Do not hardcode an E2E success response in the harness, mock engine, server, coordinator, executor, verifier, or demo portal.
- Do not switch to the mock engine when a real configured model is available just to make the test deterministic.
- Do not manually edit `dist/`; edit source and run `npm run build`.
- Preserve unrelated user changes.
- Never print or expose `.env` secrets. You may verify that required variables are present without displaying their values.

EXECUTION PLAN

STEP 1 — Establish baseline and preserve work

Run:

- git status --short
- npm run build
- npm test

Inspect the existing diff before changing files. Do not revert source or generated artifacts that belong to existing user work.

STEP 2 — Reproduce the full E2E failure

Run:

- npm run test:e2e

Read:

- docs/benchmark-results/E2E_EXTENSION_RUN.json

Confirm the real state and stage at which it fails.

STEP 3 — Expose the real sanitizer failure safely

The coordinator currently replaces all sanitizer exceptions with one generic message. Add a privacy-safe diagnostic classification so development/E2E evidence can identify the stage without leaking screenshot data, raw PII, URLs, or secrets.

Requirements:

- Preserve the user-facing fail-closed message.
- Add a safe reason code and sanitized technical detail to logs/E2E result.
- Strip data URLs, base64 blobs, raw page URLs, and unexpected long strings.
- Do not send diagnostic details to the reasoning model.
- Add a unit test proving raw image data/URLs are removed.

Suggested safe classes:

- OFFSCREEN_UNAVAILABLE
- SCREENSHOT_DECODE_FAILED
- CANVAS_UNAVAILABLE
- MASK_RENDER_FAILED
- MASK_VERIFICATION_FAILED
- DIGEST_FAILED
- SANITIZER_TIMEOUT
- UNKNOWN_SANITIZER_FAILURE

Do not guess which class applies; classify from actual thrown messages and preserve a safe fallback.

STEP 4 — Fix the actual sanitizer/offscreen root cause

Rerun E2E after safe diagnostics reveal it.

Possible causes to investigate based on evidence, not assumptions:

- Offscreen document creation/message race
- Offscreen canvas screenshot decode
- Web Crypto availability in the offscreen context
- Digest canonicalization failure
- Correlation mismatch
- ONNX model/WASM path initialization
- Screenshot/viewport dimension mismatch
- Mask count mismatch
- Invalid geometry
- Message timeout

The demo telemetry canvas should be fully opaque-masked as a high-risk surface. A maskable canvas is not a reason to block the whole page. However, if rendering or verification fails, continue to fail closed.

Do not suppress the exception without ensuring sanitization actually completed.

STEP 5 — Reach the real model and inspect its proposal

After sanitizer success, rerun:

- npm run test:e2e

Confirm:

- modelConnected is true
- sanitized screenshot has a realistic nontrivial byte size
- sanitized elements are present
- proposal is schema-valid
- proposal target exists in current sanitized elements
- raw screenshot/DOM/PII is not in the outgoing payload

If model response fails, fix prompt/schema/transport generically. Do not hardcode `el_6` or "Open Safe Preview" into production logic.

STEP 6 — Fix semantic verification root cause

The demo portal click synchronously:

- removes `hidden` from `#previewDrawer`
- sets `aria-expanded="true"`
- updates a `role="status"` region

The verifier must detect a new/open dialog/drawer or relevant status/target semantic change.

Inspect why the existing verifier previously timed out. Possible generic causes:

- 150 ms timeout too short
- pre-action snapshot includes hidden dialogs incorrectly
- dialog-open counting ignores CSS visibility
- `aria-expanded` is read from the wrong element
- MutationObserver target/subtree is too narrow
- verification checks execute before event handlers/microtasks settle
- generic expected-state text is not mapped to a supported postcondition

Implement a generic, bounded solution:

- Action-aware timeout (roughly 1–3 seconds for dynamic clicks; still bounded)
- Initial post-action check
- MutationObserver on an appropriate document root
- Periodic bounded recheck, not mutation-only
- Cleanup observers/timers
- Require a real postcondition such as a newly visible dialog, URL change, target semantic change, or status-region change
- Never treat arbitrary DOM mutation or `document.readyState` as sufficient success
- Never mark a click verified only because `click()` returned

Add focused semantic-verifier tests for:

- hidden dialog becoming visible
- status region changing
- unrelated mutation not counting
- timeout
- observer cleanup

STEP 7 — Make the E2E task terminate correctly

After the preview opens, the next agent step should either:

- return a valid `finish` because the goal is satisfied, or
- perform another justified safe observation and then finish.

The coordinator must not falsely declare complete before the preview is open.

If the model repeatedly proposes the same click after success, improve the sanitized state/prompt generically so visible dialogs/status are represented. Do not add a site-specific completion branch.

STEP 8 — Add a minimum confidence gate

Because this is production E2E behavior, add a small local gate if absent:

- Non-finite/out-of-range confidence remains schema-invalid.
- Very low-confidence automatic actions must fail safe or request re-observation.
- Protected actions always require confirmation regardless of confidence.
- Do not over-engineer calibration in this sprint.

At minimum add a test proving confidence 0.01 cannot automatically click.

STEP 9 — Repeat until the real E2E run passes

After each focused fix:

1. Run focused tests.
2. Run npm run build.
3. Run npm run test:e2e.

Do not stop after compilation. The real Chrome E2E artifact must record:

- `success: true`
- `state: complete`
- a real model connection
- at least one real action proposal
- a realistic sanitized screenshot size
- local semantic verification success
- no protected action executed without confirmation

Run the successful workflow at least three consecutive times. Preserve each run or summarize all three with raw artifacts so one lucky run is not mistaken for reliability.

STEP 10 — Regression validation

Run:

- npm run build
- npm test
- npm run lint
- npm run benchmark:browser
- npm run test:e2e three times

If the browser benchmark still reports known under-masked face/image fixtures, report that clearly. Do not claim Phase 1 pixel-verification completion unless those failures are actually fixed. The immediate sprint goal is working E2E without regressing privacy; do not hide remaining benchmark failures.

STRICT DEFINITION OF DONE

This sprint is DONE only when:

1. Build succeeds.
2. Full tests pass.
3. Lint/typecheck passes.
4. Real configured model is connected.
5. Real extension E2E starts from extension messaging.
6. Sanitizer returns verified sanitized context rather than a raw or fake image.
7. Only sanitized context reaches the server.
8. Model returns a real schema-valid action.
9. Client validates action target, risk, confidence, and capture freshness.
10. Content script performs the real click.
11. Verifier observes the preview drawer/dialog actually opening.
12. Coordinator reaches `success: true`, `state: complete`.
13. The run succeeds three consecutive times.
14. No existing 172-test baseline regresses.
15. Remaining redaction benchmark failures are explicitly reported rather than hidden.

If an external blocker remains after multiple focused attempts—such as provider outage, exhausted API quota, browser launch prohibition, or missing credentials—do not fabricate success. Provide:

- exact failing command,
- safe error message/status,
- evidence that local stages pass,
- smallest user action required,
- exact command to resume.

FINAL RESPONSE FORMAT

At the end, report:

- E2E status: PASS or BLOCKED
- Three-run reliability result
- Exact task completed
- Exact files changed
- Root causes fixed
- Tests/commands with results
- Current model/provider (never API key)
- Sanitized payload byte size
- Client/server/total latency for successful runs
- Privacy guarantees actually exercised
- Known remaining failures
- Confirmation that no raw data or secrets were logged

Do not claim the full master plan is complete. This prompt completes the narrow production end-to-end workflow only.
```
