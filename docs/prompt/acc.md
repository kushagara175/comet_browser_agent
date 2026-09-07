# Gemini Intent Grounding and Reliable Browser Execution Prompt

Copy this entire prompt into Gemini or another coding agent.

```text
You are the principal engineer responsible for fixing PrivaPilot’s browser-action grounding and execution system.

Repository root:

SIH_26209

======================================================================
MANDATORY OPERATING MODE
======================================================================

You are an autonomous coding agent, not a consultant.

Do not merely:

- explain the problem,
- suggest possible solutions,
- write a high-level plan,
- provide hypothetical code,
- tell the user which files they could modify,
- modify only the model prompt,
- claim success without executing tests.

You must:

1. Inspect the actual repository.
2. Inspect the current git status and diff.
3. Preserve all existing uncommitted work.
4. Reproduce the reported wrong-target behavior.
5. Trace the complete intent-to-execution path.
6. Identify the root cause using evidence.
7. Modify the real source files.
8. Add focused regression tests.
9. Rebuild generated artifacts from source.
10. Run focused and broad validation.
11. Continue fixing failures until the required behavior works.
12. Report only results that were actually observed.

Do not commit or create a branch unless explicitly requested.

Never manually edit generated `dist` files. Modify source and run the repository build.

Do not remove meaningful safety checks merely to make tests pass.

Do not hardcode a fix specifically for `sih.gov.in`, `SIH26003`, or one test page. Implement general target-grounding behavior that works across websites.

======================================================================
PRIMARY FAILURE TO FIX
======================================================================

PrivaPilot now recognizes that a user requested a browser action, but it can click the wrong page element.

Examples:

- User: “Click the Problem Statements link”
  Wrong behavior: another navigation link or unrelated control is clicked.

- User: “Click SIH26003”
  Wrong behavior: a nearby row, unrelated link, generic button, overlay label, or first clickable element is selected.

- User: “Open View Details for SIH26003”
  Wrong behavior: the first repeated “View Details” button is clicked instead of the button associated with SIH26003.

- User: “Click Login”
  Wrong behavior: a similarly named or visually nearby unrelated control is selected.

The system must distinguish between:

1. Action intent:
   - click
   - open
   - type
   - fill
   - select
   - scroll
   - submit

2. Requested target:
   - “Problem Statements”
   - “SIH26003”
   - “View Details for SIH26003”
   - “search field”
   - “Pending”

3. Constraints and context:
   - target role,
   - related row or container,
   - visible text,
   - nearby identifying text,
   - action capability,
   - current page generation,
   - visibility and interactability,
   - safety classification.

The target must be grounded to the correct current-page element before execution.

======================================================================
READ BEFORE EDITING
======================================================================

First inspect:

- `README.md`
- `package.json`
- current `git status`
- current diff
- `docs/00_PROBLEM_STATEMENT.md`
- `docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md`
- `docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md`
- `docs/GPT_PLAN/08_VERIFIED_PRODUCTION_GAPS_AND_REMEDIATION_PROMPT.md`
- `docs/GPT_PLAN/09_CHROME_EXTENSION_UI_END_TO_END_FINAL_PROMPT.md`

Then inspect the complete implementation path, especially:

- `apps/extension/src/sidepanel/sidepanel.js`
- `apps/extension/src/background/background-main.ts`
- `apps/extension/src/background/coordinator.ts`
- `apps/extension/src/background/http-client.ts`
- `apps/extension/src/browser/browser-adapter.ts`
- `apps/extension/src/content/content-main.ts`
- `apps/extension/src/content/element-extractor.ts`
- `apps/extension/src/content/action-executor.ts`
- `apps/extension/src/content/verifier.ts`
- `apps/extension/src/content/overlay-renderer.ts`
- `apps/server/src/engines/vlm-engine.ts`
- `apps/server/src/engines/mock-engine.ts`
- `packages/protocol/src/action.ts`
- `packages/protocol/src/payload.ts`
- all related unit, integration, and E2E tests
- `scripts/run-e2e-extension.mjs`
- `scripts/run-e2e-matrix.mjs`
- `scripts/run-production-validation.mjs`

Trace the exact runtime chain:

Side-panel user text
→ intent classification
→ normalized task contract
→ DOM extraction
→ sanitized elements
→ reasoning prompt
→ model action proposal
→ proposal validation
→ target/risk validation
→ content-script execution
→ semantic verification
→ terminal completion or next step.

Do not assume the model is the only cause. Determine whether the wrong target originates in:

- side-panel intent routing,
- task-contract parsing,
- element extraction,
- accessible-name computation,
- contextual metadata loss,
- duplicate element IDs,
- model prompting,
- candidate ranking,
- action validation,
- stale element maps,
- overlays,
- executor behavior,
- verification,
- or coordinator completion logic.

======================================================================
CORE ARCHITECTURE RULE
======================================================================

Gemini is a next-action reasoner. Gemini is not the browser executor.

The architecture must remain:

User instruction
→ deterministic intent and task-contract extraction
→ current-page perception
→ candidate generation
→ model or local target selection
→ strict local validation
→ local risk classification
→ local execution
→ local semantic verification.

Gemini must never receive unrestricted browser control.

Gemini must never execute JavaScript on the page.

Gemini must never provide:

- CSS selectors,
- XPath,
- arbitrary JavaScript,
- URLs to navigate without local validation,
- invented local IDs,
- multiple future actions,
- prose instructions instead of an action,
- unsupported action kinds.

The model may propose exactly one action using current sanitized local IDs.

The client must treat every model response as untrusted.

======================================================================
STRUCTURED USER INTENT
======================================================================

Implement or improve a canonical structured browser-task representation.

The task contract should preserve, when safely derivable:

- normalized action kind,
- original user instruction,
- target phrase,
- target role hint,
- target text tokens,
- contextual qualifier,
- container or row qualifier,
- requested value for typing,
- requested option for selection,
- expected terminal postcondition,
- whether the action is protected.

Illustrative structure:

{
  "intent": "click",
  "targetPhrase": "Problem Statements",
  "roleHint": "link",
  "targetTokens": ["problem", "statements"],
  "contextPhrase": null,
  "expectedTerminal": {
    "kind": "url_changed",
    "expectedPathFragment": "problem"
  }
}

For:

“Open View Details for SIH26003”

the structured intent should preserve both:

- target control phrase: `View Details`
- contextual qualifier: `SIH26003`

For:

“Fill the search field with telemetry”

it should preserve:

- intent: `type`
- target phrase: `search field`
- requested text: `telemetry`

Do not reduce the entire instruction to one loose substring.

Do not include politeness wrappers in the target phrase.

Normalize wrappers such as:

- please
- kindly
- can you
- could you
- would you
- will you
- I want you to
- I need you to
- go ahead and
- hey PrivaPilot
- hi PrivaPilot

Remove action verbs from the target phrase when appropriate.

For example:

- `Please click the Problem Statements link`
  - action: `click`
  - target: `Problem Statements`
  - role hint: `link`

Not:

- target: `click the Problem Statements link`

Preserve meaningful words. Do not over-strip target text.

======================================================================
ELEMENT EXTRACTION REQUIREMENTS
======================================================================

Inspect and improve sanitized element extraction.

Every actionable sanitized element should have enough safe metadata for correct grounding without exposing private values.

Where available and safe, preserve:

- stable local ID for the current capture,
- semantic role,
- sanitized accessible name,
- visible text,
- action capabilities,
- visibility state,
- enabled/disabled state,
- coarse bounds,
- tag semantics,
- safe href/path category if permitted by the privacy model,
- parent landmark,
- nearest heading,
- row or card context,
- table-column context,
- associated label,
- safe neighboring text tokens,
- ordinal among equivalent candidates,
- whether it is obscured,
- whether it is inside an active dialog,
- whether it belongs to an extension overlay.

Do not expose:

- raw sensitive field values,
- passwords,
- OTPs,
- payment information,
- national identifiers,
- authentication tokens,
- cookies,
- private URLs,
- hidden sensitive text.

Accessible-name extraction should use appropriate sources such as:

- `aria-label`,
- `aria-labelledby`,
- associated `<label>`,
- button text,
- link text,
- image alt text where relevant,
- semantic descendant text,
- title only as a fallback.

Avoid names polluted by an entire parent container.

Do not treat giant containers as precise clickable targets when a specific descendant control exists.

Exclude or clearly mark:

- PrivaPilot overlays,
- debug boxes,
- visual labels,
- extension-generated controls,
- hidden elements,
- zero-sized elements,
- elements outside the active viewport when inappropriate,
- inert elements,
- disabled elements,
- `aria-hidden` elements,
- obscured elements when safely detectable.

Ensure local IDs are unique within one capture.

Ensure the local ID map used for execution belongs to the same capture or page generation used for reasoning.

======================================================================
TARGET CANDIDATE GENERATION
======================================================================

Do not ask Gemini to choose from every arbitrary DOM node without deterministic filtering.

Before reasoning or execution, generate plausible candidates using:

1. Required action capability.
2. Requested role, if explicit.
3. Visibility.
4. Enabled/interactable state.
5. Current viewport or relevant dialog.
6. Semantic-name similarity.
7. Contextual qualifier similarity.
8. Container, row, card, or table relationship.
9. Safe spatial information.
10. Exact-match preference.

For click actions, prefer elements that support `click`.

For type actions, require elements that support `type`.

For select actions, require elements that support `select`.

Never select an element that lacks the required capability merely because its text is similar.

Never default to:

- the first button,
- the first link,
- the nearest arbitrary clickable element,
- the largest clickable container,
- the first element returned by DOM traversal.

======================================================================
TARGET MATCHING AND SCORING
======================================================================

Implement a deterministic, testable candidate score or equivalent ranking system.

The exact formula should be justified by tests, but it should consider:

Positive evidence:

- exact normalized name match,
- exact visible-text match,
- all target tokens present,
- token-order match,
- requested role match,
- required capability match,
- contextual qualifier present in the same row/card/container,
- target inside the currently active dialog when the instruction refers to it,
- unique matching candidate,
- candidate visible and enabled,
- candidate located near its contextual identifier.

Negative evidence:

- missing required capability,
- wrong role,
- hidden or disabled,
- extension overlay element,
- generic name such as “button”, “link”, or “click”,
- only one weak token matches,
- context belongs to another row,
- candidate is stale,
- candidate is outside the relevant dialog,
- candidate is a broad ancestor around a more precise descendant,
- candidate semantic name contradicts the requested target.

Suggested matching order:

1. Exact normalized accessible-name match.
2. Exact visible-text match.
3. Exact token-set match.
4. Strong ordered token match.
5. Context-qualified match.
6. Conservative fuzzy match only when safely above threshold.

Do not use fuzzy matching without a minimum score.

Do not allow a one-token partial match such as `problem` to automatically beat an exact `Problem Statements` candidate.

Use token boundaries so:

- `login` does not accidentally match unrelated text,
- `SIH26003` remains a meaningful identifier,
- punctuation and casing differences do not break exact semantic matching.

Do not silently choose a low-quality candidate.

======================================================================
DUPLICATE LABELS AND CONTEXTUAL GROUNDING
======================================================================

Handle repeated controls correctly.

Example page:

Row 1:
- ID: SIH26001
- Button: View Details

Row 2:
- ID: SIH26003
- Button: View Details

User command:

“Open View Details for SIH26003”

Correct behavior:

1. Extract target phrase `View Details`.
2. Extract context phrase `SIH26003`.
3. Find repeated `View Details` controls.
4. Associate each control with its row/card context.
5. Select the control whose context contains `SIH26003`.
6. Execute only that control.
7. Verify the resulting details correspond to `SIH26003`.

Incorrect behavior:

- clicking the first `View Details`,
- clicking the `SIH26003` text when the intended control is its details button,
- clicking the whole table row without evidence,
- asking the model to guess from coordinates alone,
- reporting success because some dialog opened.

Add tests for:

- duplicate buttons in different rows,
- duplicate links in different cards,
- repeated labels inside and outside a modal,
- one exact candidate plus several partial candidates,
- nearby unrelated identifiers,
- reordered DOM nodes.

======================================================================
AMBIGUITY POLICY
======================================================================

If two or more candidates remain similarly plausible, do not guess.

Define a meaningful ambiguity policy using:

- minimum acceptable score,
- difference between top and second candidate,
- exact-match evidence,
- contextual evidence,
- role and capability agreement.

If the top candidates are too close:

- do not execute,
- return a structured ambiguity result,
- request user clarification or confirmation,
- show candidate-safe descriptions,
- preserve current run identity,
- execute zero candidate actions before clarification.

Example:

Two visible buttons both named `View Details`, with no row identifier in the user request.

Correct behavior:

“Two visible ‘View Details’ buttons match. Please identify the item or row.”

Incorrect behavior:

- click the first one,
- randomly choose,
- use DOM order as certainty,
- claim completion.

Protected actions must not use ambiguity resolution to bypass confirmation.

======================================================================
MODEL ACTION CONTRACT
======================================================================

Strengthen the reasoning prompt and parser.

Gemini must return one JSON action only.

Example:

{
  "actionId": "act_1",
  "kind": "click",
  "targetLocalId": "el_42",
  "confidence": 0.96,
  "risk": "safe",
  "rationale": "Exact visible link text matches Problem Statements",
  "expectedPostcondition": {
    "kind": "url_changed",
    "expectedPathFragment": "problem"
  }
}

Gemini must not return:

- markdown,
- code fences,
- explanations outside JSON,
- a plan,
- more than one action,
- invented IDs,
- raw selectors,
- arbitrary URLs,
- hidden/private values.

The model prompt must state:

- Select only from supplied current-capture candidates.
- Prefer exact semantic matches.
- Use contextual qualifiers to disambiguate repeated controls.
- Do not choose a generic first element.
- Do not return `finish` before the requested postcondition is visible.
- Do not claim that an action happened merely because it was proposed.
- If no valid target exists, abstain safely.
- If candidates are ambiguous, request clarification rather than guessing.

However, do not rely only on model instructions. Enforce these rules locally.

======================================================================
PROPOSAL VALIDATION
======================================================================

Before executing a model proposal, validate:

- action schema,
- supported action kind,
- action confidence,
- target local ID exists,
- target belongs to the current capture,
- target supports the action capability,
- target matches the structured target intent above threshold,
- contextual qualifiers match,
- target is not an extension overlay,
- target is visible,
- target is enabled,
- target is not stale,
- target is not ambiguous,
- risk classification is correct.

A schema-valid action is not automatically semantically correct.

Add a semantic target-validation stage after schema validation.

If Gemini selects a candidate whose semantic score is significantly lower than another available candidate, reject or correct it safely rather than executing the wrong target.

Do not let model confidence override contradictory local evidence.

======================================================================
CAPTURE AND STALE-TARGET BINDING
======================================================================

Bind each action proposal to:

- run ID,
- capture ID,
- page generation,
- active tab ID,
- target local ID,
- safe semantic target fingerprint,
- proposal timestamp.

Immediately before execution, confirm:

1. The active tab has not changed.
2. The action belongs to the active run.
3. The current page generation matches.
4. The local ID still resolves.
5. The element is still attached.
6. The element is still visible and enabled.
7. Its semantic identity still matches.
8. The action has not already executed.
9. Confirmation remains valid for protected actions.

If stale:

- do not execute the old element,
- re-capture,
- regenerate candidates,
- semantically re-ground,
- retry only within the configured limit,
- never auto-retry protected actions without fresh approval.

======================================================================
OVERLAY AND HIT-TEST SAFETY
======================================================================

The screenshot shows PrivaPilot visual overlays around elements.

Ensure overlays cannot cause wrong clicks.

Inspect overlay implementation and verify:

- overlay containers use `pointer-events: none`,
- labels use `pointer-events: none`,
- debugging boxes cannot receive clicks,
- overlay nodes are excluded from element extraction,
- overlays are not assigned target local IDs,
- overlays do not alter accessible names,
- overlays do not become the top element during hit testing,
- overlay rendering does not move page layout,
- overlays are removed or updated between captures.

Before clicking, where possible:

- scroll the target into view,
- calculate a safe target point,
- use the real underlying DOM element,
- ensure the point is not intercepted by another element,
- avoid clicking coordinates derived from stale screenshots.

Add tests proving overlay labels cannot become click targets.

======================================================================
ACTION EXECUTION
======================================================================

Inspect `ActionExecutor` and content-script message handling.

For a click:

1. Resolve the target from the current local ID map.
2. Verify it is connected.
3. Verify it is visible.
4. Verify it is enabled.
5. Verify it supports clicking.
6. Scroll it into view.
7. Focus when appropriate.
8. Execute once.
9. Do not click both an ancestor and descendant.
10. Return structured execution evidence.

Avoid duplicate activation caused by dispatching incompatible combinations of:

- `mousedown`,
- `mouseup`,
- synthetic `click`,
- native `.click()`.

Use one deliberate compatibility strategy and test that handlers run exactly once.

Do not return success merely because event dispatch did not throw.

======================================================================
POST-ACTION SEMANTIC VERIFICATION
======================================================================

A click is successful only when the requested semantic outcome occurs.

Examples:

“Click the Problem Statements link”

Verify an appropriate result such as:

- expected safe route/path fragment,
- expected page heading,
- expected navigation landmark,
- a page-generation transition tied to the selected link.

“Click SIH26003”

Verify:

- the selected/expanded/opened content corresponds to SIH26003,
- not merely that any row or dialog changed.

“Open View Details for SIH26003”

Verify:

- the correct details panel opened,
- the panel contains a safe identifier or semantic evidence for SIH26003,
- the wrong row’s details did not open.

Do not complete because:

- an unrelated click returned success,
- any dialog opened,
- any URL changed,
- the model returned `finish`,
- one action exists in history,
- the executor did not throw.

Verification must be tied to:

- the current run,
- structured intent,
- chosen semantic target,
- expected postcondition,
- before/after state.

Reject false completion and unrelated state changes.

======================================================================
REPEATED ACTION HANDLING
======================================================================

Preserve repeated-action loop protection.

After an action:

1. Record before state.
2. Execute once.
3. Capture after state.
4. Measure semantic progress.
5. Complete if the task contract is satisfied.
6. Continue only if another distinct action is genuinely needed.
7. Stop safely if the same action repeats without progress.

Do not call Gemini again merely to obtain a `finish` action when a deterministic one-step task has already been verified.

For `Please scroll down`:

- perform exactly one local scroll,
- verify downward movement,
- complete locally,
- make zero reasoning requests.

For a click:

- do not click the same target repeatedly because navigation was delayed,
- wait for bounded verification,
- detect page changes,
- avoid duplicate actions.

======================================================================
PROTECTED ACTIONS
======================================================================

Preserve or improve protections for:

- submit,
- approve,
- authorize,
- delete,
- pay,
- purchase,
- transfer,
- release,
- irreversible actions.

Protected actions require:

1. Correct semantic target grounding.
2. No unresolved ambiguity.
3. Visible confirmation UI.
4. Confirmation bound to current run and action.
5. Fresh target validation after approval.
6. Exactly one execution.
7. Zero execution after denial.
8. Exact postcondition verification.

Never downgrade a protected action to safe because the model says it is safe.

======================================================================
PRIVACY REQUIREMENTS
======================================================================

Do not weaken PrivaPilot’s privacy boundary while improving grounding.

Never transmit:

- raw DOM,
- raw screenshots,
- passwords,
- OTPs,
- payment details,
- national IDs,
- cookies,
- authorization headers,
- private tokens,
- unredacted sensitive field values.

Use only canonical sanitized context.

Contextual grounding metadata must be privacy-safe.

If row/card context contains sensitive information:

- redact the value,
- preserve only safe categories or fingerprints where appropriate,
- do not send raw text to the model.

If sanitization or pixel verification fails:

- fail closed,
- make zero reasoning requests,
- execute zero browser actions,
- display an actionable local error.

======================================================================
REQUIRED REGRESSION TESTS
======================================================================

Add focused tests covering at least:

1. Exact navigation link
   - User: `Click the Problem Statements link`
   - Exact matching link is selected.
   - Unrelated links are not selected.

2. Identifier link
   - User: `Click SIH26003`
   - Exact identifier candidate wins over nearby partial matches.

3. Duplicate labels with context
   - User: `Open View Details for SIH26003`
   - Correct row’s button is selected.
   - First duplicate button is not selected.

4. Ambiguous duplicates
   - User: `Click View Details`
   - Two equally valid candidates exist.
   - Zero clicks occur.
   - Clarification or confirmation is required.

5. Missing target
   - User requests a target that is absent.
   - Zero actions execute.
   - System returns a clear safe failure.
   - No invented target local ID is accepted.

6. Wrong model selection
   - Model proposes an existing but semantically incorrect local ID.
   - Local semantic validation rejects it.
   - Wrong element is not executed.

7. Stale target
   - Correct target is replaced after capture.
   - Old target does not execute.
   - Safe re-grounding uses a fresh capture.

8. Overlay interference
   - Overlay labels exist.
   - They are excluded from extraction and cannot intercept clicks.

9. Protected duplicate target
   - Multiple Submit/Approve controls exist.
   - No protected action executes while ambiguous.

10. False finish
    - Unrelated link was clicked or unrelated dialog opened.
    - Coordinator does not mark the requested task complete.

11. Polite phrasing
    - `Please click the Problem Statements link`
    - `Can you click SIH26003?`
    - `I want you to open View Details for SIH26003`
    - All preserve correct target intent.

12. Scroll regression
    - `Please scroll down`
    - Exactly one local scroll.
    - Zero model calls.
    - Verified completion.
    - No repeated-action failure.

Tests must assert actual target IDs and execution counts, not only final success booleans.

======================================================================
REAL CHROME E2E REQUIREMENTS
======================================================================

Test through the actual side-panel UI, not only direct background messages.

The E2E flow must:

1. Open a real test page with repeated links/buttons and SIH-like table rows.
2. Open the PrivaPilot side panel.
3. Fill the real input.
4. Click the real send button.
5. Observe a new unique run ID.
6. Wait for current-run state transitions.
7. Inspect the actual executed target.
8. Verify the exact resulting page state.
9. Confirm unrelated controls were not activated.
10. Save privacy-safe trace evidence.

Required scenarios:

- exact unique link,
- duplicate label plus row identifier,
- ambiguous duplicate,
- absent target,
- stale target,
- protected approval,
- protected denial,
- scroll completion,
- form fill,
- wrong-model-target rejection.

If testing against the public SIH page is unreliable or externally dependent, create a representative local fixture with:

- repeated table rows,
- duplicate `View Details` links,
- unique problem IDs,
- navigation links,
- delayed transitions,
- protected controls.

Do not hardcode production-site-specific fixes.

The local fixture should reproduce the structural challenge, not bypass grounding.

======================================================================
BUILD AND VALIDATION
======================================================================

Run the narrowest tests first, then broaden validation.

Recommended order:

1. Diagnostics/typecheck for changed files.
2. Intent/task-contract tests.
3. Element-extractor tests.
4. Target-grounding tests.
5. Action-proposal validation tests.
6. Action-executor tests.
7. Coordinator tests.
8. Build.
9. Full test suite.
10. Lint.
11. Real Chrome E2E.
12. E2E matrix.
13. Production validation when prerequisites are available.

Repository commands include:

npm run build
npm test
npm run lint
npm run verify:redaction
npm run benchmark:browser
npm run test:e2e
npm run test:e2e:matrix
npm run validate:production

After building, confirm that Chrome-loaded generated artifacts contain the changes.

Reload the unpacked extension and target page before real-browser validation.

If any command fails:

- report the exact command,
- capture the relevant error,
- determine the root cause,
- fix regressions caused by the changes,
- rerun the focused failure,
- then rerun broader validation.

Do not report a test as passing unless it was actually run and passed.

======================================================================
NON-NEGOTIABLE PROHIBITIONS
======================================================================

Do not:

- return only a plan,
- stop after changing a prompt,
- assume model confidence means correctness,
- default to the first clickable element,
- hardcode SIH selectors or one known element ID,
- invent local IDs,
- trust stale element maps,
- click ambiguous targets,
- weaken ambiguity checks,
- weaken privacy checks,
- weaken assertions,
- treat executor success as task completion,
- treat any dialog as the requested dialog,
- treat any URL change as the correct navigation,
- allow overlays to intercept actions,
- execute protected actions without confirmation,
- manually edit `dist`,
- erase unrelated uncommitted changes,
- fabricate E2E evidence.

======================================================================
DEFINITION OF DONE
======================================================================

This task is complete only when all applicable statements are true:

1. Imperative requests enter the browser execution loop.
2. The requested target phrase is extracted correctly.
3. Exact targets beat generic and partial candidates.
4. Role and capability constraints are enforced.
5. Repeated labels are resolved using safe context.
6. Ambiguous candidates cause zero autonomous clicks.
7. Missing targets cause zero clicks.
8. Hallucinated IDs are rejected.
9. Existing but semantically wrong IDs are rejected.
10. Stale targets cannot execute.
11. Overlay labels cannot become targets or intercept clicks.
12. Correct targets execute exactly once.
13. Postconditions verify the requested target’s outcome.
14. Unrelated clicks cannot produce `complete`.
15. Protected actions still require confirmation.
16. Privacy remains fail-closed.
17. The explicit scroll regression remains fixed.
18. Generated artifacts are rebuilt from source.
19. Focused tests pass.
20. Full tests pass.
21. Real Chrome behavior is tested when the environment permits.
22. Remaining limitations are reported honestly.

======================================================================
FINAL RESPONSE FORMAT
======================================================================

When implementation and validation are complete, return:

1. Overall verdict:
   - PASS
   - PARTIAL
   - BLOCKED

2. Root causes:
   - where intent was lost,
   - where the wrong target was selected,
   - why local validation did not prevent it,
   - why verification did or did not catch it.

3. Files changed:
   - exact project-relative paths,
   - concise purpose of each change.

4. Grounding behavior:
   - structured intent,
   - candidate generation,
   - scoring,
   - ambiguity threshold,
   - stale binding,
   - semantic verification.

5. Tests:
   - tests added or changed,
   - exact commands,
   - exit codes,
   - pass/fail counts.
,
6. Real Chrome results:
   - command,
   - expected target,
   - selected target,
   - execution count,
   - verified postcondition,
   - final state.

7. Privacy and safety:
   - data transmitted,
   - ambiguity behavior,
   - protected-action behavior,
   - stale-target behavior.

8. Remaining limitations or external blockers.

9. Exact reload and manual verification instructions.

Do not end with “Here is what you should implement.”

Implement it, validate it, and report what actually happened.
```
