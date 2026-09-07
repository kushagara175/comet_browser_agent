You are the principal software engineer responsible for completing PrivaPilot end to end.

Repository root:
SIH_26209

IMPORTANT OPERATING MODE

You are not a consultant and must not merely explain, suggest, describe, or produce a plan.

You are an autonomous coding agent. You must:

1. Inspect the real repository.
2. Understand the existing architecture before editing.
3. Reproduce reported failures.
4. Identify root causes using evidence.
5. Modify the actual source files.
6. Add or update regression tests.
7. Rebuild all generated runtime artifacts.
8. Run focused tests and the full validation suite.
9. Inspect failures and continue fixing them.
10. Stop only when the requested behavior works or a genuine external blocker has been proven.

Do not ask the user to manually copy code into files.
Do not return hypothetical patches.
Do not claim that something works unless you ran it.
Do not stop after writing a plan.
Do not create commits or branches unless explicitly requested.
Do not overwrite or revert unrelated existing work.
Never manually patch generated `dist` files; modify source and rebuild.

FIRST ACTIONS

Before changing anything:

1. Read `git status` and the current diff.
2. Preserve all existing uncommitted user work.
3. Read:
   - `README.md`
   - `package.json`
   - `docs/00_PROBLEM_STATEMENT.md`
   - `docs/GPT_PLAN/00_MASTER_INSTRUCTIONS.md`
   - `docs/GPT_PLAN/01_IMPLEMENTATION_PHASES.md`
   - `docs/GPT_PLAN/02_EVALUATION_AND_SUBMISSION.md`
   - `docs/GPT_PLAN/04_PROGRESS_TRACKER.md`
   - `docs/GPT_PLAN/06_PRODUCTION_COMPLETION_AND_REAL_WORLD_PROMPT.md`
   - `docs/GPT_PLAN/08_VERIFIED_PRODUCTION_GAPS_AND_REMEDIATION_PROMPT.md`
   - `docs/GPT_PLAN/09_CHROME_EXTENSION_UI_END_TO_END_FINAL_PROMPT.md`
4. Treat `docs/GPT_PLAN/09_CHROME_EXTENSION_UI_END_TO_END_FINAL_PROMPT.md` as the detailed execution specification.
5. Inspect the source, tests, scripts, generated artifacts, and latest evidence before deciding what remains incomplete.
6. Do not trust historical reports when they conflict with current source or fresh test results.

PRIMARY PRODUCT REQUIREMENT

PrivaPilot is a Chrome MV3 browser agent, not merely a chatbot.

When the user gives an imperative browser command, PrivaPilot must operate the current website through the bounded agent loop.

Examples:

- “Please scroll down”
- “Can you fill the search field with telemetry?”
- “Click the Problem Statements link”
- “Open the preview”
- “Select Pending”
- “Enter launch data in this field”
- “Find SIH26003”
- “Go to the next page”
- “Close the dialog”

These requests must not be routed to conversational chat.

The expected workflow is:

User enters command in real side-panel input
→ clicks the real send button
→ side panel creates a unique run ID
→ command is classified as a browser action
→ coordinator starts a bounded agent run
→ active tab is captured
→ sensitive content is detected and sanitized locally
→ sanitized context is validated
→ local deterministic actions are resolved locally where possible
→ otherwise the configured reasoning model returns exactly one structured next action
→ action schema and target are validated locally
→ risk is classified locally
→ safe actions execute
→ protected actions require visible user confirmation
→ page state is semantically verified
→ the loop continues only if another action is needed
→ task completes only after the requested postcondition is verified
→ final result and telemetry appear in the side panel.

CURRENT OBSERVED FAILURE

A real Chrome test used:

“Please scroll down”

The page scrolled, but the run failed with:

“Repeated action loop detected: identical action proposed consecutively without progress”

This means routing reached the agent, but the coordinator/model repeated the scroll rather than recognizing completion.

A partial source fix may already exist in the working tree:

- `resolveTaskContract()` normalizes polite prefixes.
- `isBrowserActionRequest()` recognizes natural imperative requests.
- The coordinator local scroll router may have been changed to use the normalized `scroll_changed` task contract.
- A regression test may have been added for “Please scroll down”.

Inspect these changes rather than replacing them blindly.

Required behavior for a scroll command:

1. Resolve the requested direction from the task contract.
2. Handle scrolling deterministically and locally.
3. Execute exactly one scroll action.
4. Do not call Gemini for a simple explicit scroll.
5. Capture or otherwise verify the post-action scroll state.
6. Confirm that the direction and movement satisfy the contract.
7. Return `complete`.
8. Do not propose or execute a second identical scroll.
9. Preserve repeated-action protection for genuine loops.

Add or preserve a regression test proving:

- `Please scroll down` is supported.
- Exactly one `scroll` action executes.
- Direction is `down`.
- The reasoning HTTP client is not called.
- The run reaches `complete`.
- The run does not fail with repeated-action detection.

COMMAND ROUTING REQUIREMENTS

Create or preserve one clear, testable browser-action intent classifier.

It must recognize direct and naturally phrased commands, including:

- click
- open
- type
- fill
- enter
- write
- set
- press
- select
- choose
- scroll
- submit
- approve
- deny
- dismiss
- close
- accept
- filter
- find
- search
- log in
- navigate
- go to
- inspect
- check

It must normalize polite wrappers such as:

- please
- kindly
- can you
- could you
- would you
- will you
- could you please
- I want you to
- I need you to
- go ahead and
- hey PrivaPilot
- hi PrivaPilot

Examples that must enter the execution loop:

- “Can you fill this input with launch data?”
- “Could you please select Pending?”
- “I want you to open the preview”
- “Hey PrivaPilot, please scroll down”
- “Please click Continue”

Examples that should remain informational chat:

- “Why is the sky blue?”
- “Can you explain this page?”
- “What would you do here?”
- “Tell me how to fill this form”

Avoid a naive rule that interprets every occurrence of words like “fill” or “click” as an action. Intent and position matter.

TASK-CONTRACT REQUIREMENTS

`resolveTaskContract()` must agree with side-panel routing.

It must understand polite variants of:

- scrolling,
- typing/filling fields,
- searching/filtering,
- selecting options,
- clicking/opening controls,
- dismissing dialogs,
- protected approval/submission actions.

Do not allow the side panel to classify a request as executable only for the coordinator to reject it as unsupported.

Do not maintain multiple incompatible normalization rules if a shared utility can safely be used.

MODEL EXECUTION CONTRACT

Gemini or any configured VLM is a next-action reasoner, not the browser executor.

For each reasoning cycle, the model must return only one schema-valid action proposal.

It must never return:

- a prose plan,
- step-by-step user instructions,
- “I would click...” text,
- a list of future actions,
- CSS selectors,
- XPath,
- JavaScript,
- invented element IDs,
- a completion claim without visible evidence.

For form-entry requests, the model must return:

- `kind: "type"`
- the real sanitized `targetLocalId`
- the exact requested non-sensitive text in `textToType`
- appropriate confidence
- appropriate risk
- a concise rationale

For dropdown requests, return:

- `kind: "select"`
- real `targetLocalId`
- requested `selectOptionValue`

For clicks, return:

- `kind: "click"`
- real `targetLocalId`

For explicit scrolling, prefer the local deterministic router rather than a model call.

The model may return `finish` only when current page state proves that the task’s terminal postcondition has been satisfied.

A rationale is not evidence of completion.

EXECUTION VERSUS REASONING

Preserve strict separation:

- The model selects one structured next action.
- The coordinator validates and controls the loop.
- The content script executes the action.
- The verifier checks the resulting page state.
- Only the coordinator decides whether to continue or finish.

Do not give Gemini unrestricted JavaScript execution.
Do not let Gemini bypass action validation.
Do not allow model-provided selectors.
Do not treat a model statement as successful execution.

ACTION EXECUTION REQUIREMENTS

Inspect and harden:

- `apps/extension/src/content/action-executor.ts`
- `apps/extension/src/content/content-main.ts`
- `apps/extension/src/content/verifier.ts`
- `apps/extension/src/background/coordinator.ts`
- `apps/extension/src/browser/browser-adapter.ts`

Ensure:

1. Targets resolve only from the current capture’s local ID map.
2. Detached or stale elements cannot execute.
3. Hidden, disabled, and read-only controls fail clearly.
4. `type` works with native inputs, textareas, contenteditable controls, and controlled React inputs.
5. Input/change/keyboard events are framework-compatible.
6. `select` changes the real option and dispatches required events.
7. Clicks use the actual target and execute at most once.
8. Scroll actions produce measurable movement when movement is possible.
9. Execution responses distinguish:
   - success,
   - stale target,
   - policy block,
   - unsupported action,
   - semantic verification failure.
10. An executor success response must not automatically mean the overall task is complete.

SEMANTIC COMPLETION REQUIREMENTS

Never complete a task solely because an action was attempted.

Terminal verification must be tied to the current task contract and current run.

Verify exact outcomes:

- `scroll_changed`: compare baseline and resulting scroll position and direction.
- `value_present`: verify the expected value or safe fingerprint exists in the intended field.
- `select_changed`: verify the requested option became selected.
- `dialog_visible`: verify the requested dialog/drawer became visible.
- `visibility_changed`: verify the expected target changed visibility.
- `status_changed`: verify the expected final status, not an unrelated or transitional status.
- `url_changed`: verify the expected safe path fragment.
- Protected submission: verify exact approved/submitted result after confirmation.

Reject false `finish` proposals.

REPEATED-ACTION POLICY

Keep repeated-action protection, but do not use it as a substitute for completion verification.

After a successful action:

1. Record the relevant before state.
2. Observe the resulting state.
3. Verify progress against the task contract.
4. If complete, terminate successfully.
5. If not complete, ask for a different justified next action.
6. If the exact same action is proposed without measurable progress, stop safely.

For explicit one-step commands such as scrolling, do not call the model again after verified success merely to request a `finish` action. The coordinator may complete deterministically when the contract is satisfied.

PROTECTED ACTION REQUIREMENTS

Actions such as submit, approve, delete, pay, release, authorize, purchase, or transfer must:

1. Never auto-execute.
2. Show the real confirmation UI.
3. Display action kind, target, and rationale.
4. Bind confirmation to the current run and action.
5. Revalidate tab, page generation, target, freshness, and semantics after approval.
6. Execute exactly once after valid approval.
7. Execute zero times after denial.
8. Prevent stale or duplicate approval callbacks.
9. Verify exact resulting page state.
10. Keep evidence tied to the same run ID.

PRIVACY REQUIREMENTS

The privacy boundary is non-negotiable.

Never transmit:

- raw screenshots,
- raw DOM,
- passwords,
- OTPs,
- payment values,
- national identifiers,
- cookies,
- authentication headers,
- private tokens,
- unredacted sensitive field values.

Required flow:

raw capture
→ local detection
→ local masking/redaction
→ strict pixel verification
→ canonical sanitized payload
→ network request

If sanitization or pixel verification fails:

- fail closed,
- execute no browser action,
- make no reasoning request,
- show an actionable local error.

Preserve canary checks and strict closed schemas.

REAL UI REQUIREMENTS

Test the real side-panel experience:

- actual input,
- actual send button,
- loading state,
- run ID transition,
- action progress,
- success state,
- failure state,
- protected confirmation,
- approval,
- denial,
- inspector,
- wire payload,
- telemetry,
- model connectivity.

Do not test only by directly sending `START_AGENT_RUN`.
E2E tests must use the visible side-panel input and send button for UI workflow coverage.

BUILD REQUIREMENTS

Chrome loads generated artifacts for the background, content, and offscreen contexts.

Therefore:

1. Edit source files only.
2. Run the repository build.
3. Confirm generated runtime artifacts contain the intended changes.
4. Reload the unpacked Chrome extension after rebuilding.
5. Reload the target webpage so the content script is refreshed.

VALIDATION ORDER

Start with the smallest relevant validation:

1. Typecheck or diagnostics for changed files.
2. Focused routing tests.
3. Task-contract tests.
4. Coordinator multi-step tests.
5. Action-executor tests.
6. Build.
7. Full unit/integration suite.
8. Lint.
9. Real Chrome E2E.
10. E2E matrix.
11. Production validation when prerequisites are available.

Run these repository commands as appropriate:

npm run build
npm test
npm run lint
npm run verify:redaction
npm run benchmark:browser
npm run test:e2e
npm run test:e2e:matrix
npm run validate:production

If a command fails:

- capture the exact relevant error,
- determine whether your changes caused it,
- fix root causes,
- rerun the smallest failing test,
- then rerun broader validation.

Do not weaken assertions merely to make tests pass.
Do not hide failures.
Do not fabricate browser results.
Do not claim real Chrome validation if Chrome or required services were unavailable.

REQUIRED REAL-WORLD TEST COMMANDS

At minimum, validate these through the extension UI:

1. “Please scroll down”
2. “Can you fill the search field with telemetry?”
3. “Please click the Problem Statements link”
4. “Open the preview”
5. “Select Pending”
6. One protected action that is approved
7. One protected action that is denied
8. One ambiguous target
9. One stale-target recovery
10. One sanitizer or verifier failure

For each test, record:

- unique run ID,
- initial page state,
- route chosen,
- model/network request count,
- proposed action,
- actual executed action,
- target identity,
- risk classification,
- confirmation result when applicable,
- verification evidence,
- final state,
- error if any.

DEFINITION OF DONE

The task is complete only when:

1. Natural imperative requests reliably enter the execution loop.
2. Informational questions remain chat.
3. `Please scroll down` executes exactly once and completes.
4. Fill/type requests execute rather than produce prose plans.
5. Safe actions execute through the content script.
6. Protected actions require real confirmation.
7. Denied actions execute zero times.
8. Stale targets are handled safely.
9. False completion is rejected.
10. Privacy failures stop before network transmission.
11. Generated extension artifacts are rebuilt.
12. Focused and full tests pass.
13. Real Chrome results are reported honestly.
14. No unrelated user work is reverted.

FINAL RESPONSE FORMAT

Return:

1. Overall status: PASS, PARTIAL, or BLOCKED.
2. Root causes found.
3. Exact source files changed.
4. Behavior changed.
5. Tests added or updated.
6. Commands run with exit codes and test counts.
7. Real Chrome scenarios and outcomes.
8. Any external blockers.
9. Remaining limitations.
10. Exact instructions for reloading and testing the extension.

Do not finish with a proposed plan. Finish with implemented changes and verified results.
